// functions/src/index.ts - TypeScript Version with South Africa Region
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import axios from 'axios';
import crypto from 'crypto';

// Initialize Firebase Admin SDK
if (getApps().length === 0) {
    initializeApp();
}
const db = getFirestore();

// Configuration - Replace with your actual values
const WHATSAPP_CONFIG = {
    ACCESS_TOKEN: 'EAASC7YgLv0YBPRIdAASQas8IdC1vLwtsiKYcVvuC0MtZAEKQAnfaIM9Vgtnn1HNeH92ZBNlQ1kZA8Wgg7fxuoihZC6mH17frZBsAyQvk6igPZAJxK7kdI0dJ7ZAzxsKZCpUCiDZAxnnCYNgTc5zZCEeTQ3Xn8EeykvjfxxqBNZAcsxMwL6PLbQVZB7TFtLXxlFiVdgZDZD',
    PHONE_NUMBER_ID: '740740482466935',
    VERSION: 'v23.0',
    BASE_URL: 'https://graph.facebook.com'
};

// Template names from your Meta account
const TEMPLATES = {
    NEW_INVOICE: 'invoice',
    OVERDUE: 'payment_overdue_1',
    PAYMENT_SUCCESS: 'payment_confirmation_2',
    APP_CONSENT: 'app_consent', // New template for consent
};

// Rate limiting configuration
const RATE_LIMITS = {
    MESSAGES_PER_MINUTE: 50,
    MESSAGES_PER_HOUR: 1000,
    RETRY_DELAY_MS: 5000,
    MAX_RETRIES: 3
};

// User tier limits and permissions
const TIER_PERMISSIONS: Record<string, string[]> = {
    free: ['invoice'],
    low: ['invoice'],
    solo: ['invoice', 'overdue'],
    business: ['invoice', 'overdue'],
    pro: ['invoice', 'overdue', 'payment'],
    enterprise: ['invoice', 'overdue', 'payment']
};

// Rate limiting store (in production, use Redis or Firestore)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Cleanup rate limit store every hour
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitStore.entries()) {
        if (now > value.resetTime) {
            rateLimitStore.delete(key);
        }
    }
}, 60 * 60 * 1000);

// Rate limiting function
function checkRateLimit(identifier: string): boolean {
    const now = Date.now();
    const key = `${identifier}_${Math.floor(now / 60000)}`;
    const current = rateLimitStore.get(key) || { count: 0, resetTime: now + 60000 };
    
    if (current.count >= RATE_LIMITS.MESSAGES_PER_MINUTE) {
        return false;
    }
    
    current.count++;
    rateLimitStore.set(key, current);
    return true;
}

// NEW: Function to check tenant consent
async function checkTenantConsent(tenantPhone: string): Promise<{ hasConsent: boolean; status?: string }> {
    try {
        const normalizedPhone = tenantPhone.replace(/\D/g, '');
        const consentDoc = await db.collection('allowed').doc(normalizedPhone).get();
        
        if (!consentDoc.exists) {
            console.log(`No consent document found for phone: ${normalizedPhone}`);
            return { hasConsent: false };
        }
        
        const consentData = consentDoc.data();
        const status = consentData?.status;
        
        console.log(`Consent status for phone ${normalizedPhone}: ${status}`);
        
        if (status === 'allowed') {
            return { hasConsent: true, status: 'allowed' };
        } else {
            return { hasConsent: false, status: status || 'unknown' };
        }
    } catch (error) {
        console.error('Error checking tenant consent:', error);
        return { hasConsent: false };
    }
}

// NEW: Function to send consent request
// CORRECTED: Function to send consent request with dynamic button URLs
async function sendConsentRequest(tenant: any, property: any, company: any, user: any): Promise<boolean> {
    try {
        const normalizedPhone = tenant.phone.replace(/\D/g, '');
        const tenantName = tenant.name || 'Tenant';
        const agentName = company?.name || user.name || 'Property Manager';
        const propertyDetails = `${property.name}${tenant.unitNumber ? ' / ' + tenant.unitNumber : ''}`;
        
        const templateParams = [
            tenantName,
            agentName,
            propertyDetails
        ];
        
        // Create ONLY the query parameters (base URL is in template)
        const allowParams = `handleConsent?phone=${encodeURIComponent(normalizedPhone)}&name=${encodeURIComponent(tenantName)}&agent=${encodeURIComponent(agentName)}&property=${encodeURIComponent(propertyDetails)}&status=allow&date=${encodeURIComponent(new Date().toISOString())}`;
        const stopParams = `handleConsent?phone=${encodeURIComponent(normalizedPhone)}&name=${encodeURIComponent(tenantName)}&agent=${encodeURIComponent(agentName)}&property=${encodeURIComponent(propertyDetails)}&status=stop&date=${encodeURIComponent(new Date().toISOString())}`;
        
        console.log(`Sending consent request to: ${tenant.phone}`);
        console.log(`Template params:`, templateParams);
        console.log(`Allow button parameter: ${allowParams}`);
        console.log(`Stop button parameter: ${stopParams}`);
        
        // Send consent message with dynamic button parameters
        const success = await sendWhatsAppMessageWithButtons(
            tenant.phone, 
            TEMPLATES.APP_CONSENT, 
            templateParams,
            [
                { type: 'url', text: 'Allow Invoices', url: allowParams },
                { type: 'url', text: 'Stop', url: stopParams }
            ]
        );
        
        if (success) {
            console.log(`Consent request sent successfully to ${tenant.phone}`);
        } else {
            console.log(`Failed to send consent request to ${tenant.phone}`);
        }
        
        return success;
    } catch (error) {
        console.error('Error sending consent request:', error);
        return false;
    }
}

