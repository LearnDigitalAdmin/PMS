// services/sync/FirebaseSyncService.ts - SIMPLIFIED VERSION
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  getDocs, 
  writeBatch,
  serverTimestamp,
  orderBy,
  limit,
  onSnapshot,
  type Unsubscribe,
  Timestamp,
  where
} from 'firebase/firestore';
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from 'firebase/storage';
import { database } from '../database/Database';
import { generateInvoicePDF } from '../pdf/PDFService';
import type { User, Property, Tenant } from '../database/Database';
import { integrateWithFirebaseSync } from '../screening/TenantScreeningService';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyD1hg7YLv08vyR2kSWi2ymxSu2pYCRwPq8",
  authDomain: "plot-9fd6e.firebaseapp.com",
  projectId: "plot-9fd6e",
  storageBucket: "plot-9fd6e.firebasestorage.app",
  messagingSenderId: "1037620305589",
  appId: "1:1037620305589:web:2672a7dcaeca4c46b068fc",
  measurementId: "G-B90H3GJFPM"
};

// Batch Manager
class SafeBatchManager {
  private batches: any[] = [];
  private currentBatch: any;
  private operationCount = 0;
  private operations: { type: string; id: string; action: string }[] = [];
  private readonly MAX_BATCH_SIZE = 400;

  constructor() {
    this.currentBatch = writeBatch(db);
  }

  addOperation(operation: (batch: any) => void, description: string, type: 'CREATE' | 'UPDATE' | 'DELETE' = 'UPDATE'): void {
    if (this.operationCount >= this.MAX_BATCH_SIZE) {
      this.batches.push({
        batch: this.currentBatch,
        operations: [...this.operations]
      });
      this.currentBatch = writeBatch(db);
      this.operationCount = 0;
      this.operations = [];
    }
    
    operation(this.currentBatch);
    this.operationCount++;
    this.operations.push({ type, id: description.split(' ')[1] || 'unknown', action: description });
  }

  async commitAll(): Promise<void> {
    if (this.operationCount > 0) {
      this.batches.push({
        batch: this.currentBatch,
        operations: [...this.operations]
      });
    }

    console.log(`🚀 Executing ${this.batches.length} batch(es)...`);
    
    for (let i = 0; i < this.batches.length; i++) {
      try {
        await this.batches[i].batch.commit();
        console.log(`✅ Batch ${i + 1}/${this.batches.length} committed`);
      } catch (error) {
        console.error(`❌ Batch ${i + 1} failed:`, error);
        throw error;
      }
    }
  }
}

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
const storage = getStorage(app);
export const functions = getFunctions(app, "africa-south1");

// User tier limits
export const USER_LIMITS = {
  free: { properties: 1, tenantsPerProperty: 5, totalTenants: 5, storage: false },
  low: { properties: 3, tenantsPerProperty: 10, totalTenants: 30, storage: false },
  business: { properties: 9, tenantsPerProperty: 14, totalTenants: 126, storage: true },
  solo: { properties: 1, tenantsPerProperty: 20, totalTenants: 20, storage: true },
  pro: { properties: 16, tenantsPerProperty: 20, totalTenants: 300, storage: true },
  enterprise: { properties: -1, tenantsPerProperty: -1, totalTenants: -1, storage: true }
} as const;

export type UserType = 'free' | 'paid';
export type UserTier = 'free' | 'low' | 'business' | 'solo' | 'pro' | 'enterprise';

export interface SyncStatus {
  lastDownloadTime: string;
  lastUploadTime: string;
  syncInProgress: boolean;
  nextScheduledUpload: string;
  errors: string[];
}

// ==================== MAIN SYNC SERVICE CLASS ====================
export class FirebaseSyncService {
  private static instance: FirebaseSyncService;
  
  private operationLocks = new Map<string, boolean>();
  private initPromises = new Map<number, Promise<SyncStatus>>();
  private initializedUsers = new Set<number>();
  private userListeners = new Map<number, Unsubscribe>();
  private uploadScheduleTimers = new Map<number, NodeJS.Timeout>();
  
  private readonly UPLOAD_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
  private readonly OPERATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
  
  private readonly LAST_UPLOAD_KEY = 'lastUploadTime';
  private readonly LAST_DOWNLOAD_KEY = 'lastDownloadTime';
  private readonly UPLOAD_SCHEDULE_KEY = 'uploadScheduleEnabled';

  // Add these methods to FirebaseSyncService class

// ==================== TRANSACTION LISTENER ====================

private transactionListeners = new Map<number, Unsubscribe>();

/**
 * Sets up a real-time listener for transactions where agentId matches userId
 * Automatically updates invoices when transaction status changes to SUCCESS
 */
setupTransactionListener(userId: number): void {
  const existing = this.transactionListeners.get(userId);
  if (existing) existing();

  console.log(`🔔 Setting up transaction listener for user ${userId}`);

  const unsubscribe = onSnapshot(
    query(
      collection(db, 'transactions'),
      where('agentId', '==', userId.toString())
    ),
    async (snapshot) => {
      if (snapshot.empty) return;

      const changes = snapshot.docChanges();
      let hasUpdates = false;

      for (const change of changes) {
        if (change.type === 'added' || change.type === 'modified') {
          const data = change.doc.data();
          
          // Only process SUCCESS transactions
          if (data.status === 'success' && data.invoiceId) {
            try {
              await this.processSuccessfulTransaction(userId, data);
              hasUpdates = true;
            } catch (error) {
              console.error(`❌ Failed to process transaction ${change.doc.id}:`, error);
            }
          }
        }
      }

      // Trigger upload if any invoices were updated
      if (hasUpdates && navigator.onLine) {
        try {
          console.log('📤 Triggering upload after transaction update...');
          await this.performSafeUploadSync(userId, 'manual');
        } catch (error) {
          console.error('❌ Post-transaction upload failed:', error);
        }
      }
    },
    (error) => {
      console.error('❌ Transaction listener error:', error);
    }
  );

  this.transactionListeners.set(userId, unsubscribe);
}

/**
 * Rent collected through Paystack per invoice, summed over ALL successful transactions (a tenant may pay in parts).
 * Transaction `amount` is the rent only — the tenant's transaction fee is never part of it.
 */
private async collectedByInvoice(userId: number): Promise<Map<number, number>> {
  const snapshot = await getDocs(
    query(
      collection(db, 'transactions'),
      where('agentId', '==', userId.toString()),
      where('status', '==', 'success'),
      orderBy('completedAt', 'desc')
    )
  );
  const sums = new Map<number, number>();
  for (const d of snapshot.docs) {
    const t = d.data();
    const id = parseInt(t.invoiceId);
    if (!isNaN(id) && typeof t.amount === 'number') sums.set(id, Math.round(((sums.get(id) || 0) + t.amount) * 100) / 100);
  }
  return sums;
}

/**
 * Processes a successful transaction and updates the corresponding invoice
 */
private async processSuccessfulTransaction(userId: number, data: any): Promise<void> {
  try {
    const invoiceId = parseInt(data.invoiceId);
    if (isNaN(invoiceId)) {
      console.warn(`⚠️ Invalid invoiceId: ${data.invoiceId}`);
      return;
    }

    // Verify invoice exists and belongs to user
    const invoice = await database.getInvoiceById(invoiceId);
    if (!invoice) {
      console.debug(`Invoice ${invoiceId} not found locally, skipping`);
      return;
    }

    const tenant = await database.getTenantById(invoice.tenantId);
    if (!tenant) {
      console.warn(`⚠️ Invoice ${invoiceId} does not belong to user ${userId}`);
      return;
    }

    // Convert completedAt timestamp
    let paidDate: string | null = null;
    if (data.completedAt) {
      if (typeof data.completedAt === 'number') {
        paidDate = new Date(data.completedAt).toISOString().split('T')[0];
      } else if (data.completedAt.seconds) {
        paidDate = new Date(data.completedAt.seconds * 1000).toISOString().split('T')[0];
      } else if (typeof data.completedAt === 'string') {
        paidDate = new Date(data.completedAt).toISOString().split('T')[0];
      }
    }

    // Re-derive the invoice from everything collected (all Paystack payments + manual ledger): idempotent, so
    // a repeated or out-of-order event never double-counts; a part-payment leaves it "partial", a full one clears arrears.
    const collected = (await this.collectedByInvoice(userId)).get(invoiceId) || 0;
    await database.applyInvoiceCollection(invoiceId, collected, paidDate);
    console.log(`✅ Invoice ${invoiceId} re-derived from transactions (Paystack collected: ${collected})`);

  } catch (error) {
    console.error('❌ Transaction processing failed:', error);
    throw error;
  }
}

/**
 * Syncs all pending successful transactions (for offline recovery)
 * Call this when user comes back online or during initialization
 */
private async syncPendingTransactions(userId: number): Promise<number> {
  console.log('🔄 Syncing pending transactions...');
  
  try {
    const snapshot = await getDocs(
      query(
        collection(db, 'transactions'),
        where('agentId', '==', userId.toString()),
        where('status', '==', 'success'),
        orderBy('completedAt', 'desc')
      )
    );

    if (snapshot.empty) {
      console.log('✅ No pending transactions to sync');
      return 0;
    }

    let processedCount = 0;
    const collected = await this.collectedByInvoice(userId);

    for (const [invoiceId, paystackCollected] of collected) {
      try {
        const before = await database.getInvoiceById(invoiceId);
        if (!before) continue;
        await database.applyInvoiceCollection(invoiceId, paystackCollected);
        const after = await database.getInvoiceById(invoiceId);
        if (after && (after.amountPaid !== before.amountPaid || after.isPaid !== before.isPaid || after.arrears !== before.arrears)) {
          processedCount++;
        }
      } catch (error) {
        console.error(`❌ Failed to sync payments for invoice ${invoiceId}:`, error);
      }
    }

    console.log(`✅ Synced ${processedCount} pending transactions`);

    // Trigger upload if any transactions were processed
    if (processedCount > 0 && navigator.onLine) {
      await this.performSafeUploadSync(userId, 'manual');
    }

    return processedCount;

  } catch (error) {
    console.error('❌ Pending transactions sync failed:', error);
    return 0;
  }
}

/**
 * Removes the transaction listener for a user
 */
removeTransactionListener(userId: number): void {
  const listener = this.transactionListeners.get(userId);
  if (listener) {
    listener();
    this.transactionListeners.delete(userId);
    console.log(`🔕 Transaction listener removed for user ${userId}`);
  }
}

// ==================== UPDATE INITIALIZATION METHOD ====================

/**
 * Updated initialization to include transaction listener
 */
async initializeForUser(userId: number): Promise<SyncStatus> {
  // De-duplicate: StrictMode double effects and the App + AuthWrapper both start sync.
  const inFlight = this.initPromises.get(userId);
  if (inFlight) return inFlight;
  if (this.initializedUsers.has(userId)) {
    return this.buildSyncStatus('Already initialized');
  }

  const promise = this.runInitializeForUser(userId).finally(() => {
    this.initPromises.delete(userId);
  });
  this.initPromises.set(userId, promise);
  return promise;
}

private async runInitializeForUser(userId: number): Promise<SyncStatus> {
  console.log(`🚀 Initializing sync for user ${userId}...`);

  // Wait for Firebase Auth to restore the session before any Firestore call;
  // otherwise request.auth is null and every rule denies.
  const fbAuth = getAuth();
  await fbAuth.authStateReady();
  if (!fbAuth.currentUser) {
    console.warn('⚠️ No Firebase Auth user yet - skipping sync until sign-in');
    return this.buildSyncStatus('Waiting for Firebase sign-in');
  }

  try {
    // Setup user updates listener
    this.setupUserListener(userId, (user) => {
      console.log('👤 User updated:', user.tier);
    });
    
    // Setup transaction listener
    this.setupTransactionListener(userId);
    
    // Start scheduled uploads
    this.startUploadScheduling(userId);
    
    // Integrate with tenant screening
    integrateWithFirebaseSync(userId);
    
    // Perform full sync
    const result = await this.performFullSync(userId);
    
    // Sync any pending transactions
    await this.syncPendingTransactions(userId);
    
    this.initializedUsers.add(userId);
    console.log('✅ Sync initialized with transaction listener');
    return result;
  } catch (error) {
    console.error('❌ Sync initialization failed:', error);
    throw error;
  }
}

// ==================== UPDATE CLEANUP METHOD ====================

/**
 * Updated cleanup to remove transaction listeners
 */
cleanup(userId?: number): void {
  if (userId) {
    this.removeUserListener(userId);
    this.removeTransactionListener(userId);
    this.stopUploadScheduling(userId);
    this.initializedUsers.delete(userId);
    this.initPromises.delete(userId);
    this.releaseOperationLock(`download_${userId}`);
    this.releaseOperationLock(`upload_${userId}`);
  } else {
    this.userListeners.forEach((listener, uid) => {
      listener();
      this.stopUploadScheduling(uid);
    });
    this.transactionListeners.forEach((listener) => listener());
    
    this.userListeners.clear();
    this.transactionListeners.clear();
    this.initializedUsers.clear();
    this.initPromises.clear();
    this.uploadScheduleTimers.clear();
    this.operationLocks.clear();
  }
}



