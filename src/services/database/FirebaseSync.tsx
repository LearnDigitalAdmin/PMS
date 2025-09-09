// services/sync/FirebaseSyncService.ts
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  writeBatch,
  serverTimestamp,
  orderBy,
  limit,
  onSnapshot,
  type Unsubscribe,
  deleteDoc
} from 'firebase/firestore';
import { database } from '../database/Database';
import type { 
  User, 
  Property, 
  Tenant} from '../database/Database';
  
// Add these imports at the top of FirebaseSync.tsx
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from 'firebase/storage';
import { generateInvoicePDF } from '../pdf/PDFService';

// Firebase config - replace with your actual config
const firebaseConfig = {
  apiKey: "AIzaSyD1hg7YLv08vyR2kSWi2ymxSu2pYCRwPq8",
  authDomain: "plot-9fd6e.firebaseapp.com",
  projectId: "plot-9fd6e",
  storageBucket: "plot-9fd6e.firebasestorage.app",
  messagingSenderId: "1037620305589",
  appId: "1:1037620305589:web:2672a7dcaeca4c46b068fc",
  measurementId: "G-B90H3GJFPM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// Sync interfaces
export interface SyncStatus {
  lastSyncTime: string;
  syncInProgress: boolean;
  pendingUploads: number;
  pendingDownloads: number;
  errors: string[];
}

export interface SyncLog {
  id: string;
  userId: number;
  action: 'upload' | 'download' | 'full_sync';
  timestamp: string;
  status: 'success' | 'error';
  details: string;
  errorMessage?: string;
}

// User tier limits
export const USER_LIMITS = {
  free: { 
    properties: 1, 
    tenantsPerProperty: 12, 
    totalTenants: 12,
    storage: false 
  },
  low: { 
    properties: 4, 
    tenantsPerProperty: 15, 
    totalTenants: 75,
    storage: false // Can be upgraded with IAP
  },
  business: { 
    properties: 10, 
    tenantsPerProperty: 20, 
    totalTenants: 230,
    storage: true 
  },
  pro: { 
    properties: 20, 
    tenantsPerProperty: 25, 
    totalTenants: 500,
    storage: true 
  },
  enterprise: { 
    properties: -1, // unlimited
    tenantsPerProperty: -1, // unlimited
    totalTenants: -1, // unlimited
    storage: true 
  }
} as const;

export type UserType = 'free' | 'paid';
export type UserTier = 'free' | 'low' | 'business' | 'pro' | 'enterprise';

export class FirebaseSyncService {
  private static instance: FirebaseSyncService;
  private syncInProgress = false;
  private syncListeners: Unsubscribe[] = [];
  private lastSyncTime: string | null = null;

  static getInstance(): FirebaseSyncService {
    if (!this.instance) {
      this.instance = new FirebaseSyncService();
    }
    return this.instance;
  }

// Add this helper function to generate company info based on user tier
private getCompanyInfoForPDF(user: User, userCompany: any): any {
  if (user.tier === 'business' || user.tier === 'enterprise') {
    return userCompany ? {
      name: userCompany.name,
      address: userCompany.address || '',
      phone: userCompany.phone || '',
      email: userCompany.email || '',
      website: 'www.cogvana.com'
    } : {
      name: 'SMB KENYA LTD: PLOT YANGU',
      address: 'Naivasha, Nakuru, Kenya',
      phone: '+254 791 286 165',
      email: 'info@smbkenya.com',
      website: 'www.cogvana.com'
    };
  }
  
  return {
    name: 'SMB KENYA LTD: PLOT YANGU',
    address: 'Naivasha, Nakuru, Kenya',
    phone: '+254 791 286 165',
    email: 'info@smbkenya.com',
    website: 'www.cogvana.com'
  };
}





// ==================== OPTION 1: MERGE-FIRST SYNC (RECOMMENDED) ====================
// Download first, then upload changes - preserves data from both sides

async performFullSync(userId: number): Promise<SyncStatus> {
  if (this.syncInProgress) {
    throw new Error('Sync already in progress');
  }

  this.syncInProgress = true;
  const errors: string[] = [];
  
  try {
    const user = await database.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    if (!this.canUserSync(user)) {
      throw new Error('User does not have sync permissions. Upgrade to business, pro, or enterprise tier, or purchase cloud storage.');
    }

    console.log('Starting MERGE-FIRST sync for user:', user.email);
    
    // Step 1: Download and apply any tier/type updates from Firestore first
    try {
      const latestUser = await this.downloadUserFromFirestore(userId);
      if (latestUser) {
        await database.updateUserTierAndType(
          userId, 
          latestUser.tier, 
          latestUser.type, 
          latestUser.storage
        );
        console.log('User tier and permissions updated from Firestore');
      }
    } catch (error) {
      errors.push(`Failed to download user updates: ${error}`);
      console.error('Error downloading user updates:', error);
    }

    // Step 2: DOWNLOAD FIRST - Merge remote data into local
    try {
      await this.downloadAndMergeData(userId);
      console.log('Download from Firestore completed');
    } catch (error) {
      errors.push(`Failed to download data: ${error}`);
      console.error('Error downloading data:', error);
    }

    // Step 3: UPLOAD SECOND - Use MERGE strategy instead of CRITICAL DELETE
    try {
      await this.syncUserDataToFirestoreMerge(userId); // Use merge instead of delete
      console.log('Merge upload to Firestore completed');
    } catch (error) {
      errors.push(`Failed to upload data: ${error}`);
      console.error('Error uploading data:', error);
    }

    // Step 4: Final enforcement of limits
    try {
      await this.enforceTierLimits(userId);
      console.log('Final limit enforcement completed');
    } catch (error) {
      errors.push(`Failed to enforce limits: ${error}`);
      console.error('Error enforcing limits:', error);
    }
    
    this.lastSyncTime = new Date().toISOString();
    localStorage.setItem('lastSyncTime', this.lastSyncTime);
    
    return {
      lastSyncTime: this.lastSyncTime,
      syncInProgress: false,
      pendingUploads: 0,
      pendingDownloads: 0,
      errors
    };
    
  } catch (error) {
    console.error('Critical sync error:', error);
    errors.push(error instanceof Error ? error.message : 'Unknown sync error');
    
    return {
      lastSyncTime: this.lastSyncTime || 'Never',
      syncInProgress: false,
      pendingUploads: 0,
      pendingDownloads: 0,
      errors
    };
  } finally {
    this.syncInProgress = false;
  }
}

// ==================== NEW: MERGE-BASED UPLOAD (DOESN'T DELETE EVERYTHING) ====================
private async syncUserDataToFirestoreMerge(userId: number): Promise<void> {
  const user = await database.getUserById(userId);
  if (!user || !this.canUserSync(user)) {
    console.log('User cannot sync - no storage permission');
    return;
  }

  try {
    console.log('Starting MERGE sync for user:', user.email);
    
    const batches = [];
    let currentBatch = writeBatch(db);
    let operationCount = 0;
    const maxBatchSize = 450;

    const addToBatch = (ref: any, data: any, description: string) => {
      if (operationCount >= maxBatchSize) {
        console.log(`Batch full (${operationCount} operations), creating new batch`);
        batches.push(currentBatch);
        currentBatch = writeBatch(db);
        operationCount = 0;
      }
      // Use MERGE instead of overwrite
      currentBatch.set(ref, data, { merge: true });
      operationCount++;
      console.log(`Added to batch (MERGE): ${description} (${operationCount}/${maxBatchSize})`);
    };

    // 1. Sync user data with company embedded
    const company = await database.getCompanyByUserId(userId);
    const userRef = doc(db, 'users', userId.toString());
    addToBatch(userRef, {
      ...user,
      lastSyncTime: serverTimestamp(),
      localId: user.id,
      company: company ? {
        ...company,
        localId: company.id,
        lastSyncTime: serverTimestamp()
      } : null
    }, `User ${user.id}`);

    // 2. Sync properties (MERGE - don't delete existing)
    const properties = await this.getFilteredPropertiesForSync(userId);
    console.log(`Merging ${properties.length} properties`);
    
    for (const property of properties) {
      const propertyRef = doc(db, 'users', userId.toString(), 'properties', property.id.toString());
      addToBatch(propertyRef, {
        ...property,
        userId,
        localId: property.id,
        lastSyncTime: serverTimestamp()
      }, `Property ${property.id}`);

      // Sync units for this property
      const units = await database.getUnitsByProperty(property.id);
      for (const unit of units) {
        const unitRef = doc(db, 'users', userId.toString(), 'properties', property.id.toString(), 'units', unit.id.toString());
        addToBatch(unitRef, {
          ...unit,
          userId,
          propertyId: property.id,
          localId: unit.id,
          lastSyncTime: serverTimestamp()
        }, `Unit ${unit.id} in Property ${property.id}`);
      }
    }

    // 3. Sync tenants (MERGE)
    for (const property of properties) {
      const tenants = await this.getFilteredTenantsForSync(property.id, user);
      
      for (const tenant of tenants) {
        const tenantRef = doc(db, 'users', userId.toString(), 'tenants', tenant.id.toString());
        addToBatch(tenantRef, {
          ...tenant,
          userId,
          propertyId: property.id,
          localId: tenant.id,
          lastSyncTime: serverTimestamp()
        }, `Tenant ${tenant.id}`);
      }
    }

    // 4. Sync invoices (MERGE)
    for (const property of properties) {
      const tenants = await this.getFilteredTenantsForSync(property.id, user);
      
      for (const tenant of tenants) {
        const invoices = await database.getInvoices({ tenantId: tenant.id });
        
        for (const invoice of invoices) {
          const invoiceRef = doc(db, 'users', userId.toString(), 'invoices', invoice.id.toString());
          
          // Handle PDF generation (same as before)
          let pdfUrl = null;
          const statusSuffix = invoice.totalAmount <= invoice.amountPaid ? 'paid' : 'pending';
          
          try {
            const existingInvoiceDoc = await getDoc(invoiceRef);
            const existingInvoice = existingInvoiceDoc.exists() ? existingInvoiceDoc.data() : null;
            
            const shouldGeneratePDF = !existingInvoice || (existingInvoice.pdfStatus !== statusSuffix);
            
            if (shouldGeneratePDF) {
              console.log(`Generating PDF for invoice ${invoice.id} - Status: ${statusSuffix}`);
              
              if (existingInvoice && existingInvoice.pdfUrl && existingInvoice.pdfStatus !== statusSuffix) {
                await this.deleteOldPDFFromStorage(existingInvoice.pdfUrl);
              }
              
              const pdfPromise = this.generateAndUploadInvoicePDF(userId, invoice, statusSuffix);
              const timeoutPromise = new Promise<string | null>((_, reject) => 
                setTimeout(() => reject(new Error('PDF generation timeout')), 30000)
              );
              
              pdfUrl = await Promise.race([pdfPromise, timeoutPromise]);
            } else {
              pdfUrl = existingInvoice?.pdfUrl || null;
            }
          } catch (pdfError) {
            console.error(`PDF generation failed for invoice ${invoice.id}:`, pdfError);
            pdfUrl = null;
          }
          
          addToBatch(invoiceRef, {
            ...invoice,
            userId,
            tenantId: tenant.id,
            propertyId: property.id,
            localId: invoice.id,
            pdfUrl: pdfUrl,
            pdfStatus: statusSuffix,
            lastSyncTime: serverTimestamp()
          }, `Invoice ${invoice.id}`);

          // 5. Sync payments
          const payments = await database.getPaymentsByInvoice(invoice.id);
          for (const payment of payments) {
            const paymentRef = doc(db, 'users', userId.toString(), 'invoices', invoice.id.toString(), 'payments', payment.id.toString());
            addToBatch(paymentRef, {
              ...payment,
              userId,
              invoiceId: invoice.id,
              tenantId: tenant.id,
              propertyId: property.id,
              localId: payment.id,
              lastSyncTime: serverTimestamp()
            }, `Payment ${payment.id}`);
          }
        }
      }
    }

    // Execute all batches
    batches.push(currentBatch);
    console.log(`Executing ${batches.length} batch(es) with MERGE operations`);
    
    for (let i = 0; i < batches.length; i++) {
      await batches[i].commit();
      console.log(`MERGE Batch ${i + 1}/${batches.length} committed successfully`);
    }

    console.log('MERGE sync completed - Firestore updated with local changes');
  } catch (error) {
    console.error('Error in MERGE sync:', error);
    throw error;
  }
}

// ==================== OPTION 2: CRITICAL DELETE ONLY WHEN NEEDED ====================
// Use critical delete only for specific scenarios (user reset, corruption, etc.)

async performCriticalDeleteSync(userId: number): Promise<SyncStatus> {
  // This should only be called when you specifically want to wipe Firestore
  // and replace with local data (e.g., user requests data reset)
  
  console.warn('CRITICAL DELETE SYNC - This will delete all Firestore data!');
  
  if (this.syncInProgress) {
    throw new Error('Sync already in progress');
  }

  this.syncInProgress = true;
  const errors: string[] = [];
  
  try {
    const user = await database.getUserById(userId);
    if (!user || !this.canUserSync(user)) {
      throw new Error('User cannot sync - no storage permission');
    }

    console.log('Starting CRITICAL DELETE sync for user:', user.email);
    
    // Only do critical delete - no download phase
    await this.syncUserDataToFirestore(userId); // Your original critical delete method
    
    console.log('CRITICAL DELETE sync completed - Firestore replaced with local data');
    
    this.lastSyncTime = new Date().toISOString();
    localStorage.setItem('lastSyncTime', this.lastSyncTime);
    
    return {
      lastSyncTime: this.lastSyncTime,
      syncInProgress: false,
      pendingUploads: 0,
      pendingDownloads: 0,
      errors
    };
    
  } catch (error) {
    console.error('Critical delete sync error:', error);
    errors.push(error instanceof Error ? error.message : 'Unknown sync error');
    
    return {
      lastSyncTime: this.lastSyncTime || 'Never',
      syncInProgress: false,
      pendingUploads: 0,
      pendingDownloads: 0,
      errors
    };
  } finally {
    this.syncInProgress = false;
  }
}

// ==================== OPTION 3: SMART SYNC STRATEGY ====================
// Automatically choose strategy based on data state

async performSmartSync(userId: number): Promise<SyncStatus> {
  try {
    const user = await database.getUserById(userId);
    if (!user || !this.canUserSync(user)) {
      throw new Error('User cannot sync - no storage permission');
    }

    // Check if this is first sync or if Firestore is empty
    const userRef = doc(db, 'users', userId.toString());
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.log('First sync detected - uploading local data to Firestore');
      return await this.performCriticalDeleteSync(userId);
    } else {
      console.log('Regular sync detected - merging data');
      return await this.performFullSync(userId); // Uses merge strategy
    }
    
  } catch (error) {
    console.error('Smart sync error:', error);
    return {
      lastSyncTime: this.lastSyncTime || 'Never',
      syncInProgress: false,
      pendingUploads: 0,
      pendingDownloads: 0,
      errors: [error instanceof Error ? error.message : 'Unknown sync error']
    };
  }
}









//////////NEWEST
// REFACTORED SYNC FUNCTIONS - FLATTENED STRUCTURE

// ==================== CRITICAL DELETE SYNC TO FIRESTORE ====================
private async syncUserDataToFirestore(userId: number): Promise<void> {
  const user = await database.getUserById(userId);
  if (!user || !this.canUserSync(user)) {
    console.log('User cannot sync - no storage permission');
    return;
  }

  try {
    console.log('Starting CRITICAL DELETE sync for user:', user.email);
    
    const batches = [];
    let currentBatch = writeBatch(db);
    let operationCount = 0;
    const maxBatchSize = 450; // Safe limit

    const addToBatch = (ref: any, data: any, description: string) => {
      if (operationCount >= maxBatchSize) {
        console.log(`Batch full (${operationCount} operations), creating new batch`);
        batches.push(currentBatch);
        currentBatch = writeBatch(db);
        operationCount = 0;
      }
      currentBatch.set(ref, data, { merge: true });
      operationCount++;
      console.log(`Added to batch: ${description} (${operationCount}/${maxBatchSize})`);
    };

    const deleteBatch = (ref: any, description: string) => {
      if (operationCount >= maxBatchSize) {
        console.log(`Batch full (${operationCount} operations), creating new batch`);
        batches.push(currentBatch);
        currentBatch = writeBatch(db);
        operationCount = 0;
      }
      currentBatch.delete(ref);
      operationCount++;
      console.log(`Added DELETE to batch: ${description} (${operationCount}/${maxBatchSize})`);
    };

    // 1. Sync user data with company embedded
    const company = await database.getCompanyByUserId(userId);
    const userRef = doc(db, 'users', userId.toString());
    addToBatch(userRef, {
      ...user,
      lastSyncTime: serverTimestamp(),
      localId: user.id,
      company: company ? {
        ...company,
        localId: company.id,
        lastSyncTime: serverTimestamp()
      } : null
    }, `User ${user.id}`);

    // 2. CRITICAL DELETE: Properties with complete replacement
    await this.syncPropertiesWithCriticalDelete(userId, addToBatch, deleteBatch);

    // 3. CRITICAL DELETE: Tenants with complete replacement
    await this.syncTenantsWithCriticalDelete(userId, addToBatch, deleteBatch);

    // 4. CRITICAL DELETE: Invoices with complete replacement
    await this.syncInvoicesWithCriticalDelete(userId, addToBatch, deleteBatch);

    // Execute all batches
    batches.push(currentBatch);
    console.log(`Executing ${batches.length} batch(es) with CRITICAL DELETE operations`);
    
    for (let i = 0; i < batches.length; i++) {
      await batches[i].commit();
      console.log(`CRITICAL DELETE Batch ${i + 1}/${batches.length} committed successfully`);
    }

    console.log('CRITICAL DELETE sync completed - Firestore now matches local data exactly');
  } catch (error) {
    console.error('Error in CRITICAL DELETE sync:', error);
    throw error;
  }
}

// ==================== CRITICAL DELETE: PROPERTIES ====================
private async syncPropertiesWithCriticalDelete(
  userId: number, 
  addToBatch: Function, 
  deleteBatch: Function
): Promise<void> {
  console.log('Starting CRITICAL DELETE for properties...');
  
  // Get local properties (authoritative source)
  const localProperties = await this.getFilteredPropertiesForSync(userId);
  const localPropertyIds = new Set(localProperties.map(p => p.id.toString()));
  
  // Get existing Firestore properties
  const firestorePropertiesQuery = query(
    collection(db, 'users', userId.toString(), 'properties')
  );
  const firestoreSnapshot = await getDocs(firestorePropertiesQuery);
  const firestorePropertyIds = new Set<string>();
  
  // Track existing Firestore properties
  firestoreSnapshot.docs.forEach(doc => {
    const data = doc.data();
    if (data.localId) {
      firestorePropertyIds.add(data.localId.toString());
    }
  });

  console.log(`Local properties: ${localPropertyIds.size}, Firestore properties: ${firestorePropertyIds.size}`);

  // STEP 1: DELETE properties that exist in Firestore but not locally
  for (const firestoreDoc of firestoreSnapshot.docs) {
    const data = firestoreDoc.data();
    if (!data.localId || !localPropertyIds.has(data.localId.toString())) {
      console.log(`DELETING property from Firestore: ${firestoreDoc.id} (localId: ${data.localId})`);
      
      // Delete all units in this property first
      await this.deleteAllUnitsInProperty(userId, firestoreDoc.id, deleteBatch);
      
      // Delete the property
      const propertyRef = doc(db, 'users', userId.toString(), 'properties', firestoreDoc.id);
      deleteBatch(propertyRef, `DELETE Property ${firestoreDoc.id}`);
    }
  }

  // STEP 2: ADD/REPLACE all local properties (complete overwrite)
  for (const property of localProperties) {
    console.log(`REPLACING property in Firestore: ${property.id}`);
    
    const propertyRef = doc(db, 'users', userId.toString(), 'properties', property.id.toString());
    addToBatch(propertyRef, {
      ...property,
      userId,
      localId: property.id,
      lastSyncTime: serverTimestamp()
    }, `REPLACE Property ${property.id}`);

    // Sync units for this property with critical delete
    await this.syncUnitsWithCriticalDelete(userId, property.id, addToBatch, deleteBatch);
  }

  console.log('CRITICAL DELETE for properties completed');
}

// ==================== CRITICAL DELETE: UNITS ====================
private async syncUnitsWithCriticalDelete(
  userId: number,
  propertyId: number,
  addToBatch: Function,
  deleteBatch: Function
): Promise<void> {
  // Get local units (authoritative source)
  const localUnits = await database.getUnitsByProperty(propertyId);
  const localUnitIds = new Set(localUnits.map(u => u.id.toString()));

  // Get existing Firestore units
  const firestoreUnitsQuery = query(
    collection(db, 'users', userId.toString(), 'properties', propertyId.toString(), 'units')
  );
  const firestoreUnitsSnapshot = await getDocs(firestoreUnitsQuery);

  // STEP 1: DELETE units that exist in Firestore but not locally
  for (const unitDoc of firestoreUnitsSnapshot.docs) {
    const data = unitDoc.data();
    if (!data.localId || !localUnitIds.has(data.localId.toString())) {
      console.log(`DELETING unit from Firestore: ${unitDoc.id} (localId: ${data.localId})`);
      deleteBatch(unitDoc.ref, `DELETE Unit ${unitDoc.id}`);
    }
  }

  // STEP 2: ADD/REPLACE all local units
  for (const unit of localUnits) {
    const unitRef = doc(db, 'users', userId.toString(), 'properties', propertyId.toString(), 'units', unit.id.toString());
    addToBatch(unitRef, {
      ...unit,
      userId,
      propertyId,
      localId: unit.id,
      lastSyncTime: serverTimestamp()
    }, `REPLACE Unit ${unit.id}`);
  }
}

// ==================== CRITICAL DELETE: TENANTS ====================
private async syncTenantsWithCriticalDelete(
  userId: number,
  addToBatch: Function,
  deleteBatch: Function
): Promise<void> {
  console.log('Starting CRITICAL DELETE for tenants...');
  
  // Get all local tenants across all properties (authoritative source)
  const properties = await this.getFilteredPropertiesForSync(userId);
  const allLocalTenants: Tenant[] = [];
  
  for (const property of properties) {
    const tenants = await this.getFilteredTenantsForSync(property.id, await database.getUserById(userId)!);
    allLocalTenants.push(...tenants);
  }
  
  const localTenantIds = new Set(allLocalTenants.map(t => t.id.toString()));
  
  // Get existing Firestore tenants
  const firestoreTenantsQuery = query(
    collection(db, 'users', userId.toString(), 'tenants')
  );
  const firestoreTenantsSnapshot = await getDocs(firestoreTenantsQuery);

  console.log(`Local tenants: ${localTenantIds.size}, Firestore tenants: ${firestoreTenantsSnapshot.docs.length}`);

  // STEP 1: DELETE tenants that exist in Firestore but not locally
  for (const tenantDoc of firestoreTenantsSnapshot.docs) {
    const data = tenantDoc.data();
    if (!data.localId || !localTenantIds.has(data.localId.toString())) {
      console.log(`DELETING tenant from Firestore: ${tenantDoc.id} (localId: ${data.localId})`);
      
      // This will cascade delete all invoices and payments for this tenant
      await this.deleteTenantsSubcollections(userId, data.localId?.toString() || tenantDoc.id);
      
      // Delete the tenant document
      deleteBatch(tenantDoc.ref, `DELETE Tenant ${tenantDoc.id}`);
    }
  }

  // STEP 2: ADD/REPLACE all local tenants (complete overwrite)
  for (const tenant of allLocalTenants) {
    console.log(`REPLACING tenant in Firestore: ${tenant.id}`);
    
    const tenantRef = doc(db, 'users', userId.toString(), 'tenants', tenant.id.toString());
    addToBatch(tenantRef, {
      ...tenant,
      userId,
      propertyId: tenant.propertyId,
      localId: tenant.id,
      lastSyncTime: serverTimestamp()
    }, `REPLACE Tenant ${tenant.id}`);
  }

  console.log('CRITICAL DELETE for tenants completed');
}

// ==================== CRITICAL DELETE: INVOICES ====================
private async syncInvoicesWithCriticalDelete(
  userId: number,
  addToBatch: Function,
  deleteBatch: Function
): Promise<void> {
  console.log('Starting CRITICAL DELETE for invoices...');
  
  // Get all local invoices across all tenants (authoritative source)
  const properties = await this.getFilteredPropertiesForSync(userId);
  const user = await database.getUserById(userId)!;
  const allLocalInvoices: any[] = [];
  
  for (const property of properties) {
    const tenants = await this.getFilteredTenantsForSync(property.id, user);
    
    for (const tenant of tenants) {
      const invoices = await database.getInvoices({ tenantId: tenant.id });
      allLocalInvoices.push(...invoices.map(invoice => ({
        ...invoice,
        propertyId: property.id,
        tenantId: tenant.id
      })));
    }
  }
  
  const localInvoiceIds = new Set(allLocalInvoices.map(i => i.id.toString()));
  
  // Get existing Firestore invoices
  const firestoreInvoicesQuery = query(
    collection(db, 'users', userId.toString(), 'invoices')
  );
  const firestoreInvoicesSnapshot = await getDocs(firestoreInvoicesQuery);

  console.log(`Local invoices: ${localInvoiceIds.size}, Firestore invoices: ${firestoreInvoicesSnapshot.docs.length}`);

  // STEP 1: DELETE invoices that exist in Firestore but not locally
  for (const invoiceDoc of firestoreInvoicesSnapshot.docs) {
    const data = invoiceDoc.data();
    if (!data.localId || !localInvoiceIds.has(data.localId.toString())) {
      console.log(`DELETING invoice from Firestore: ${invoiceDoc.id} (localId: ${data.localId})`);
      
      // Delete old PDF if exists
      if (data.pdfUrl) {
        await this.deleteOldPDFFromStorage(data.pdfUrl);
      }
      
      // Delete all payments for this invoice
      await this.deleteAllPaymentsForInvoice(userId, invoiceDoc.id, deleteBatch);
      
      // Delete the invoice document
      deleteBatch(invoiceDoc.ref, `DELETE Invoice ${invoiceDoc.id}`);
    }
  }

  // STEP 2: ADD/REPLACE all local invoices (complete overwrite)
  for (const invoice of allLocalInvoices) {
    console.log(`REPLACING invoice in Firestore: ${invoice.id}`);
    
    const invoiceRef = doc(db, 'users', userId.toString(), 'invoices', invoice.id.toString());
    
    // Handle PDF generation
    let pdfUrl = null;
    const statusSuffix = invoice.totalAmount <= invoice.amountPaid ? 'paid' : 'pending';
    
    try {
      // Get existing invoice to compare status
      const existingInvoiceDoc = await getDoc(invoiceRef);
      const existingInvoice = existingInvoiceDoc.exists() ? existingInvoiceDoc.data() : null;
      
      const shouldGeneratePDF = !existingInvoice || (existingInvoice.pdfStatus !== statusSuffix);
      
      if (shouldGeneratePDF) {
        console.log(`Generating PDF for invoice ${invoice.id} - Status: ${statusSuffix}`);
        
        // Delete old PDF if status changed
        if (existingInvoice && existingInvoice.pdfUrl && existingInvoice.pdfStatus !== statusSuffix) {
          await this.deleteOldPDFFromStorage(existingInvoice.pdfUrl);
        }
        
        // Generate new PDF with timeout
        const pdfPromise = this.generateAndUploadInvoicePDF(userId, invoice, statusSuffix);
        const timeoutPromise = new Promise<string | null>((_, reject) => 
          setTimeout(() => reject(new Error('PDF generation timeout')), 30000)
        );
        
        pdfUrl = await Promise.race([pdfPromise, timeoutPromise]);
      } else {
        pdfUrl = existingInvoice?.pdfUrl || null;
      }
    } catch (pdfError) {
      console.error(`PDF generation failed for invoice ${invoice.id}:`, pdfError);
      pdfUrl = null;
    }
    
    addToBatch(invoiceRef, {
      ...invoice,
      userId,
      tenantId: invoice.tenantId,
      propertyId: invoice.propertyId,
      localId: invoice.id,
      pdfUrl: pdfUrl,
      pdfStatus: statusSuffix,
      lastSyncTime: serverTimestamp()
    }, `REPLACE Invoice ${invoice.id}`);

    // Sync payments for this invoice with critical delete
    await this.syncPaymentsWithCriticalDelete(userId, invoice, addToBatch, deleteBatch);
  }

  console.log('CRITICAL DELETE for invoices completed');
}

// ==================== CRITICAL DELETE: PAYMENTS ====================
private async syncPaymentsWithCriticalDelete(
  userId: number,
  invoice: any,
  addToBatch: Function,
  deleteBatch: Function
): Promise<void> {
  // Get local payments (authoritative source)
  const localPayments = await database.getPaymentsByInvoice(invoice.id);
  const localPaymentIds = new Set(localPayments.map(p => p.id.toString()));

  // Get existing Firestore payments
  const firestorePaymentsQuery = query(
    collection(db, 'users', userId.toString(), 'invoices', invoice.id.toString(), 'payments')
  );
  const firestorePaymentsSnapshot = await getDocs(firestorePaymentsQuery);

  // STEP 1: DELETE payments that exist in Firestore but not locally
  for (const paymentDoc of firestorePaymentsSnapshot.docs) {
    const data = paymentDoc.data();
    if (!data.localId || !localPaymentIds.has(data.localId.toString())) {
      console.log(`DELETING payment from Firestore: ${paymentDoc.id} (localId: ${data.localId})`);
      deleteBatch(paymentDoc.ref, `DELETE Payment ${paymentDoc.id}`);
    }
  }

  // STEP 2: ADD/REPLACE all local payments
  for (const payment of localPayments) {
    const paymentRef = doc(db, 'users', userId.toString(), 'invoices', invoice.id.toString(), 'payments', payment.id.toString());
    addToBatch(paymentRef, {
      ...payment,
      userId,
      invoiceId: invoice.id,
      tenantId: invoice.tenantId,
      propertyId: invoice.propertyId,
      localId: payment.id,
      lastSyncTime: serverTimestamp()
    }, `REPLACE Payment ${payment.id}`);
  }
}

// ==================== HELPER DELETE METHODS ====================

private async deleteAllUnitsInProperty(
  userId: number,
  firestorePropertyId: string,
  deleteBatch: Function
): Promise<void> {
  try {
    const unitsQuery = query(
      collection(db, 'users', userId.toString(), 'properties', firestorePropertyId, 'units')
    );
    const unitsSnapshot = await getDocs(unitsQuery);
    
    unitsSnapshot.docs.forEach(unitDoc => {
      deleteBatch(unitDoc.ref, `DELETE Unit ${unitDoc.id} from property ${firestorePropertyId}`);
    });
    
    console.log(`Deleted ${unitsSnapshot.docs.length} units from property ${firestorePropertyId}`);
  } catch (error) {
    console.error(`Error deleting units for property ${firestorePropertyId}:`, error);
  }
}

private async deleteAllPaymentsForInvoice(
  userId: number,
  firestoreInvoiceId: string,
  deleteBatch: Function
): Promise<void> {
  try {
    const paymentsQuery = query(
      collection(db, 'users', userId.toString(), 'invoices', firestoreInvoiceId, 'payments')
    );
    const paymentsSnapshot = await getDocs(paymentsQuery);
    
    paymentsSnapshot.docs.forEach(paymentDoc => {
      deleteBatch(paymentDoc.ref, `DELETE Payment ${paymentDoc.id} from invoice ${firestoreInvoiceId}`);
    });
    
    console.log(`Deleted ${paymentsSnapshot.docs.length} payments from invoice ${firestoreInvoiceId}`);
  } catch (error) {
    console.error(`Error deleting payments for invoice ${firestoreInvoiceId}:`, error);
  }
}

// ==================== MAIN SYNC TO FIRESTORE ====================
// private async syncUserDataToFirestore(userId: number): Promise<void> {
//   const user = await database.getUserById(userId);
//   if (!user || !this.canUserSync(user)) {
//     console.log('User cannot sync - no storage permission');
//     return;
//   }

//   try {
//     console.log('Starting complete data upload for user:', user.email);
    
//     const batches = [];
//     let currentBatch = writeBatch(db);
//     let operationCount = 0;
//     const maxBatchSize = 450; // Safe limit

//     const addToBatch = (ref: any, data: any, description: string) => {
//       if (operationCount >= maxBatchSize) {
//         console.log(`Batch full (${operationCount} operations), creating new batch`);
//         batches.push(currentBatch);
//         currentBatch = writeBatch(db);
//         operationCount = 0;
//       }
//       currentBatch.set(ref, data, { merge: true });
//       operationCount++;
//       console.log(`Added to batch: ${description} (${operationCount}/${maxBatchSize})`);
//     };

//     // 1. Sync user data with company embedded
//     const company = await database.getCompanyByUserId(userId);
//     const userRef = doc(db, 'users', userId.toString());
//     addToBatch(userRef, {
//       ...user,
//       lastSyncTime: serverTimestamp(),
//       localId: user.id,
//       company: company ? {
//         ...company,
//         localId: company.id,
//         lastSyncTime: serverTimestamp()
//       } : null
//     }, `User ${user.id}`);

//     // 2. Sync properties (flat collection)
//     const properties = await this.getFilteredPropertiesForSync(userId);
//     console.log(`Syncing ${properties.length} properties`);
    
//     for (const property of properties) {
//       const propertyRef = doc(db, 'users', userId.toString(), 'properties', property.id.toString());
//       addToBatch(propertyRef, {
//         ...property,
//         userId,
//         localId: property.id,
//         lastSyncTime: serverTimestamp()
//       }, `Property ${property.id}`);

//       // Sync units for this property
//       const units = await database.getUnitsByProperty(property.id);
//       for (const unit of units) {
//         const unitRef = doc(db, 'users', userId.toString(), 'properties', property.id.toString(), 'units', unit.id.toString());
//         addToBatch(unitRef, {
//           ...unit,
//           userId,
//           propertyId: property.id,
//           localId: unit.id,
//           lastSyncTime: serverTimestamp()
//         }, `Unit ${unit.id} in Property ${property.id}`);
//       }
//     }

//     // 3. Sync tenants (flat collection with propertyId reference)
//     console.log('Syncing tenants...');
//     for (const property of properties) {
//       const tenants = await this.getFilteredTenantsForSync(property.id, user);
//       console.log(`Syncing ${tenants.length} tenants for property ${property.id}`);
      
//       for (const tenant of tenants) {
//         const tenantRef = doc(db, 'users', userId.toString(), 'tenants', tenant.id.toString());
//         addToBatch(tenantRef, {
//           ...tenant,
//           userId,
//           propertyId: property.id, // Foreign key reference
//           localId: tenant.id,
//           lastSyncTime: serverTimestamp()
//         }, `Tenant ${tenant.id}`);
//       }
//     }

//     // 4. Sync invoices (flat collection with tenantId and propertyId references)
//     console.log('Syncing invoices...');
//     for (const property of properties) {
//       const tenants = await this.getFilteredTenantsForSync(property.id, user);
      
//       for (const tenant of tenants) {
//         const invoices = await database.getInvoices({ tenantId: tenant.id });
//         console.log(`Syncing ${invoices.length} invoices for tenant ${tenant.id}`);
        
//         for (const invoice of invoices) {
//           const invoiceRef = doc(db, 'users', userId.toString(), 'invoices', invoice.id.toString());
          
//           // Handle PDF generation with error isolation
//           let pdfUrl = null;
//           const statusSuffix = invoice.totalAmount <= invoice.amountPaid ? 'paid' : 'pending';
          
//           try {
//             // Get existing invoice to compare status
//             const existingInvoiceDoc = await getDoc(invoiceRef);
//             const existingInvoice = existingInvoiceDoc.exists() ? existingInvoiceDoc.data() : null;
            
//             const shouldGeneratePDF = !existingInvoice || (existingInvoice.pdfStatus !== statusSuffix);
            
//             if (shouldGeneratePDF) {
//               console.log(`Generating PDF for invoice ${invoice.id} - Status: ${statusSuffix}`);
              
//               // Delete old PDF if status changed
//               if (existingInvoice && existingInvoice.pdfUrl && existingInvoice.pdfStatus !== statusSuffix) {
//                 await this.deleteOldPDFFromStorage(existingInvoice.pdfUrl);
//               }
              
//               // Generate new PDF with timeout
//               const pdfPromise = this.generateAndUploadInvoicePDF(userId, invoice, statusSuffix);
//               const timeoutPromise = new Promise<string | null>((_, reject) => 
//                 setTimeout(() => reject(new Error('PDF generation timeout')), 30000)
//               );
              
//               pdfUrl = await Promise.race([pdfPromise, timeoutPromise]);
//             } else {
//               pdfUrl = existingInvoice?.pdfUrl || null;
//             }
//           } catch (pdfError) {
//             console.error(`PDF generation failed for invoice ${invoice.id}:`, pdfError);
//             pdfUrl = null;
//           }
          
//           // Add invoice to batch
//           addToBatch(invoiceRef, {
//             ...invoice,
//             userId,
//             tenantId: tenant.id, // Foreign key reference
//             propertyId: property.id, // Foreign key reference  
//             localId: invoice.id,
//             pdfUrl: pdfUrl,
//             pdfStatus: statusSuffix,
//             lastSyncTime: serverTimestamp()
//           }, `Invoice ${invoice.id}`);

//           // 5. Sync payments (nested under invoices - this makes sense)
//           const payments = await database.getPaymentsByInvoice(invoice.id);
//           for (const payment of payments) {
//             const paymentRef = doc(db, 'users', userId.toString(), 'invoices', invoice.id.toString(), 'payments', payment.id.toString());
//             addToBatch(paymentRef, {
//               ...payment,
//               userId,
//               invoiceId: invoice.id, // Parent reference
//               tenantId: tenant.id, // Denormalized for easier queries
//               propertyId: property.id, // Denormalized for easier queries
//               localId: payment.id,
//               lastSyncTime: serverTimestamp()
//             }, `Payment ${payment.id}`);
//           }
//         }
//       }
//     }

//     // Execute all batches
//     batches.push(currentBatch);
//     console.log(`Executing ${batches.length} batch(es)`);
    
//     for (let i = 0; i < batches.length; i++) {
//       await batches[i].commit();
//       console.log(`Batch ${i + 1}/${batches.length} committed successfully`);
//     }

//     console.log('Complete user data synced to Firestore');
//   } catch (error) {
//     console.error('Error syncing user data to Firestore:', error);
//     throw error;
//   }
// }

// ==================== DOWNLOAD AND MERGE ====================
private async downloadAndMergeData(userId: number): Promise<void> {
  const user = await database.getUserById(userId);
  if (!user || !this.canUserSync(user)) {
    console.log('User cannot sync - no storage permission');
    return;
  }

  try {
    console.log('Starting complete data download for user:', user.email);
    
    // 1. Download and merge company data from user doc
    const userRef = doc(db, 'users', userId.toString());
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      if (userData.company) {
        const localCompany = await database.getCompanyByUserId(userId);
        
        if (!localCompany && user.type === 'paid') {
          await database.createCompany(userId, {
            name: userData.company.name,
            address: userData.company.address,
            phone: userData.company.phone,
            email: userData.company.email
          });
        } else if (localCompany) {
          await database.updateCompany(localCompany.id, {
            name: userData.company.name,
            address: userData.company.address,
            phone: userData.company.phone,
            email: userData.company.email
          });
        }
      }
    }

    // 2. Download and merge properties
    await this.syncPropertiesFromFirestore(userId);

    // 3. Download and merge tenants  
    await this.syncTenantsFromFirestore(userId);

    // 4. Download and merge invoices with payments
    await this.syncInvoicesFromFirestore(userId);

    console.log('Complete data download and merge completed');
  } catch (error) {
    console.error('Error in downloadAndMergeData:', error);
    throw error;
  }
}