// CORRECTED: WhatsApp message with buttons for consent
async function sendWhatsAppMessageWithButtons(
    to: string,
    templateName: string,
    templateParams: string[],
    buttons: Array<{ type: string; text: string; url: string }>,
    retryCount: number = 0
): Promise<boolean> {
    try {
        if (!checkRateLimit('whatsapp_api')) {
            console.log('Rate limit exceeded, queuing message');
            if (retryCount < RATE_LIMITS.MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, RATE_LIMITS.RETRY_DELAY_MS));
                return sendWhatsAppMessageWithButtons(to, templateName, templateParams, buttons, retryCount + 1);
            }
            throw new Error('Rate limit exceeded after retries');
        }

        const cleanPhone = to.replace(/\D/g, '');
        const formattedPhone = cleanPhone.startsWith('254') ? cleanPhone :
            cleanPhone.startsWith('0') ? '254' + cleanPhone.substring(1) :
            cleanPhone.startsWith('7') ? '254' + cleanPhone : cleanPhone;

        console.log(`Attempting to send WhatsApp consent message to: ${formattedPhone}`);

        const messagePayload: any = {
            messaging_product: 'whatsapp',
            to: formattedPhone,
            type: 'template',
            template: {
                name: templateName,
                language: { code: 'en' },
                components: [
                    {
                        type: 'body',
                        parameters: templateParams.map(param => ({
                            type: 'text',
                            text: param
                        }))
                    }
                ]
            }
        };

        // FIXED: Add buttons as parameters to button components
        // Each button in your template needs its own component with the correct index
        buttons.forEach((button, index) => {
            messagePayload.template.components.push({
                type: 'button',
                sub_type: 'url',
                index: index.toString(),
                parameters: [{
                    type: 'text',
                    text: button.url  // This should be the full URL
                }]
            });
        });

        console.log('WhatsApp consent payload:', JSON.stringify(messagePayload, null, 2));

        const response = await axios.post(
            `${WHATSAPP_CONFIG.BASE_URL}/${WHATSAPP_CONFIG.VERSION}/${WHATSAPP_CONFIG.PHONE_NUMBER_ID}/messages`,
            messagePayload,
            {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_CONFIG.ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        if (response.status === 200) {
            console.log(`WhatsApp consent message sent successfully to ${formattedPhone}`);
            return true;
        } else {
            throw new Error(`WhatsApp API returned status ${response.status}`);
        }
    } catch (error: any) {
        console.error(`Error sending WhatsApp consent message (attempt ${retryCount + 1}):`, error.message);
        
        if (retryCount < RATE_LIMITS.MAX_RETRIES) {
            console.log(`Retrying in ${RATE_LIMITS.RETRY_DELAY_MS}ms...`);
            await new Promise(resolve => setTimeout(resolve, RATE_LIMITS.RETRY_DELAY_MS));
            return sendWhatsAppMessageWithButtons(to, templateName, templateParams, buttons, retryCount + 1);
        }
        
        console.error('All retry attempts exhausted');
        return false;
    }
}

// NEW: Function to process Firebase URL for WhatsApp template
function processFirebaseUrlForWhatsApp(pdfUrl: string): string {
    if (!pdfUrl) {
        console.warn('No PDF URL provided');
        return '';
    }

    const firebaseBaseUrl = 'https://firebasestorage.googleapis.com/';
    
    // Check if URL starts with Firebase Storage URL
    if (pdfUrl.startsWith(firebaseBaseUrl)) {
        // Extract everything after the base URL
        const urlPath = pdfUrl.substring(firebaseBaseUrl.length);
        console.log(`Processed Firebase URL: ${firebaseBaseUrl} + ${urlPath}`);
        return urlPath;
    }
    
    // If it's not a Firebase URL, return as is (for other URLs)
    console.log(`Non-Firebase URL passed through: ${pdfUrl}`);
    return pdfUrl;
}

// RevenueCat helper functions
const verifyWebhookSignature = (body: Buffer, signature: string, secret: string): boolean => {
    if (!secret || !signature) {
        return true;
    }
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
};

const getTierFromProductId = (productId: string): string => {
    console.log(`Determining tier for product: ${productId}`);
    if (productId.startsWith('low_')) return 'low';
    if (productId.startsWith('business_')) return 'business';
    if (productId.startsWith('pro_')) return 'pro';
    if (productId.startsWith('enterprise_')) return 'enterprise';
    if (productId.startsWith('solo_')) return 'solo';
    return 'free';
};

interface UserData {
    userId: string;
    tier: string;
    type: string;
    storage: boolean;
    name: string;
    email: string;
    createdAt: Date;
    updatedAt: Date;
    lastSyncTime: string;
    subscriptionExpiry?: Date;
    storageType?: string;
}

