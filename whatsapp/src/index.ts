

// functions/src/index.ts
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import axios from 'axios';
import crypto from 'crypto';
import { Request, Response } from 'express';

// Initialize Firebase Admin SDK
if (getApps().length === 0) {
    initializeApp();
}
const db = getFirestore();

// Configuration - Replace with your actual values
const WHATSAPP_CONFIG = {
  ACCESS_TOKEN: 'EZC', // Replace with your token
  PHONE_NUMBER_ID: '744556782079507', // Replace with your phone number ID
  VERSION: 'v18.0', // Latest API version
  BASE_URL: 'https://graph.facebook.com'
};

// Template names from your Meta account
const TEMPLATES = {
  NEW_INVOICE: 'invoice', 
  OVERDUE: 'payment_overdue_1',  
  PAYMENT_SUCCESS: 'payment_confirmation_2',
  // USER_OVERDUE_NOTIFICATION: 'landlord_overdue_alert',
  // USER_GENERAL_NOTIFICATION: 'landlord_notification'
};

// Rate limiting configuration
const RATE_LIMITS = {
  MESSAGES_PER_MINUTE: 50,
  MESSAGES_PER_HOUR: 1000,
  RETRY_DELAY_MS: 5000,
  MAX_RETRIES: 3
};

// User tier limits and permissions
const TIER_PERMISSIONS = {
  free: ['invoice'],
  low: ['invoice'],
  business: ['invoice', 'overdue'],
  pro: ['invoice', 'overdue', 'payment'],
  enterprise: ['invoice', 'overdue', 'payment']
};

interface InvoiceData {
  id: string;
  tenantLocalId: number;
  propertyLocalId: number;
  userId: number;
  billingMonth: string;
  rentAmount: number;
  totalAmount: number;
  amountPaid: number;
  dueDate: string;
  pdfUrl?: string;
  pdfStatus?: string;
  lastSyncTime: Timestamp;
  isNew?: boolean;
  isDue?: boolean;
  isPaid?: boolean;
}

interface TenantData {
  localId: number;
  name: string;
  phone: string;
  email?: string;
  unitNumber: string;
}

interface PropertyData {
  localId: number;
  name: string;
  address: string;
}

interface UserData {
  localId?: number;
  userId?: string;
  name: string;
  email: string;
  phone?: string;
  type: 'free' | 'paid';
  tier: 'free' | 'low' | 'business' | 'pro' | 'enterprise';
  storage: boolean;
  syncLogs?: any[];
  createdAt?: Date;
  updatedAt?: Date;
  lastSyncTime?: string;
  subscriptionExpiry?: Date;
  storageType?: string;
}

interface CompanyData {
  name: string;
  phone?: string;
  email?: string;
}

// RevenueCat Types
interface RevenueCatEvent {
  type: string;
  app_user_id: string;
  product_id: string;
  expiration_at_ms?: number;
  environment: string;
}

interface WebhookPayload {
  event: RevenueCatEvent;
}

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
  const key = `${identifier}_${Math.floor(now / 60000)}`; // Per minute bucket
  
  const current = rateLimitStore.get(key) || { count: 0, resetTime: now + 60000 };
  
  if (current.count >= RATE_LIMITS.MESSAGES_PER_MINUTE) {
    return false;
  }
  
  current.count++;
  rateLimitStore.set(key, current);
  return true;
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
  
  return crypto.timingSafeEqual(
    Buffer.from(signature), 
    Buffer.from(expectedSignature)
  );
};

const getTierFromProductId = (productId: string): string => {
  console.log(`Determining tier for product: ${productId}`);
  
  if (productId.startsWith('low_')) return 'low';
  if (productId.startsWith('business_')) return 'business';
  if (productId.startsWith('pro_')) return 'pro';
  if (productId.startsWith('enterprise_')) return 'enterprise';
  
  return 'free';
};