// ==================== INDIVIDUAL COLLECTION SYNC METHODS ====================

private async syncPropertiesFromFirestore(userId: number): Promise<void> {
  try {
    console.log('Syncing properties from Firestore...');
    
    const propertiesQuery = query(
      collection(db, 'users', userId.toString(), 'properties'),
      orderBy('lastSyncTime', 'desc')
    );
    
    const propertiesSnapshot = await getDocs(propertiesQuery);
    console.log(`Found ${propertiesSnapshot.docs.length} properties in Firestore`);
    
    for (const doc of propertiesSnapshot.docs) {
      const propertyData = doc.data();
      const localProperty = await database.getPropertyById(propertyData.localId);
      
      if (!localProperty) {
        const canCreate = await database.canCreateProperty?.(userId);
        if (canCreate?.allowed !== false) {
          try {
            await database.createProperty({
              userId: propertyData.userId,
              companyId: propertyData.companyId,
              name: propertyData.name,
              address: propertyData.address,
              description: propertyData.description,
              image: propertyData.image,
              agentCommissionRate: propertyData.agentCommissionRate,
              maxUnits: propertyData.maxUnits
            });
            console.log(`Created property ${propertyData.localId} from Firestore`);
          } catch (error) {
            console.error('Failed to create property during sync:', error);
          }
        }
      } else if (!localProperty.isRestricted) {
        await database.updateProperty(propertyData.localId, {
          name: propertyData.name,
          address: propertyData.address,
          description: propertyData.description,
          image: propertyData.image,
          agentCommissionRate: propertyData.agentCommissionRate,
          maxUnits: propertyData.maxUnits
        });
        console.log(`Updated property ${propertyData.localId} from Firestore`);
      }

      // Sync units for this property
      await this.syncUnitsForProperty(userId, doc.id, propertyData.localId);
    }
  } catch (error) {
    console.error('Error syncing properties from Firestore:', error);
  }
}