const createDefaultUser = (userId: string): UserData => {
    const now = new Date();
    return {
        userId: userId,
        tier: 'free',
        type: 'free',
        storage: false,
        name: '',
        email: '',
        createdAt: now,
        updatedAt: now,
        lastSyncTime: now.toISOString()
    };
};

const findOrCreateUserDocument = async (userId: string): Promise<{ docId: string; data: any }> => {
    console.log(`Looking for user: ${userId}`);
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
            console.log(`Found existing user: ${userId}`);
            return { docId: userId, data: userDoc.data() };
        }
        
        const newUserData = createDefaultUser(userId);
        await db.collection('users').doc(userId).set(newUserData);
        console.log(`Successfully created new user document with ID: ${userId}`);
        return { docId: userId, data: newUserData };
    } catch (error) {
        console.error(`Error in findOrCreateUserDocument for user ${userId}:`, error);
        throw error;
    }
};

const updateUserSubscription = async (
    docId: string, 
    tier: string, 
    type: string, 
    storage: boolean, 
    expirationDate?: Date
): Promise<void> => {
    console.log(`Updating user ${docId}: tier=${tier}, type=${type}, storage=${storage}`);
    try {
        const updateData: any = {
            tier: tier,
            type: type,
            storage,
            updatedAt: new Date(),
            lastSyncTime: new Date().toISOString()
        };
        
        if (expirationDate) {
            updateData.subscriptionExpiry = expirationDate;
        }
        
        await db.collection('users').doc(docId).update(updateData);
        console.log(`Successfully updated user ${docId} subscription`);
    } catch (error) {
        console.error(`Error updating user ${docId} subscription:`, error);
        throw error;
    }
};

interface RevenueCatEvent {
    type: string;
    app_user_id: string;
    product_id: string;
    expiration_at_ms?: number;
    environment: string;
}

const handleSubscriptionEvent = async (event: RevenueCatEvent): Promise<void> => {
    const userId = event.app_user_id;
    console.log(`Processing event ${event.type} for user: ${userId}`);
    
    try {
        const { docId } = await findOrCreateUserDocument(userId);
        
        switch (event.type) {
            case 'INITIAL_PURCHASE':
            case 'RENEWAL':
            case 'PRODUCT_CHANGE':
                if (event.product_id === 'storage_onetime') {
                    await updateUserSubscription(docId, 'free', 'free', true);
                } else {
                    const tier = getTierFromProductId(event.product_id);
                    const expirationDate = event.expiration_at_ms 
                        ? new Date(event.expiration_at_ms) 
                        : undefined;
                    const storageAccess = tier === 'low' ? false : true;
                    await updateUserSubscription(docId, tier, 'paid', storageAccess, expirationDate);
                }
                break;
                
            case 'CANCELLATION':
            case 'EXPIRATION':
            case 'BILLING_ISSUE':
                const { data: currentUser } = await findOrCreateUserDocument(userId);
                const keepStorage = currentUser?.storage && 
                    (currentUser?.storageType === 'onetime' || event.product_id !== 'storage_onetime');
                await updateUserSubscription(docId, 'free', 'free', keepStorage || false);
                break;
                
            case 'NON_RENEWING_PURCHASE':
                if (event.product_id === 'storage_onetime') {
                    await db.collection('users').doc(docId).update({
                        storage: true,
                        storageType: 'onetime',
                        updatedAt: new Date(),
                        lastSyncTime: new Date().toISOString()
                    });
                }
                break;
                
            default:
                console.log(`Unhandled event type: ${event.type}`);
        }
        
        console.log(`Successfully processed ${event.type} for user ${userId}`);
    } catch (error) {
        console.error(`Failed to process event for user ${userId}:`, error);
        throw error;
    }
};

// UPDATED: New invoice notification function with consent check
async function sendNewInvoiceNotification(invoice: any, fallbackInvoiceId: string | null = null): Promise<boolean> {
    try {
        const invoiceLocalId = invoice.localId || fallbackInvoiceId || 'unknown';
        console.log(`Sending new invoice notification for invoice ${invoiceLocalId}`);
        const { tenant, property, user, company } = await getInvoiceContext(invoice, fallbackInvoiceId);
        
        if (!canSendNotification(user, 'invoice')) {
            console.log(`User ${user.localId} cannot receive invoice notifications`);
            return false;
        }

        // CHECK CONSENT FIRST
        const consentCheck = await checkTenantConsent(tenant.phone);
        if (!consentCheck.hasConsent) {
            console.log(`No consent for tenant ${tenant.name} (${tenant.phone}), sending consent request`);
            return await sendConsentRequest(tenant, property, company, user);
        }

        const shouldSendNewNotification = !invoice.hasOwnProperty('isNew') || invoice.isNew === true;
        
        if (!shouldSendNewNotification) {
            console.log(`Invoice ${invoiceLocalId} already processed for new invoice (isNew=false)`);
            return false;
        }

        if (invoice.pdfStatus === 'paid' || invoice.status === 'paid') {
            console.log(`Invoice ${invoiceLocalId} is already paid, skipping new invoice notification`);
            return false;
        }

        if (!tenant.phone) {
            console.error(`No phone number found for tenant ${tenant.name}`);
            return false;
        }

        const templateParams = [
            tenant.name,
            invoice.billingMonth,
            property.name,
            company?.name || user.name,
            company?.phone || user.phone || '',
            company?.email || user.email
        ];

        // Process the PDF URL for WhatsApp template
        const processedUrl = processFirebaseUrlForWhatsApp(invoice.pdfUrl);

        console.log(`Sending NEW INVOICE to phone: ${tenant.phone}, template: ${TEMPLATES.NEW_INVOICE}`);
        console.log(`Template params:`, templateParams);
        console.log(`Original PDF URL: ${invoice.pdfUrl}`);
        console.log(`Processed URL parameter: ${processedUrl}`);
        
        const success = await sendWhatsAppMessage(tenant.phone, TEMPLATES.NEW_INVOICE, templateParams, processedUrl);
        
        if (success) {
            await updateInvoiceFlags(invoice.userId, invoiceLocalId, { isNew: false });
            console.log(`Successfully sent new invoice notification for invoice ${invoiceLocalId}`);
        }
        
        return success;
    } catch (error) {
        console.error('Error sending new invoice notification:', error);
        return false;
    }
}