const createDefaultUser = (userId: string): UserData => {
  const now = new Date();
  const userData: UserData = {
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
  
  console.log(`Creating default user data:`, JSON.stringify(userData, null, 2));
  return userData;
};

const findOrCreateUserDocument = async (userId: string): Promise<{ docId: string; data: UserData }> => {
  console.log(`Looking for user: ${userId}`);
  
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (userDoc.exists) {
      console.log(`Found existing user: ${userId}`);
      console.log(`Existing user data:`, JSON.stringify(userDoc.data(), null, 2));
      return { docId: userId, data: userDoc.data() as UserData };
    }
    
    // User doesn't exist, create new one
    console.log(`User not found, creating new user: ${userId}`);
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
  console.log(`Updating user ${docId}: tier=${tier}, type=${type}, storage=${storage}, expiration=${expirationDate}`);
  
  try {
    const updateData: Partial<UserData> = {
      tier: tier as any,
      type: type as any,
      storage,
      updatedAt: new Date(),
      lastSyncTime: new Date().toISOString()
    };
    
    if (expirationDate) {
      updateData.subscriptionExpiry = expirationDate;
    }
    
    await db.collection('users').doc(docId).update(updateData);
    console.log(`Successfully updated user ${docId} subscription`);
    console.log(`Update data:`, JSON.stringify(updateData, null, 2));
    
  } catch (error) {
    console.error(`Error updating user ${docId} subscription:`, error);
    throw error;
  }
};

const handleSubscriptionEvent = async (event: RevenueCatEvent): Promise<void> => {
  const userId = event.app_user_id;
  console.log(`Processing event ${event.type} for user: ${userId}`);
  
  try {
    const { docId } = await findOrCreateUserDocument(userId);
    console.log(`Working with user document: ${docId}`);
    
    switch (event.type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'PRODUCT_CHANGE':
        console.log(`Processing ${event.type} for product: ${event.product_id}`);
        
        if (event.product_id === 'storage_onetime') {
          console.log(`Processing one-time storage purchase`);
          await updateUserSubscription(docId, 'free', 'free', true);
        } else {
          const tier = getTierFromProductId(event.product_id);
          const expirationDate = event.expiration_at_ms
            ? new Date(event.expiration_at_ms)
            : undefined;
          
          console.log(`Setting user to tier: ${tier}, expiration: ${expirationDate}`);
          
          // For 'low' tier, set storage to false
          const storageAccess = tier === 'low' ? false : true;
          
          await updateUserSubscription(docId, tier, 'paid', storageAccess, expirationDate);
        }
        break;
        
      case 'CANCELLATION':
      case 'EXPIRATION':
      case 'BILLING_ISSUE':
        console.log(`Processing ${event.type}, checking storage retention`);
        
        const { data: currentUser } = await findOrCreateUserDocument(userId);
        const keepStorage = (currentUser?.storage) &&
          (currentUser?.storageType === 'onetime' || event.product_id !== 'storage_onetime');
        
        console.log(`Keep storage: ${keepStorage}, current storage type: ${currentUser?.storageType}`);
        await updateUserSubscription(docId, 'free', 'free', keepStorage || false);
        break;
        
      case 'NON_RENEWING_PURCHASE':
        console.log(`Processing one-time purchase: ${event.product_id}`);
        
        if (event.product_id === 'storage_onetime') {
          console.log(`Updating user with one-time storage purchase`);
          
          await db.collection('users').doc(docId).update({
            storage: true,
            storageType: 'onetime',
            updatedAt: new Date(),
            lastSyncTime: new Date().toISOString()
          });
          
          console.log(`Updated user ${docId} with one-time storage purchase`);
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

// WhatsApp API helper functions
async function sendWhatsAppMessage(
  to: string,
  templateName: string,
  templateParams: string[],
  buttonUrl?: string,
  retryCount = 0
): Promise<boolean> {
  try {
    // Rate limiting check
    if (!checkRateLimit('whatsapp_api')) {
      console.log('Rate limit exceeded, queuing message');
      if (retryCount < RATE_LIMITS.MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMITS.RETRY_DELAY_MS));
        return sendWhatsAppMessage(to, templateName, templateParams, buttonUrl, retryCount + 1);
      }
      throw new Error('Rate limit exceeded after retries');
    }

    // Clean phone number (remove non-digits, ensure country code)
    const cleanPhone = to.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('254') ? cleanPhone : 
                          cleanPhone.startsWith('0') ? '254' + cleanPhone.substring(1) :
                          cleanPhone.startsWith('7') ? '254' + cleanPhone : cleanPhone;

    const messagePayload: any = {
      messaging_product: 'whatsapp',
      to: formattedPhone,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: 'en'
        },
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

    // Add button with URL if provided
    if (buttonUrl) {
      messagePayload.template.components.push({
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [
          {
            type: 'text',
            text: buttonUrl
          }
        ]
      });
    }

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
      console.log(`WhatsApp message sent successfully to ${formattedPhone}:`, response.data);
      return true;
    } else {
      throw new Error(`WhatsApp API returned status ${response.status}`);
    }

  } catch (error) {
    console.error(`Error sending WhatsApp message (attempt ${retryCount + 1}):`, error);
    
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorData = error.response?.data;
      
      console.error('WhatsApp API Error Details:', {
        status,
        data: errorData,
        phone: to,
        template: templateName
      });

      // Handle specific WhatsApp API errors
      if (status === 429) { // Rate limited
        if (retryCount < RATE_LIMITS.MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RATE_LIMITS.RETRY_DELAY_MS * (retryCount + 1)));
          return sendWhatsAppMessage(to, templateName, templateParams, buttonUrl, retryCount + 1);
        }
      } else if (status === 400) {
        // Bad request - don't retry
        console.error('Bad request to WhatsApp API - not retrying');
        return false;
      }
    }

    if (retryCount < RATE_LIMITS.MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, RATE_LIMITS.RETRY_DELAY_MS));
      return sendWhatsAppMessage(to, templateName, templateParams, buttonUrl, retryCount + 1);
    }

    return false;
  }
}