private async syncUnitsForProperty(userId: number, firestorePropertyId: string, localPropertyId: number): Promise<void> {
  try {
    const unitsQuery = query(
      collection(db, 'users', userId.toString(), 'properties', firestorePropertyId, 'units'),
      orderBy('lastSyncTime', 'desc')
    );
    
    const unitsSnapshot = await getDocs(unitsQuery);
    
    for (const unitDoc of unitsSnapshot.docs) {
      const unitData = unitDoc.data();
      const localUnit = await database.getUnitById(unitData.localId);
      
      if (!localUnit) {
        try {
          await database.createUnit({
            propertyId: localPropertyId,
            unitNumber: unitData.unitNumber,
            rentAmount: unitData.rentAmount
          });
        } catch (error) {
          console.error('Failed to create unit during sync:', error);
        }
      } else {
        await database.updateUnit(unitData.localId, {
          unitNumber: unitData.unitNumber,
          rentAmount: unitData.rentAmount
        });
      }
    }
  } catch (error) {
    console.error(`Error syncing units for property ${localPropertyId}:`, error);
  }
}

private async syncTenantsFromFirestore(userId: number): Promise<void> {
  try {
    console.log('Syncing tenants from Firestore...');
    
    const tenantsQuery = query(
      collection(db, 'users', userId.toString(), 'tenants'),
      orderBy('lastSyncTime', 'desc')
    );
    
    const tenantsSnapshot = await getDocs(tenantsQuery);
    console.log(`Found ${tenantsSnapshot.docs.length} tenants in Firestore`);
    
    // Get local tenants to check for deletions
    const allLocalProperties = await database.getProperties(userId);
    const allLocalTenants = [];
    
    for (const property of allLocalProperties) {
      const tenants = await database.getTenantsByProperty(property.id);
      allLocalTenants.push(...tenants);
    }
    
    const localTenantIds = new Set(allLocalTenants.map(t => t.id));
    const firestoreTenantIds = new Set();
    
    for (const tenantDoc of tenantsSnapshot.docs) {
      const tenantData = tenantDoc.data();
      firestoreTenantIds.add(tenantData.localId);
      
      const localTenant = await database.getTenantById(tenantData.localId);
      const property = await database.getPropertyById(tenantData.propertyId);
      
      // Only sync if property exists and is not restricted
      if (property && !property.isRestricted) {
        if (!localTenant) {
          try {
            await database.createTenant({
              propertyId: tenantData.propertyId,
              name: tenantData.name,
              phone: tenantData.phone,
              email: tenantData.email,
              unitNumber: tenantData.unitNumber,
              rentAmount: tenantData.rentAmount,
              standingFees: tenantData.standingFees,
              depositAmount: tenantData.depositAmount,
              leaseStart: tenantData.leaseStart,
              leaseEnd: tenantData.leaseEnd
            });
            console.log(`Created tenant ${tenantData.localId} from Firestore`);
          } catch (error) {
            console.error('Failed to create tenant during sync:', error);
          }
        } else if (!localTenant.isRestricted) {
          await database.updateTenant(tenantData.localId, {
            name: tenantData.name,
            phone: tenantData.phone,
            email: tenantData.email,
            unitNumber: tenantData.unitNumber,
            rentAmount: tenantData.rentAmount,
            standingFees: tenantData.standingFees,
            depositAmount: tenantData.depositAmount,
            leaseStart: tenantData.leaseStart,
            leaseEnd: tenantData.leaseEnd
          });
          console.log(`Updated tenant ${tenantData.localId} from Firestore`);
        }
      }
    }

    // Handle tenant deletions - if local tenant exists but not in Firestore, delete from Firestore
    for (const localTenantId of localTenantIds) {
      if (!firestoreTenantIds.has(localTenantId)) {
        console.log(`Local tenant ${localTenantId} not found in Firestore - will be created in next upload`);
      }
    }

  } catch (error) {
    console.error('Error syncing tenants from Firestore:', error);
  }
}