// UPDATED: Payment success notification function with consent check
async function sendPaymentSuccessNotification(invoice: any, fallbackInvoiceId: string | null = null): Promise<boolean> {
    try {
        const invoiceLocalId = invoice.localId || fallbackInvoiceId || 'unknown';
        console.log(`Sending payment success notification for invoice ${invoiceLocalId}`);
        const { tenant, property, user, company } = await getInvoiceContext(invoice, fallbackInvoiceId);
        
        if (!canSendNotification(user, 'payment')) {
            console.log(`User ${user.localId} cannot receive payment notifications`);
            return false;
        }

        // CHECK CONSENT FIRST
        const consentCheck = await checkTenantConsent(tenant.phone);
        if (!consentCheck.hasConsent) {
            console.log(`No consent for tenant ${tenant.name} (${tenant.phone}), sending consent request`);
            return await sendConsentRequest(tenant, property, company, user);
        }

        const isInvoicePaid = invoice.pdfStatus === 'paid' || invoice.isPaid;
        const notificationAlreadySent = invoice.hasPaid === true;
        
        if (!isInvoicePaid) {
            console.log(`Invoice ${invoiceLocalId} is not paid yet, skipping payment notification`);
            return false;
        }
        
        if (notificationAlreadySent) {
            console.log(`Invoice ${invoiceLocalId} payment notification already sent (isPaid=true)`);
            return false;
        }

        if (!tenant.phone) {
            console.error(`No phone number found for tenant ${tenant.name}`);
            return false;
        }

        const templateParams = [
            tenant.name,
            formatCurrency(invoice.amountPaid),
            `${property.name} ${tenant.unitNumber || ''}`
        ];

        // Process the PDF URL for WhatsApp template
        const processedUrl = processFirebaseUrlForWhatsApp(invoice.pdfUrl);

        console.log(`Sending PAYMENT SUCCESS to phone: ${tenant.phone}, template: ${TEMPLATES.PAYMENT_SUCCESS}`);
        console.log(`Template params:`, templateParams);
        console.log(`Original PDF URL: ${invoice.pdfUrl}`);
        console.log(`Processed URL parameter: ${processedUrl}`);
        
        const success = await sendWhatsAppMessage(tenant.phone, TEMPLATES.PAYMENT_SUCCESS, templateParams, processedUrl);
        
        if (success) {
            await updateInvoiceFlags(invoice.userId, invoiceLocalId, { hasPaid: true });
            console.log(`Successfully sent payment success notification for invoice ${invoiceLocalId}`);
        }
        
        return success;
    } catch (error) {
        console.error('Error sending payment success notification:', error);
        return false;
    }
}