// Helper function to check if user can receive notifications
function canSendNotification(user: UserData, messageType: string): boolean {
  if (user.type !== 'paid') return false;
  
  // Check sync log recency (must be less than 8 days old)
  if (user.syncLogs && user.syncLogs.length > 0) {
    const latestSync = user.syncLogs[0];
    const syncTime = latestSync.timestamp?.toDate?.() || new Date(latestSync.timestamp);
    const daysSinceSync = (Date.now() - syncTime.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceSync > 8) {
      console.log(`User ${user.localId} sync too old: ${daysSinceSync} days`);
      return false;
    }
  } else {
    console.log(`User ${user.localId} has no sync logs`);
    return false;
  }

  const allowedTypes = TIER_PERMISSIONS[user.tier] || [];
  return allowedTypes.includes(messageType);
}

// Helper function to check overdue conditions
function shouldSendOverdueMessage(invoice: InvoiceData, user: UserData): boolean {
  if (!canSendNotification(user, 'overdue')) return false;
  
  // Check if invoice is unpaid and overdue
  if (invoice.totalAmount <= invoice.amountPaid) return false;
  
  const dueDate = new Date(invoice.dueDate);
  const now = new Date();
  if (now <= dueDate) return false;
  
  // Check if sync log is less than 3 days old (more recent requirement for overdue)
  if (user.syncLogs && user.syncLogs.length > 0) {
    const latestSync = user.syncLogs[0];
    const syncTime = latestSync.timestamp?.toDate?.() || new Date(latestSync.timestamp);
    const daysSinceSync = (Date.now() - syncTime.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceSync > 3) {
      console.log(`User ${user.localId} sync too old for overdue: ${daysSinceSync} days`);
      return false;
    }
  }
  
  // Check if already sent (isDue flag)
  return invoice.isDue !== true;
}

// Helper function to get property and tenant data
async function getInvoiceContext(invoice: InvoiceData) {
  const userId = invoice.userId.toString();
  const propertyId = invoice.propertyLocalId.toString();
  const tenantPhoneId = await getTenantPhoneId(userId, propertyId, invoice.tenantLocalId);
  
  if (!tenantPhoneId) {
    throw new Error(`Cannot find tenant phone ID for tenant ${invoice.tenantLocalId}`);
  }

  // Get tenant data
  const tenantDoc = await db
    .collection('users')
    .doc(userId)
    .collection('properties')
    .doc(propertyId)
    .collection('tenants')
    .doc(tenantPhoneId)
    .get();

  if (!tenantDoc.exists) {
    throw new Error(`Tenant not found: ${tenantPhoneId}`);
  }

  // Get property data
  const propertyDoc = await db
    .collection('users')
    .doc(userId)
    .collection('properties')
    .doc(propertyId)
    .get();

  if (!propertyDoc.exists) {
    throw new Error(`Property not found: ${propertyId}`);
  }

  // Get user data
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    throw new Error(`User not found: ${userId}`);
  }

  return {
    tenant: tenantDoc.data() as TenantData,
    property: propertyDoc.data() as PropertyData,
    user: userDoc.data() as UserData,
    company: userDoc.data()?.company as CompanyData | undefined
  };
}