private async syncInvoicesFromFirestore(userId: number): Promise<void> {
  try {
    console.log('Syncing invoices from Firestore...');
    
    const invoicesQuery = query(
      collection(db, 'users', userId.toString(), 'invoices'),
      orderBy('lastSyncTime', 'desc')
    );
    
    const invoicesSnapshot = await getDocs(invoicesQuery);
    console.log(`Found ${invoicesSnapshot.docs.length} invoices in Firestore`);
    
    for (const invoiceDoc of invoicesSnapshot.docs) {
      const invoiceData = invoiceDoc.data();
      const localInvoice = await database.getInvoiceById(invoiceData.localId);
      const localTenant = await database.getTenantById(invoiceData.tenantId);
      
      // Only sync if tenant exists and is not restricted
      if (localTenant && !localTenant.isRestricted) {
        if (!localInvoice) {
          try {
            await database.createInvoice({
              id: invoiceData.localId,
              tenantId: invoiceData.tenantId,
              propertyId: invoiceData.propertyId,
              billingMonth: invoiceData.billingMonth,
              rentAmount: invoiceData.rentAmount,
              waterCurrentReading: invoiceData.waterCurrentReading,
              waterPreviousReading: invoiceData.waterPreviousReading,
              waterStandingFee: invoiceData.waterStandingFee,
              waterUnitPrice: invoiceData.waterUnitPrice,
              powerCurrentReading: invoiceData.powerCurrentReading,
              powerPreviousReading: invoiceData.powerPreviousReading,
              powerUnitPrice: invoiceData.powerUnitPrice,
              otherCharges: invoiceData.otherCharges,
              otherChargesDescription: invoiceData.otherChargesDescription,
              dueDate: invoiceData.dueDate
            });
            
            console.log(`Created invoice ${invoiceData.localId} - PDF available: ${invoiceData.pdfUrl || 'No PDF'}`);
          } catch (error) {
            console.error('Failed to create invoice during sync:', error);
          }
        } else {
          await database.updateInvoice(invoiceData.localId, {
            billingMonth: invoiceData.billingMonth,
            rentAmount: invoiceData.rentAmount,
            waterCurrentReading: invoiceData.waterCurrentReading,
            waterPreviousReading: invoiceData.waterPreviousReading,
            waterStandingFee: invoiceData.waterStandingFee,
            waterUnitPrice: invoiceData.waterUnitPrice,
            powerCurrentReading: invoiceData.powerCurrentReading,
            powerPreviousReading: invoiceData.powerPreviousReading,
            powerUnitPrice: invoiceData.powerUnitPrice,
            otherCharges: invoiceData.otherCharges,
            otherChargesDescription: invoiceData.otherChargesDescription,
            dueDate: invoiceData.dueDate
          });
          
          console.log(`Updated invoice ${invoiceData.localId} - PDF available: ${invoiceData.pdfUrl || 'No PDF'}`);
        }

        // Sync payments for this invoice
        await this.syncPaymentsForInvoice(userId, invoiceDoc.id, invoiceData.localId);
      }
    }
  } catch (error) {
    console.error('Error syncing invoices from Firestore:', error);
  }
}