// WhatsApp API helper functions
// Enhanced error handling for WhatsApp API
async function sendWhatsAppMessage(
    to: string, 
    templateName: string, 
    templateParams: string[], 
    buttonUrl?: string, 
    retryCount: number = 0
): Promise<boolean> {
    try {
        if (!checkRateLimit('whatsapp_api')) {
            console.log('Rate limit exceeded, queuing message');
            if (retryCount < RATE_LIMITS.MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, RATE_LIMITS.RETRY_DELAY_MS));
                return sendWhatsAppMessage(to, templateName, templateParams, buttonUrl, retryCount + 1);
            }
            throw new Error('Rate limit exceeded after retries');
        }

        const cleanPhone = to.replace(/\D/g, '');
        const formattedPhone = cleanPhone.startsWith('254') ? cleanPhone :
            cleanPhone.startsWith('0') ? '254' + cleanPhone.substring(1) :
            cleanPhone.startsWith('7') ? '254' + cleanPhone : cleanPhone;

        console.log(`Attempting to send WhatsApp message to: ${formattedPhone}, template: ${templateName}`);

        const messagePayload: any = {
            messaging_product: 'whatsapp',
            to: formattedPhone,
            type: 'template',
            template: {
                name: templateName,
                language: { code: 'en' },
                components: [
                    {
                        type: 'body',
                        parameters: templateParams.map(param => ({
                            type: 'text',
                            text: param
                        }))
                    }
                ]
            }
        };

        // Use processed URL directly (already cut from Firebase base)
        if (buttonUrl && buttonUrl.trim() !== '') {
            messagePayload.template.components.push({
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [{ 
                    type: 'text', 
                    text: buttonUrl // This is now the processed URL path
                }]
            });
            console.log(`Added button URL parameter: ${buttonUrl}`);
        }

        console.log('WhatsApp payload:', JSON.stringify(messagePayload, null, 2));

        const response = await axios.post(
            `${WHATSAPP_CONFIG.BASE_URL}/${WHATSAPP_CONFIG.VERSION}/${WHATSAPP_CONFIG.PHONE_NUMBER_ID}/messages`,
            messagePayload,
            {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_CONFIG.ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        if (response.status === 200) {
            console.log(`WhatsApp message sent successfully to ${formattedPhone}`);
            return true;
        } else {
            throw new Error(`WhatsApp API returned status ${response.status}`);
        }
    } catch (error: any) {
        console.error(`Error sending WhatsApp message (attempt ${retryCount + 1}):`, error.message);
        
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            const errorData = error.response?.data;
            
            console.error('WhatsApp API Error Details:', {
                status,
                data: errorData,
                headers: error.response?.headers
            });

            // Handle specific error codes
            if (status === 400) {
                const errorCode = errorData?.error?.code;
                const errorMessage = errorData?.error?.message;
                
                console.error(`WhatsApp API Bad Request - Code: ${errorCode}, Message: ${errorMessage}`);
                
                // Common error codes and their meanings
                switch (errorCode) {
                    case 131032:
                        console.error('SOLUTION: Phone number not registered as test recipient. Add it in Meta Developer Console.');
                        break;
                    case 131026:
                        console.error('SOLUTION: Template not found or not approved. Check template name and approval status.');
                        break;
                    case 131047:
                        console.error('SOLUTION: Re-engagement message required. User needs to initiate conversation first.');
                        break;
                    case 131051:
                        console.error('SOLUTION: Template parameter count mismatch. Check template parameters.');
                        break;
                    default:
                        console.error('SOLUTION: Check WhatsApp Business API documentation for error code:', errorCode);
                }
                
                // Log to Firestore for tracking
                try {
                    await db.collection('whatsapp_errors').add({
                        phone: to,
                        template: templateName,
                        errorCode,
                        errorMessage,
                        status,
                        timestamp: FieldValue.serverTimestamp(),
                        retryCount
                    });
                } catch (logError) {
                    console.error('Failed to log WhatsApp error:', logError);
                }
                
                return false; // Don't retry bad requests
            }
            
            if (status === 429 && retryCount < RATE_LIMITS.MAX_RETRIES) {
                console.log('Rate limited, retrying...');
                await new Promise(resolve => setTimeout(resolve, RATE_LIMITS.RETRY_DELAY_MS * (retryCount + 1)));
                return sendWhatsAppMessage(to, templateName, templateParams, buttonUrl, retryCount + 1);
            }
        }
        
        if (retryCount < RATE_LIMITS.MAX_RETRIES) {
            console.log(`Retrying in ${RATE_LIMITS.RETRY_DELAY_MS}ms...`);
            await new Promise(resolve => setTimeout(resolve, RATE_LIMITS.RETRY_DELAY_MS));
            return sendWhatsAppMessage(to, templateName, templateParams, buttonUrl, retryCount + 1);
        }
        
        console.error('All retry attempts exhausted');
        return false;
    }
}

// Helper function to check if user can receive notifications
function canSendNotification(user: any, messageType: string): boolean {
    if (user.type !== 'paid') return false;
    
    // Check lastSyncTime recency (must be less than 8 days old)
    if (user.lastSyncTime) {
        const syncTime = new Date(user.lastSyncTime);
        const daysSinceSync = (Date.now() - syncTime.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceSync > 8) {
            console.log(`User ${user.userId} sync too old: ${daysSinceSync} days`);
            return false;
        }
    } else {
        console.log(`User ${user.userId} has no lastSyncTime`);
        return false;
    }

    const allowedTypes = TIER_PERMISSIONS[user.tier] || [];
    return allowedTypes.includes(messageType);
}

// Helper function to check overdue conditions
function shouldSendOverdueMessage(invoice: any, user: any): boolean {
    if (!canSendNotification(user, 'overdue')) return false;
    
    // Check if invoice is unpaid and overdue
    if (invoice.totalAmount <= invoice.amountPaid) return false;
    
    const dueDate = new Date(invoice.dueDate);
    const now = new Date();
    if (now <= dueDate) return false;
    
    // Check if lastSyncTime is less than 3 days old (more recent requirement for overdue)
    if (user.lastSyncTime) {
        const syncTime = new Date(user.lastSyncTime);
        const daysSinceSync = (Date.now() - syncTime.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceSync > 3) {
            console.log(`User ${user.userId} sync too old for overdue: ${daysSinceSync} days`);
            return false;
        }
    }
    
    // Check if already sent (isDue flag)
    return invoice.isDue !== true;
}

