// functions/src/index.ts - TypeScript Version with South Africa Region
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { CallableRequest, HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import axios from 'axios';
import crypto from 'crypto';
import { defineSecret } from 'firebase-functions/params';

// Initialize Firebase Admin SDK
if (getApps().length === 0) {
    initializeApp();
}
const db = getFirestore();

const PAYSTACK_SECRET_KEY = defineSecret('PAYSTACK_SECRET_KEY');
const PAYSTACK_API_BASE = "https://api.paystack.co";

// Configuration - Replace with your actual values
const WHATSAPP_CONFIG = {
    ACCESS_TOKEN: process.env.ACCESS_TOKEN,
    PHONE_NUMBER_ID: process.env.PHONE_NUMBER_ID,
    VERSION: 'v23.0',
    BASE_URL: 'https://graph.facebook.com'
};

// Template names from your Meta account
const TEMPLATES = {
    NEW_INVOICE: 'invoice',
    OVERDUE: 'payment_overdue_1',
    PAYMENT_SUCCESS: 'payment_confirmation_2',
    SUBSCRIPTION: 'subscription',
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
// setInterval(() => {
//     const now = Date.now();
//     for (const [key, value] of rateLimitStore.entries()) {
//         if (now > value.resetTime) {
//             rateLimitStore.delete(key);
//         }
//     }
// }, 60 * 60 * 1000);
interface ProcessWebSubscriptionRequest {
  userId: string;
  userName: string;
  email: string;
  phone: string;
  planId: string;
  planName: string;
  billingCycle: 'monthly' | 'annual';
  amount: number;
  daysToAdd: number;
  cyber?: any;
}



// ============================================================
// SMS LAYER — HostPinnacle Bulk SMS
// Drop-in additions/replacements for your existing functions file.
// ============================================================
// WHAT CHANGED:
//   - Added SMS_CONFIG and SMS_TEMPLATES (add your .env vars)
//   - Added sanitizeSmsText() utility
//   - Added buildSmsMessage() — builds the 3 transactional templates
//   - Added sendHostPinnacleSms() — core low-level sender
//   - Added sendSmsWithWhatsAppFallback() — SMS first, WhatsApp if SMS fails
//     (checks user.tokens before attempting SMS)
//   - Added exported `sendSMS` onCall Cloud Function — universal,
//     callable from UI for custom messages / bulk numbers
//   - REPLACED: sendNewInvoiceNotification()
//   - REPLACED: sendPaymentSuccessNotification()
//   - REPLACED: sendOverdueNotification()
//   All other functions in your file are UNCHANGED.
// ============================================================

const SMS_CONFIG = {
    API_URL:   "https://smsportal.hostpinnacle.co.ke/SMSApi/send",
    USERID:    process.env.HP_SMS_USERID    || "",   // set in .env / functions config
    PASSWORD:  process.env.HP_SMS_PASSWORD  || "",
    APIKEY:    process.env.HP_SMS_APIKEY    || "",
    SENDER_ID: process.env.HP_SMS_SENDERID  || "",   // your approved sender ID
    MAX_LENGTH: 400,
};

// Human-readable message type labels used inside SMS text bodies.
// No template IDs needed — HostPinnacle transactional sends are free-form text.
const SMS_TEMPLATES = {
    NEW_INVOICE:     "new_invoice",
    OVERDUE:         "overdue",
    PAYMENT_SUCCESS: "payment_success",
} as const;

type SmsTemplateKey = typeof SMS_TEMPLATES[keyof typeof SMS_TEMPLATES];

// ─── UTILITIES ───────────────────────────────────────────────────────────────

/**
 * Strip emoji / non-GSM characters and trim to max 300 chars.
 * GSM-7 safe: printable ASCII + common punctuation only.
 */
function sanitizeSmsText(text: string): string {
    // Remove emoji and non-Latin extended characters (outside GSM-7 basic charset)
    const stripped = text
        .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")   // emoji blocks
        .replace(/[\u{2600}-\u{27BF}]/gu, "")      // misc symbols / dingbats
        .replace(/[^\x20-\x7E\xA0-\xFF]/gu, "")   // keep printable Latin-1 only
        .replace(/\s+/g, " ")                       // collapse whitespace
        .trim();

    return stripped.length > SMS_CONFIG.MAX_LENGTH
        ? stripped.substring(0, SMS_CONFIG.MAX_LENGTH - 3) + "..."
        : stripped;
}

/**
 * Normalise a Kenyan phone number to 254XXXXXXXXX (no +, no spaces).
 * Identical logic to what you already use for WhatsApp.
 */
function normalizeSmsPhone(raw: string): string {
    const clean = raw.replace(/[\s\-\+]/g, "");
    if (clean.startsWith("254"))  return clean;
    if (clean.startsWith("0"))    return "254" + clean.substring(1);
    if (clean.startsWith("7") || clean.startsWith("1")) return "254" + clean;
    return clean;
}

// ─── TRANSACTIONAL SMS TEMPLATES ─────────────────────────────────────────────
// Plain-text, max 300 chars, no emoji.
// These mirror the 3 WhatsApp templates but adapted for SMS constraints.

function buildSmsMessage(
    type: SmsTemplateKey,
    params: Record<string, string>
): string {
    let msg = "";

    switch (type) {
        case SMS_TEMPLATES.NEW_INVOICE:
            // params: tenantName, billingMonth, propertyName, agentName, agentPhone, agentEmail
            msg = `Dear ${params.tenantName}, your invoice for ${params.billingMonth} at ${params.propertyName} is ready. TOTAL AMOUNT: ${params.totalAmount}` +
                  ` Contact ${params.agentName} on ${params.agentPhone} for queries.` +
                  ` PLOT YANGU`;
            break;

        case SMS_TEMPLATES.OVERDUE:
            // params: tenantName, outstandingAmount, daysOverdue, propertyName
            msg = `Dear ${params.tenantName}, your rent at ${params.propertyName} is overdue by ${params.daysOverdue} day(s). ` + 
                  ` Outstanding: ${params.outstandingAmount}. Please pay to avoid late fees.` + 
                  ` PLOT YANGU`;
            break;

        case SMS_TEMPLATES.PAYMENT_SUCCESS:
            // params: tenantName, amountPaid, propertyUnit
            msg = `Dear ${params.tenantName}, ${params.agentName} has received your payment of ${params.amountPaid} for ${params.propertyUnit}. Thank you!` + 
                   ` PLOT YANGU`;
            break;

        default:
            msg = `Dear User, you have a new notification from your property manager.`+
                  ` PLOT YANGU`;
    }

    return sanitizeSmsText(msg);
}

// ─── CORE SENDER ─────────────────────────────────────────────────────────────

interface SmsSendOptions {
    /** Single number OR comma-separated list e.g. "254700000001,254700000002" */
    mobile: string;
    message: string;
    /** Optional: override default sender ID */
    senderId?: string;
    /** Skip duplicate suppression — useful for OTPs. Default: true (suppress) */
    duplicateCheck?: boolean;
}

interface SmsSendResult {
    success: boolean;
    /** Raw response from HostPinnacle */
    raw?: any;
    error?: string;
}

/**
 * Low-level HostPinnacle sender.
 * Returns { success: true } on HTTP 200 + non-error response code.
 * Never throws — callers decide what to do on failure.
 */
async function sendHostPinnacleSms(opts: SmsSendOptions): Promise<SmsSendResult> {
    try {
        if (!SMS_CONFIG.USERID || !SMS_CONFIG.APIKEY) {
            console.warn("HostPinnacle SMS credentials not configured — skipping SMS.");
            return { success: false, error: "SMS credentials not configured" };
        }

        const params = new URLSearchParams({
            userid:         SMS_CONFIG.USERID,
            password:       SMS_CONFIG.PASSWORD,
            sendMethod:     "quick",
            mobile:         opts.mobile,
            msg:            opts.message,
            senderid:       opts.senderId || SMS_CONFIG.SENDER_ID,
            msgType:        "text",
            duplicatecheck: opts.duplicateCheck === false ? "false" : "true",
            output:         "json",
        });

        const response = await axios.post(
            SMS_CONFIG.API_URL,
            params.toString(),
            {
                headers: {
                    "apikey":       SMS_CONFIG.APIKEY,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                timeout: 10_000,
            }
        );

        const data = response.data;
        console.log(`HostPinnacle SMS response for ${opts.mobile}:`, JSON.stringify(data));

        // HostPinnacle returns a top-level status field.
        // Treat anything other than explicit error codes as success.
        const isError =
            data?.status === "error" ||
            data?.ErrorCode !== undefined ||
            (typeof data?.status === "string" && data.status.toLowerCase().includes("fail"));

        if (isError) {
            return { success: false, raw: data, error: data?.message || "API error" };
        }

        return { success: true, raw: data };
    } catch (err: any) {
        const msg = err?.response?.data
            ? JSON.stringify(err.response.data)
            : err.message;
        console.error(`HostPinnacle SMS send error for ${opts.mobile}:`, msg);
        return { success: false, error: msg };
    }
}

// ─── SMS-FIRST, WHATSAPP-FALLBACK ─────────────────────────────────────────────

/**
 * Shared logic used by all 3 notification functions.
 *
 * Strategy:
 *   1. If user.tokens > 0  → try SMS via HostPinnacle and deduct 1 token on success.
 *   2. If SMS fails OR no tokens → fall through to WhatsApp (existing sendWhatsAppMessage call).
 *
 * `user.tokens` is an integer field you maintain on the user document.
 * Decrement is done with a Firestore transaction so concurrent calls are safe.
 */


async function sendSmsWithWhatsAppFallback(opts: {
    phone:        string;
    smsMessage:   string;
    userId:       string;
    sendWhatsApp: () => Promise<boolean>;
}): Promise<boolean> {
    const { phone, smsMessage, userId, sendWhatsApp } = opts;
    const mobile    = normalizeSmsPhone(phone);
    const sanitized = sanitizeSmsText(smsMessage);

    // Calculate tokens required: 1 token per 144 chars (ceiling division).
    // e.g. 144 chars = 1 token, 145 chars = 2 tokens, 288 = 2, 289 = 3 ...
    const tokensRequired = Math.ceil(sanitized.length / 144);

    let smsAttempted = false;
    let smsSent      = false;

    try {
        const userRef = db.collection("users").doc(userId);

        const tokenResult = await db.runTransaction(async (tx) => {
            const snap = await tx.get(userRef);
            if (!snap.exists) return { hadTokens: false, tokensRequired: 0 };

            const available: number = snap.data()?.tokens ?? 0;
            if (available < tokensRequired) {
                console.log(
                    `User ${userId} has ${available} token(s) but needs ${tokensRequired} — skipping SMS.`
                );
                return { hadTokens: false, tokensRequired };
            }

            // Reserve all required tokens atomically
            tx.update(userRef, {
                tokens: admin.firestore.FieldValue.increment(-tokensRequired),
            });
            return { hadTokens: true, tokensRequired };
        });

        if (tokenResult.hadTokens) {
            smsAttempted = true;
            const result = await sendHostPinnacleSms({ mobile, message: sanitized });

            if (result.success) {
                smsSent = true;
                console.log(
                    `SMS sent to ${mobile} for user ${userId} — deducted ${tokensRequired} token(s) ` +
                    `(${sanitized.length} chars).`
                );
                return true; // no WhatsApp needed
            }

            // SMS failed — refund all reserved tokens
            console.warn(
                `SMS failed for ${mobile}, refunding ${tokensRequired} token(s) and falling back to WhatsApp.`
            );
            await db.collection("users").doc(userId).update({
                tokens: admin.firestore.FieldValue.increment(tokensRequired),
            });
        } else {
            console.log(`User ${userId} has insufficient tokens — going straight to WhatsApp.`);
        }
    } catch (tokenErr) {
        console.error("Token transaction error, falling back to WhatsApp:", tokenErr);
        if (smsAttempted && !smsSent) {
            // Best-effort refund — fire-and-forget
            db.collection("users").doc(userId).update({
                tokens: admin.firestore.FieldValue.increment(tokensRequired),
            }).catch(() => {});
        }
    }

    console.log(`Sending WhatsApp fallback to ${phone} for user ${userId}`);
    return sendWhatsApp();
}
// async function sendSmsWithWhatsAppFallback(opts: {
//     phone:          string;
//     smsMessage:     string;
//     userId:         string;         // for token deduction
//     /** Async function that sends the WhatsApp message — caller provides it */
//     sendWhatsApp:   () => Promise<boolean>;
// }): Promise<boolean> {
//     const { phone, smsMessage, userId, sendWhatsApp } = opts;
//     const mobile = normalizeSmsPhone(phone);

//     // ── Attempt SMS if user has tokens ───────────────────────────────────────
//     let smsAttempted = false;
//     let smsSent      = false;

//     try {
//         const userRef = db.collection("users").doc(userId);

//         // Read token count inside a transaction so we never go negative
//         const tokenResult = await db.runTransaction(async (tx) => {
//             const snap = await tx.get(userRef);
//             if (!snap.exists) return { hadTokens: false };
//             const tokens: number = snap.data()?.tokens ?? 0;
//             if (tokens <= 0) return { hadTokens: false };
//             // Reserve the token immediately — we'll release it if SMS fails
//             tx.update(userRef, { tokens: admin.firestore.FieldValue.increment(-1) });
//             return { hadTokens: true };
//         });

//         if (tokenResult.hadTokens) {
//             smsAttempted = true;
//             const sanitized = sanitizeSmsText(smsMessage);
//             const result = await sendHostPinnacleSms({ mobile, message: sanitized });

//             if (result.success) {
//                 smsSent = true;
//                 console.log(`SMS sent to ${mobile} for user ${userId}`);
//                 return true; // done — no WhatsApp needed
//             }

//             // SMS failed — give the token back
//             console.warn(`SMS failed for ${mobile}, refunding token and falling back to WhatsApp.`);
//             await db.collection("users").doc(userId).update({
//                 tokens: admin.firestore.FieldValue.increment(1),
//             });
//         } else {
//             console.log(`User ${userId} has no SMS tokens — going straight to WhatsApp.`);
//         }
//     } catch (tokenErr) {
//         // Don't let token logic break the notification path
//         console.error("Token transaction error, falling back to WhatsApp:", tokenErr);
//         if (smsAttempted && !smsSent) {
//             // Attempt refund best-effort (fire-and-forget)
//             db.collection("users").doc(userId).update({
//                 tokens: admin.firestore.FieldValue.increment(1),
//             }).catch(() => {});
//         }
//     }

//     // ── WhatsApp fallback ────────────────────────────────────────────────────
//     console.log(`Sending WhatsApp fallback to ${phone} for user ${userId}`);
//     return sendWhatsApp();
// }

// ─── UPDATED NOTIFICATION FUNCTIONS ──────────────────────────────────────────
// These are drop-in replacements.  The consent check, template sends, and
// flag updates are identical to your original code — the only new part is the
// SMS-first / WhatsApp-fallback wrapper.

async function sendNewInvoiceNotification(
    invoice: any,
    fallbackInvoiceId: string | null = null
): Promise<boolean> {
    try {
        const invoiceLocalId = invoice.localId || fallbackInvoiceId || "unknown";
        console.log(`Sending new invoice notification for invoice ${invoiceLocalId}`);
        const { tenant, property, user, company } = await getInvoiceContext(invoice, fallbackInvoiceId);

        if (!canSendNotification(user, "invoice")) {
            console.log(`User ${user.localId} cannot receive invoice notifications`);
            return false;
        }

        // Consent check — only relevant for WhatsApp path
        const consentCheck = await checkTenantConsent(tenant.phone);
        if (!consentCheck.hasConsent) {
            // For SMS we skip consent; for WhatsApp we request it.
            // We still try SMS first (no consent needed), then request consent for WA.
            const smsMsg = buildSmsMessage(SMS_TEMPLATES.NEW_INVOICE, {
                tenantName:   tenant.name,
                billingMonth: invoice.billingMonth,
                totalAmount:  formatCurrency(invoice.totalAmount),
                propertyName: property.name,
                agentName:    company?.name  || user.name,
                agentPhone:   company?.phone || user.phone || "",
                agentEmail:   company?.email || user.email,
            });

            const smsSent = await trySmsOnly(tenant.phone, smsMsg, invoice.userId);
            if (!smsSent) {
                // Fallback: send consent request via WhatsApp as before
                console.log(`No consent for ${tenant.phone} and SMS failed — sending consent request`);
                return await sendConsentRequest(tenant, property, company, user);
            }
            return smsSent;
        }

        if (!invoice.hasOwnProperty("isNew") || invoice.isNew === true) {
            // nothing — proceed below
        } else {
            console.log(`Invoice ${invoiceLocalId} already processed (isNew=false)`);
            return false;
        }

        if (invoice.pdfStatus === "paid" || invoice.status === "paid") {
            console.log(`Invoice ${invoiceLocalId} already paid, skipping`);
            return false;
        }

        if (!tenant.phone) {
            console.error(`No phone for tenant ${tenant.name}`);
            return false;
        }

        const smsMsg = buildSmsMessage(SMS_TEMPLATES.NEW_INVOICE, {
            tenantName:   tenant.name,
            billingMonth: invoice.billingMonth,
            totalAmount:  formatCurrency(invoice.totalAmount),
            propertyName: property.name,
            agentName:    company?.name  || user.name,
            agentPhone:   company?.phone || user.phone || "",
            agentEmail:   company?.email || user.email,
        });

        const processedUrl = processFirebaseUrlForWhatsApp(invoice.pdfUrl);
        const templateParams = [
            tenant.name,
            invoice.billingMonth,
            property.name,
            company?.name  || user.name,
            company?.phone || user.phone || "",
            company?.email || user.email,
        ];

        const success = await sendSmsWithWhatsAppFallback({
            phone:       tenant.phone,
            smsMessage:  smsMsg,
            userId:      invoice.userId,
            sendWhatsApp: () =>
                sendWhatsAppMessage(tenant.phone, TEMPLATES.NEW_INVOICE, templateParams, processedUrl),
        });

        if (success) {
            await updateInvoiceFlags(invoice.userId, invoiceLocalId, { isNew: false });
        }
        return success;
    } catch (error) {
        console.error("Error in sendNewInvoiceNotification:", error);
        return false;
    }
}

async function sendPaymentSuccessNotification(
    invoice: any,
    fallbackInvoiceId: string | null = null
): Promise<boolean> {
    try {
        const invoiceLocalId = invoice.localId || fallbackInvoiceId || "unknown";
        console.log(`Sending payment success notification for invoice ${invoiceLocalId}`);
        const { tenant, property, user, company } = await getInvoiceContext(invoice, fallbackInvoiceId);

        if (!canSendNotification(user, "payment")) {
            console.log(`User ${user.localId} cannot receive payment notifications`);
            return false;
        }

        const consentCheck = await checkTenantConsent(tenant.phone);
        if (!consentCheck.hasConsent) {
            const smsMsg = buildSmsMessage(SMS_TEMPLATES.PAYMENT_SUCCESS, {
                tenantName:  tenant.name,
                amountPaid:  formatCurrency(invoice.amountPaid),
                propertyUnit: `${property.name} ${tenant.unitNumber || ""}`.trim(),
                agentName:    company?.name  || user.name,
            });
            const smsSent = await trySmsOnly(tenant.phone, smsMsg, invoice.userId);
            if (!smsSent) {
                return await sendConsentRequest(tenant, property, company, user);
            }
            return smsSent;
        }

        const isInvoicePaid = invoice.pdfStatus === "paid" || invoice.isPaid;
        if (!isInvoicePaid) {
            console.log(`Invoice ${invoiceLocalId} not paid yet, skipping`);
            return false;
        }
        if (invoice.hasPaid === true) {
            console.log(`Invoice ${invoiceLocalId} payment notification already sent`);
            return false;
        }
        if (!tenant.phone) {
            console.error(`No phone for tenant ${tenant.name}`);
            return false;
        }

        const smsMsg = buildSmsMessage(SMS_TEMPLATES.PAYMENT_SUCCESS, {
            tenantName:   tenant.name,
            amountPaid:   formatCurrency(invoice.amountPaid),
            propertyUnit: `${property.name} ${tenant.unitNumber || ""}`.trim(),
            agentName:    company?.name  || user.name,
        });

        const processedUrl  = processFirebaseUrlForWhatsApp(invoice.pdfUrl);
        const templateParams = [
            tenant.name,
            formatCurrency(invoice.amountPaid),
            `${property.name} ${tenant.unitNumber || ""}`.trim(),
        ];

        const success = await sendSmsWithWhatsAppFallback({
            phone:       tenant.phone,
            smsMessage:  smsMsg,
            userId:      invoice.userId,
            sendWhatsApp: () =>
                sendWhatsAppMessage(tenant.phone, TEMPLATES.PAYMENT_SUCCESS, templateParams, processedUrl),
        });

        if (success) {
            await updateInvoiceFlags(invoice.userId, invoiceLocalId, { hasPaid: true });
        }
        return success;
    } catch (error) {
        console.error("Error in sendPaymentSuccessNotification:", error);
        return false;
    }
}

async function sendOverdueNotification(
    invoice: any,
    fallbackInvoiceId: string | null = null
): Promise<boolean> {
    try {
        const invoiceLocalId = invoice.localId || fallbackInvoiceId || "unknown";
        console.log(`Checking overdue notification for invoice ${invoiceLocalId}`);
        const { tenant, user, property, company } = await getInvoiceContext(invoice, fallbackInvoiceId);

        if (!shouldSendOverdueMessage(invoice, user)) {
            console.log(`Should not send overdue for invoice ${invoiceLocalId}`);
            return false;
        }

        const consentCheck = await checkTenantConsent(tenant.phone);
        if (!consentCheck.hasConsent) {
            const daysOverdue      = getDaysOverdue(invoice.dueDate);
            const outstandingAmount = invoice.totalAmount - invoice.amountPaid;
            const smsMsg = buildSmsMessage(SMS_TEMPLATES.OVERDUE, {
                tenantName:        tenant.name,
                outstandingAmount: formatCurrency(outstandingAmount),
                daysOverdue:       daysOverdue.toString(),
                propertyName:      property.name,
            });
            const smsSent = await trySmsOnly(tenant.phone, smsMsg, invoice.userId);
            if (!smsSent) {
                return await sendConsentRequest(tenant, property, company, user);
            }
            return smsSent;
        }

        if (!tenant.phone) {
            console.error(`No phone for tenant ${tenant.name}`);
            return false;
        }

        const daysOverdue       = getDaysOverdue(invoice.dueDate);
        const outstandingAmount = invoice.totalAmount - invoice.amountPaid;

        const smsMsg = buildSmsMessage(SMS_TEMPLATES.OVERDUE, {
            tenantName:        tenant.name,
            outstandingAmount: formatCurrency(outstandingAmount),
            daysOverdue:       daysOverdue.toString(),
            propertyName:      property.name,
        });

        const processedUrl  = processFirebaseUrlForWhatsApp(invoice.pdfUrl);
        const templateParams = [
            "Reminder: Pay your current and bills",
            formatCurrency(outstandingAmount),
            daysOverdue.toString(),
            "late fees",
        ];

        const success = await sendSmsWithWhatsAppFallback({
            phone:       tenant.phone,
            smsMessage:  smsMsg,
            userId:      invoice.userId,
            sendWhatsApp: () =>
                sendWhatsAppMessage(tenant.phone, TEMPLATES.OVERDUE, templateParams, processedUrl),
        });

        if (success) {
            await updateInvoiceFlags(invoice.userId, invoiceLocalId, { isDue: true });
        }
        return success;
    } catch (error) {
        console.error("Error in sendOverdueNotification:", error);
        return false;
    }
}

// ─── INTERNAL HELPER: SMS-only (no WhatsApp fallback) ────────────────────────
// Used when there's no WhatsApp consent AND we still want to try SMS.

async function trySmsOnly(
    phone: string,
    message: string,
    userId: string
): Promise<boolean> {
    const mobile = normalizeSmsPhone(phone);
    try {
        const userSnap = await db.collection("users").doc(userId).get();
        const tokens: number = userSnap.data()?.tokens ?? 0;
        if (tokens <= 0) {
            console.log(`No tokens for user ${userId}, cannot send SMS-only.`);
            return false;
        }

        await db.collection("users").doc(userId).update({
            tokens: admin.firestore.FieldValue.increment(-1),
        });

        const result = await sendHostPinnacleSms({ mobile, message: sanitizeSmsText(message) });
        if (!result.success) {
            // Refund
            await db.collection("users").doc(userId).update({
                tokens: admin.firestore.FieldValue.increment(1),
            });
        }
        return result.success;
    } catch (err) {
        console.error("trySmsOnly error:", err);
        return false;
    }
}

// ─── UNIVERSAL sendSMS CLOUD FUNCTION ────────────────────────────────────────
// Callable from the UI. Supports:
//   - Single or multiple recipients (array of numbers)
//   - Custom message text (no template needed)
//   - Same sanitisation + token rules apply
//   - Returns per-number results

interface SendSmsRequest {
    /** One number or an array of numbers — any format, normalised internally */
    numbers: string | string[];
    message: string;
    /** Optional sender ID override (must be pre-approved in your HP account) */
    senderId?: string;
}

export const sendSMS = onCall({
    timeoutSeconds: 30,
    memory: "256MiB",
    region: "africa-south1",
    cors: true,
}, async (request: CallableRequest<SendSmsRequest>) => {
    // Auth required
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in to send SMS.");
    }

    const { numbers, message, senderId } = request.data;

    if (!numbers || !message) {
        throw new HttpsError("invalid-argument", "numbers and message are required.");
    }

    const rawNumbers = Array.isArray(numbers) ? numbers : [numbers];
    if (rawNumbers.length === 0) {
        throw new HttpsError("invalid-argument", "At least one number is required.");
    }
    if (rawNumbers.length > 100) {
        throw new HttpsError("invalid-argument", "Maximum 100 numbers per call.");
    }

    const sanitizedMessage = sanitizeSmsText(message);
    if (!sanitizedMessage) {
        throw new HttpsError("invalid-argument", "Message is empty after sanitisation.");
    }

    const userId = request.auth.uid;

    // Token check — deduct one token per unique number
    const userRef = db.collection("users").doc(userId);
    let tokensAvailable = 0;

    try {
        const userSnap = await userRef.get();
        tokensAvailable = userSnap.data()?.tokens ?? 0;
    } catch (err) {
        throw new HttpsError("internal", "Could not read user token balance.");
    }

    if (tokensAvailable < rawNumbers.length) {
        throw new HttpsError(
            "resource-exhausted",
            `Insufficient SMS tokens. Required: ${rawNumbers.length}, available: ${tokensAvailable}.`
        );
    }

    // Deduct upfront; we'll refund for individual failures below
    await userRef.update({
        tokens: admin.firestore.FieldValue.increment(-rawNumbers.length),
    });

    // Send to each number and collect results
    const results: Array<{ number: string; success: boolean; error?: string }> = [];
    let failCount = 0;

    for (const raw of rawNumbers) {
        const mobile = normalizeSmsPhone(raw);
        const result = await sendHostPinnacleSms({
            mobile,
            message: sanitizedMessage,
            ...(senderId ? { senderId } : {}),
        });

        results.push({ number: mobile, success: result.success, error: result.error });
        if (!result.success) failCount++;
    }

    // Refund tokens for failed sends
    if (failCount > 0) {
        await userRef.update({
            tokens: admin.firestore.FieldValue.increment(failCount),
        });
    }

    const successCount = rawNumbers.length - failCount;
    console.log(`sendSMS: ${successCount}/${rawNumbers.length} sent for user ${userId}`);

    return {
        success:      successCount > 0,
        sent:         successCount,
        failed:       failCount,
        totalNumbers: rawNumbers.length,
        results,
    };
});

// ─── ENV VARS TO ADD ──────────────────────────────────────────────────────────
// Add to functions/.env (Firebase Gen 2) or via `firebase functions:config:set`:
//
//   HP_SMS_USERID=your_hostpinnacle_username
//   HP_SMS_PASSWORD=your_hostpinnacle_password
//   HP_SMS_APIKEY=your_hostpinnacle_apikey
//   HP_SMS_SENDERID=YOURID
//
// Also add `tokens` (integer, default 0) to your user documents.
// Top up tokens from your admin panel or a separate purchase flow.



























async function sendWhatsAppReminder(phone: string, daysLeft: number, planName: string) {
  try {
    const formattedPhone = phone.startsWith('254') ? phone : '254' + phone.replace(/^0/, '');
    
    const url = `${WHATSAPP_CONFIG.BASE_URL}/${WHATSAPP_CONFIG.VERSION}/${WHATSAPP_CONFIG.PHONE_NUMBER_ID}/messages`;
    
    const payload = {
      messaging_product: "whatsapp",
      to: formattedPhone,
      type: "template",
      template: {
        name: TEMPLATES.SUBSCRIPTION,
        language: {
          code: "en"
        },
        components: [
          {
            type: "body",
            parameters: [
             {
                type: "text",
                text: planName
              },    
              {
                type: "text",
                text: daysLeft.toString()
              }
            ]
          }
        ]
      }
    };

    await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_CONFIG.ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`WhatsApp reminder sent to ${phone}: ${daysLeft} days left`);
  } catch (error: any) {
    console.error('Failed to send WhatsApp reminder:', error.response?.data || error.message);
  }
}

async function getOrCreateSplitCode(
  subaccountCode: string,
  commissionRate: number,
  agentId: string
): Promise<string> {
  //const paystackHeaders = getPaystackHeaders(secretValue);
  
  // Check if split code exists in Firestore cache
  const splitDoc = await db.collection("splitCodes").doc(agentId).get();
  
  if (splitDoc.exists) {
    const data = splitDoc.data();
    // Verify the split matches current commission rate
    if (data?.commissionRate === commissionRate) {
      console.log(`Using cached split code for agent ${agentId}: ${data.splitCode}`);
      return data.splitCode;
    }
  }
  
  // Create new split code
  try {
    const splitPayload = {
      name: `Agent ${agentId} Split`,
      type: "percentage",
      currency: "KES",
      subaccounts: [
        {
          subaccount: subaccountCode,
          share: 100 - commissionRate,
        },
      ],
      bearer_type: "all-proportional",
    };
    
    console.log('Creating split code:', JSON.stringify(splitPayload, null, 2));
    
    const response = await axios.post(
      `${PAYSTACK_API_BASE}/split`,
      splitPayload,
      { headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      } }
    );
    
    if (!response.data.status) {
      throw new Error(`Failed to create split: ${response.data.message}`);
    }
    
    const splitCode = response.data.data.split_code;
    
    // Cache the split code
    await db.collection("splitCodes").doc(agentId).set({
      splitCode: splitCode,
      subaccountCode: subaccountCode,
      commissionRate: commissionRate,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log(`Created new split code for agent ${agentId}: ${splitCode}`);
    return splitCode;
    
  } catch (error: any) {
    console.error('Error creating split code:', error.response?.data || error.message);
    throw error;
  }
}

export const processWebSubscription = onCall({
  timeoutSeconds: 60,
  memory: "512MiB",
  maxInstances: 10,
  region: "africa-south1",
  cors: true,
  secrets: [PAYSTACK_SECRET_KEY]
}, async (request: CallableRequest<ProcessWebSubscriptionRequest>) => {
  try {
    const { userId, userName, email, phone, planId, planName, billingCycle, amount, daysToAdd, cyber } = request.data;

    if (!userId || !userName || !email || !phone || !planId || !planName || !amount) {
      throw new HttpsError(
        "invalid-argument",
        "All fields are required"
      );
    }

    let splitCode: string | undefined;

    if (cyber) {
    try {
        console.log(`Attempting to process with agent ${cyber.uid}`);
        
        // Get agent's payment info (subaccount)
        const agentDoc = await db.collection("agents").doc(cyber.uid).get();

        if (!agentDoc.exists) {
        console.warn(`Agent ${cyber.uid} not found - processing payment without split`);
        } else {
        const agentData = agentDoc.data();
        const paymentInfo = agentData?.paymentInfo;

        if (!paymentInfo || !paymentInfo.accountId) {
            console.warn(`Agent ${cyber.uid} has not set up payment account - processing payment without split`);
        } else {
            const subaccountCode = paymentInfo.accountId;
            console.log(`Processing payment for user ${userId}, agent ${cyber.uid}, amount ${amount}`);

            // Get or create split code
            splitCode = await getOrCreateSplitCode(subaccountCode, 55, cyber.uid);
            console.log(`Successfully created split code: ${splitCode}`);
        }
        }
    } catch (agentError: any) {
        console.error(`Error processing agent split for ${cyber.uid}:`, agentError);
        console.log(`Continuing payment without agent split`);
        // Don't throw - just continue without the split
        splitCode = undefined;
    }
    }

console.log(`Processing web subscription for user ${userId}, plan ${planId}, amount ${amount}${splitCode ? ' with agent split' : ' without agent split'}`);

    console.log(`Processing web subscription for user ${userId}, plan ${planId}, amount ${amount}`);

    let formattedPhone = phone.replace(/[\s-]/g, '');
    
    if (formattedPhone.startsWith('+254')) {
      formattedPhone = formattedPhone;
    } else if (formattedPhone.startsWith('254')) {
      formattedPhone = '+' + formattedPhone;
    } else if (formattedPhone.startsWith('0')) {
      formattedPhone = '+254' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('7') || formattedPhone.startsWith('1')) {
      formattedPhone = '+254' + formattedPhone;
    }
    
    console.log(`Formatted phone for M-Pesa: ${phone} -> ${formattedPhone}`);

    const amountInCents = Math.round(amount * 100);

    // Build charge payload
    const chargePayload: any = {
      email: email,
      amount: amountInCents,
      currency: "KES",
      mobile_money: {
        phone: formattedPhone,
        provider: "mpesa",
      },
      reference: `SUB_${userId}_${planId}_${Date.now()}`,
      metadata: {
        userId: userId,
        userName: userName,
        planId: planId,
        planName: planName,
        billingCycle: billingCycle,
        daysToAdd: daysToAdd,
        originalAmount: amount,
        subscriptionType: 'web'
      },
    };

    // Add split_code only if cyber agent is involved
    if (splitCode) {
      chargePayload.split_code = splitCode;
      chargePayload.metadata.agentId = cyber.uid;
        console.log(`Including split code in charge: ${splitCode}`);
    }

    console.log('Paystack charge request:', JSON.stringify(chargePayload, null, 2));

    const paystackResponse = await axios.post(
      `${PAYSTACK_API_BASE}/charge`,
      chargePayload,
      { 
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY.value()}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log('Paystack response:', JSON.stringify(paystackResponse.data, null, 2));

    if (!paystackResponse.data.status) {
      throw new HttpsError(
        "internal",
        `Paystack API error: ${paystackResponse.data.message}`
      );
    }

    const transactionData = paystackResponse.data.data;

    console.log(`Subscription payment initiated: ${transactionData.reference}, status: ${transactionData.status}`);

    const subscriptionRecord = {
      userId: userId,
      userName: userName,
      email: email,
      phone: formattedPhone,
      planId: planId,
      planName: planName,
      billingCycle: billingCycle,
      amount: amount,
      daysToAdd: daysToAdd,
      reference: transactionData.reference,
      status: "pending",
      displayText: transactionData.display_text,
      accountReference: transactionData.account_reference,
      initiatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiryDate: null,
      agentId: null,
      remindersSent: {
        day0: false,
        day2: false,
        day5: false
      }
    };

    // Add cyber agent info if applicable
    // if (cyber) {
    //   subscriptionRecord.agentId = cyber.uid;
    // }

    await db.collection("subscriptions").doc(transactionData.reference).set({
        ...subscriptionRecord,
        agentId: cyber?.uid || null, // Add agentId property
    });

    //await db.collection("subscriptions").doc(transactionData.reference).set(subscriptionRecord);

    await db.collection("users").doc(userId).set({
      lastSubscriptionAttempt: admin.firestore.FieldValue.serverTimestamp(),
      lastSubscriptionReference: transactionData.reference
    }, { merge: true });

    return {
      success: true,
      message: "Payment initialized successfully",
      data: {
        reference: transactionData.reference,
        status: transactionData.status,
        displayText: transactionData.display_text || "Check your phone for the M-Pesa prompt",
        accountReference: transactionData.account_reference,
      },
    };
  } catch (error: any) {
    console.error("Error in processWebSubscription:", error);
    
    if (error.response) {
      console.error("Paystack error response:", {
        status: error.response.status,
        data: JSON.stringify(error.response.data, null, 2),
      });
    }

    if (error instanceof HttpsError) {
      throw error;
    }

    const errorMessage = error.response?.data?.message || error.message;
    throw new HttpsError(
      "internal",
      `Failed to process subscription: ${errorMessage}`
    );
  }
});

export const paystackWebhook = onCall({
  timeoutSeconds: 60,
  memory: "512MiB",
  cors: false,
  maxInstances: 10,
  region: "africa-south1",
  secrets: [PAYSTACK_SECRET_KEY]
}, async (request: any) => {
  console.log(`Webhook request received`);
  
  try {
    const hash = request.headers?.["x-paystack-signature"]?.toString();
    const body = JSON.stringify(request.data);

    const expectedHash = crypto
      .createHmac("sha512", PAYSTACK_SECRET_KEY.value())
      .update(body)
      .digest("hex");
      
    if (hash !== expectedHash) {
      console.error("Invalid signature");
      throw new HttpsError("permission-denied", "Invalid signature");
    }

    const event = request.data;

    console.log(`Received webhook event: ${event.event}`);

    if (event.event === "charge.success") {
      const data = event.data;
      const reference = data.reference;
      const metadata = data.metadata;

      console.log(`Processing successful subscription payment: ${reference}`);

      const subscriptionRef = db.collection("subscriptions").doc(reference);
      const subscriptionDoc = await subscriptionRef.get();

      if (!subscriptionDoc.exists) {
        console.error(`Subscription not found: ${reference}`);
        throw new HttpsError("not-found", "Subscription not found");
      }

      const subscriptionData = subscriptionDoc.data();
      const userId = metadata.userId || subscriptionData?.userId;
      const planId = metadata.planId || subscriptionData?.planId;
      const planName = metadata.planName || subscriptionData?.planName;
      const daysToAdd = metadata.daysToAdd || subscriptionData?.daysToAdd || 30;

      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + daysToAdd);

      await subscriptionRef.update({
        status: "success",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        expiryDate: admin.firestore.Timestamp.fromDate(expiryDate),
        paystackResponse: data,
      });

      const userRef = db.collection("users").doc(userId);
      await userRef.set({
        type: "paid",
        tier: planId,
        storage: true,
        subscriptionExpiry: admin.firestore.Timestamp.fromDate(expiryDate),
        lastPaymentDate: admin.firestore.FieldValue.serverTimestamp(),
        lastPaymentReference: reference,
        lastPaymentAmount: data.amount / 100,
        planName: planName
      }, { merge: true });

      console.log(`Successfully activated subscription for user ${userId}, expires: ${expiryDate.toISOString()}`);
    }

    if (event.event === "charge.failed") {
      const data = event.data;
      const reference = data.reference;

      console.warn(`Subscription payment failed: ${reference}`);

      await db.collection("subscriptions").doc(reference).update({
        status: "failed",
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
        failureReason: data.gateway_response,
      });
    }

    return { 
      received: true,
      processed: true,
      eventType: event.event 
    };
  } catch (error: any) {
    console.error("Error in paystackWebhook:", error);
    throw new HttpsError("internal", error.message);
  }
});

export const checkExpiredSubscriptions = onSchedule(
  {
    schedule: "0 8 * * 1",
    timeZone: "Africa/Nairobi",
    region: "us-central1",
    //memory: "512MiB",
  },
  async (event) => {
    console.log("Running weekly subscription expiry check...");

    try {
      const now = admin.firestore.Timestamp.now();
      
      const usersSnapshot = await db.collection("users")
        .where("type", "==", "paid")
        .where("subscriptionExpiry", "<=", now)
        .get();

      console.log(`Found ${usersSnapshot.size} expired subscriptions`);

      const batch = db.batch();
      
      usersSnapshot.forEach((doc) => {
        const userRef = db.collection("users").doc(doc.id);
        batch.update(userRef, {
          type: "free",
          tier: "free",
          storage: false,
          subscriptionExpiredAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });

      await batch.commit();

      console.log(`Successfully reset ${usersSnapshot.size} expired subscriptions`);

      // Do not return an object, just return void
      return;
    } catch (error: any) {
      console.error("Error in checkExpiredSubscriptions:", error);
      throw error;
    }
  }
);

export const sendSubscriptionReminders = onSchedule(
  {
    schedule: "0 9 * * *",
    timeZone: "Africa/Nairobi",
    region: "us-central1",
    //memory: "512MiB",
  },
  async (event) => {
    console.log("Running daily subscription reminder check...");

    try {
      const now = new Date();
      
      const check0Days = new Date(now);
      check0Days.setDate(check0Days.getDate());
      //const check0DaysTimestamp = admin.firestore.Timestamp.fromDate(check0Days);
      
      const check2Days = new Date(now);
      check2Days.setDate(check2Days.getDate() + 2);
      //const check2DaysTimestamp = admin.firestore.Timestamp.fromDate(check2Days);
      
      const check5Days = new Date(now);
      check5Days.setDate(check5Days.getDate() + 5);
      //const check5DaysTimestamp = admin.firestore.Timestamp.fromDate(check5Days);

      const usersSnapshot = await db.collection("users")
        .where("type", "==", "paid")
        .get();

      console.log(`Checking ${usersSnapshot.size} paid users for reminders`);

      let remindersSent = 0;

      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        const expiryDate = userData.subscriptionExpiry;
        
        if (!expiryDate) continue;

        const userId = userDoc.id;
        const phone = userData.phone;
        const planName = userData.name || userData.planName || userData.tier || 'Client';

        if (!phone) {
          console.log(`User ${userId} has no phone number, skipping`);
          continue;
        }

        const subscriptionRef = db.collection("subscriptions")
          .where("userId", "==", userId)
          .where("status", "==", "success")
          .orderBy("completedAt", "desc")
          .limit(1);
        
        const subscriptionSnapshot = await subscriptionRef.get();
        
        if (subscriptionSnapshot.empty) continue;

        const subscriptionDoc = subscriptionSnapshot.docs[0];
        const subscriptionData = subscriptionDoc.data();
        let remindersSentFlags = subscriptionData.remindersSent || { day0: false, day2: false, day5: false };

        const expiryTimestamp = expiryDate.toDate();
        const daysUntilExpiry = Math.ceil((expiryTimestamp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilExpiry <= 0 && !remindersSentFlags.day0) {
          await sendWhatsAppReminder(phone, 0, planName);
          await db.collection("subscriptions").doc(subscriptionDoc.id).update({
            "remindersSent.day0": true
          });
          remindersSent++;
        }
        else if (daysUntilExpiry <= 2 && !remindersSentFlags.day2) {
          await sendWhatsAppReminder(phone, 2, planName);
          await db.collection("subscriptions").doc(subscriptionDoc.id).update({
            "remindersSent.day2": true
          });
          remindersSent++;
        }
        else if (daysUntilExpiry <= 5 && !remindersSentFlags.day5) {
          await sendWhatsAppReminder(phone, 5, planName);
          await db.collection("subscriptions").doc(subscriptionDoc.id).update({
            "remindersSent.day5": true
          });
          remindersSent++;
        }
      }

      console.log(`Successfully sent ${remindersSent} reminders`);

      // Do not return an object, just return void
      return;
    } catch (error: any) {
      console.error("Error in sendSubscriptionReminders:", error);
      throw error;
    }
  }
);

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
// async function sendNewInvoiceNotification(invoice: any, fallbackInvoiceId: string | null = null): Promise<boolean> {
//     try {
//         const invoiceLocalId = invoice.localId || fallbackInvoiceId || 'unknown';
//         console.log(`Sending new invoice notification for invoice ${invoiceLocalId}`);
//         const { tenant, property, user, company } = await getInvoiceContext(invoice, fallbackInvoiceId);
        
//         if (!canSendNotification(user, 'invoice')) {
//             console.log(`User ${user.localId} cannot receive invoice notifications`);
//             return false;
//         }

//         // CHECK CONSENT FIRST
//         const consentCheck = await checkTenantConsent(tenant.phone);
//         if (!consentCheck.hasConsent) {
//             console.log(`No consent for tenant ${tenant.name} (${tenant.phone}), sending consent request`);
//             return await sendConsentRequest(tenant, property, company, user);
//         }

//         const shouldSendNewNotification = !invoice.hasOwnProperty('isNew') || invoice.isNew === true;
        
//         if (!shouldSendNewNotification) {
//             console.log(`Invoice ${invoiceLocalId} already processed for new invoice (isNew=false)`);
//             return false;
//         }

//         if (invoice.pdfStatus === 'paid' || invoice.status === 'paid') {
//             console.log(`Invoice ${invoiceLocalId} is already paid, skipping new invoice notification`);
//             return false;
//         }

//         if (!tenant.phone) {
//             console.error(`No phone number found for tenant ${tenant.name}`);
//             return false;
//         }

//         const templateParams = [
//             tenant.name,
//             invoice.billingMonth,
//             property.name,
//             company?.name || user.name,
//             company?.phone || user.phone || '',
//             company?.email || user.email
//         ];

//         // Process the PDF URL for WhatsApp template
//         const processedUrl = processFirebaseUrlForWhatsApp(invoice.pdfUrl);

//         console.log(`Sending NEW INVOICE to phone: ${tenant.phone}, template: ${TEMPLATES.NEW_INVOICE}`);
//         console.log(`Template params:`, templateParams);
//         console.log(`Original PDF URL: ${invoice.pdfUrl}`);
//         console.log(`Processed URL parameter: ${processedUrl}`);
        
//         const success = await sendWhatsAppMessage(tenant.phone, TEMPLATES.NEW_INVOICE, templateParams, processedUrl);
        
//         if (success) {
//             await updateInvoiceFlags(invoice.userId, invoiceLocalId, { isNew: false });
//             console.log(`Successfully sent new invoice notification for invoice ${invoiceLocalId}`);
//         }
        
//         return success;
//     } catch (error) {
//         console.error('Error sending new invoice notification:', error);
//         return false;
//     }
// }

// // UPDATED: Payment success notification function with consent check
// async function sendPaymentSuccessNotification(invoice: any, fallbackInvoiceId: string | null = null): Promise<boolean> {
//     try {
//         const invoiceLocalId = invoice.localId || fallbackInvoiceId || 'unknown';
//         console.log(`Sending payment success notification for invoice ${invoiceLocalId}`);
//         const { tenant, property, user, company } = await getInvoiceContext(invoice, fallbackInvoiceId);
        
//         if (!canSendNotification(user, 'payment')) {
//             console.log(`User ${user.localId} cannot receive payment notifications`);
//             return false;
//         }

//         // CHECK CONSENT FIRST
//         const consentCheck = await checkTenantConsent(tenant.phone);
//         if (!consentCheck.hasConsent) {
//             console.log(`No consent for tenant ${tenant.name} (${tenant.phone}), sending consent request`);
//             return await sendConsentRequest(tenant, property, company, user);
//         }

//         const isInvoicePaid = invoice.pdfStatus === 'paid' || invoice.isPaid;
//         const notificationAlreadySent = invoice.hasPaid === true;
        
//         if (!isInvoicePaid) {
//             console.log(`Invoice ${invoiceLocalId} is not paid yet, skipping payment notification`);
//             return false;
//         }
        
//         if (notificationAlreadySent) {
//             console.log(`Invoice ${invoiceLocalId} payment notification already sent (isPaid=true)`);
//             return false;
//         }

//         if (!tenant.phone) {
//             console.error(`No phone number found for tenant ${tenant.name}`);
//             return false;
//         }

//         const templateParams = [
//             tenant.name,
//             formatCurrency(invoice.amountPaid),
//             `${property.name} ${tenant.unitNumber || ''}`
//         ];

//         // Process the PDF URL for WhatsApp template
//         const processedUrl = processFirebaseUrlForWhatsApp(invoice.pdfUrl);

//         console.log(`Sending PAYMENT SUCCESS to phone: ${tenant.phone}, template: ${TEMPLATES.PAYMENT_SUCCESS}`);
//         console.log(`Template params:`, templateParams);
//         console.log(`Original PDF URL: ${invoice.pdfUrl}`);
//         console.log(`Processed URL parameter: ${processedUrl}`);
        
//         const success = await sendWhatsAppMessage(tenant.phone, TEMPLATES.PAYMENT_SUCCESS, templateParams, processedUrl);
        
//         if (success) {
//             await updateInvoiceFlags(invoice.userId, invoiceLocalId, { hasPaid: true });
//             console.log(`Successfully sent payment success notification for invoice ${invoiceLocalId}`);
//         }
        
//         return success;
//     } catch (error) {
//         console.error('Error sending payment success notification:', error);
//         return false;
//     }
// }

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
                index: '1',
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
// async function sendOverdueNotification(invoice: any, fallbackInvoiceId: string | null = null): Promise<boolean> {
//     try {
//         const invoiceLocalId = invoice.localId || fallbackInvoiceId || 'unknown';
//         console.log(`Checking overdue notification for invoice ${invoiceLocalId}`);
//         const { tenant, user, property, company } = await getInvoiceContext(invoice, fallbackInvoiceId);
        
//         if (!shouldSendOverdueMessage(invoice, user)) {
//             console.log(`Should not send overdue message for invoice ${invoiceLocalId}`);
//             return false;
//         }

//         // CHECK CONSENT FIRST
//         const consentCheck = await checkTenantConsent(tenant.phone);
//         if (!consentCheck.hasConsent) {
//             console.log(`No consent for tenant ${tenant.name} (${tenant.phone}), sending consent request`);
//             return await sendConsentRequest(tenant, property, company, user);
//         }

//         if (!tenant.phone) {
//             console.error(`No phone number found for tenant ${tenant.name}`);
//             return false;
//         }

//         const daysOverdue = getDaysOverdue(invoice.dueDate);
//         const outstandingAmount = invoice.totalAmount - invoice.amountPaid;

//         const templateParams = [
//             'Reminder: Pay your current and bills',
//             formatCurrency(outstandingAmount),
//             daysOverdue.toString(),
//             'late fees'
//         ];

//         // Process the PDF URL for WhatsApp template
//         const processedUrl = processFirebaseUrlForWhatsApp(invoice.pdfUrl);

//         console.log(`Sending overdue to phone: ${tenant.phone}, days overdue: ${daysOverdue}`);
//         console.log(`Original PDF URL: ${invoice.pdfUrl}`);
//         console.log(`Processed URL parameter: ${processedUrl}`);
        
//         const success = await sendWhatsAppMessage(tenant.phone, TEMPLATES.OVERDUE, templateParams, processedUrl);
        
//         if (success) {
//             await updateInvoiceFlags(invoice.userId, invoiceLocalId, { isDue: true });
//             console.log(`Successfully sent overdue notification for invoice ${invoiceLocalId}`);
//         }
        
//         return success;
//     } catch (error) {
//         console.error('Error sending overdue notification:', error);
//         return false;
//     }
// }

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
}, async () => {
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