private async syncPaymentsForInvoice(userId: number, firestoreInvoiceId: string, localInvoiceId: number): Promise<void> {
  try {
    const paymentsQuery = query(
      collection(db, 'users', userId.toString(), 'invoices', firestoreInvoiceId, 'payments'),
      orderBy('lastSyncTime', 'desc')
    );
    
    const paymentsSnapshot = await getDocs(paymentsQuery);
    
    for (const paymentDoc of paymentsSnapshot.docs) {
      const paymentData = paymentDoc.data();
      const existingPayments = await database.getPaymentsByInvoice(localInvoiceId);
      const paymentExists = existingPayments.some(p => p.id === paymentData.localId);
      
      if (!paymentExists) {
        try {
          await database.createPayment({
            invoiceId: localInvoiceId,
            amount: paymentData.amount,
            paymentDate: paymentData.paymentDate,
            paymentMethod: paymentData.paymentMethod,
            notes: paymentData.notes
          });
        } catch (error) {
          console.error('Failed to create payment during sync:', error);
        }
      }
    }
  } catch (error) {
    console.error(`Error syncing payments for invoice ${localInvoiceId}:`, error);
  }
}

// ==================== CLEANUP METHODS ====================

// Simplified cleanup - delete documents by simple queries instead of deep traversal
private async deleteTenantsSubcollections(userId: number, tenantId: string): Promise<void> {
  try {
    console.log(`Cleaning up data for deleted tenant ${tenantId}`);
    
    // Delete all invoices for this tenant
    const invoicesQuery = query(
      collection(db, 'users', userId.toString(), 'invoices'),
      where('tenantId', '==', parseInt(tenantId))
    );
    
    const invoicesSnapshot = await getDocs(invoicesQuery);
    
    for (const invoiceDoc of invoicesSnapshot.docs) {
      // Delete all payments for this invoice
      const paymentsQuery = query(
        collection(db, 'users', userId.toString(), 'invoices', invoiceDoc.id, 'payments')
      );
      
      const paymentsSnapshot = await getDocs(paymentsQuery);
      const deletePaymentsBatch = writeBatch(db);
      
      paymentsSnapshot.docs.forEach(paymentDoc => {
        deletePaymentsBatch.delete(paymentDoc.ref);
      });
      
      if (paymentsSnapshot.docs.length > 0) {
        await deletePaymentsBatch.commit();
        console.log(`Deleted ${paymentsSnapshot.docs.length} payments for invoice ${invoiceDoc.id}`);
      }
      
      // Delete the invoice
      await deleteDoc(invoiceDoc.ref);
      console.log(`Deleted invoice ${invoiceDoc.id}`);
    }
    
    // Delete the tenant
    const tenantRef = doc(db, 'users', userId.toString(), 'tenants', tenantId);
    await deleteDoc(tenantRef);
    console.log(`Deleted tenant ${tenantId}`);
    
  } catch (error) {
    console.error('Error deleting tenant and related data:', error);
  }
}




