// Helper function to get property and tenant data - FLATTENED STRUCTURE
async function getInvoiceContext(invoice: any, fallbackInvoiceId: string | null = null): Promise<any> {
    const userId = invoice.userId.toString();
    const invoiceLocalId = invoice.localId || fallbackInvoiceId || 'unknown';
    
    console.log(`Getting invoice context for invoice ${invoiceLocalId}, user ${userId}`);

    // Get tenant data from flattened structure
    const tenantDoc = await db
        .collection('users')
        .doc(userId)
        .collection('tenants')
        .doc(invoice.tenantId.toString())
        .get();

    if (!tenantDoc.exists) {
        throw new Error(`Tenant not found: ${invoice.tenantId} in flattened structure`);
    }

    const tenantData = tenantDoc.data()!;
    console.log(`Found tenant: ${tenantData.name}, phone: ${tenantData.phone}`);

    // Get property data from flattened structure
    const propertyDoc = await db
        .collection('users')
        .doc(userId)
        .collection('properties')
        .doc(invoice.propertyId.toString())
        .get();

    if (!propertyDoc.exists) {
        throw new Error(`Property not found: ${invoice.propertyId} in flattened structure`);
    }

    const propertyData = propertyDoc.data()!;
    console.log(`Found property: ${propertyData.name}`);

    // Get user data
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
        throw new Error(`User not found: ${userId}`);
    }

    const userData = userDoc.data()!;
    console.log(`Found user: ${userData.name || userData.email}`);

    return {
        tenant: tenantData,
        property: propertyData,
        user: userData,
        company: userData?.company
    };
}