  static getInstance(): FirebaseSyncService {
    if (!this.instance) {
      this.instance = new FirebaseSyncService();
    }
    return this.instance;
  }

  // ==================== SIMPLIFIED DOWNLOAD - PARALLEL + ORPHAN CLEANUP ====================

  // ==================== SIMPLIFIED DOWNLOAD - SEQUENTIAL + ORPHAN CLEANUP ====================

  private async downloadAllData(userId: number): Promise<void> {
    console.log('📥 Starting SEQUENTIAL download...');
    
    try {
      // Download in order to maintain referential integrity
      // 1. Properties first (no dependencies)
      const propertiesResult = await this.downloadProperties(userId);
      console.log(`✅ Downloaded ${propertiesResult} properties`);
      
      // 2. Tenants second (depend on properties; units were downloaded with their property)
      const tenantsResult = await this.downloadTenants(userId);
      console.log(`✅ Downloaded ${tenantsResult} tenants`);

      // Tenants from before units existed get a unit, and a unit with a tenant is always occupied
      try {
        await database.backfillUnitsFromTenants();
        await database.reconcileUnitOccupancy();
      } catch (error) {
        console.warn('Unit reconcile skipped:', error);
      }
      
      // 3. Invoices last (depend on tenants and properties)
      const invoicesResult = await this.downloadInvoices(userId);
      console.log(`✅ Downloaded ${invoicesResult} invoices`);

      // Clean up orphans after download
      await this.purgeOrphans(userId);
      
      console.log('✅ Download complete with orphan cleanup');
      
    } catch (error) {
      console.error('❌ Download failed:', error);
      throw error;
    }
  }

  // NOTE: these queries deliberately have NO orderBy. Firestore silently drops every document that
  // lacks the ordered field, so ordering by 'lastSyncTime' made any document written by another
  // client (Desk) invisible to the app. We fetch everything and order by ID locally instead.
  private sortByLocalId(docs: any[]): any[] {
    return [...docs].sort((a, b) => Number(a.data()?.localId ?? a.data()?.id ?? 0) - Number(b.data()?.localId ?? b.data()?.id ?? 0));
  }

  private async downloadProperties(userId: number): Promise<number> {
    try {
      const snapshot = await getDocs(collection(db, 'users', userId.toString(), 'properties'));
      
      let count = 0;
      for (const docSnap of this.sortByLocalId(snapshot.docs)) {
        if (await this.syncPropertyDoc(userId, docSnap)) {
          count++;
          await this.downloadUnits(userId, docSnap.id, Number(docSnap.data().localId));
        }
      }
      
      return count;
    } catch (error) {
      console.error('❌ Properties download failed:', error);
      return 0;
    }
  }

  private async downloadUnits(userId: number, firestorePropertyId: string, localPropertyId: number): Promise<void> {
    try {
      const snapshot = await getDocs(
        collection(db, 'users', userId.toString(), 'properties', firestorePropertyId, 'units')
      );

      for (const docSnap of this.sortByLocalId(snapshot.docs)) {
        const data = docSnap.data();
        if (!data?.localId) continue;

        const unclaimed = this.isUnclaimedDeskDoc(data);
        if (unclaimed) {
          const local: any = await this.safeLocal(() => database.getUnitById(data.localId));
          if (local && !this.sameText(local.unitNumber, data.unitNumber)) {
            console.warn(`⚠️ ID conflict: desk unit ${data.localId} ("${data.unitNumber}") vs local unit ("${local.unitNumber}"). Skipping; local record kept.`);
            continue;
          }
        }

        const ok = await this.upsertUnit(localPropertyId, data);
        if (ok && unclaimed) await this.claimDeskDoc(docSnap.ref);
      }
    } catch (error) {
      console.error(`❌ Units download failed for property ${localPropertyId}:`, error);
    }
  }

  // private async downloadUnits(userId: number, firestorePropertyId: string, localPropertyId: number): Promise<void> {
  //   try {
  //     const snapshot = await getDocs(
  //       collection(db, 'users', userId.toString(), 'properties', firestorePropertyId, 'units')
  //     );
      
  //     for (const doc of snapshot.docs) {
  //       const data = doc.data();
  //       if (!data?.localId) continue;
        
  //       await this.upsertUnit(localPropertyId, data);
  //     }
  //   } catch (error) {
  //     console.error(`❌ Units download failed for property ${localPropertyId}:`, error);
  //   }
  // }

  private async downloadTenants(userId: number): Promise<number> {
    try {
      const snapshot = await getDocs(collection(db, 'users', userId.toString(), 'tenants'));
      
      let count = 0;
      for (const docSnap of this.sortByLocalId(snapshot.docs)) {
        if (await this.syncTenantDoc(docSnap)) count++;
      }
      
      return count;
    } catch (error) {
      console.error('❌ Tenants download failed:', error);
      return 0;
    }
  }

  private async downloadInvoices(userId: number): Promise<number> {
    try {
      const snapshot = await getDocs(collection(db, 'users', userId.toString(), 'invoices'));
      
      let count = 0;
      for (const docSnap of this.sortByLocalId(snapshot.docs)) {
        if (await this.syncInvoiceDoc(userId, docSnap)) count++;
      }
      
      return count;
    } catch (error) {
      console.error('❌ Invoices download failed:', error);
      return 0;
    }
  }