// Add this helper function to get stored payment instructions
private getStoredPaymentInstructions(): string {
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

// Add this method to generate and upload PDF
private async generateAndUploadInvoicePDF(
  userId: number, 
  invoice: any, 
  statusSuffix: string
): Promise<string | null> {
  try {
    console.log(`Generating PDF for invoice ${invoice.id} with status: ${statusSuffix}`);
    
    // Get user and company data
    const user = await database.getUserById(userId);
    if (!user) {
      console.error('User not found for PDF generation');
      return null;
    }
    
    const userCompany = await database.getCompanyByUserId(userId);
    const property = await database.getPropertyById(invoice.propertyId);
    
    if (!property) {
      console.error('Property not found for PDF generation');
      return null;
    }
    
    // Get payment history
    const payments = await database.getPaymentsByInvoice(invoice.id);
    
    // Get company info and payment instructions
    const companyInfo = this.getCompanyInfoForPDF(user, userCompany);
    const paymentInstructions = this.getStoredPaymentInstructions();
    
    // Generate PDF
    const pdfBytes = await generateInvoicePDF(
      invoice,
      property,
      payments,
      companyInfo,
      {
        template: 'standard',
        paymentInstructions: paymentInstructions,
        includeCompanyLogo: true
      },
      user
    );
    
    // Create storage path with status suffix
    const filename = `invoices/${userId}/${invoice.id}_${statusSuffix}.pdf`;
    const storageRef = ref(storage, filename);
    
    // Upload to Firebase Storage
    console.log(`Uploading PDF to storage: ${filename}`);
    const uploadResult = await uploadBytes(storageRef, pdfBytes);
    
    // Get download URL
    const downloadURL = await getDownloadURL(uploadResult.ref);
    console.log(`PDF uploaded successfully: ${downloadURL}`);
    
    return downloadURL;
    
  } catch (error) {
    console.error('Error generating and uploading PDF:', error);
    return null;
  }
}

// Add this method to delete old PDF from storage
private async deleteOldPDFFromStorage(pdfUrl: string): Promise<void> {
  try {
    if (!pdfUrl || !pdfUrl.includes('firebase')) return;
    
    // Extract storage path from download URL
    const urlParts = pdfUrl.split('/o/')[1];
    if (!urlParts) return;
    
    const storagePath = decodeURIComponent(urlParts.split('?')[0]);
    const storageRef = ref(storage, storagePath);
    
    console.log(`Deleting old PDF from storage: ${storagePath}`);
    await deleteObject(storageRef);
    console.log('Old PDF deleted successfully');
    
  } catch (error) {
    console.error('Error deleting old PDF from storage:', error);
    // Don't throw error - continue with sync even if delete fails
  }
}

// Update the syncTenantInvoicesAndPayments method to handle PDF data (but not generate PDFs on download)
// private async syncTenantInvoicesAndPayments(userId: number, propertyDocId: string, tenantPhoneId: string, localTenantId: number): Promise<void> {
//   try {
//     // Sync invoices
//     const invoicesQuery = query(
//       collection(db, 'users', userId.toString(), 'properties', propertyDocId, 'tenants', tenantPhoneId, 'invoices'),
//       orderBy('lastSyncTime', 'desc')
//     );
    
//     const invoicesSnapshot = await getDocs(invoicesQuery);
    
//     for (const invoiceDoc of invoicesSnapshot.docs) {
//       const invoiceData = invoiceDoc.data();
//       const localInvoice = await database.getInvoiceById(invoiceData.localId);
      
//       if (!localInvoice) {
//         try {
//           await database.createInvoice({
//             id: invoiceData.localId,
//             tenantId: localTenantId,
//             propertyId: invoiceData.propertyLocalId,
//             billingMonth: invoiceData.billingMonth,
//             rentAmount: invoiceData.rentAmount,
//             waterCurrentReading: invoiceData.waterCurrentReading,
//             waterPreviousReading: invoiceData.waterPreviousReading,
//             waterStandingFee: invoiceData.waterStandingFee,
//             waterUnitPrice: invoiceData.waterUnitPrice,
//             powerCurrentReading: invoiceData.powerCurrentReading,
//             powerPreviousReading: invoiceData.powerPreviousReading,
//             powerUnitPrice: invoiceData.powerUnitPrice,
//             otherCharges: invoiceData.otherCharges,
//             otherChargesDescription: invoiceData.otherChargesDescription,
//             dueDate: invoiceData.dueDate
//           });
          
//           console.log(`Created invoice ${invoiceData.localId} - PDF available at: ${invoiceData.pdfUrl || 'No PDF'}`);
//         } catch (error) {
//           console.error('Failed to create invoice during sync:', error);
//         }
//       } else {
//         await database.updateInvoice(invoiceData.localId, {
//           billingMonth: invoiceData.billingMonth,
//           rentAmount: invoiceData.rentAmount,
//           waterCurrentReading: invoiceData.waterCurrentReading,
//           waterPreviousReading: invoiceData.waterPreviousReading,
//           waterStandingFee: invoiceData.waterStandingFee,
//           waterUnitPrice: invoiceData.waterUnitPrice,
//           powerCurrentReading: invoiceData.powerCurrentReading,
//           powerPreviousReading: invoiceData.powerPreviousReading,
//           powerUnitPrice: invoiceData.powerUnitPrice,
//           otherCharges: invoiceData.otherCharges,
//           otherChargesDescription: invoiceData.otherChargesDescription,
//           dueDate: invoiceData.dueDate
//         });
        
//         console.log(`Updated invoice ${invoiceData.localId} - PDF available at: ${invoiceData.pdfUrl || 'No PDF'}`);
//       }

//       // Sync payments for this invoice
//       const paymentsQuery = query(
//         collection(db, 'users', userId.toString(), 'properties', propertyDocId, 'tenants', tenantPhoneId, 'invoices', invoiceDoc.id, 'payments'),
//         orderBy('lastSyncTime', 'desc')
//       );
      
//       const paymentsSnapshot = await getDocs(paymentsQuery);
      
//       for (const paymentDoc of paymentsSnapshot.docs) {
//         const paymentData = paymentDoc.data();
//         const existingPayments = await database.getPaymentsByInvoice(invoiceData.localId);
//         const paymentExists = existingPayments.some(p => p.id === paymentData.localId);
        
//         if (!paymentExists) {
//           try {
//             await database.createPayment({
//               invoiceId: invoiceData.localId,
//               amount: paymentData.amount,
//               paymentDate: paymentData.paymentDate,
//               paymentMethod: paymentData.paymentMethod,
//               notes: paymentData.notes
//             });
//           } catch (error) {
//             console.error('Failed to create payment during sync:', error);
//           }
//         }
//       }
//     }
//   } catch (error) {
//     console.error('Error syncing tenant invoices and payments:', error);
//   }
// }

// Add method to clean up orphaned PDFs (optional - for maintenance)
async cleanupOrphanedPDFs(_userId: number): Promise<void> {
  try {
    console.log('Starting cleanup of orphaned PDFs...');
    
    // This is a maintenance function that could be called periodically
    // to clean up any PDFs in storage that no longer have corresponding invoices
    
    // Note: This is a complex operation that would require listing all files
    // in the user's storage folder and comparing with existing invoices
    // For now, we'll just log that cleanup is available
    
    console.log('PDF cleanup completed (placeholder implementation)');
  } catch (error) {
    console.error('Error during PDF cleanup:', error);
  }
}















  // ==================== USER SYNC OPERATIONS ====================


  // Updated functions for subcollection structure and tenant deletion logic

async syncUserToFirestore(user: User): Promise<void> {
  if (!this.canUserSync(user)) {
    console.log('User cannot sync - no storage permission');
    return;
  }

  try {
    const userRef = doc(db, 'users', user.id.toString());
    
    // Get company data to include in user doc
    const company = await database.getCompanyByUserId(user.id);
    
    const userData = {
      ...user,
      lastSyncTime: serverTimestamp(),
      localId: user.id,
      company: company ? {
        ...company,
        localId: company.id,
        lastSyncTime: serverTimestamp()
      } : null
    };

    await setDoc(userRef, userData, { merge: true });
    console.log('User synced to Firestore:', user.email);
  } catch (error) {
    console.error('Error syncing user to Firestore:', error);
    throw error;
  }
}

async downloadUserFromFirestore(localUserId: number): Promise<User | null> {
  try {
    console.log('Downloading user data from Firestore for user ID:', localUserId);
    
    const userRef = doc(db, 'users', localUserId.toString());
    let userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      const localUser = await database.getUserById(localUserId);
      if (localUser?.email) {
        console.log('Trying to find user by email:', localUser.email);
        const usersQuery = query(
          collection(db, 'users'),
          where('email', '==', localUser.email.toLowerCase()),
          limit(1)
        );
        const querySnapshot = await getDocs(usersQuery);
        if (!querySnapshot.empty) {
          userDoc = querySnapshot.docs[0];
          console.log('Found user by email in Firestore');
        }
      }
    }

    if (userDoc.exists()) {
      const firestoreUser = userDoc.data();
      console.log('Successfully downloaded user from Firestore');
      
      return {
        id: localUserId,
        name: firestoreUser.name,
        email: firestoreUser.email,
        phone: firestoreUser.phone,
        passwordHash: firestoreUser.passwordHash,
        isPremium: firestoreUser.isPremium || false,
        type: firestoreUser.type || 'free',
        tier: firestoreUser.tier || 'free',
        storage: firestoreUser.storage || false,
        revenuekatUserId: firestoreUser.revenuekatUserId,
        selectedPropertyIds: firestoreUser.selectedPropertyIds || [],
        restrictedAccess: firestoreUser.restrictedAccess || false,
        createdAt: firestoreUser.createdAt,
        updatedAt: firestoreUser.updatedAt
      };
    }
    
    console.log('User not found in Firestore');
    return null;
  } catch (error) {
    console.error('Error downloading user from Firestore:', error);
    return null;
  }
}