// Helper function to format currency
function formatCurrency(amount: number): string {
    return `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Helper function to calculate days overdue
function getDaysOverdue(dueDate: string): number {
    const due = new Date(dueDate);
    const now = new Date();
    const diffTime = now.getTime() - due.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// UPDATED: Send overdue notification with consent check
async function sendOverdueNotification(invoice: any, fallbackInvoiceId: string | null = null): Promise<boolean> {
    try {
        const invoiceLocalId = invoice.localId || fallbackInvoiceId || 'unknown';
        console.log(`Checking overdue notification for invoice ${invoiceLocalId}`);
        const { tenant, user, property, company } = await getInvoiceContext(invoice, fallbackInvoiceId);
        
        if (!shouldSendOverdueMessage(invoice, user)) {
            console.log(`Should not send overdue message for invoice ${invoiceLocalId}`);
            return false;
        }

        // CHECK CONSENT FIRST
        const consentCheck = await checkTenantConsent(tenant.phone);
        if (!consentCheck.hasConsent) {
            console.log(`No consent for tenant ${tenant.name} (${tenant.phone}), sending consent request`);
            return await sendConsentRequest(tenant, property, company, user);
        }

        if (!tenant.phone) {
            console.error(`No phone number found for tenant ${tenant.name}`);
            return false;
        }

        const daysOverdue = getDaysOverdue(invoice.dueDate);
        const outstandingAmount = invoice.totalAmount - invoice.amountPaid;

        const templateParams = [
            'Reminder: Pay your current and bills',
            formatCurrency(outstandingAmount),
            daysOverdue.toString(),
            'late fees'
        ];

        // Process the PDF URL for WhatsApp template
        const processedUrl = processFirebaseUrlForWhatsApp(invoice.pdfUrl);

        console.log(`Sending overdue to phone: ${tenant.phone}, days overdue: ${daysOverdue}`);
        console.log(`Original PDF URL: ${invoice.pdfUrl}`);
        console.log(`Processed URL parameter: ${processedUrl}`);
        
        const success = await sendWhatsAppMessage(tenant.phone, TEMPLATES.OVERDUE, templateParams, processedUrl);
        
        if (success) {
            await updateInvoiceFlags(invoice.userId, invoiceLocalId, { isDue: true });
            console.log(`Successfully sent overdue notification for invoice ${invoiceLocalId}`);
        }
        
        return success;
    } catch (error) {
        console.error('Error sending overdue notification:', error);
        return false;
    }
}

// Helper function to update invoice flags - FLATTENED STRUCTURE
async function updateInvoiceFlags(userId: string, invoiceLocalId: string, flags: any): Promise<void> {
    try {
        console.log(`Updating invoice ${invoiceLocalId} flags in flattened structure:`, flags);
        
        const invoiceRef = db
            .collection('users')
            .doc(userId.toString())
            .collection('invoices')
            .doc(invoiceLocalId.toString());

        await invoiceRef.update(flags);
        console.log(`Updated invoice ${invoiceLocalId} flags:`, flags);
    } catch (error) {
        console.error('Error updating invoice flags:', error);
        throw error;
    }
}

// NEW: Consent handler function
export const handleConsent = onRequest({
    timeoutSeconds: 30,
    memory: '256MiB',
    region: 'africa-south1'
}, async (req, res) => {
    try {
        const { phone, name, agent, company, property, status, date } = req.query;
        
        if (!phone || !status) {
            res.status(400).send("Missing required parameters: phone, status.");
            return;
        }
        
        const normalizedPhone = phone.toString().replace(/\D/g, ''); // digits only
        const allowedRef = db.collection("allowed").doc(normalizedPhone);
        
        if (status.toString().toLowerCase() === "allow") {
            await allowedRef.set(
                {
                    phone: normalizedPhone,
                    name: name?.toString() || null,
                    agent: agent?.toString() || null,
                    company: company?.toString() || null,
                    property: property?.toString() || null,
                    status: "allowed",
                    updatedAt: FieldValue.serverTimestamp(),
                    date: date?.toString() || null,
                },
                { merge: true }
            );
            console.log(`Consent allowed for phone: ${normalizedPhone}`);
        } else if (status.toString().toLowerCase() === "stop") {
            await allowedRef.set(
                {
                    phone: normalizedPhone,
                    status: "stopped",
                    updatedAt: FieldValue.serverTimestamp(),
                    date: date?.toString() || null,
                },
                { merge: true }
            );
            console.log(`Consent stopped for phone: ${normalizedPhone}`);
        } else {
            res.status(400).send("Invalid status. Use 'allow' or 'stop'.");
            return;
        }
        
        // Simple branded response
        res.set("Content-Type", "text/html");
        res.status(200).send(`
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Consent Updated</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            background: #f9f9f9;
                            padding: 40px;
                            text-align: center;
                        }
                        .box {
                            display: inline-block;
                            background: #fff;
                            border-radius: 8px;
                            padding: 30px;
                            box-shadow: 0 2px 6px rgba(0,0,0,0.1);
                        }
                        h1 { color: #4CAF50; margin-bottom: 20px; }
                        p { font-size: 16px; }
                    </style>
                </head>
                <body>
                    <div class="box">
                        <h1>✅ Success</h1>
                        <p>Consent status for <strong>${normalizedPhone}</strong> updated to <strong>${status}</strong>.</p>
                    </div>
                </body>
            </html>
        `);
    } catch (error) {
        console.error("Error handling consent:", error);
        res.status(500).send("Internal server error.");
    }
});

// RevenueCat Webhook Handler - Deployed to South Africa region
export const plotWebhook = onRequest({
    timeoutSeconds: 60,
    memory: '512MiB',
    cors: false,
    maxInstances: 10,
    region: 'africa-south1'
}, async (req, res) => {
    console.log(`Webhook request received: ${req.method}`);
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    
    try {
        const signature = req.headers['authorization']?.toString().replace('Bearer ', '') ||
            req.headers['x-revenuecat-signature']?.toString();
        const webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
        const rawBody = Buffer.from(req.rawBody || req.body);
        
        if (signature && webhookSecret) {
            if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
                console.error('Invalid webhook signature');
                res.status(401).json({ error: 'Invalid signature' });
                return;
            }
        }
        
        const event = JSON.parse(rawBody.toString());
        console.log(`Received RevenueCat webhook: ${event.event.type} for user ${event.event.app_user_id}`);
        
        await handleSubscriptionEvent(event.event);
        
        const response = {
            received: true,
            processed: true,
            eventType: event.event.type,
            userId: event.event.app_user_id
        };
        
        res.status(200).json(response);
    } catch (error: any) {
        console.error('Webhook processing error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

export const plotWebhookHealth = onRequest({
    timeoutSeconds: 10,
    memory: '128MiB',
    region: 'africa-south1'
}, async (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'plotWebhook',
        region: 'africa-south1'
    });
});

// Main Cloud Function - Invoice Document Trigger - SOUTH AFRICA REGION
export const processInvoiceNotifications = onDocumentWritten({
    document: 'users/{userId}/invoices/{invoiceId}',
    region: 'africa-south1'
}, async (event) => {
    try {
        const { userId, invoiceId } = event.params;
        console.log(`TRIGGER FIRED! Processing invoice ${invoiceId} for user ${userId} in South Africa region`);
        
        if (!event.data?.after.exists) {
            console.log(`Invoice ${invoiceId} was deleted, skipping notifications`);
            return;
        }

        const invoice = event.data.after.data();
        const previousInvoice = event.data.before?.exists ? event.data.before.data() : null;
        
        if (!invoice) {
            console.error('No invoice data found in event');
            return;
        }

        // Add localId from document path if missing
        if (!invoice.localId) {
            console.log(`Invoice missing localId, using document ID: ${invoiceId}`);
            invoice.localId = invoiceId;
        }
        
        console.log(`Raw invoice data:`, JSON.stringify(invoice, null, 2));
        
        // Determine notification needs based on YOUR logic
        const isInvoicePaid = invoice.pdfStatus === 'paid' || invoice.isPaid;
        const wasPreviouslyPaid = previousInvoice ? 
            (previousInvoice.pdfStatus === 'paid' || previousInvoice.isPaid) : false;
        
        const paymentStatusChanged = wasPreviouslyPaid !== isInvoicePaid;

        console.log(`Invoice analysis:`);
        console.log(`- Current status: ${invoice.pdfStatus || invoice.status || 'pending'}`);
        console.log(`- Previous status: ${previousInvoice?.pdfStatus || previousInvoice?.status || 'none'}`);
        console.log(`- isInvoicePaid: ${isInvoicePaid}`);
        console.log(`- wasPreviouslyPaid: ${wasPreviouslyPaid}`);
        console.log(`- paymentStatusChanged: ${paymentStatusChanged}`);
        console.log(`- isNew flag: ${invoice.isNew}`);
        console.log(`- isPaid flag: ${invoice.isPaid}`);
        console.log(`- isDue flag: ${invoice.isDue}`);

        let notificationsSent = 0;

        // 1. New Invoice Notification
        // Send if: isNew flag missing OR isNew=true, AND invoice not paid
        const shouldSendNewNotification = (!invoice.hasOwnProperty('isNew') || invoice.isNew === true) && !isInvoicePaid;
        
        if (shouldSendNewNotification) {
            console.log(`Attempting new invoice notification for invoice ${invoiceId}`);
            const success = await sendNewInvoiceNotification(invoice, invoiceId);
            if (success) {
                notificationsSent++;
                console.log(`New invoice notification sent successfully`);
            } else {
                console.log(`New invoice notification failed`);
            }
        } else {
            console.log(`Skipping new invoice notification - conditions not met`);
        }

        // 2. Payment Success Notification
        // Send if: invoice is paid AND (isPaid flag missing OR isPaid=false)
        const shouldSendPaymentNotification = isInvoicePaid && (!invoice.hasOwnProperty('hasPaid') || invoice.hasPaid === false);
        
        if (shouldSendPaymentNotification) {
            console.log(`Attempting payment success notification for invoice ${invoiceId}`);
            const success = await sendPaymentSuccessNotification(invoice, invoiceId);
            if (success) {
                notificationsSent++;
                console.log(`Payment success notification sent successfully`);
            } else {
                console.log(`Payment success notification failed`);
            }
        } else {
            console.log(`Skipping payment success notification - conditions not met`);
        }

        // 3. Overdue Notification
        if (!isInvoicePaid) {
            console.log(`Attempting overdue notification for invoice ${invoiceId}`);
            const success = await sendOverdueNotification(invoice, invoiceId);
            if (success) {
                notificationsSent++;
                console.log(`Overdue notification sent successfully`);
            } else {
                console.log(`Overdue notification failed or not needed`);
            }
        }

        console.log(`PROCESSING COMPLETE: Invoice ${invoiceId} processed, ${notificationsSent} notifications sent`);

        // Log the processing result
        await db.collection('notification_logs').add({
            invoiceId: invoice.localId || invoiceId,
            userId: parseInt(userId),
            tenantId: invoice.tenantId,
            propertyId: invoice.propertyId,
            timestamp: FieldValue.serverTimestamp(),
            notificationsSent,
            isInvoicePaid,
            wasPreviouslyPaid,
            paymentStatusChanged,
            processedAt: new Date().toISOString(),
            flags: {
                isNew: invoice.isNew,
                hasPaid: invoice.hasPaid,
                isDue: invoice.isDue
            }
        });
        
    } catch (error: any) {
        console.error('ERROR in processInvoiceNotifications:', error);
        await db.collection('notification_errors').add({
            invoiceId: event.params.invoiceId,
            userId: event.params.userId,
            error: error.message,
            timestamp: FieldValue.serverTimestamp(),
            stack: error.stack
        });
    }
});

// Scheduled function to check for overdue invoices
export const checkOverdueInvoices = onSchedule({
    schedule: '0 9 * * *',
    timeZone: 'Africa/Nairobi',
    region: 'us-central1'
}, async (event) => {
    console.log('Starting daily overdue check with flattened structure in South Africa...');
    
    try {
        const usersSnapshot = await db
            .collection('users')
            .where('type', '==', 'paid')
            .get();

        let processedUsers = 0;
        let notificationsSent = 0;

        for (const userDoc of usersSnapshot.docs) {
            try {
                const user = userDoc.data();
                
                if (!canSendNotification(user, 'overdue')) {
                    continue;
                }

                const invoicesSnapshot = await db
                    .collection('users')
                    .doc(userDoc.id)
                    .collection('invoices')
                    .get();

                for (const invoiceDoc of invoicesSnapshot.docs) {
                    const invoice = invoiceDoc.data();
                    
                    if (invoice.totalAmount <= invoice.amountPaid) {
                        continue;
                    }

                    const dueDate = new Date(invoice.dueDate);
                    const now = new Date();
                    
                    if (now > dueDate && invoice.isDue !== true) {
                        const success = await sendOverdueNotification(invoice, invoiceDoc.id);
                        if (success) {
                            notificationsSent++;
                        }
                    }
                }

                processedUsers++;
            } catch (error) {
                console.error(`Error processing user ${userDoc.id}:`, error);
            }
        }

        console.log(`Daily overdue check completed: ${processedUsers} users processed, ${notificationsSent} notifications sent`);

        await db.collection('batch_logs').add({
            type: 'overdue_check',
            timestamp: FieldValue.serverTimestamp(),
            processedUsers,
            notificationsSent,
            completedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in daily overdue check:', error);
    }
});

// Health check endpoint
export const healthCheck = onRequest({
    region: 'africa-south1'
}, async (req, res) => {
    try {
        const testResponse = await axios.get(
            `${WHATSAPP_CONFIG.BASE_URL}/${WHATSAPP_CONFIG.VERSION}/${WHATSAPP_CONFIG.PHONE_NUMBER_ID}`,
            {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_CONFIG.ACCESS_TOKEN}`
                }
            }
        );

        res.status(200).json({
            status: 'healthy',
            whatsapp_api: testResponse.status === 200 ? 'connected' : 'error',
            timestamp: new Date().toISOString(),
            region: 'africa-south1'
        });
    } catch (error: any) {
        console.error('Health check failed:', error);
        res.status(500).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString(),
            region: 'africa-south1'
        });
    }
});