// Helper function to find tenant phone ID
async function getTenantPhoneId(userId: string, propertyId: string, tenantLocalId: number): Promise<string | null> {
  const tenantsSnapshot = await db
    .collection('users')
    .doc(userId)
    .collection('properties')
    .doc(propertyId)
    .collection('tenants')
    .where('localId', '==', tenantLocalId)
    .limit(1)
    .get();

  if (tenantsSnapshot.empty) return null;
  return tenantsSnapshot.docs[0].id;
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

// Send new invoice notification
async function sendNewInvoiceNotification(invoice: InvoiceData): Promise<boolean> {
  try {
    const { tenant, property, user, company } = await getInvoiceContext(invoice);
    
    if (!canSendNotification(user, 'invoice')) {
      console.log(`User ${user.localId} cannot receive invoice notifications`);
      return false;
    }

    if (invoice.isNew === false) {
      console.log(`Invoice ${invoice.id} already marked as notified for new invoice`);
      return false;
    }

    // Prepare template parameters based on your template
    const templateParams = [
      tenant.name, // {{1}}
      invoice.billingMonth, // {{2}}
      property.name, // {{3}}
      company?.name || user.name, // {{4}}
      company?.phone || user.phone || '', // {{5}}
      company?.email || user.email // {{6}}
    ];

    const success = await sendWhatsAppMessage(
      tenant.phone,
      TEMPLATES.NEW_INVOICE,
      templateParams,
      invoice.pdfUrl
    );

    if (success) {
      // Mark as sent
      await updateInvoiceFlags(invoice.userId, invoice.propertyLocalId, invoice.tenantLocalId, invoice.id, {
        isNew: false
      });
    }

    return success;
  } catch (error) {
    console.error('Error sending new invoice notification:', error);
    return false;
  }
}

// Send overdue notification, property, company
async function sendOverdueNotification(invoice: InvoiceData): Promise<boolean> {
  try {
    const { tenant, user } = await getInvoiceContext(invoice);
    
    if (!shouldSendOverdueMessage(invoice, user)) {
      return false;
    }

    const daysOverdue = getDaysOverdue(invoice.dueDate);
    const outstandingAmount = invoice.totalAmount - invoice.amountPaid;

    const templateParams = [
      'Reminder: Pay your current and bills', // {{1}}
      formatCurrency(outstandingAmount), // {{2}}
      daysOverdue.toString(), // {{3}}
      'late fees' // {{4}}
    ];

    const success = await sendWhatsAppMessage(
      tenant.phone,
      TEMPLATES.OVERDUE,
      templateParams,
      invoice.pdfUrl
    );

    if (success) {
      // Mark as sent
      await updateInvoiceFlags(invoice.userId, invoice.propertyLocalId, invoice.tenantLocalId, invoice.id, {
        isDue: true
      });
    }

    return success;
  } catch (error) {
    console.error('Error sending overdue notification:', error);
    return false;
  }
}

// Send payment success notification, company
async function sendPaymentSuccessNotification(invoice: InvoiceData): Promise<boolean> {
  try {
    const { tenant, property, user } = await getInvoiceContext(invoice);
    
    if (!canSendNotification(user, 'payment')) {
      console.log(`User ${user.localId} cannot receive payment notifications`);
      return false;
    }

    if (invoice.isPaid === true) {
      console.log(`Invoice ${invoice.id} already marked as notified for payment`);
      return false;
    }

    const templateParams = [
      tenant.name, // {{1}}
      formatCurrency(invoice.amountPaid), // {{2}} - amount paid
      `${property.name} ${tenant.unitNumber}` // {{3}} - property and unit
    ];

    const success = await sendWhatsAppMessage(
      tenant.phone,
      TEMPLATES.PAYMENT_SUCCESS,
      templateParams,
      invoice.pdfUrl
    );

    if (success) {
      // Mark as sent
      await updateInvoiceFlags(invoice.userId, invoice.propertyLocalId, invoice.tenantLocalId, invoice.id, {
        isPaid: true
      });
    }

    return success;
  } catch (error) {
    console.error('Error sending payment success notification:', error);
    return false;
  }
}

// Helper function to update invoice flags
async function updateInvoiceFlags(
  userId: number,
  propertyLocalId: number,
  tenantLocalId: number,
  invoiceId: string,
  flags: { isNew?: boolean; isDue?: boolean; isPaid?: boolean }
): Promise<void> {
  try {
    const tenantPhoneId = await getTenantPhoneId(userId.toString(), propertyLocalId.toString(), tenantLocalId);
    if (!tenantPhoneId) {
      throw new Error(`Cannot find tenant phone ID for tenant ${tenantLocalId}`);
    }

    const invoiceRef = db
      .collection('users')
      .doc(userId.toString())
      .collection('properties')
      .doc(propertyLocalId.toString())
      .collection('tenants')
      .doc(tenantPhoneId)
      .collection('invoices')
      .doc(invoiceId);

    await invoiceRef.update(flags);
    console.log(`Updated invoice ${invoiceId} flags:`, flags);
  } catch (error) {
    console.error('Error updating invoice flags:', error);
    throw error;
  }
}

// RevenueCat Webhook Handler
export const plotWebhook = onRequest({
  timeoutSeconds: 60,
  memory: '512MiB',
  cors: false,
  maxInstances: 10,
}, async (req: Request, res: Response) => {
  console.log(`Webhook request received: ${req.method}`);
  
  if (req.method !== 'POST') {
    console.log(`Invalid method: ${req.method}`);
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const signature = (req.headers['authorization']?.toString().replace('Bearer ', '')) ||
        req.headers['x-revenuecat-signature'] as string;
    const webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
    const rawBody = Buffer.from((req as any).rawBody || req.body);

    console.log(`Processing webhook with signature verification: ${!!signature && !!webhookSecret}`);

    // Optional signature verification
    if (signature && webhookSecret) {
      if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
        console.error('Invalid webhook signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }
      console.log('Webhook signature verified successfully');
    }

    const event: WebhookPayload = JSON.parse(rawBody.toString());
    console.log(`Received RevenueCat webhook: ${event.event.type} for user ${event.event.app_user_id}`);
    console.log(`Full event data:`, JSON.stringify(event.event, null, 2));

    // Process all events (sandbox and production)
    console.log(`Processing ${event.event.environment} event`);

    await handleSubscriptionEvent(event.event);

    const response = {
      received: true,
      processed: true,
      eventType: event.event.type,
      userId: event.event.app_user_id
    };
    
    console.log(`Webhook processing completed successfully:`, JSON.stringify(response, null, 2));
    res.status(200).json(response);

  } catch (error) {
    console.error('Webhook processing error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export const plotWebhookHealth = onRequest({
  timeoutSeconds: 10,
  memory: '128MiB',
}, async (req: Request, res: Response) => {
  console.log('Health check requested');
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'plotWebhook'
  });
});

// Main Cloud Function - Invoice Document Trigger (Updated for v2 API)
export const processInvoiceNotifications = onDocumentWritten(
  {
    document: 'users/{userId}/properties/{propertyId}/tenants/{tenantId}/invoices/{invoiceId}',
    region: 'us-central1'
  },
  async (event) => {
    try {
      const { userId, propertyId, tenantId, invoiceId } = event.params;
      
      // Skip if document was deleted
      if (!event.data?.after.exists) {
        console.log(`Invoice ${invoiceId} was deleted, skipping notifications`);
        return;
      }

      const invoice = event.data.after.data() as InvoiceData;
      const previousInvoice = event.data.before?.exists ? event.data.before.data() as InvoiceData : null;

      console.log(`Processing invoice ${invoiceId} for user ${userId}`);
      console.log('Invoice data:', invoice);
      console.log('Previous invoice data:', previousInvoice);

      // Determine what type of notification to send
      const isNewInvoice = !previousInvoice;
      const isPaid = invoice.totalAmount <= invoice.amountPaid;
      const wasPreviouslyPaid = previousInvoice ? previousInvoice.totalAmount <= previousInvoice.amountPaid : false;
      const statusChanged = wasPreviouslyPaid !== isPaid;

      console.log(`Invoice analysis: isNew=${isNewInvoice}, isPaid=${isPaid}, statusChanged=${statusChanged}`);

      // Process notifications based on conditions
      let notificationsSent = 0;

      // 1. New Invoice Notification
      if (isNewInvoice && !isPaid) {
        console.log('Attempting to send new invoice notification...');
        const success = await sendNewInvoiceNotification(invoice);
        if (success) notificationsSent++;
      }

      // 2. Payment Success Notification
      if (isPaid && (!wasPreviouslyPaid || invoice.isPaid !== true)) {
        console.log('Attempting to send payment success notification...');
        const success = await sendPaymentSuccessNotification(invoice);
        if (success) notificationsSent++;
      }

      // 3. Overdue Notification (checked for all unpaid invoices)
      if (!isPaid) {
        console.log('Checking if overdue notification should be sent...');
        const success = await sendOverdueNotification(invoice);
        if (success) notificationsSent++;
      }

      console.log(`Processed invoice ${invoiceId}: ${notificationsSent} notifications sent`);

      // Log the processing result
      await db.collection('notification_logs').add({
        invoiceId,
        userId: parseInt(userId),
        propertyId: parseInt(propertyId),
        tenantId,
        timestamp: FieldValue.serverTimestamp(),
        notificationsSent,
        isNewInvoice,
        isPaid,
        statusChanged,
        processedAt: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('Error in processInvoiceNotifications:', error);
      
      // Log error for debugging
      await db.collection('notification_errors').add({
        invoiceId: event.params.invoiceId,
        userId: event.params.userId,
        error: error.message,
        timestamp: FieldValue.serverTimestamp(),
        stack: error.stack
      });
    }
  }
);

// Scheduled function to check for overdue invoices (Updated for v2 API)
export const checkOverdueInvoices = onSchedule(
  {
    schedule: '0 9 * * *', // Run at 9 AM daily
    timeZone: 'Africa/Nairobi',
    region: 'us-central1'
  },
  async (event) => {
    console.log('Starting daily overdue check...');
    
    try {
      // Get all paid users
      const usersSnapshot = await db
        .collection('users')
        .where('type', '==', 'paid')
        .get();

      let processedUsers = 0;
      let notificationsSent = 0;

      for (const userDoc of usersSnapshot.docs) {
        try {
          const user = userDoc.data() as UserData;
          
          // Check if user has recent sync logs
          if (!canSendNotification(user, 'overdue')) {
            continue;
          }

          // Get all properties for this user
          const propertiesSnapshot = await db
            .collection('users')
            .doc(userDoc.id)
            .collection('properties')
            .get();

          for (const propertyDoc of propertiesSnapshot.docs) {
            // Get all tenants for this property
            const tenantsSnapshot = await db
              .collection('users')
              .doc(userDoc.id)
              .collection('properties')
              .doc(propertyDoc.id)
              .collection('tenants')
              .get();

            for (const tenantDoc of tenantsSnapshot.docs) {
              // Get all unpaid invoices for this tenant
              const invoicesSnapshot = await db
                .collection('users')
                .doc(userDoc.id)
                .collection('properties')
                .doc(propertyDoc.id)
                .collection('tenants')
                .doc(tenantDoc.id)
                .collection('invoices')
                .where('totalAmount', '>', 'amountPaid')
                .get();

              for (const invoiceDoc of invoicesSnapshot.docs) {
                const invoice = invoiceDoc.data() as InvoiceData;
                
                // Check if this invoice should receive an overdue notification
                const dueDate = new Date(invoice.dueDate);
                const now = new Date();
                
                if (now > dueDate && invoice.isDue !== true) {
                  console.log(`Checking overdue invoice ${invoice.id}...`);
                  const success = await sendOverdueNotification(invoice);
                  if (success) {
                    notificationsSent++;
                  }
                }
              }
            }
          }

          processedUsers++;
        } catch (error) {
          console.error(`Error processing user ${userDoc.id}:`, error);
        }
      }

      console.log(`Daily overdue check completed: ${processedUsers} users processed, ${notificationsSent} notifications sent`);

      // Log the batch result
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
  }
);

// Health check endpoint (Updated for v2 API)
export const healthCheck = onRequest(
  {
    region: 'us-central1'
  },
  async (req, res) => {
    try {
      // Test WhatsApp API connection
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
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Health check failed:', error);
      res.status(500).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);