// private async logSyncOperation(
//   userId: number, 
//   action: 'upload' | 'download' | 'full_sync', 
//   status: 'success' | 'error',
//   details: string,
//   errorMessage?: string
// ): Promise<void> {
//   try {
//     const userRef = doc(db, 'users', userId.toString());
//     const syncLog = {
//       id: `${Date.now()}_${action}`,
//       userId,
//       action,
//       status,
//       details,
//       errorMessage: errorMessage || null,
//       timestamp: serverTimestamp()
//     };

//     // Add sync log to user document syncLogs array
//     await setDoc(userRef, {
//       syncLogs: [syncLog], // This will be merged, creating an array or adding to existing
//       lastSyncLog: syncLog
//     }, { merge: true });
//   } catch (error) {
//     console.error('Error logging sync operation:', error);
//   }
// }

static async handleRevenueCatWebhook(data: {
  localUserId: number;
  firestoreUserId: string;
  tier: UserTier;
  type: UserType;
  storage: boolean;
  revenuekatUserId: string;
}): Promise<void> {
  try {
    // Update Firestore user document directly
    const userRef = doc(db, 'users', data.firestoreUserId);
    await setDoc(userRef, {
      tier: data.tier,
      type: data.type,
      storage: data.storage,
      revenuekatUserId: data.revenuekatUserId,
      isPremium: data.type === 'paid',
      lastUpdated: serverTimestamp()
    }, { merge: true });
    
    // Local update if available
    try {
      const localUser = await database.getUserById(data.localUserId);
      if (localUser) {
        await database.updateUserTierAndType(data.localUserId, data.tier, data.type, data.storage);
        console.log('Local user tier updated immediately via webhook');
      }
    } catch (localError) {
      console.log('Local update not available, will sync on next app open');
    }
    
    console.log('User tier updated via RevenueCat webhook:', data);
  } catch (error) {
    console.error('Error handling RevenueCat webhook:', error);
    throw error;
  }
}































// 3. FIX: Secure property filtering for sync (respects tier limits)
private async getFilteredPropertiesForSync(userId: number): Promise<Property[]> {
  const user = await database.getUserById(userId);
  if (!user) return [];

  const limits = this.getUserLimits(user);
  
  // Get all properties, then filter based on restrictions
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

// 4. FIX: Secure tenant filtering for sync (respects tier limits)
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

// 5. FIX: Enhanced updateUserTierAndType with immediate enforcement
async updateUserTierAndType(userId: number, tier: UserTier, type: UserType, storage: boolean = false): Promise<void> {
  try {
    console.log(`Updating user ${userId} to tier: ${tier}, type: ${type}, storage: ${storage}`);
    
    // Update local database first
    await database.updateUserTierAndType(userId, tier, type, storage);
    
    // CRITICAL: Immediately enforce limits to prevent bypasses
    await this.enforceTierLimits(userId);
    
    // Update Firestore if user has sync permissions
    const updatedUser = await database.getUserById(userId);
    if (updatedUser && this.canUserSync(updatedUser)) {
      await this.syncUserToFirestore(updatedUser);
    }
    
    console.log(`User ${userId} tier update completed and limits enforced`);
  } catch (error) {
    console.error('Error updating user tier and type:', error);
    throw error;
  }
}

// 6. FIX: Immediate and strict limit enforcement
private async enforceTierLimits(userId: number): Promise<void> {
  const user = await database.getUserById(userId);
  if (!user) return;

  const limits = this.getUserLimits(user);
  console.log(`Enforcing limits for user ${userId}, tier: ${user.tier}`, limits);
  
  // CRITICAL: Get ALL properties (including restricted ones) for limit calculation
  const allPropertiesQuery = `SELECT * FROM properties WHERE user_id = ? ORDER BY created_at ASC`;
  const allPropsResult = await database.db!.query(allPropertiesQuery, [userId]);
  const allProperties = database.mapToProperties(allPropsResult.values || []);
  
  // Enforce property limits
  if (limits.properties !== -1 && allProperties.length > limits.properties) {
    console.log(`User ${userId} exceeds property limit (${allProperties.length}/${limits.properties}). Applying restrictions.`);
    
    // Allow only the oldest N properties (protects user's core data)
    const allowedProperties = allProperties.slice(0, limits.properties);
    const allowedIds = allowedProperties.map(p => p.id);
    const restrictedIds = allProperties.slice(limits.properties).map(p => p.id);
    
    // Update user restrictions
    await database.db!.run(`
      UPDATE users 
      SET selected_property_ids = ?, restricted_access = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [JSON.stringify(allowedIds), userId]);
    
    // Mark ALL properties as restricted first
    await database.db!.run(`UPDATE properties SET is_restricted = 1 WHERE user_id = ?`, [userId]);
    
    // Unrestrict only allowed properties
    if (allowedIds.length > 0) {
      const placeholders = allowedIds.map(() => '?').join(',');
      await database.db!.run(
        `UPDATE properties SET is_restricted = 0 WHERE id IN (${placeholders})`,
        allowedIds
      );
    }
    
    // Also restrict all tenants in restricted properties
    if (restrictedIds.length > 0) {
      const restrictedPlaceholders = restrictedIds.map(() => '?').join(',');
      await database.db!.run(
        `UPDATE tenants SET is_restricted = 1 WHERE property_id IN (${restrictedPlaceholders})`,
        restrictedIds
      );
    }
  } else {
    // Remove restrictions if user is within limits
    await database.db!.run(`
      UPDATE users 
      SET selected_property_ids = NULL, restricted_access = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [userId]);
    
    await database.db!.run(`UPDATE properties SET is_restricted = 0 WHERE user_id = ?`, [userId]);
  }

  // Enforce tenant limits per allowed property
  const allowedProperties = allProperties.slice(0, limits.properties === -1 ? allProperties.length : limits.properties);
  
  for (const property of allowedProperties) {
    const allTenantsQuery = `SELECT * FROM tenants WHERE property_id = ? ORDER BY created_at ASC`;
    const allTenantsResult = await database.db!.query(allTenantsQuery, [property.id]);
    const allTenants = database.mapToTenants(allTenantsResult.values || []);
    
    if (limits.tenantsPerProperty !== -1 && allTenants.length > limits.tenantsPerProperty) {
      console.log(`Property ${property.id} exceeds tenant limit (${allTenants.length}/${limits.tenantsPerProperty}). Applying restrictions.`);
      
      const allowedTenants = allTenants.slice(0, limits.tenantsPerProperty);
      const allowedTenantIds = allowedTenants.map(t => t.id);
      
      // Mark ALL tenants as restricted first
      await database.db!.run(`UPDATE tenants SET is_restricted = 1 WHERE property_id = ?`, [property.id]);
      
      // Unrestrict only allowed tenants
      if (allowedTenantIds.length > 0) {
        const placeholders = allowedTenantIds.map(() => '?').join(',');
        await database.db!.run(
          `UPDATE tenants SET is_restricted = 0 WHERE id IN (${placeholders})`,
          allowedTenantIds
        );
      }
    } else {
      // Remove restrictions if within limits
      await database.db!.run(`UPDATE tenants SET is_restricted = 0 WHERE property_id = ?`, [property.id]);
    }
  }
}

// 7. FIX: Enhanced performFullSync with complete error handling
// async performFullSync(userId: number): Promise<SyncStatus> {
//   if (this.syncInProgress) {
//     throw new Error('Sync already in progress');
//   }

//   this.syncInProgress = true;
//   //const startTime = new Date().toISOString();
//   const errors: string[] = [];
  
//   try {
//     const user = await database.getUserById(userId);
//     if (!user) {
//       throw new Error('User not found');
//     }
    
//     if (!this.canUserSync(user)) {
//       throw new Error('User does not have sync permissions. Upgrade to business, pro, or enterprise tier, or purchase cloud storage.');
//     }

//     console.log('Starting complete full sync for user:', user.email);
    
//     // Step 1: Download and apply any tier/type updates from Firestore first
//     try {
//       const latestUser = await this.downloadUserFromFirestore(userId);
//       if (latestUser) {
        
//         await database.updateUserTierAndType(
//           userId, 
//           latestUser.tier, 
//           latestUser.type, 
//           latestUser.storage
//         );
        
//         console.log('User tier and permissions updated from Firestore');
//       }
//     } catch (error) {
//       errors.push(`Failed to download user updates: ${error}`);
//       console.error('Error downloading user updates:', error);
//     }

//     // Step 2: Upload all local data to Firestore
//     try {
//       await this.syncUserDataToFirestore(userId);
//       console.log('Upload to Firestore completed');
//     } catch (error) {
//       errors.push(`Failed to upload data: ${error}`);
//       console.error('Error uploading data:', error);
//     }

//     // Step 3: Download and merge remote data
//     try {
//       await this.downloadAndMergeData(userId);
//       console.log('Download from Firestore completed');
//     } catch (error) {
//       errors.push(`Failed to download data: ${error}`);
//       console.error('Error downloading data:', error);
//     }

//     // Step 4: Final enforcement of limits (critical security step)
//     try {
//       await this.enforceTierLimits(userId);
//       console.log('Final limit enforcement completed');
//     } catch (error) {
//       errors.push(`Failed to enforce limits: ${error}`);
//       console.error('Error enforcing limits:', error);
//     }
    
//     this.lastSyncTime = new Date().toISOString();
//     localStorage.setItem('lastSyncTime', this.lastSyncTime);
    
//     await this.logSyncOperation(
//       userId, 
//       'full_sync', 
//       errors.length > 0 ? 'error' : 'success', 
//       errors.length > 0 ? 'Full sync completed with errors' : 'Full sync completed successfully',
//       errors.length > 0 ? errors.join('; ') : undefined
//     );
    
//     return {
//       lastSyncTime: this.lastSyncTime,
//       syncInProgress: false,
//       pendingUploads: 0,
//       pendingDownloads: 0,
//       errors
//     };
    
//   } catch (error) {
//     console.error('Critical sync error:', error);
//     errors.push(error instanceof Error ? error.message : 'Unknown sync error');
    
//     await this.logSyncOperation(userId, 'full_sync', 'error', `Sync failed: ${error}`);
    
//     return {
//       lastSyncTime: this.lastSyncTime || 'Never',
//       syncInProgress: false,
//       pendingUploads: 0,
//       pendingDownloads: 0,
//       errors
//     };
//   } finally {
//     this.syncInProgress = false;
//   }
// }

// 8. FIX: Enhanced user listener with immediate limit enforcement
setupUserListener(userId: number, onUserUpdate: (user: User) => void): void {
  const userRef = doc(db, 'users', userId.toString());
  
  const unsubscribe = onSnapshot(userRef, async (doc) => {
    if (doc.exists()) {
      const userData = doc.data();
      
      console.log('Received user update from Firestore:', userData);
      
      try {
        // Update local user data
        await database.updateUser(userId, {
          name: userData.name,
          email: userData.email,
          phone: userData.phone,
          isPremium: userData.isPremium
        });

        // Update tier and type
        await database.updateUserTierAndType(
          userId, 
          userData.tier || 'free', 
          userData.type || 'free',
          userData.storage || false
        );

        // CRITICAL: Immediately enforce limits after any tier change
        await this.enforceTierLimits(userId);
        
        // Get updated user and notify app
        const updatedUser = await database.getUserById(userId);
        if (updatedUser) {
          onUserUpdate(updatedUser);
        }
        
        console.log('User update applied and limits enforced');
      } catch (error) {
        console.error('Error applying user update:', error);
      }
    }
  });

  this.syncListeners.push(unsubscribe);
}

// 12. FIX: Add method to validate user access to specific entities
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
    console.error('Error validating user access:', error);
    return false;
  }
}

