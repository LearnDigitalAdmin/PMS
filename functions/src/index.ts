import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import crypto from 'crypto';

// Initialize Firebase Admin SDK
if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

interface RevenueCatEvent {
  event: {
    type: string;
    app_user_id: string;
    product_id: string;
    period_type: string;
    purchased_at_ms: number;
    expiration_at_ms?: number;
    is_family_share?: boolean;
    country_code?: string;
    currency?: string;
    price?: number;
    price_in_purchased_currency?: number;
    subscriber_attributes?: any;
    store: string;
    environment: string;
  };
  api_version: string;
}

// Verify webhook signature (optional)
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

// Extract user identifier from app_user_id
const extractUserIdentifier = (appUserId: string) => {
  if (appUserId.includes('@') || appUserId.length < 10) {
    return { userId: appUserId };
  } else {
    return { phone: appUserId };
  }
};

// Get user tier from product ID
const getTierFromProductId = (productId: string): string => {
  if (productId.startsWith('low_')) return 'low';
  if (productId.startsWith('business_')) return 'business';
  if (productId.startsWith('enterprise_')) return 'enterprise';
  if (productId.startsWith('solo_')) return 'solo';
  return 'free';
};

// Find user document in Firestore
const findUserDocument = async (userId?: string, phone?: string) => {
  if (userId) {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      return { docId: userId, data: userDoc.data() };
    }
  }

  if (phone) {
    const querySnapshot = await db.collection('users')
      .where('phone', '==', parseInt(phone))
      .limit(1)
      .get();
    
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      return { docId: doc.id, data: doc.data() };
    }
  }

  throw new Error(`User not found: userId=${userId}, phone=${phone}`);
};

// Update user subscription status
const updateUserSubscription = async (
  docId: string, 
  tier: string, 
  type: string, 
  storage: boolean,
  expirationDate?: Date
) => {
  const updateData: any = {
    tier,
    type,
    storage,
    updatedAt: new Date(),
    lastSyncTime: new Date().toISOString()
  };

  if (expirationDate) {
    updateData.subscriptionExpiry = expirationDate;
  }

  await db.collection('users').doc(docId).update(updateData);
  console.log(`Updated user ${docId}: tier=${tier}, type=${type}, storage=${storage}`);
};

// Handle subscription events
const handleSubscriptionEvent = async (event: any) => {
  const { userId, phone } = extractUserIdentifier(event.app_user_id);
  
  try {
    const { docId } = await findUserDocument(userId, phone);
    
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
          
          await updateUserSubscription(docId, tier, 'paid', true, expirationDate);
        }
        break;

      case 'CANCELLATION':
      case 'EXPIRATION':
      case 'BILLING_ISSUE':
        const { data: currentUser } = await findUserDocument(userId, phone);
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

    console.log(`Successfully processed ${event.type} for user ${event.app_user_id}`);
    
  } catch (error) {
    console.error(`Failed to process event for user ${event.app_user_id}:`, error);
    throw error;
  }
};

// Cloud Function HTTP handler
export const plotWebhook = onRequest(
  {
    timeoutSeconds: 60,
    memory: '512MiB',
    cors: false,
    maxInstances: 10,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      const signature = req.headers['authorization']?.toString().replace('Bearer ', '') || 
                       req.headers['x-revenuecat-signature'] as string;

      const webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
      const rawBody = Buffer.from(req.rawBody || req.body);

      // Optional signature verification
      if (signature && webhookSecret) {
        if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
          console.error('Invalid signature');
          res.status(401).json({ error: 'Invalid signature' });
          return;
        }
      }

      const event: RevenueCatEvent = JSON.parse(rawBody.toString());
      
      console.log(`Received RevenueCat webhook: ${event.event.type} for user ${event.event.app_user_id}`);

      // Skip sandbox events in production
      if (process.env.NODE_ENV === 'production' && event.event.environment === 'SANDBOX') {
        res.status(200).json({ received: true, skipped: 'sandbox' });
        return;
      }

      await handleSubscriptionEvent(event.event);
      
      res.status(200).json({ 
        received: true, 
        processed: true,
        eventType: event.event.type,
        userId: event.event.app_user_id
      });

    } catch (error) {
      console.error('Webhook processing error:', error);
      res.status(500).json({ 
        error: 'Internal server error', 
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

export const plotWebhookHealth = onRequest(
  {
    timeoutSeconds: 10,
    memory: '128MiB',
  },
  async (req, res) => {
    res.status(200).json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      service: 'plotWebhook'
    });
  }
);