  // ==================== DESK-ORIGIN DOCUMENT HANDLING ====================
  // Documents created by Samuhia Desk carry origin: 'desk'. The app "claims" one (appClaimedAt) once it
  // has stored it locally. An UNCLAIMED desk document must never be overwritten by an unrelated local
  // record that happened to reuse its ID (the app picks IDs from its local MAX+1 while offline).

  private isUnclaimedDeskDoc(data: any): boolean {
    return data?.origin === 'desk' && !data?.appClaimedAt;
  }

  private async claimDeskDoc(ref: any): Promise<void> {
    try {
      await setDoc(ref, { appClaimedAt: serverTimestamp() }, { merge: true });
    } catch (error) {
      // Not fatal: the next download retries (the fingerprint check below lets it self-heal)
      console.warn('⚠️ Could not claim desk document:', error);
    }
  }

  private async safeLocal<T>(fn: () => Promise<T>): Promise<T | null> {
    try { return (await fn()) ?? null; } catch { return null; }
  }

  private sameText(a: any, b: any): boolean {
    return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
  }

  private async syncPropertyDoc(userId: number, docSnap: any): Promise<boolean> {
    const data = docSnap.data();
    if (!data?.localId) return false;

    const unclaimed = this.isUnclaimedDeskDoc(data);
    if (unclaimed) {
      const local: any = await this.safeLocal(() => database.getPropertyById(data.localId));
      if (local && !this.sameText(local.name, data.name)) {
        console.warn(`⚠️ ID conflict: desk property ${data.localId} ("${data.name}") vs local property ${data.localId} ("${local.name}"). Skipping; local record kept.`);
        return false;
      }
    }

    const ok = await this.upsertProperty(userId, data);
    if (ok && unclaimed) await this.claimDeskDoc(docSnap.ref);
    return ok;
  }

  private async syncTenantDoc(docSnap: any): Promise<boolean> {
    const data = docSnap.data();
    if (!data?.localId || !data?.propertyId) return false;

    const unclaimed = this.isUnclaimedDeskDoc(data);
    if (unclaimed) {
      const local: any = await this.safeLocal(() => database.getTenantById(data.localId));
      if (local && !this.sameText(local.name, data.name)) {
        console.warn(`⚠️ ID conflict: desk tenant ${data.localId} ("${data.name}") vs local tenant ("${local.name}"). Skipping; local record kept.`);
        return false;
      }
    }

    const ok = await this.upsertTenant(data);
    if (ok && unclaimed) await this.claimDeskDoc(docSnap.ref);
    return ok;
  }

  private async syncInvoiceDoc(userId: number, docSnap: any): Promise<boolean> {
    const data = docSnap.data();
    if (!data?.localId || !data?.tenantId || !data?.propertyId) return false;

    const unclaimed = this.isUnclaimedDeskDoc(data);
    if (unclaimed) {
      const local: any = await this.safeLocal(() => database.getInvoiceById(data.localId));
      if (local && !(Number(local.tenantId) === Number(data.tenantId) && this.sameText(local.billingMonth, data.billingMonth))) {
        console.warn(`⚠️ ID conflict: desk invoice ${data.localId} vs a different local invoice with the same ID. Skipping; local record kept.`);
        return false;
      }
    }

    const ok = await this.upsertInvoice(data);
    if (!ok) return false;

    // Download payments for this invoice
    await this.downloadPayments(userId, docSnap.id, data.localId);
    if (unclaimed) await this.claimDeskDoc(docSnap.ref);
    return true;
  }

  /**
   * Best-effort refresh of the newest cloud records of one kind, run right before the app picks a new
   * ID locally, so records created by Desk (or another device) are already in the local table and
   * MAX(id)+1 cannot land on an ID that exists in the cloud. Never blocks creation: offline, no sync
   * permission, a lock, an error or a timeout all just return.
   */
  async pullBeforeCreate(userId: number, kind: 'properties' | 'invoices', windowSize: number = 25): Promise<void> {
    try {
      if (!navigator.onLine) return;
      const user = await database.getUserById(userId);
      if (!user || !this.canUserSync(user)) return;

      const lockKey = `download_${userId}`;
      if (this.isOperationLocked(lockKey)) return;

      const work = async () => {
        const col = collection(db, 'users', userId.toString(), kind);
        const snapshot = await getDocs(query(col, orderBy('id', 'desc'), limit(windowSize)));
        for (const docSnap of this.sortByLocalId(snapshot.docs)) {
          if (kind === 'properties') {
            await this.syncPropertyDoc(userId, docSnap);
          } else {
            await this.ensureInvoiceParents(userId, docSnap.data());
            await this.syncInvoiceDoc(userId, docSnap);
          }
        }
      };

      await Promise.race([
        work(),
        new Promise<void>(resolve => setTimeout(resolve, 8000))
      ]);
    } catch (error) {
      console.warn('⚠️ pullBeforeCreate skipped:', error);
    }
  }

  // An invoice cannot be stored without its tenant and property, so fetch those individually if missing
  private async ensureInvoiceParents(userId: number, invoiceData: any): Promise<void> {
    const base = ['users', userId.toString()] as const;
    if (invoiceData?.propertyId && !(await this.safeLocal(() => database.getPropertyById(invoiceData.propertyId)))) {
      const snap = await getDoc(doc(db, base[0], base[1], 'properties', String(invoiceData.propertyId)));
      if (snap.exists()) await this.syncPropertyDoc(userId, snap);
    }
    if (invoiceData?.tenantId && !(await this.safeLocal(() => database.getTenantById(invoiceData.tenantId)))) {
      const snap = await getDoc(doc(db, base[0], base[1], 'tenants', String(invoiceData.tenantId)));
      if (snap.exists()) await this.syncTenantDoc(snap);
    }
  }

  private async downloadPayments(userId: number, firestoreInvoiceId: string, localInvoiceId: number): Promise<void> {
    try {
      const snapshot = await getDocs(
        collection(db, 'users', userId.toString(), 'invoices', firestoreInvoiceId, 'payments')
      );
      
      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (!data?.localId) continue;
        
        await this.upsertPayment(localInvoiceId, data);
      }
    } catch (error) {
      console.error(`❌ Payments download failed for invoice ${localInvoiceId}:`, error);
    }
  }




  // ==================== SIMPLE UPSERT OPERATIONS - FIXED ====================