// 13. FIX: Offline-first sync with graceful degradation
async performOfflineFirstSync(userId: number): Promise<SyncStatus> {
  const user = await database.getUserById(userId);
  if (!user) {
    return {
      lastSyncTime: 'Never',
      syncInProgress: false,
      pendingUploads: 0,
      pendingDownloads: 0,
      errors: ['User not found']
    };
  }

  // CRITICAL: Always work offline, sync is optional enhancement
  try {
    // Check if sync is available and permitted
    if (!this.canUserSync(user)) {
      console.log('Operating in offline-only mode - no sync permissions');
      return {
        lastSyncTime: 'Offline Mode',
        syncInProgress: false,
        pendingUploads: 0,
        pendingDownloads: 0,
        errors: []
      };
    }

    // Check network connectivity
    if (!navigator.onLine) {
      console.log('Operating in offline mode - no network connection');
      return {
        lastSyncTime: localStorage.getItem('lastSyncTime') || 'Never',
        syncInProgress: false,
        pendingUploads: 0,
        pendingDownloads: 0,
        errors: ['No network connection - operating offline']
      };
    }

    // Attempt sync only if online and permitted
    return await this.performFullSync(userId);
    
  } catch (error) {
    console.error('Sync failed, continuing offline:', error);
    return {
      lastSyncTime: localStorage.getItem('lastSyncTime') || 'Never',
      syncInProgress: false,
      pendingUploads: 0,
      pendingDownloads: 0,
      errors: ['Sync failed - operating offline: ' + (error instanceof Error ? error.message : 'Unknown error')]
    };
  }
}

// 15. FIX: Network-aware sync operations
async attemptSyncWithFallback(userId: number): Promise<SyncStatus> {
  // CRITICAL: App works offline by default
  const offlineStatus: SyncStatus = {
    lastSyncTime: localStorage.getItem('lastSyncTime') || 'Never',
    syncInProgress: false,
    pendingUploads: 0,
    pendingDownloads: 0,
    errors: []
  };

  const user = await database.getUserById(userId);
  if (!user) {
    return { ...offlineStatus, errors: ['User not found'] };
  }

  // If no sync permissions, work offline (no error)
  if (!this.canUserSync(user)) {
    console.log('No sync permissions - working offline');
    return { ...offlineStatus, lastSyncTime: 'Offline Mode' };
  }

  // If no network, work offline (no error)
  if (!navigator.onLine) {
    console.log('No network connection - working offline');
    return { ...offlineStatus, errors: ['Offline mode'] };
  }

  // Try to sync, but don't break offline functionality
  try {
    return await this.performFullSync(userId);
  } catch (error) {
    console.error('Sync failed, continuing offline operation:', error);
    return {
      ...offlineStatus,
      errors: ['Sync failed - offline mode: ' + (error instanceof Error ? error.message : 'Unknown error')]
    };
  }
}

// 16. FIX: Graceful sync startup (doesn't break offline)
startAutomaticSync(userId: number): void {
  // CRITICAL: Only start auto-sync if user has permissions
  database.getUserById(userId).then(user => {
    if (!user || !this.canUserSync(user)) {
      console.log('Auto-sync disabled - no permissions or offline mode');
      return;
    }

    // Schedule daily sync only if network available
    const scheduleDailySync = () => {
      if (!navigator.onLine) {
        console.log('No network - skipping scheduled sync');
        setTimeout(scheduleDailySync, 60 * 60 * 1000); // Retry in 1 hour
        return;
      }

      const now = new Date();
      const next2AM = new Date();
      next2AM.setHours(2, 0, 0, 0);
      
      if (now.getHours() >= 2) {
        next2AM.setDate(next2AM.getDate() + 1);
      }
      
      const timeUntilNext = next2AM.getTime() - now.getTime();
      
      setTimeout(async () => {
        try {
          await this.performOfflineFirstSync(userId);
          scheduleDailySync();
        } catch (error) {
          console.error('Scheduled sync failed:', error);
          setTimeout(() => scheduleDailySync(), 60 * 60 * 1000);
        }
      }, timeUntilNext);
      
      console.log(`Next sync scheduled for: ${next2AM.toLocaleString()}`);
    };

    scheduleDailySync();

    // Sync when app becomes active (with network check)
    document.addEventListener('visibilitychange', async () => {
      if (!document.hidden && navigator.onLine && this.shouldPerformCatchupSync()) {
        try {
          console.log('Performing catch-up sync...');
          await this.performOfflineFirstSync(userId);
        } catch (error) {
          console.error('Catch-up sync failed - continuing offline:', error);
        }
      }
    });
  });
}


  private shouldPerformCatchupSync(): boolean {
    const lastSyncTime = localStorage.getItem('lastSyncTime');
    if (!lastSyncTime) return true;
    
    const timeSinceLastSync = Date.now() - new Date(lastSyncTime).getTime();
    const hoursInMs = 24 * 60 * 60 * 1000; // 24 hours
    
    return timeSinceLastSync > hoursInMs;
  }


  // ==================== HELPER METHODS ====================

  private canUserSync(user: any): boolean {
    // Business and enterprise users always have sync
    if (user.tier === 'business' || user.tier === 'pro' || user.tier === 'enterprise') {
      return true;
    }
    
    // Free and low tier users need storage permission
    return user.storage === true;
  }

  private getUserLimits(user: any) {
    return USER_LIMITS[user.tier as UserTier] || USER_LIMITS.free;
  }

  // ==================== PUBLIC UTILITY METHODS ====================

  async getSyncStatus(_userId: number): Promise<SyncStatus> {
    const lastSyncTime = localStorage.getItem('lastSyncTime') || 'Never';
    
    return {
      lastSyncTime,
      syncInProgress: this.syncInProgress,
      pendingUploads: 0, // Could be calculated based on local changes
      pendingDownloads: 0, // Could be calculated based on server changes
      errors: []
    };
  }

  async forceSyncUserData(userId: number): Promise<void> {
    try {
      await this.performFullSync(userId);
      console.log('Manual sync completed successfully');
    } catch (error) {
      console.error('Manual sync failed:', error);
      throw error;
    }
  }

  cleanup(): void {
    this.syncListeners.forEach(unsubscribe => unsubscribe());
    this.syncListeners = [];
  }
}

export const firebaseSyncService = FirebaseSyncService.getInstance();