private async upsertProperty(userId: number, data: any): Promise<boolean> {
  try {
    let local = null;
    try {
      local = await database.getPropertyById(data.localId);
    } catch {}
    
    if (!local) {
      // Over the plan's property limit: still store it (restricted) instead of dropping it. Dropping it
      // would leave its ID free for the app to reuse, which then overwrote the cloud copy.
      // enforceTierLimits() decides which properties stay unlocked.
      const canCreate = await database.canCreateProperty?.(userId);
      const restrictedFlag = canCreate?.allowed === false ? 1 : 0;
      {
        // CRITICAL: Use raw SQL to insert with exact ID from Firebase
        await database.db!.run(`
          INSERT INTO properties (
            id, user_id, company_id, name, address, description, image,
            agent_commission_rate, max_units, billing_mode, is_restricted,
            owner_id, owner_phone, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [
          data.localId,  // Use exact ID from Firebase
          data.userId || userId,
          data.companyId || null,
          data.name || 'Restored Property',
          data.address || '',
          data.description || '',
          data.image || null,
          data.agentCommissionRate || 0,
          data.maxUnits || 50,
          data.billingMode === 'rent_only' ? 'rent_only' : 'full',
          restrictedFlag,
          typeof data.ownerId === 'string' && /^PYP-\d{4,}$/.test(data.ownerId) ? data.ownerId : null,
          typeof data.ownerPhone === 'string' && data.ownerPhone.trim() ? data.ownerPhone.trim() : null
        ]);
        
        console.log(`✅ Created property ${data.localId} for user ${userId}`);
      }
    } else if (!local.isRestricted && this.isNewer(this.cloudModified(data), local.updatedAt)) {
      await database.updateProperty(data.localId, {
        name: data.name || local.name,
        address: data.address || local.address,
        description: data.description || local.description,
        image: data.image || local.image,
        agentCommissionRate: data.agentCommissionRate ?? local.agentCommissionRate,
        maxUnits: data.maxUnits || local.maxUnits,
        billingMode: (data.billingMode === 'rent_only' || data.billingMode === 'full') ? data.billingMode : local.billingMode
      });
      
      console.log(`✅ Updated property ${data.localId}`);
    }
    // The owner id is assigned once and never changes; the owner phone follows the cloud copy.
    if (local) await database.applyRemoteOwner(data.localId, { ownerId: data.ownerId, ownerPhone: data.ownerPhone });
    return true;
  } catch (error) {
    console.error(`❌ Upsert property ${data.localId} failed:`, error);
    return false;
  }
}

private async upsertUnit(propertyId: number, data: any): Promise<boolean> {
  try {
    const unitType = data.unitType === 'commercial' ? 'commercial' : 'residential';
    const unitCondition = data.condition === 'new' || data.condition === 'old' ? data.condition : 'maintained';
    const status = data.status === 'occupied' || data.status === 'maintenance' ? data.status : 'vacant';
    const unitSize = typeof data.unitSize === 'string' && data.unitSize ? data.unitSize : 'other';

    let local = null;
    try {
      local = await database.getUnitById(data.localId);
    } catch {}

    if (!local) {
      await database.db!.run(`
        INSERT OR IGNORE INTO units (
          id, property_id, unit_number, rent_amount, deposit_amount,
          unit_type, unit_size, unit_condition, status, is_occupied, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        data.localId,  // Use exact ID from Firebase
        propertyId,
        data.unitNumber || `UN-${data.localId}`,
        data.rentAmount || 0,
        data.depositAmount || 0,
        unitType,
        unitSize,
        unitCondition,
        status,
        status === 'occupied' ? 1 : 0,
        new Date().toISOString(),
        new Date().toISOString()
      ]);
      console.log(`✅ Created unit ${data.localId} for property ${propertyId}`);
    } else if (this.isNewer(this.cloudModified(data), local.updatedAt)) {
      await database.db!.run(`
        UPDATE units
        SET unit_number = ?, rent_amount = ?, deposit_amount = ?, unit_type = ?, unit_size = ?,
            unit_condition = ?, status = ?, is_occupied = ?, updated_at = ?
        WHERE id = ?
      `, [
        data.unitNumber || local.unitNumber,
        data.rentAmount ?? local.rentAmount,
        data.depositAmount ?? local.depositAmount,
        unitType,
        unitSize,
        unitCondition,
        status,
        status === 'occupied' ? 1 : 0,
        new Date().toISOString(),
        data.localId
      ]);
      console.log(`✅ Updated unit ${data.localId}`);
    }
    return true;
  } catch (error) {
    console.error(`❌ Upsert unit ${data.localId} failed:`, error);
    return false;
  }
}

private async upsertTenant(data: any): Promise<boolean> {
  try {
    let local = null;
    try {
      local = await database.getTenantById(data.localId);
    } catch {}
    
    // The leased unit (units are downloaded with their property, before tenants)
    let cloudUnitId: number | null = null;
    if (data.unitId != null) {
      const unit = await this.safeLocal(() => database.getUnitById(Number(data.unitId)));
      if (unit) cloudUnitId = unit.id;
    }

    if (!local) {
      // CRITICAL: Use raw SQL to insert with exact ID from Firebase
      await database.db!.run(`
        INSERT INTO tenants (
          id, property_id, unit_id, name, phone, email, unit_number, rent_amount,
          standing_fees, deposit_amount, lease_start, lease_end,
          is_restricted, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        data.localId,  // Use exact ID from Firebase
        data.propertyId,
        cloudUnitId,
        data.name || 'Restored Tenant',
        data.phone || '',
        data.email || '',
        data.unitNumber || '',
        data.rentAmount || 0,
        data.standingFees || 0,
        data.depositAmount || 0,
        data.leaseStart || null,
        data.leaseEnd || null
      ]);
      
      console.log(`✅ Created tenant ${data.localId} for property ${data.propertyId}`);
      
    } else if (!local.isRestricted && this.isNewer(this.cloudModified(data), local.updatedAt)) {
      await database.updateTenant(data.localId, {
        name: data.name || local.name,
        phone: data.phone || local.phone,
        email: data.email || local.email,
        unitNumber: data.unitNumber || local.unitNumber,
        rentAmount: data.rentAmount ?? local.rentAmount,
        standingFees: data.standingFees ?? local.standingFees,
        depositAmount: data.depositAmount ?? local.depositAmount,
        leaseStart: data.leaseStart || local.leaseStart,
        leaseEnd: data.leaseEnd || local.leaseEnd
      });
      // The unit link comes from the cloud as-is (the unit's own status was synced with the units)
      if (cloudUnitId !== null && cloudUnitId !== local.unitId) {
        await database.db!.run('UPDATE tenants SET unit_id = ? WHERE id = ?', [cloudUnitId, data.localId]);
      }
      
      console.log(`✅ Updated tenant ${data.localId}`);
    }
    return true;
  } catch (error) {
    console.error(`❌ Upsert tenant ${data.localId} failed:`, error);
    return false;
  }
}

private async upsertInvoice(data: any): Promise<boolean> {
  try {
    let local = null;
    try {
      local = await database.getInvoiceById(data.localId);
    } catch {}
    
    if (!local) {
      // CRITICAL: Use raw SQL to insert with exact ID from Firebase
      const waterAmount = ((data.waterCurrentReading || 0) - (data.waterPreviousReading || 0)) * 
                         (data.waterUnitPrice || 0) + (data.waterStandingFee || 0);
      const powerAmount = ((data.powerCurrentReading || 0) - (data.powerPreviousReading || 0)) * 
                         (data.powerUnitPrice || 0);
      const totalAmount = (data.rentAmount || 0) + waterAmount + powerAmount + (data.otherCharges || 0);
      
      await database.db!.run(`
        INSERT INTO invoices (
          id, tenant_id, property_id, invoice_number, billing_month, rent_amount,
          water_current_reading, water_previous_reading, water_standing_fee, water_unit_price,
          power_current_reading, power_previous_reading, power_unit_price,
          other_charges, other_charges_description, total_amount, amount_paid, arrears,
          due_date, paid_date, is_paid, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        data.localId,  // Use exact ID from Firebase
        data.tenantId,
        data.propertyId,
        data.invoiceNumber || `INV-${data.localId}`,
        data.billingMonth || new Date().toISOString().substring(0, 7),
        data.rentAmount || 0,
        data.waterCurrentReading || 0,
        data.waterPreviousReading || 0,
        data.waterStandingFee || 0,
        data.waterUnitPrice || 0,
        data.powerCurrentReading || 0,
        data.powerPreviousReading || 0,
        data.powerUnitPrice || 0,
        data.otherCharges || 0,
        data.otherChargesDescription || '',
        totalAmount,
        data.amountPaid || 0,
        data.arrears || 0,
        data.dueDate || null,
        data.paidDate || null,
        data.isPaid ? 1 : 0
      ]);
      
      console.log(`✅ Created invoice ${data.localId} for tenant ${data.tenantId}`);
      
    } else if (this.isNewer(this.cloudModified(data), local.updatedAt)) {
      // Update existing invoice
      await database.updateInvoice(data.localId, {
        billingMonth: data.billingMonth || local.billingMonth,
        rentAmount: data.rentAmount ?? local.rentAmount,
        waterCurrentReading: data.waterCurrentReading ?? local.waterCurrentReading,
        waterPreviousReading: data.waterPreviousReading ?? local.waterPreviousReading,
        waterStandingFee: data.waterStandingFee ?? local.waterStandingFee,
        waterUnitPrice: data.waterUnitPrice ?? local.waterUnitPrice,
        powerCurrentReading: data.powerCurrentReading ?? local.powerCurrentReading,
        powerPreviousReading: data.powerPreviousReading ?? local.powerPreviousReading,
        powerUnitPrice: data.powerUnitPrice ?? local.powerUnitPrice,
        otherCharges: data.otherCharges ?? local.otherCharges,
        otherChargesDescription: data.otherChargesDescription || local.otherChargesDescription,
        dueDate: data.dueDate || local.dueDate
      });
      
      // Update payment data separately
      await database.db!.run(`
        UPDATE invoices 
        SET amount_paid = ?, arrears = ?, paid_date = ?, is_paid = ?
        WHERE id = ?
      `, [
        data.amountPaid || 0,
        data.arrears || 0,
        data.paidDate || null,
        data.isPaid ? 1 : 0,
        data.localId
      ]);
      
      console.log(`✅ Updated invoice ${data.localId} for tenant ${data.tenantId}`);
    }
    return true;
  } catch (error) {
    console.error(`❌ Upsert invoice ${data.localId} failed:`, error);
    return false;
  }
}

private async upsertPayment(invoiceId: number, data: any): Promise<void> {
  try {
    const existing = await database.getPaymentsByInvoice(invoiceId);
    const found = existing.find(p => p.id === data.localId);
    
    if (!found) {
      // CRITICAL: Use raw SQL to insert with exact ID from Firebase
      await database.db!.run(`
        INSERT INTO payments (
          id, invoice_id, amount, payment_date, payment_method, notes,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        data.localId,  // Use exact ID from Firebase
        invoiceId,
        data.amount || 0,
        data.paymentDate || new Date().toISOString().split('T')[0],
        data.paymentMethod || 'Cash',
        data.notes || ''
      ]);
      
      console.log(`✅ Created payment ${data.localId} for invoice ${invoiceId}`);
    }
  } catch (error) {
    console.error(`❌ Upsert payment ${data.localId} failed:`, error);
  }
}














  // ==================== ORPHAN CLEANUP ====================

  private async isDeskOriginInCloud(userId: number, collectionName: 'tenants' | 'invoices', id: number): Promise<boolean> {
    try {
      const snap = await getDoc(doc(db, 'users', userId.toString(), collectionName, String(id)));
      return snap.exists() && snap.data()?.origin === 'desk';
    } catch {
      // If we cannot tell, do not delete anything from the cloud
      return true;
    }
  }

  private async purgeOrphans(userId: number): Promise<void> {
  console.log('🧹 Purging orphaned records...');
  
  try {
    // Delete orphaned tenants (property_id is null or doesn't exist)
    const orphanedTenants = await database.db!.query(`
      SELECT t.id FROM tenants t
      LEFT JOIN properties p ON t.property_id = p.id
      WHERE t.property_id IS NULL OR p.id IS NULL
    `);
    
    if (orphanedTenants?.values && orphanedTenants.values.length > 0) {
      console.log(`🗑️ Deleting ${orphanedTenants.values.length} orphaned tenants`);
      for (const row of orphanedTenants.values) {
        if (await this.isDeskOriginInCloud(userId, 'tenants', row[0])) {
          // Local-only cleanup: never delete a Desk-created document from the cloud
          await database.db!.run('DELETE FROM tenants WHERE id = ?', [row[0]]);
          console.warn(`⚠️ Removed local orphan tenant ${row[0]} (kept the Desk copy in the cloud)`);
          continue;
        }
        await database.deleteTenant(row[0], userId);
      }
    }

    // Delete orphaned invoices (tenant or property doesn't exist)
    const orphanedInvoices = await database.db!.query(`
      SELECT i.id FROM invoices i
      LEFT JOIN tenants t ON i.tenant_id = t.id
      LEFT JOIN properties p ON i.property_id = p.id
      WHERE t.id IS NULL OR p.id IS NULL
    `);
    
    if (orphanedInvoices?.values && orphanedInvoices.values.length > 0) {
      console.log(`🗑️ Deleting ${orphanedInvoices.values.length} orphaned invoices`);
      for (const row of orphanedInvoices.values) {
        if (await this.isDeskOriginInCloud(userId, 'invoices', row[0])) {
          await database.db!.run('DELETE FROM invoices WHERE id = ?', [row[0]]);
          console.warn(`⚠️ Removed local orphan invoice ${row[0]} (kept the Desk copy in the cloud)`);
          continue;
        }
        await database.deleteInvoice(row[0], userId);
      }
    }

    console.log('✅ Orphan cleanup complete');
  } catch (error) {
    console.error('❌ Orphan cleanup failed:', error);
  }
}

  // ==================== USER UPDATES ====================

  async downloadUserUpdates(userId: number): Promise<{ tier: string; type: string; storage: boolean; company?: any } | null> {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId.toString()));
      
      if (!userDoc.exists()) return null;
      
      const data = userDoc.data();
      if (!data) return null;
      
      const result = {
        tier: data.tier || 'free',
        type: data.type || 'free',
        storage: data.storage === true,
        company: data.company
      };
      
      await database.updateUserTierAndType(userId, result.tier, result.type, result.storage);
      
      if (result.company) {
        await this.syncCompanyData(userId, result.company);
      }
      
      return result;
    } catch (error) {
      console.error('❌ User updates download failed:', error);
      return null;
    }
  }

  private async syncCompanyData(userId: number, companyData: any): Promise<void> {
    try {
      const local = await database.getCompanyByUserId(userId);
      const user = await database.getUserById(userId);
      
      if (!local && user?.type === 'paid') {
        await database.createCompany(userId, {
          name: companyData.name || '',
          address: companyData.address || '',
          phone: companyData.phone || '',
          email: companyData.email || ''
        });
      } else if (local && this.isNewer(companyData.lastModified, local.updatedAt)) {
        await database.updateCompany(local.id, {
          name: companyData.name || local.name,
          address: companyData.address || local.address,
          phone: companyData.phone || local.phone,
          email: companyData.email || local.email
        });
      }
    } catch (error) {
      console.error('❌ Company sync failed:', error);
    }
  }

  // ==================== UPLOAD OPERATIONS ====================

  private async uploadAllData(userId: number): Promise<void> {
    console.log('📤 Uploading all data...');
    
    const user = await database.getUserById(userId);
    if (!user) throw new Error('User not found');

    const batchManager = new SafeBatchManager();

    await this.uploadUserData(userId, user, batchManager);
    await this.uploadProperties(userId, batchManager);
    await this.uploadTenants(userId, batchManager);
    await this.uploadInvoices(userId, batchManager);
    try {
      await this.uploadTranscripts(userId, batchManager);
    } catch (error) {
      // Transcripts are an extra copy for Landlord Watch; they must never block syncing rent data.
      console.warn('Transcript sync skipped:', error);
    }

    await batchManager.commitAll();
    console.log('✅ Upload complete');
  }

  private async uploadUserData(userId: number, user: User, batchManager: SafeBatchManager): Promise<void> {
    const company = await database.getCompanyByUserId(userId);
    const userRef = doc(db, 'users', userId.toString());
    const existing = await getDoc(userRef);
    
    batchManager.addOperation((batch) => {
      batch.set(userRef, {
        ...(existing.exists() ? existing.data() : {}),
        ...user,
        lastSyncTime: serverTimestamp(),
        localId: user.id,
        company: company ? {
          ...(existing.exists() ? existing.data()?.company : {}),
          ...company,
          localId: company.id,
          lastSyncTime: serverTimestamp()
        } : null
      }, { merge: true });
    }, `User ${user.id}`, 'UPDATE');
  }

  /**
   * The property's PYP-NNNN owner id. Reuses the local or cloud id when there is one; otherwise asks the server to allocate
   * the next number (atomic counter, idempotent per property). Returns null when offline: the property still uploads and
   * gets its id on a later sync.
   */
  private async ensureOwnerId(userId: number, property: Property, remote?: Record<string, unknown>): Promise<string | null> {
    const valid = (v: unknown): v is string => typeof v === 'string' && /^PYP-\d{4,}$/.test(v);
    if (valid(property.ownerId)) return property.ownerId;
    if (valid(remote?.ownerId)) {
      await database.setPropertyOwnerId(property.id, remote.ownerId);
      return remote.ownerId;
    }
    try {
      const allocate = httpsCallable<{ userId: string; propertyId: number }, { ownerId: string }>(functions, 'allocatePropertyOwnerId');
      const res = await allocate({ userId: String(userId), propertyId: property.id });
      if (valid(res.data?.ownerId)) {
        await database.setPropertyOwnerId(property.id, res.data.ownerId);
        return res.data.ownerId;
      }
    } catch (error) {
      console.warn(`Owner id for property ${property.id} will be allocated on a later sync:`, error);
    }
    return null;
  }

  private async uploadProperties(userId: number, batchManager: SafeBatchManager, only?: { propertyId: number; unitIds?: number[] }): Promise<void> {
    const properties = (await this.getFilteredPropertiesForSync(userId)).filter(p => !only || p.id === only.propertyId);
    
    for (const property of properties) {
      const ref = doc(db, 'users', userId.toString(), 'properties', property.id.toString());
      const existing = await getDoc(ref);

      if (existing.exists() && this.isUnclaimedDeskDoc(existing.data())) {
        console.warn(`⚠️ Not uploading property ${property.id}: that ID already belongs to a different, unsynced record created in Desk.`);
        continue;
      }
      
      const ownerId = await this.ensureOwnerId(userId, property, existing.exists() ? existing.data() : undefined);
      // Never write a null owner field over one that already exists in the cloud.
      const { ownerId: _localOwnerId, ownerPhone, ...propertyFields } = property;
      void _localOwnerId;

      batchManager.addOperation((batch) => {
        batch.set(ref, {
          ...(existing.exists() ? existing.data() : {}),
          ...propertyFields,
          ...(ownerId ? { ownerId } : {}),
          ...(ownerPhone ? { ownerPhone } : {}),
          userId,
          localId: property.id,
          lastSyncTime: serverTimestamp(),
          lastModified: new Date().toISOString()
        }, { merge: true });
      }, `Property ${property.id}`, existing.exists() ? 'UPDATE' : 'CREATE');
      
      // Upload units (unit facts only, never tenant details). A Cloud Function mirrors them to the public /units collection.
      const units = (await database.getUnitsByProperty(property.id)).filter(u => !only?.unitIds || only.unitIds.includes(u.id));
      for (const unit of units) {
        const unitRef = doc(db, 'users', userId.toString(), 'properties', property.id.toString(), 'units', unit.id.toString());
        const existingUnit = await getDoc(unitRef);

        if (existingUnit.exists() && this.isUnclaimedDeskDoc(existingUnit.data())) {
          console.warn(`⚠️ Not uploading unit ${unit.id}: that ID already belongs to a different, unsynced unit created in Desk.`);
          continue;
        }

        // Real time of the last change (SQLite stores UTC), so another device's newer change is never masked
        const modified = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(unit.updatedAt) ? unit.updatedAt : unit.updatedAt.replace(' ', 'T') + 'Z');
        
        batchManager.addOperation((batch) => {
          batch.set(unitRef, {
            ...(existingUnit.exists() ? existingUnit.data() : {}),
            id: unit.id,
            localId: unit.id,
            userId,
            propertyId: property.id,
            ...(ownerId ? { ownerId } : {}),
            unitNumber: unit.unitNumber,
            unitType: unit.unitType,
            unitSize: unit.unitSize,
            condition: unit.condition,
            status: unit.status,
            isOccupied: unit.status === 'occupied',
            rentAmount: unit.rentAmount,
            depositAmount: unit.depositAmount,
            lastSyncTime: serverTimestamp(),
            lastModified: isNaN(modified.getTime()) ? new Date().toISOString() : modified.toISOString()
          }, { merge: true });
        }, `Unit ${unit.id}`, existingUnit.exists() ? 'UPDATE' : 'CREATE');
      }
    }
  }

  private async uploadTenants(userId: number, batchManager: SafeBatchManager, only?: { propertyId: number; tenantId?: number }): Promise<void> {
    const properties = (await this.getFilteredPropertiesForSync(userId)).filter(p => !only || p.id === only.propertyId);
    const user = await database.getUserById(userId);
    
    for (const property of properties) {
      const tenants = (await this.getFilteredTenantsForSync(property.id, user)).filter(t => !only?.tenantId || t.id === only.tenantId);
      
      for (const tenant of tenants) {
        const ref = doc(db, 'users', userId.toString(), 'tenants', tenant.id.toString());
        const existing = await getDoc(ref);

        if (existing.exists() && this.isUnclaimedDeskDoc(existing.data())) {
          console.warn(`⚠️ Not uploading tenant ${tenant.id}: that ID already belongs to a different, unsynced record created in Desk.`);
          continue;
        }
        
        batchManager.addOperation((batch) => {
          batch.set(ref, {
            ...(existing.exists() ? existing.data() : {}),
            ...tenant,
            ...(property.ownerId ? { ownerId: property.ownerId } : {}),
            userId,
            propertyId: tenant.propertyId,
            localId: tenant.id,
            lastSyncTime: serverTimestamp(),
            lastModified: new Date().toISOString()
          }, { merge: true });
        }, `Tenant ${tenant.id}`, existing.exists() ? 'UPDATE' : 'CREATE');
      }
    }
  }

  /**
   * Landlord transcripts (the agent's monthly statement to the landlord: collected rent, utilities, commission, arrears and
   * any custom deductions) live in SQLite. Landlord Watch has to show the landlord the SAME statement, so every
   * property-month that has transcript lines is mirrored to users/{userId}/transcripts/{propertyId}_{YYYY-MM}.
   * Totals use the PMS rule: net = income lines - deduction lines. A doc is rewritten only when its content changed.
   */
  private async uploadTranscripts(userId: number, batchManager: SafeBatchManager): Promise<void> {
    const properties = await this.getFilteredPropertiesForSync(userId);

    for (const property of properties) {
      const monthsResult = await database.db!.query(
        `SELECT DISTINCT billing_month FROM transcript_items WHERE property_id = ? ORDER BY billing_month`,
        [property.id]
      );
      for (const monthRow of monthsResult.values || []) {
        const month = String(monthRow.billing_month);
        if (!/^\d{4}-\d{2}$/.test(month)) continue;

        const itemsResult = await database.db!.query(
          `SELECT description, amount, type, category, is_deductible, sort_order
             FROM transcript_items WHERE property_id = ? AND billing_month = ? ORDER BY sort_order, id`,
          [property.id, month]
        );
        const items = (itemsResult.values || []).map((r: any) => ({
          description: String(r.description ?? ''),
          amount: Number(r.amount) || 0,
          type: String(r.type ?? 'custom'),
          category: String(r.category ?? ''),
          isDeductible: Boolean(r.is_deductible),
          sortOrder: Number(r.sort_order) || 0
        }));

        const sum = (pick: (i: (typeof items)[number]) => boolean) =>
          Math.round(items.filter(pick).reduce((s, i) => s + i.amount, 0) * 100) / 100;
        const totalIncome = sum(i => !i.isDeductible);
        const totalDeductibles = sum(i => i.isDeductible);
        const totals = {
          grossRentCollected: sum(i => i.type === 'rent' && !i.isDeductible),
          totalWaterCharges: sum(i => i.type === 'water'),
          totalPowerCharges: sum(i => i.type === 'power'),
          totalIncome,
          totalDeductibles,
          agentCommission: sum(i => i.isDeductible && i.description.toLowerCase().includes('commission')),
          netAmountToLandlord: Math.round((totalIncome - totalDeductibles) * 100) / 100
        };

        const summaryResult = await database.db!.query(
          `SELECT status, landlord_name, notes FROM monthly_transcripts WHERE property_id = ? AND billing_month = ?`,
          [property.id, month]
        );
        const summary: any = summaryResult.values?.[0] || {};
        const content = {
          status: String(summary.status ?? 'draft'),
          landlordName: summary.landlord_name ? String(summary.landlord_name) : null,
          notes: summary.notes ? String(summary.notes) : null,
          agentCommissionRate: property.agentCommissionRate,
          items,
          ...totals
        };
        const contentKey = JSON.stringify(content);

        const ref = doc(db, 'users', userId.toString(), 'transcripts', `${property.id}_${month}`);
        const existing = await getDoc(ref);
        if (existing.exists() && existing.data()?.contentKey === contentKey) continue;

        batchManager.addOperation((batch) => {
          batch.set(ref, {
            ...content,
            ...(property.ownerId ? { ownerId: property.ownerId } : {}),
            userId,
            propertyId: property.id,
            billingMonth: month,
            contentKey,
            lastSyncTime: serverTimestamp(),
            lastModified: new Date().toISOString()
          });
        }, `Transcript ${property.id}/${month}`, existing.exists() ? 'UPDATE' : 'CREATE');
      }
    }
  }

  private async uploadInvoices(userId: number, batchManager: SafeBatchManager, only?: { propertyId: number; invoiceId?: number }): Promise<void> {
    const properties = (await this.getFilteredPropertiesForSync(userId)).filter(p => !only || p.id === only.propertyId);
    const user = await database.getUserById(userId);
    
    for (const property of properties) {
      const tenants = await this.getFilteredTenantsForSync(property.id, user);
      
      for (const tenant of tenants) {
        const invoices = (await database.getInvoices({ tenantId: tenant.id })).filter(i => !only?.invoiceId || i.id === only.invoiceId);
        
        for (const invoice of invoices) {
          const ref = doc(db, 'users', userId.toString(), 'invoices', invoice.id.toString());
          const existing = await getDoc(ref);

          if (existing.exists() && this.isUnclaimedDeskDoc(existing.data())) {
            console.warn(`⚠️ Not uploading invoice ${invoice.id}: that ID already belongs to a different, unsynced invoice created in Desk.`);
            continue;
          }
          
          const statusSuffix = invoice.totalAmount <= invoice.amountPaid ? 'paid' : 'pending';
          let pdfUrl = existing.exists() ? existing.data()?.pdfUrl : null;
          
          if (!pdfUrl || existing.data()?.pdfStatus !== statusSuffix) {
            if (existing.exists() && existing.data()?.pdfUrl) {
              await this.deleteOldPDF(existing.data()!.pdfUrl);
            }
            pdfUrl = await this.generateAndUploadPDF(userId, invoice, statusSuffix);
          }
          
          batchManager.addOperation((batch) => {
            batch.set(ref, {
              ...(existing.exists() ? existing.data() : {}),
              ...invoice,
              ...(property.ownerId ? { ownerId: property.ownerId } : {}),
              userId,
              tenantId: invoice.tenantId,
              propertyId: property.id,
              localId: invoice.id,
              pdfUrl,
              pdfStatus: statusSuffix,
              status: invoice.isPaid ? 'paid' : invoice.amountPaid > 0 ? 'partial' : 'unpaid',
              lastSyncTime: serverTimestamp(),
              lastModified: new Date().toISOString()
            }, { merge: true });
          }, `Invoice ${invoice.id}`, existing.exists() ? 'UPDATE' : 'CREATE');
          
          // Upload payments
          const payments = await database.getPaymentsByInvoice(invoice.id);
          for (const payment of payments) {
            const paymentRef = doc(db, 'users', userId.toString(), 'invoices', invoice.id.toString(), 'payments', payment.id.toString());
            const existingPayment = await getDoc(paymentRef);
            
            batchManager.addOperation((batch) => {
              batch.set(paymentRef, {
                ...(existingPayment.exists() ? existingPayment.data() : {}),
                ...payment,
                ...(property.ownerId ? { ownerId: property.ownerId } : {}),
                userId,
                invoiceId: invoice.id,
                tenantId: invoice.tenantId,
                propertyId: property.id,
                localId: payment.id,
                lastSyncTime: serverTimestamp(),
                lastModified: new Date().toISOString()
              }, { merge: true });
            }, `Payment ${payment.id}`, existingPayment.exists() ? 'UPDATE' : 'CREATE');
          }
        }
      }
    }
  }

  // ==================== PDF OPERATIONS ====================

  private async generateAndUploadPDF(userId: number, invoice: any, statusSuffix: string): Promise<string | null> {
    try {
      const user = await database.getUserById(userId);
      if (!user) return null;
      
      const company = await database.getCompanyByUserId(userId);
      const property = await database.getPropertyById(invoice.propertyId);
      if (!property) return null;
      
      //const payments = await database.getPaymentsByInvoice(invoice.id);
      const companyInfo = this.getCompanyInfo(user, company);
      const paymentInstructions = this.getPaymentInstructions();
      
      const pdfBytes = await generateInvoicePDF(
        invoice,
        property,
        //payments,
        companyInfo,
        { template: 'standard', paymentInstructions, includeCompanyLogo: true },
        user
      );
      
      const filename = `invoices/${userId}/${invoice.id}_${statusSuffix}.pdf`;
      const storageRef = ref(storage, filename);
      
      const uploadResult = await uploadBytes(storageRef, pdfBytes);
      return await getDownloadURL(uploadResult.ref);
      
    } catch (error) {
      console.error('❌ PDF generation failed:', error);
      return null;
    }
  }

  private async deleteOldPDF(pdfUrl: string): Promise<void> {
    try {
      if (!pdfUrl || !pdfUrl.includes('firebase')) return;
      
      const urlParts = pdfUrl.split('/o/')[1];
      if (!urlParts) return;
      
      const storagePath = decodeURIComponent(urlParts.split('?')[0]);
      await deleteObject(ref(storage, storagePath));
    } catch (error) {
      console.error('❌ PDF deletion failed:', error);
    }
  }

  private getCompanyInfo(user: User, company: any): any {
    if ((user.tier === 'pro' || user.tier === 'business' || user.tier === 'enterprise') && company) {
      return {
        name: company.name,
        address: company.address || '',
        phone: company.phone || '',
        email: company.email || '',
        website: 'www.samuhia.co.ke'
      };
    }
    
    return {
      name: 'PLOT YANGU',
      address: 'Naivasha, Nakuru, Kenya',
      phone: '+254 791 286 165',
      email: 'info@samuhia.co.ke',
      website: 'www.samuhia.co.ke'
    };
  }

  private getPaymentInstructions(): string {
    try {
      const stored = localStorage.getItem('defaultPaymentInstructions');
      const instructions = stored ? JSON.parse(stored) : {};
      
      const parts = [];
      if (instructions.mpesaTillNumber) {
        parts.push(`M-Pesa Till Number: ${instructions.mpesaTillNumber}`);
      }
      if (instructions.bankName && instructions.accountNumber) {
        parts.push(`Bank Transfer: ${instructions.bankName} - Account: ${instructions.accountNumber}`);
      }
      if (instructions.customInstructions) {
        parts.push(instructions.customInstructions);
      }
      
      return parts.length > 0 
        ? parts.join('. ') 
        : 'Please make payment within 7 days of the due date. Contact us for payment methods.';
    } catch {
      return 'Please make payment within 7 days of the due date. Contact us for payment methods.';
    }
  }

  // ==================== TIER LIMITS ====================

  private async enforceTierLimits(userId: number): Promise<void> {
    const user = await database.getUserById(userId);
    if (!user) return;

    const limits = this.getUserLimits(user);
    
    try {
      const allProperties = await database.getProperties(userId);
      if (allProperties.length === 0) return;
      
      // Restrict excess properties
      if (limits.properties !== -1 && allProperties.length > limits.properties) {
        const excess = allProperties.slice(limits.properties);
        console.log(`🚫 Restricting ${excess.length} properties`);
        
        for (const property of excess) {
          await database.updateProperty(property.id, { isRestricted: true });
          
          const tenants = await database.getTenantsByProperty(property.id);
          for (const tenant of tenants) {
            await database.updateTenant(tenant.id, { isRestricted: true });
          }
        }
      }
      
      // Restrict excess tenants per property
      // Restrict excess tenants per property
      if (limits.tenantsPerProperty !== -1) {
        // Handle unlimited properties for enterprise tier
        const maxProperties = typeof limits.properties === 'number' && limits.properties > 0 
          ? limits.properties 
          : allProperties.length;
          
        const allowedProperties = allProperties.slice(0, maxProperties);
        
        for (const property of allowedProperties) {
          const tenants = await database.getTenantsByProperty(property.id);
          
          if (tenants.length > limits.tenantsPerProperty) {
            const excess = tenants.slice(limits.tenantsPerProperty);
            console.log(`🚫 Restricting ${excess.length} tenants in property ${property.id}`);
            
            for (const tenant of excess) {
              await database.updateTenant(tenant.id, { isRestricted: true });
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Tier limit enforcement failed:', error);
    }
  }

  private getUserLimits(user: any) {
    return USER_LIMITS[user?.tier as UserTier] || USER_LIMITS.free;
  }

  canUserSync(user: any): boolean {
    if (user.tier === 'business' || user.tier === 'solo' || user.tier === 'pro' || user.tier === 'enterprise') {
      return true;
    }
    return user.storage === true;
  }

  // ==================== HELPER METHODS ====================

  private async getFilteredPropertiesForSync(userId: number): Promise<Property[]> {
    const user = await database.getUserById(userId);
    if (!user) return [];

    const limits = this.getUserLimits(user);
    
    let query = `
      SELECT * FROM properties 
      WHERE user_id = ? AND is_restricted = 0
      ORDER BY created_at ASC
    `;
    
    if (limits.properties !== -1) {
      query += ` LIMIT ${limits.properties}`;
    }
    
    const result = await database.db!.query(query, [userId]);
    return database.mapToProperties(result.values || []);
  }

  private async getFilteredTenantsForSync(propertyId: number, user: User | null): Promise<Tenant[]> {
    const limits = this.getUserLimits(user);
    
    let query = `
      SELECT * FROM tenants 
      WHERE property_id = ? AND is_restricted = 0
      ORDER BY created_at ASC
    `;
    
    if (limits.tenantsPerProperty !== -1) {
      query += ` LIMIT ${limits.tenantsPerProperty}`;
    }
    
    const result = await database.db!.query(query, [propertyId]);
    return database.mapToTenants(result.values || []);
  }

  // Documents written by Desk may not carry lastModified; fall back to the other change markers
  private cloudModified(data: any): any {
    return data?.lastModified ?? data?.lastSyncTime ?? data?.updatedAt ?? null;
  }

  private isNewer(serverTimestamp: any, localTimestamp: string): boolean {
    const serverDate = this.parseTimestamp(serverTimestamp);
    const localDate = new Date(localTimestamp);
    return serverDate > localDate;
  }

  private parseTimestamp(timestamp: any): Date {
    if (!timestamp) return new Date(0);
    if (timestamp instanceof Timestamp) return timestamp.toDate();
    if (typeof timestamp === 'string') return new Date(timestamp);
    if (timestamp.seconds) return new Date(timestamp.seconds * 1000);
    return new Date(timestamp);
  }

  // ==================== OPERATION LOCKS ====================

  private async acquireOperationLock(lockKey: string): Promise<void> {
    const timeout = setTimeout(() => {
      throw new Error(`Operation timeout: ${lockKey}`);
    }, this.OPERATION_TIMEOUT_MS);

    try {
      while (this.operationLocks.get(lockKey)) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      this.operationLocks.set(lockKey, true);
    } finally {
      clearTimeout(timeout);
    }
  }

  private releaseOperationLock(lockKey: string): void {
    this.operationLocks.delete(lockKey);
  }

  private isOperationLocked(lockKey: string): boolean {
    return this.operationLocks.get(lockKey) || false;
  }

  // ==================== PUBLIC API - DOWNLOAD ====================

  async performDownloadSync(userId: number, source: 'signin' | 'manual' = 'manual'): Promise<SyncStatus> {
    const lockKey = `download_${userId}`;
    
    if (this.isOperationLocked(lockKey)) {
      // Not an error: another caller is already downloading (e.g. StrictMode's
      // double mount). Let it finish instead of surfacing an unhandled rejection.
      console.log('⏳ Download already in progress, skipping duplicate request');
      return this.buildSyncStatus('Download already in progress');
    }

    console.log(`🔽 Starting download (${source})...`);
    
    try {
      await this.acquireOperationLock(lockKey);
      
      const user = await database.getUserById(userId);
      if (!user) throw new Error('User not found');

      if (!this.canUserSync(user)) {
        return this.buildSyncStatus('No sync permission');
      }

      if (!navigator.onLine) {
        throw new Error('No network connection');
      }

      await this.downloadUserUpdates(userId);
      await this.downloadAllData(userId);
      await this.enforceTierLimits(userId);

      localStorage.setItem(this.LAST_DOWNLOAD_KEY, new Date().toISOString());
      
      console.log('✅ Download complete');
      return this.buildSyncStatus('Download completed');
      
    } catch (error) {
      console.error('❌ Download failed:', error);
      throw error;
    } finally {
      this.releaseOperationLock(lockKey);
    }
  }

  // ==================== PUBLIC API - UPLOAD ====================

  async performSafeUploadSync(userId: number, source: 'scheduled' | 'manual' = 'manual'): Promise<SyncStatus> {
    const lockKey = `upload_${userId}`;
    
    if (this.isOperationLocked(lockKey)) {
      // Not an error: another upload is running. Skip instead of rejecting.
      console.log('⏳ Upload already in progress, skipping duplicate request');
      return this.buildSyncStatus('Upload already in progress');
    }

    console.log(`🔼 Starting upload (${source})...`);
    
    try {
      await this.acquireOperationLock(lockKey);
      
      const user = await database.getUserById(userId);
      if (!user) throw new Error('User not found');

      if (!this.canUserSync(user)) {
        return this.buildSyncStatus('No sync permission');
      }

      if (!navigator.onLine) {
        throw new Error('No network connection');
      }

      if (source === 'scheduled' && !this.shouldPerformScheduledUpload()) {
        return this.buildSyncStatus('Upload skipped - too soon');
      }

      await this.uploadAllData(userId);

      localStorage.setItem(this.LAST_UPLOAD_KEY, new Date().toISOString());
      
      console.log('✅ Upload complete');
      return this.buildSyncStatus('Upload completed');
      
    } catch (error) {
      console.error('❌ Upload failed:', error);
      throw error;
    } finally {
      this.releaseOperationLock(lockKey);
    }
  }

  // ==================== PUBLIC API - FULL SYNC ====================

  async performFullSync(userId: number): Promise<SyncStatus> {
    console.log('🔄 Starting full sync...');
    
    try {
      await this.performDownloadSync(userId, 'signin');
      
      if (this.shouldPerformScheduledUpload()) {
        await this.performSafeUploadSync(userId, 'scheduled');
      }
      
      return this.buildSyncStatus('Full sync completed');
    } catch (error) {
      console.error('❌ Full sync failed:', error);
      throw error;
    }
  }

  

  // ==================== PUBLIC API - FORCE OPERATIONS ====================

  async forceDownload(userId: number): Promise<SyncStatus> {
    return this.performDownloadSync(userId, 'manual');
  }

  /**
   * Live sync: pushes just the property (+ the given units / tenant) that changed, right away.
   * Only for online users on plans with cloud storage (free and starter stay offline).
   */
  async pushLive(userId: number, propertyId: number, only: { unitIds?: number[]; tenantId?: number; invoiceId?: number } = {}): Promise<void> {
    if (!navigator.onLine) return;
    const user = await database.getUserById(userId);
    if (!user || USER_LIMITS[user.tier as keyof typeof USER_LIMITS]?.storage !== true) return;

    const batchManager = new SafeBatchManager();
    await this.uploadProperties(userId, batchManager, { propertyId, unitIds: only.unitIds });
    if (only.tenantId) await this.uploadTenants(userId, batchManager, { propertyId, tenantId: only.tenantId });
    if (only.invoiceId) await this.uploadInvoices(userId, batchManager, { propertyId, invoiceId: only.invoiceId });
    await batchManager.commitAll();
  }

  async forceUpload(userId: number): Promise<SyncStatus> {
    return this.performSafeUploadSync(userId, 'manual');
  }

  // ==================== SCHEDULING ====================

  startUploadScheduling(userId: number): void {
    const existing = this.uploadScheduleTimers.get(userId);
    if (existing) clearTimeout(existing);

    const scheduleNext = () => {
      const nextTime = this.calculateNextUploadTime();
      const msUntil = nextTime.getTime() - Date.now();
      
      const timer = setTimeout(async () => {
        try {
          if (navigator.onLine && this.shouldPerformScheduledUpload()) {
            await this.performSafeUploadSync(userId, 'scheduled');
          }
          scheduleNext();
        } catch (error) {
          console.error('❌ Scheduled upload failed:', error);
          scheduleNext();
        }
      }, msUntil);
      
      this.uploadScheduleTimers.set(userId, timer);
    };

    scheduleNext();
    localStorage.setItem(this.UPLOAD_SCHEDULE_KEY, 'true');
  }

  stopUploadScheduling(userId: number): void {
    const timer = this.uploadScheduleTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.uploadScheduleTimers.delete(userId);
    }
    localStorage.removeItem(this.UPLOAD_SCHEDULE_KEY);
  }

  private calculateNextUploadTime(): Date {
    return new Date(Date.now() + this.UPLOAD_INTERVAL_MS);
  }

  private shouldPerformScheduledUpload(): boolean {
    const last = localStorage.getItem(this.LAST_UPLOAD_KEY);
    if (!last) return true;
    
    const timeSince = Date.now() - new Date(last).getTime();
    return timeSince >= this.UPLOAD_INTERVAL_MS;
  }

  // ==================== USER LISTENER ====================

  setupUserListener(userId: number, onUserUpdate: (user: User) => void): void {
    const existing = this.userListeners.get(userId);
    if (existing) existing();

    const unsubscribe = onSnapshot(doc(db, 'users', userId.toString()), async (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        
        try {
          await database.updateUser(userId, {
            name: data.name || 'Unknown User',
            email: data.email || '',
            phone: data.phone || '',
            isPremium: data.isPremium || false
          });

          await database.updateUserTierAndType(
            userId, 
            data.tier || 'free', 
            data.type || 'free',
            data.storage || false
          );

          await this.enforceTierLimits(userId);
          
          const updated = await database.getUserById(userId);
          if (updated) onUserUpdate(updated);
          
        } catch (error) {
          console.error('❌ User update failed:', error);
        }
      }
    });

    this.userListeners.set(userId, unsubscribe);
  }

  removeUserListener(userId: number): void {
    const listener = this.userListeners.get(userId);
    if (listener) {
      listener();
      this.userListeners.delete(userId);
    }
  }

  // ==================== STATUS AND UTILITY ====================

  private buildSyncStatus(message: string): SyncStatus {
    return {
      lastDownloadTime: localStorage.getItem(this.LAST_DOWNLOAD_KEY) || 'Never',
      lastUploadTime: localStorage.getItem(this.LAST_UPLOAD_KEY) || 'Never',
      syncInProgress: false,
      nextScheduledUpload: this.calculateNextUploadTime().toISOString(),
      errors: [message]
    };
  }

  async getSyncStatus(userId: number): Promise<SyncStatus> {
    return {
      lastDownloadTime: localStorage.getItem(this.LAST_DOWNLOAD_KEY) || 'Never',
      lastUploadTime: localStorage.getItem(this.LAST_UPLOAD_KEY) || 'Never',
      syncInProgress: this.isOperationLocked(`download_${userId}`) || this.isOperationLocked(`upload_${userId}`),
      nextScheduledUpload: localStorage.getItem(this.UPLOAD_SCHEDULE_KEY) === 'true' 
        ? this.calculateNextUploadTime().toISOString() 
        : 'Disabled',
      errors: []
    };
  }

  canPerformNetworkOperations(): boolean {
    return navigator.onLine;
  }

  getNetworkStatus(): { online: boolean; canSync: boolean; message: string } {
    const online = navigator.onLine;
    
    return {
      online,
      canSync: online,
      message: online 
        ? 'Network available - sync operations enabled'
        : 'No network connection - operating in offline mode'
    };
  }

  // ==================== VALIDATION ====================

  async validateUserAccess(userId: number, entityType: 'property' | 'tenant' | 'invoice', entityId: number): Promise<boolean> {
    try {
      const user = await database.getUserById(userId);
      if (!user) return false;

      switch (entityType) {
        case 'property':
          const property = await database.getPropertyById(entityId);
          return property?.userId === userId && !property.isRestricted;
          
        case 'tenant':
          const tenant = await database.getTenantById(entityId);
          if (!tenant || tenant.isRestricted) return false;
          
          const tenantProperty = await database.getPropertyById(tenant.propertyId);
          return tenantProperty?.userId === userId && !tenantProperty.isRestricted;
          
        case 'invoice':
          const invoice = await database.getInvoiceById(entityId);
          if (!invoice) return false;
          
          const invoiceProperty = await database.getPropertyById(invoice.propertyId);
          const invoiceTenant = await database.getTenantById(invoice.tenantId);
          
          return invoiceProperty?.userId === userId && 
                 !invoiceProperty.isRestricted && 
                 !invoiceTenant?.isRestricted;
                 
        default:
          return false;
      }
    } catch (error) {
      return false;
    }
  }

  // ==================== DEBUG ====================

  async getDebugInfo(userId: number): Promise<any> {
    const user = await database.getUserById(userId);
    const syncStatus = await this.getSyncStatus(userId);
    const networkStatus = this.getNetworkStatus();
    const limits = this.getUserLimits(user);
    
    const properties = await database.getProperties(userId);
    const restrictedProperties = properties.filter(p => p.isRestricted);
    
    let totalTenants = 0;
    let restrictedTenants = 0;
    
    for (const property of properties) {
      const tenants = await database.getTenantsByProperty(property.id);
      totalTenants += tenants.length;
      restrictedTenants += tenants.filter(t => t.isRestricted).length;
    }
    
    return {
      user: {
        id: user?.id,
        tier: user?.tier,
        type: user?.type,
        storage: user?.storage,
        canSync: user ? this.canUserSync(user) : false
      },
      limits,
      entities: {
        properties: {
          total: properties.length,
          restricted: restrictedProperties.length,
          allowed: properties.length - restrictedProperties.length
        },
        tenants: {
          total: totalTenants,
          restricted: restrictedTenants,
          allowed: totalTenants - restrictedTenants
        }
      },
      sync: syncStatus,
      network: networkStatus
    };
  }

  

  // ==================== WEBHOOK HANDLER ====================

  static async handleRevenueCatWebhook(data: {
    localUserId: number;
    firestoreUserId: string;
    tier: UserTier;
    type: UserType;
    storage: boolean;
    revenuekatUserId: string;
  }): Promise<void> {
    try {
      const userRef = doc(db, 'users', data.firestoreUserId);
      await setDoc(userRef, {
        tier: data.tier,
        type: data.type,
        storage: data.storage,
        revenuekatUserId: data.revenuekatUserId,
        isPremium: data.type === 'paid',
        lastUpdated: serverTimestamp()
      }, { merge: true });
      
      try {
        const localUser = await database.getUserById(data.localUserId);
        if (localUser) {
          await database.updateUserTierAndType(data.localUserId, data.tier, data.type, data.storage);
        }
      } catch {
        // Local update will happen on next sync
      }
    } catch (error) {
      console.error('❌ Webhook handling failed:', error);
      throw error;
    }
  }
}

// Export singleton
export const firebaseSyncService = FirebaseSyncService.getInstance();