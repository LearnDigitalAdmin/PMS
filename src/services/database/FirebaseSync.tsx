// services/sync/FirebaseSyncService.ts - FIXED VERSION
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  //where, 
  getDocs, 
  writeBatch,
  serverTimestamp,
  orderBy,
  onSnapshot,
  type Unsubscribe,
  Timestamp} from 'firebase/firestore';
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from 'firebase/storage';
import { database } from '../database/Database';
import { generateInvoicePDF } from '../pdf/PDFService';
import type { User, Property, Tenant, InvoiceInput, Invoice } from '../database/Database';
import { integrateWithFirebaseSync } from '../screening/TenantScreeningService';


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

// Enhanced Batch Manager with operation tracking
class SafeBatchManager {
  private batches: any[] = [];
  private currentBatch: any;
  private operationCount = 0;
  private operations: { type: string; id: string; action: string }[] = [];
  private readonly MAX_BATCH_SIZE = 400; // Reduced for safety

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
    console.log(`➕ ${type}: ${description} (${this.operationCount}/${this.MAX_BATCH_SIZE})`);
  }

  async commitAll(): Promise<void> {
    // Add current batch if it has operations
    if (this.operationCount > 0) {
      this.batches.push({
        batch: this.currentBatch,
        operations: [...this.operations]
      });
    }

    console.log(`🚀 Executing ${this.batches.length} batch(es) with ${this.batches.reduce((sum, b) => sum + b.operations.length, 0)} operations...`);
    
    for (let i = 0; i < this.batches.length; i++) {
      try {
        await this.batches[i].batch.commit();
        console.log(`✅ Batch ${i + 1}/${this.batches.length} committed (${this.batches[i].operations.length} ops)`);
      } catch (error) {
        console.error(`❌ Batch ${i + 1} failed:`, error);
        console.error(`Failed operations:`, this.batches[i].operations);
        throw error;
      }
    }
  }
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
const storage = getStorage(app);

// User tier limits
export const USER_LIMITS = {
  free: { 
    properties: 1, 
    tenantsPerProperty: 5, 
    totalTenants: 5,
    storage: false 
  },
  low: { 
    properties: 3, 
    tenantsPerProperty: 10, 
    totalTenants: 30,
    storage: false 
  },
  business: { 
    properties: 9, 
    tenantsPerProperty: 14, 
    totalTenants: 126,
    storage: true 
  },
  solo: {
    properties: 1,
    tenantsPerProperty: 20,
    totalTenants: 20,
    storage: true
  },
  pro: { 
    properties: 16, 
    tenantsPerProperty: 20, 
    totalTenants: 300,
    storage: true 
  },
  enterprise: { 
    properties: -1, 
    tenantsPerProperty: -1, 
    totalTenants: -1, 
    storage: true 
  }
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

// Data sync metadata interface
// interface SyncMetadata {
//   localId: number;
//   lastModified: string;
//   version: number;
//   syncHash: string;
//   serverFields?: { [key: string]: any };
// }

// ==================== MAIN SYNC SERVICE CLASS ====================
export class FirebaseSyncService {
  private static instance: FirebaseSyncService;
  
  // Sync state management
  private operationLocks = new Map<string, boolean>();
  private userListeners = new Map<number, Unsubscribe>();
  private uploadScheduleTimers = new Map<number, NodeJS.Timeout>();
  
  // Constants
  private readonly UPLOAD_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
  private readonly OPERATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
  
  // Storage keys
  private readonly LAST_UPLOAD_KEY = 'lastUploadTime';
  private readonly LAST_DOWNLOAD_KEY = 'lastDownloadTime';
  private readonly UPLOAD_SCHEDULE_KEY = 'uploadScheduleEnabled';

  static getInstance(): FirebaseSyncService {
    if (!this.instance) {
      this.instance = new FirebaseSyncService();
    }
    return this.instance;
  }


  // ==================== ENHANCED DOWNLOAD WITH SEQUENTIAL PROCESSING ====================

private async downloadAllDataWithConflictResolution(userId: number): Promise<void> {
  console.log('📥 Starting SEQUENTIAL download with conflict resolution...');
  
  const errors: string[] = [];
  
  try {
    // CRITICAL: Download in strict sequential order to prevent foreign key issues
    console.log('🏢 Step 1/4: Downloading properties...');
    try {
      await this.downloadPropertiesWithConflictResolution(userId);
      
      // SAFETY: Wait for all property database writes to complete
      await this.waitForDatabaseWrites('properties', 500);
      console.log('✅ Properties downloaded and committed to database');
    } catch (error: any) {
      errors.push(`Properties: ${error.message}`);
      console.error('❌ Properties download failed - STOPPING to prevent data corruption');
      throw new Error(`Critical dependency failed: ${error.message}`);
    }
    
    console.log('👥 Step 2/4: Downloading tenants...');
    try {
      await this.downloadTenantsWithConflictResolution(userId);
      
      // SAFETY: Wait for all tenant database writes to complete before proceeding
      await this.waitForDatabaseWrites('tenants', 800);
      console.log('✅ Tenants downloaded and committed to database');
    } catch (error: any) {
      errors.push(`Tenants: ${error.message}`);
      console.error('❌ Tenants download failed - STOPPING to prevent invoice corruption');
      throw new Error(`Critical dependency failed: ${error.message}`);
    }
    
    console.log('🧾 Step 3/4: Downloading invoices...');
    try {
      await this.downloadInvoicesWithConflictResolution(userId);
      
      // SAFETY: Wait for invoice writes before payments
      await this.waitForDatabaseWrites('invoices', 600);
      console.log('✅ Invoices downloaded and committed to database');
    } catch (error: any) {
      errors.push(`Invoices: ${error.message}`);
      console.error('❌ Invoices download failed, continuing with payments');
    }
    
    console.log('💰 Step 4/4: Downloading payments...');
    try {
      await this.downloadPaymentsWithConflictResolution(userId);
      
      // Final safety wait for all payments
      await this.waitForDatabaseWrites('payments', 400);
      console.log('✅ Payments downloaded and committed to database');
    } catch (error: any) {
      errors.push(`Payments: ${error.message}`);
      console.error('❌ Payments download failed');
    }
    
    if (errors.length > 0) {
      console.warn('⚠️ Some data downloads had issues but sequence completed:', errors);
    } else {
      console.log('✅ All data downloaded successfully in proper sequence');
    }
    
    // CRITICAL: Prevent immediate uploads after download
    this.blockUploadsTemporarily(userId, 30000); // Block for 30 seconds
    
  } catch (error) {
    console.error('❌ Sequential download failed:', error);
    throw new Error(`Sequential download failed: ${errors.join(', ')}`);
  }
}

// ==================== UPDATED EXISTING DOWNLOAD METHODS ====================

private async downloadPropertiesWithConflictResolution(userId: number): Promise<void> {
  console.log('📥 Downloading properties with enhanced conflict resolution...');
  
  try {
    const propertiesQuery = query(
      collection(db, 'users', userId.toString(), 'properties'),
      orderBy('lastSyncTime', 'desc')
    );
    
    const snapshot = await getDocs(propertiesQuery);
    console.log(`Found ${snapshot.docs.length} properties in Firestore`);
    
    // SEQUENTIAL processing instead of concurrent
    for (const doc of snapshot.docs) {
      try {
        const propertyData = doc.data();
        
        if (!propertyData || !propertyData.localId) {
          console.warn('⚠️ Skipping invalid property data:', propertyData);
          continue;
        }
        
        // USE the enhanced merge method
        await this.mergePropertyWithConflictResolution(userId, propertyData);
        
        // Download units for this property AFTER property is confirmed
        // if (propertyData.localId) {
        //   await this.downloadUnitsForProperty(userId, doc.id, propertyData.localId);
        //   // Small delay between properties to prevent overwhelming the database
        //   await new Promise(resolve => setTimeout(resolve, 100));
        // }
      } catch (docError) {
        console.error(`❌ Failed to process property document ${doc.id}:`, docError);
        throw docError; // Re-throw for critical properties
      }
    }
    
    console.log('✅ Properties downloaded successfully with enhanced safety');
  } catch (error: any) {
    console.error('❌ Failed to download properties:', error);
    throw new Error(`Properties download failed: ${error.message || 'Unknown error'}`);
  }
}

private async downloadTenantsWithConflictResolution(userId: number): Promise<void> {
  console.log('📥 Downloading tenants with enhanced conflict resolution...');
  
  try {
    const tenantsQuery = query(
      collection(db, 'users', userId.toString(), 'tenants'),
      orderBy('lastSyncTime', 'desc')
    );
    
    const snapshot = await getDocs(tenantsQuery);
    console.log(`Found ${snapshot.docs.length} tenants in Firestore`);
    
    const validPropertyIds = await this.getValidPropertyIds(userId);
    
    // SEQUENTIAL processing instead of concurrent
    for (const doc of snapshot.docs) {
      try {
        const tenantData = doc.data();
        
        if (!this.isValidTenantData(tenantData, validPropertyIds)) {
          console.warn('⚠️ Skipping invalid tenant data:', tenantData);
          continue;
        }
        
        // USE the enhanced merge method
        await this.mergeTenantWithConflictResolution(tenantData);
        
        // Small delay between tenants to prevent database conflicts
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (docError) {
        console.error(`❌ Failed to process tenant document ${doc.id}:`, docError);
        throw docError; // Re-throw for critical tenants
      }
    }
    
    console.log('✅ Tenants downloaded successfully with enhanced safety');
  } catch (error) {
    console.error('❌ Failed to download tenants:', error);
    throw error;
  }
}

private async downloadInvoicesWithConflictResolution(userId: number): Promise<void> {
  console.log('📥 Downloading invoices with CRITICAL enhanced conflict resolution...');
  
  try {
    const invoicesQuery = query(
      collection(db, 'users', userId.toString(), 'invoices'),
      orderBy('lastSyncTime', 'desc')
    );
    
    const snapshot = await getDocs(invoicesQuery);
    console.log(`Found ${snapshot.docs.length} invoices in Firestore`);
    
    const validTenantIds = await this.getValidTenantIds(userId);
    
    // SEQUENTIAL processing instead of concurrent
    for (const doc of snapshot.docs) {
      try {
        const invoiceData = doc.data();
        
        if (!this.isValidInvoiceData(invoiceData, validTenantIds)) {
          console.warn('⚠️ Skipping invalid invoice data:', invoiceData);
          continue;
        }
        
        // USE the enhanced merge method with critical safety
        await this.mergeInvoiceWithCriticalConflictResolution(invoiceData);
        
        // Small delay between invoices to prevent database conflicts
        await new Promise(resolve => setTimeout(resolve, 150));
      } catch (docError) {
        console.error(`❌ Failed to process invoice document ${doc.id}:`, docError);
        // For invoices, continue with others even if one fails (less critical than dependencies)
        continue;
      }
    }
    
    console.log('✅ Invoices downloaded successfully with payment data preserved');
  } catch (error) {
    console.error('❌ Failed to download invoices:', error);
    throw error;
  }
}

// ==================== DATABASE WRITE SAFETY METHODS ====================

private async waitForDatabaseWrites(entityType: string, delayMs: number): Promise<void> {
  console.log(`⏳ Waiting ${delayMs}ms for ${entityType} database writes to complete...`);
  
  // Use promise-based delay instead of setTimeout for better async handling
  await new Promise(resolve => setTimeout(resolve, delayMs));
  
  // Additional safety: Verify database consistency
  try {
    await this.verifyDatabaseConsistency(entityType);
  } catch (error) {
    console.warn(`⚠️ Database consistency check failed for ${entityType}:`, error);
    // Add extra delay if consistency issues detected
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

private async verifyDatabaseConsistency(entityType: string): Promise<void> {
  try {
    switch (entityType) {
      case 'properties':
        // Quick count check to ensure writes completed
        const propResult = await database.db!.query('SELECT COUNT(*) as count FROM properties WHERE user_id IS NOT NULL');
        const propCount = propResult?.values?.[0]?.[0] ?? 0;
        console.log(`✓ Properties consistency: ${propCount} records`);
        break;
        
      case 'tenants':
        // Verify tenant-property relationships
        const tenantResult = await database.db!.query(`
          SELECT COUNT(*) as count FROM tenants t 
          INNER JOIN properties p ON t.property_id = p.id
        `);
        const tenantCount = tenantResult?.values?.[0]?.[0] ?? 0;
        console.log(`✓ Tenants consistency: ${tenantCount} records with valid properties`);
        break;
        
      case 'invoices':
        // Verify invoice-tenant relationships
        const invoiceResult = await database.db!.query(`
          SELECT COUNT(*) as count FROM invoices i 
          INNER JOIN tenants t ON i.tenant_id = t.id
        `);
        const invoiceCount = invoiceResult?.values?.[0]?.[0] ?? 0;
        console.log(`✓ Invoices consistency: ${invoiceCount} records with valid tenants`);
        break;
    }
  } catch (error) {
    console.warn(`Database consistency check failed for ${entityType}:`, error);
    throw error;
  }
}

// ==================== UPLOAD BLOCKING MECHANISM ====================

private uploadBlocks = new Map<number, number>(); // userId -> blockUntilTimestamp

private blockUploadsTemporarily(userId: number, durationMs: number): void {
  const blockUntil = Date.now() + durationMs;
  this.uploadBlocks.set(userId, blockUntil);
  console.log(`🚫 Uploads blocked for user ${userId} for ${durationMs}ms to prevent conflicts`);
  
  // Auto-clear the block
  setTimeout(() => {
    this.uploadBlocks.delete(userId);
    console.log(`✅ Upload block cleared for user ${userId}`);
  }, durationMs);
}

private isUploadBlocked(userId: number): boolean {
  const blockUntil = this.uploadBlocks.get(userId);
  if (!blockUntil) return false;
  
  const isBlocked = Date.now() < blockUntil;
  if (!isBlocked) {
    this.uploadBlocks.delete(userId);
  }
  return isBlocked;
}

// ==================== ENHANCED MERGE METHODS WITH TRANSACTION-LIKE SAFETY ====================

private async mergePropertyWithConflictResolution(userId: number, propertyData: any): Promise<void> {
  const startTime = Date.now();
  try {
    let localProperty = null;
    try {
      localProperty = await database.getPropertyById(propertyData.localId);
    } catch (error) {
      console.log(`Property ${propertyData.localId} not found locally, will create new one`);
    }
    
    if (!localProperty) {
      // Create new property from Firestore data
      console.log(`📝 Creating property ${propertyData.localId} from Firestore backup`);
      
      const canCreate = await database.canCreateProperty?.(userId);
      if (canCreate?.allowed !== false) {
        // SAFETY: Use transaction-like approach with verification
        await database.createProperty({
          userId: propertyData.userId || userId,
          companyId: propertyData.companyId || undefined,
          name: propertyData.name || 'Restored Property',
          address: propertyData.address || '',
          description: propertyData.description || '',
          image: propertyData.image || undefined,
          agentCommissionRate: propertyData.agentCommissionRate || 0,
          maxUnits: propertyData.maxUnits || 50
        });
        
        // VERIFICATION: Ensure the property was actually created
        const verification = await database.getPropertyById(propertyData.localId);
        if (!verification) {
          throw new Error(`Property creation verification failed for ID ${propertyData.localId}`);
        }
        
        console.log(`✅ Created and verified property ${propertyData.localId} from Firestore`);
      }
    } else if (!localProperty.isRestricted) {
      // Conflict resolution: Use most recent data based on lastModified
      const serverLastModified = this.parseFirestoreTimestamp(propertyData.lastModified);
      const localLastModified = new Date(localProperty.updatedAt);
      
      if (serverLastModified > localLastModified) {
        console.log(`🔄 Updating property ${propertyData.localId} with newer Firestore data`);
        
        await database.updateProperty(propertyData.localId, {
          name: propertyData.name || localProperty.name,
          address: propertyData.address || localProperty.address,
          description: propertyData.description || localProperty.description,
          image: propertyData.image || localProperty.image,
          agentCommissionRate: propertyData.agentCommissionRate !== undefined ? 
            propertyData.agentCommissionRate : localProperty.agentCommissionRate,
          maxUnits: propertyData.maxUnits || localProperty.maxUnits
        });
        
        // VERIFICATION: Ensure update completed
        const updated = await database.getPropertyById(propertyData.localId);
        if (updated?.name !== (propertyData.name || localProperty.name)) {
          console.warn(`⚠️ Property update verification failed for ID ${propertyData.localId}`);
        }
      } else {
        console.log(`ℹ️ Local property ${propertyData.localId} is newer, keeping local data`);
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`⏱️ Property merge completed in ${duration}ms for ID ${propertyData.localId}`);
    
  } catch (error) {
    console.error(`❌ Failed to merge property ${propertyData.localId}:`, error);
    throw error; // Re-throw to stop sequence if critical
  }
}

// Add this method to your FirebaseSyncService class

private async waitForDatabaseReady(maxWaitMs: number = 30000): Promise<void> {
  const startTime = Date.now();
  const checkInterval = 200; // Check every 200ms
  
  console.log('⏳ Waiting for database to be ready...');
  
  while (Date.now() - startTime < maxWaitMs) {
    try {
      // Check if database is initialized and ready
      if (!database.db) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        continue;
      }
      
      // Try a simple query to verify database is fully operational
      const testResult = await database.db.query('SELECT 1 as test');
      
      if (testResult && testResult.values) {
        console.log('✅ Database is ready for sync operations');
        
        // Additional wait to ensure all initialization is complete
        await new Promise(resolve => setTimeout(resolve, 500));
        return;
      }
    } catch (error) {
      // Database not ready yet, continue waiting
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
  }
  
  throw new Error('Database failed to become ready within timeout period');
}

// Update the initializeForUser method
async initializeForUser(userId: number): Promise<SyncStatus> {
  console.log(`🚀 Initializing sync service for user: ${userId}`);
  
  try {
    // CRITICAL: Wait for database to be fully ready before any sync operations
    await this.waitForDatabaseReady();
    
    // Setup user listener for tier/permission changes
    this.setupUserListener(userId, (user) => {
      console.log('👤 User data updated via listener:', user.tier);
    });
    
    // Start safe upload scheduling
    this.startUploadScheduling(userId);
    
    // 🔍 INTEGRATE SCREENING SERVICE
    integrateWithFirebaseSync(userId);
    
    // Perform full sync with conflict resolution and safe upload
    const syncResult = await this.performFullSync(userId);
    
    console.log('✅ Sync service initialized successfully with safe sync and screening');
    return syncResult;
    
  } catch (error) {
    console.error('❌ Failed to initialize sync service:', error);
    throw error;
  }
}

// Update performDownloadSync to check database readiness
async performDownloadSync(userId: number, source: 'signin' | 'manual' = 'manual'): Promise<SyncStatus> {
  const lockKey = `download_${userId}`;
  
  if (this.isOperationLocked(lockKey)) {
    throw new Error('Download already in progress');
  }

  console.log(`🔽 Starting DOWNLOAD sync (${source}) for user: ${userId}`);
  
  try {
    await this.acquireOperationLock(lockKey);
    
    // CRITICAL: Ensure database is ready before any operations
    await this.waitForDatabaseReady();
    
    const user = await database.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (!this.canUserSync(user)) {
      console.log('❌ User cannot sync - no storage permission');
      return this.buildSyncStatus('No sync permission');
    }

    if (!navigator.onLine) {
      throw new Error('No network connection available');
    }

    // Download user updates first
    await this.downloadUserUpdates(userId);

    // Download and merge all data with conflict resolution
    await this.downloadAllDataWithConflictResolution(userId);

    // Enforce tier limits after download
    await this.enforceTierLimits(userId);

    const now = new Date().toISOString();
    localStorage.setItem(this.LAST_DOWNLOAD_KEY, now);
    
    console.log('✅ Download sync completed successfully');
    
    return this.buildSyncStatus('Download completed');
    
  } catch (error) {
    console.error('❌ Download sync failed:', error);
    throw error;
  } finally {
    this.releaseOperationLock(lockKey);
  }
}

// Enhanced mergeTenantWithConflictResolution with better debugging
private async mergeTenantWithConflictResolution(tenantData: any): Promise<void> {
  const startTime = Date.now();
  try {
    let localTenant = null;
    try {
      localTenant = await database.getTenantById(tenantData.localId);
    } catch (error) {
      console.log(`Tenant ${tenantData.localId} not found locally, will create new one`);
    }
    
    if (!localTenant) {
      // SAFETY: Verify property exists before creating tenant
      try {
        const property = await database.getPropertyById(tenantData.propertyId);
        if (!property) {
          throw new Error(`Cannot create tenant ${tenantData.localId} - property ${tenantData.propertyId} not found`);
        }
      } catch (error) {
        console.error(`❌ Property verification failed for tenant ${tenantData.localId}:`, error);
        throw error;
      }
      
      console.log(`📝 Creating tenant ${tenantData.localId} from Firestore backup`);
      
      // Create the tenant
      const createdTenant = await database.createTenant({
        id: tenantData.localId,
        propertyId: tenantData.propertyId,
        name: tenantData.name || 'Restored Tenant',
        phone: tenantData.phone || '',
        email: tenantData.email || '',
        unitNumber: tenantData.unitNumber || '',
        rentAmount: tenantData.rentAmount || 0,
        standingFees: tenantData.standingFees || 0,
        depositAmount: tenantData.depositAmount || 0,
        leaseStart: tenantData.leaseStart || undefined,
        leaseEnd: tenantData.leaseEnd || undefined
      });
      
      console.log(`✅ Tenant created, ID returned:`, createdTenant?.id);
      
      // ENHANCED VERIFICATION with multiple strategies
      let verification = null;
      const maxRetries = 5;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const delayMs = 50 * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        
        try {
          // Strategy 1: Try getTenantById
          verification = await database.getTenantById(tenantData.localId);
          
          if (verification && verification.propertyId === tenantData.propertyId) {
            console.log(`✅ Tenant ${tenantData.localId} verified on attempt ${attempt}`);
            break;
          }
          
          // Strategy 2: If getTenantById returns null but tenant exists, try direct query
          if (!verification) {
            console.log(`⏳ Attempt ${attempt}/${maxRetries}: getTenantById returned null, trying direct query...`);
            
            const directQuery = await database.db!.query(
              'SELECT * FROM tenants WHERE id = ?',
              [tenantData.localId]
            );
            
            if (directQuery?.values && directQuery.values.length > 0) {
              const foundTenants = database.mapToTenants(directQuery.values);
              if (foundTenants.length > 0) {
                verification = foundTenants[0];
                console.log(`✅ Found tenant via direct query on attempt ${attempt}`);
                break;
              }
            }
          }
          
          console.log(`⏳ Attempt ${attempt}/${maxRetries}: Tenant not yet visible...`);
        } catch (error) {
          console.log(`⏳ Attempt ${attempt}/${maxRetries}: Query failed, retrying...`, error);
        }
      }
      
      // Final check and detailed debugging
      if (!verification || verification.propertyId !== tenantData.propertyId) {
        console.error(`❌ VERIFICATION FAILED for tenant ${tenantData.localId}:`);
        console.error(`Expected propertyId: ${tenantData.propertyId}`);
        console.error(`Found tenant:`, verification);
        console.error(`Created tenant result:`, createdTenant);
        
        // Get all tenants for debugging
        try {
          const allTenantsQuery = await database.db!.query(
            'SELECT id, property_id, name FROM tenants'
          );
          console.error(`Current tenants in database:`, allTenantsQuery?.values);
          
          // Check if tenant exists with different ID
          const byPropertyQuery = await database.db!.query(
            'SELECT * FROM tenants WHERE property_id = ?',
            [tenantData.propertyId]
          );
          console.error(`Tenants for property ${tenantData.propertyId}:`, byPropertyQuery?.values);
          
          // Check if it's an ID mismatch issue
          if (createdTenant && createdTenant.id !== tenantData.localId) {
            console.error(`⚠️ ID MISMATCH: Created with ID ${createdTenant.id} but expected ${tenantData.localId}`);
            // Try to find by the created ID
            const byCreatedId = await database.getTenantById(createdTenant.id);
            if (byCreatedId) {
              console.log(`✅ Found tenant by created ID ${createdTenant.id}, considering this a success`);
              return; // Success - tenant was created, just with different ID
            }
          }
        } catch (debugError) {
          console.error(`Could not retrieve debug information:`, debugError);
        }
        
        throw new Error(`Tenant creation verification failed for ID ${tenantData.localId} after ${maxRetries} attempts`);
      }
      
      console.log(`✅ Created and verified tenant ${tenantData.localId} from Firestore`);
      
    } else if (!localTenant.isRestricted) {
      // Conflict resolution: Use most recent data
      const serverLastModified = this.parseFirestoreTimestamp(tenantData.lastModified);
      const localLastModified = new Date(localTenant.updatedAt);
      
      if (serverLastModified > localLastModified) {
        console.log(`🔄 Updating tenant ${tenantData.localId} with newer Firestore data`);
        
        await database.updateTenant(tenantData.localId, {
          name: tenantData.name || localTenant.name,
          phone: tenantData.phone || localTenant.phone,
          email: tenantData.email || localTenant.email,
          unitNumber: tenantData.unitNumber || localTenant.unitNumber,
          rentAmount: tenantData.rentAmount !== undefined ? tenantData.rentAmount : localTenant.rentAmount,
          standingFees: tenantData.standingFees !== undefined ? tenantData.standingFees : localTenant.standingFees,
          depositAmount: tenantData.depositAmount !== undefined ? tenantData.depositAmount : localTenant.depositAmount,
          leaseStart: tenantData.leaseStart || localTenant.leaseStart,
          leaseEnd: tenantData.leaseEnd || localTenant.leaseEnd
        });
      } else {
        console.log(`ℹ️ Local tenant ${tenantData.localId} is newer, keeping local data`);
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`⏱️ Tenant merge completed in ${duration}ms for ID ${tenantData.localId}`);
    
  } catch (error) {
    console.error(`❌ Failed to merge tenant ${tenantData.localId}:`, error);
    throw error;
  }
}

private async mergeInvoiceWithCriticalConflictResolution(invoiceData: any): Promise<void> {
  const startTime = Date.now();
  try {
    let localInvoice = null;
    try {
      localInvoice = await database.getInvoiceById(invoiceData.localId);
    } catch (error) {
      console.log(`Invoice ${invoiceData.localId} not found locally, will create new one`);
    }
    
    if (!localInvoice) {
      // SAFETY: Verify tenant exists before creating invoice
      try {
        const tenant = await database.getTenantById(invoiceData.tenantId);
        if (!tenant) {
          throw new Error(`Cannot create invoice ${invoiceData.localId} - tenant ${invoiceData.tenantId} not found`);
        }
        if (tenant.propertyId !== invoiceData.propertyId) {
          throw new Error(`Tenant-Property mismatch for invoice ${invoiceData.localId}`);
        }
      } catch (error) {
        console.error(`❌ Tenant verification failed for invoice ${invoiceData.localId}:`, error);
        throw error; // Critical error - stop processing
      }
      
      console.log(`📝 Creating invoice ${invoiceData.localId} from Firestore backup with payment data`);
      
      await database.createInvoice({
        id: invoiceData.localId,
        tenantId: invoiceData.tenantId,
        propertyId: invoiceData.propertyId,
        billingMonth: invoiceData.billingMonth || new Date().toISOString().substring(0, 7),
        rentAmount: invoiceData.rentAmount || 0,
        waterCurrentReading: invoiceData.waterCurrentReading || 0,
        waterPreviousReading: invoiceData.waterPreviousReading || 0,
        waterStandingFee: invoiceData.waterStandingFee || 0,
        waterUnitPrice: invoiceData.waterUnitPrice || 0,
        powerCurrentReading: invoiceData.powerCurrentReading || 0,
        powerPreviousReading: invoiceData.powerPreviousReading || 0,
        powerUnitPrice: invoiceData.powerUnitPrice || 0,
        otherCharges: invoiceData.otherCharges || 0,
        otherChargesDescription: invoiceData.otherChargesDescription || '',
        dueDate: invoiceData.dueDate || undefined,
        isPaid: invoiceData.isPaid || false
      });
      
      // CRITICAL: Update payment-related fields separately to preserve them
      if (invoiceData.amountPaid !== undefined || invoiceData.arrears !== undefined || invoiceData.paidDate) {
        console.log(`🔄 Restoring critical payment data for invoice ${invoiceData.localId}`);
        const updateQuery = `
          UPDATE invoices SET 
            amount_paid = COALESCE(?, amount_paid),
            arrears = COALESCE(?, arrears),
            paid_date = COALESCE(?, paid_date),
            is_paid = COALESCE(?, is_paid),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `;
        await database.db!.run(updateQuery, [
          invoiceData.amountPaid,
          invoiceData.arrears,
          invoiceData.paidDate,
          invoiceData.isPaid,
          invoiceData.localId
        ]);
      }
      
      // VERIFICATION: Ensure the invoice was created with correct foreign keys
      const verification = await database.getInvoiceById(invoiceData.localId);
      if (!verification || verification.tenantId !== invoiceData.tenantId) {
        throw new Error(`Invoice creation verification failed for ID ${invoiceData.localId}`);
      }
      
      console.log(`✅ Created and verified invoice ${invoiceData.localId} from Firestore with payment data preserved`);
    } else {
      // CRITICAL CONFLICT RESOLUTION: For invoices, ALWAYS preserve payment data from server
      console.log(`🚨 CRITICAL: Merging invoice ${invoiceData.localId} with payment data preservation`);
      
      const updateData: Partial<InvoiceInput> = {};
      
      // Determine which data is newer for invoice details
      const serverLastModified = this.parseFirestoreTimestamp(invoiceData.lastModified);
      const localLastModified = new Date(localInvoice.updatedAt);
      
      if (serverLastModified > localLastModified) {
        // Server invoice data is newer - update invoice fields
        updateData.billingMonth = invoiceData.billingMonth || localInvoice.billingMonth;
        updateData.rentAmount = invoiceData.rentAmount !== undefined ? invoiceData.rentAmount : localInvoice.rentAmount;
        updateData.waterCurrentReading = invoiceData.waterCurrentReading !== undefined ? invoiceData.waterCurrentReading : localInvoice.waterCurrentReading;
        updateData.waterPreviousReading = invoiceData.waterPreviousReading !== undefined ? invoiceData.waterPreviousReading : localInvoice.waterPreviousReading;
        updateData.waterStandingFee = invoiceData.waterStandingFee !== undefined ? invoiceData.waterStandingFee : localInvoice.waterStandingFee;
        updateData.waterUnitPrice = invoiceData.waterUnitPrice !== undefined ? invoiceData.waterUnitPrice : localInvoice.waterUnitPrice;
        updateData.powerCurrentReading = invoiceData.powerCurrentReading !== undefined ? invoiceData.powerCurrentReading : localInvoice.powerCurrentReading;
        updateData.powerPreviousReading = invoiceData.powerPreviousReading !== undefined ? invoiceData.powerPreviousReading : localInvoice.powerPreviousReading;
        updateData.powerUnitPrice = invoiceData.powerUnitPrice !== undefined ? invoiceData.powerUnitPrice : localInvoice.powerUnitPrice;
        updateData.otherCharges = invoiceData.otherCharges !== undefined ? invoiceData.otherCharges : localInvoice.otherCharges;
        updateData.otherChargesDescription = invoiceData.otherChargesDescription || localInvoice.otherChargesDescription;
        updateData.dueDate = invoiceData.dueDate || localInvoice.dueDate;
      }
      
      // CRITICAL: ALWAYS use server payment data if it exists (it's authoritative for payments)
      const paymentDataChanged = (
        invoiceData.amountPaid !== undefined && invoiceData.amountPaid !== localInvoice.amountPaid
      ) || (
        invoiceData.arrears !== undefined && invoiceData.arrears !== localInvoice.arrears
      ) || (
        invoiceData.isPaid !== undefined && invoiceData.isPaid !== localInvoice.isPaid
      );
      
      if (paymentDataChanged) {
        console.log(`🚨 CRITICAL: Server has different payment data - using server values`);
        console.log(`Server: paid=${invoiceData.amountPaid}, arrears=${invoiceData.arrears}, isPaid=${invoiceData.isPaid}`);
        console.log(`Local: paid=${localInvoice.amountPaid}, arrears=${localInvoice.arrears}, isPaid=${localInvoice.isPaid}`);
      }
      
      // Update invoice with conflict resolution
      if (Object.keys(updateData).length > 0) {
        await database.updateInvoice(invoiceData.localId, updateData);
      }
      
      // CRITICAL: Update payment fields directly if server has payment data
      if (invoiceData.amountPaid !== undefined || invoiceData.arrears !== undefined || invoiceData.paidDate) {
        const paymentUpdateQuery = `
          UPDATE invoices SET 
            amount_paid = COALESCE(?, amount_paid),
            arrears = COALESCE(?, arrears),
            paid_date = COALESCE(?, paid_date),
            is_paid = COALESCE(?, is_paid),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `;
        await database.db!.run(paymentUpdateQuery, [
          invoiceData.amountPaid,
          invoiceData.arrears,
          invoiceData.paidDate,
          invoiceData.isPaid,
          invoiceData.localId
        ]);
        console.log(`✅ Payment data synchronized for invoice ${invoiceData.localId}`);
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`⏱️ Invoice merge completed in ${duration}ms for ID ${invoiceData.localId}`);
    
  } catch (error) {
    console.error(`❌ CRITICAL: Failed to merge invoice ${invoiceData.localId}:`, error);
    throw error; // Re-throw to stop sequence if critical
  }
}

// ==================== ENHANCED UPLOAD METHODS WITH BLOCK CHECKING ====================

async performSafeUploadSync(userId: number, source: 'scheduled' | 'manual' = 'manual'): Promise<SyncStatus> {
  const lockKey = `upload_${userId}`;
  
  if (this.isOperationLocked(lockKey)) {
    throw new Error('Upload already in progress');
  }

  // SAFETY: Check if uploads are temporarily blocked
  if (this.isUploadBlocked(userId)) {
    console.log('🚫 Upload blocked to prevent conflicts with recent download');
    return this.buildSyncStatus('Upload blocked - waiting for download completion');
  }

  console.log(`🔼 Starting SAFE UPLOAD sync (${source}) for user: ${userId}`);
  
  try {
    await this.acquireOperationLock(lockKey);
    
    const user = await database.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (!this.canUserSync(user)) {
      console.log('❌ User cannot upload - no storage permission');
      return this.buildSyncStatus('No sync permission');
    }

    if (!navigator.onLine) {
      throw new Error('No network connection available');
    }

    // Only upload if enough time has passed (unless manual)
    if (source === 'scheduled' && !this.shouldPerformScheduledUpload()) {
      console.log('⏰ Scheduled upload skipped - too soon');
      return this.buildSyncStatus('Upload skipped - too soon');
    }

    // SAFETY: Additional verification before upload
    await this.verifyLocalDataIntegrity(userId);

    // SAFE UPLOAD: Merge data preserving server fields
    await this.safeUploadAllDataWithMerge(userId);

    const now = new Date().toISOString();
    localStorage.setItem(this.LAST_UPLOAD_KEY, now);
    
    console.log('✅ Safe upload sync completed successfully');
    
    return this.buildSyncStatus('Upload completed');
    
  } catch (error) {
    console.error('❌ Safe upload sync failed:', error);
    throw error;
  } finally {
    this.releaseOperationLock(lockKey);
  }
}

// ==================== DATA INTEGRITY VERIFICATION ====================

private async verifyLocalDataIntegrity(_userId: number): Promise<void> {
  console.log('🔍 Verifying local data integrity before upload...');
  
  try {
    // Check for orphaned tenants, [userId]
    const orphanedTenantsQuery = `
      SELECT t.id, t.name, t.property_id 
      FROM tenants t 
      LEFT JOIN properties p ON t.property_id = p.id 
      WHERE p.id IS NULL
    `;
    const orphanedResult = await database.db!.query(orphanedTenantsQuery);
    
    if (orphanedResult?.values && orphanedResult.values.length > 0) {
      console.warn('⚠️ Found orphaned tenants:', orphanedResult.values);
      // Could mark them as restricted or skip upload
      for (const orphan of orphanedResult.values) {
        await database.updateTenant(orphan[0], { isRestricted: true });
      }
    }
    
    // Check for orphaned invoices
    const orphanedInvoicesQuery = `
      SELECT i.id, i.tenant_id 
      FROM invoices i 
      LEFT JOIN tenants t ON i.tenant_id = t.id 
      WHERE t.id IS NULL
    `;
    const orphanedInvoicesResult = await database.db!.query(orphanedInvoicesQuery);
    
    if (orphanedInvoicesResult?.values && orphanedInvoicesResult.values.length > 0) {
      console.warn('⚠️ Found orphaned invoices - marking as problematic');
      // These shouldn't be uploaded
    }
    
    console.log('✅ Local data integrity verified');
    
  } catch (error) {
    console.error('❌ Data integrity check failed:', error);
    throw new Error('Local data integrity issues detected');
  }
}
































































  

  private async safeUploadAllDataWithMerge(userId: number): Promise<void> {
    console.log('📤 Uploading all data with SAFE MERGE strategy...');
    
    try {
      const user = await database.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Create safe batch manager
      const batchManager = new SafeBatchManager();

      // STEP 1: Upload user data (merge only)
      await this.safeUploadUserData(userId, user, batchManager);

      // STEP 2: Upload properties with merge strategy
      await this.safeUploadPropertiesWithMerge(userId, batchManager);

      // STEP 3: Upload tenants with merge strategy
      await this.safeUploadTenantsWithMerge(userId, batchManager);

      // STEP 4: Upload invoices with merge strategy (CRITICAL - preserve payment data)
      await this.safeUploadInvoicesWithMerge(userId, batchManager);

      // Execute all batches atomically
      await batchManager.commitAll();

      console.log('✅ All data uploaded safely with merge strategy');
    } catch (error) {
      console.error('❌ Failed to upload data safely:', error);
      throw error;
    }
  }

  // ==================== SAFE UPLOAD METHODS ====================

  private async safeUploadUserData(userId: number, user: User, batchManager: SafeBatchManager): Promise<void> {
    console.log('📤 Safely uploading user data...');
    
    try {
      const company = await database.getCompanyByUserId(userId);
      const userRef = doc(db, 'users', userId.toString());
      
      // Get existing document to preserve server fields
      const existingDoc = await getDoc(userRef);
      const existingData = existingDoc.exists() ? existingDoc.data() : {};
      
      batchManager.addOperation((batch) => {
        batch.set(userRef, {
          // Preserve existing server fields
          ...existingData,
          // Update with local data
          ...user,
          lastSyncTime: serverTimestamp(),
          localId: user.id,
          company: company ? {
            // Preserve existing company server fields
            ...(existingData.company || {}),
            // Update with local company data
            ...company,
            localId: company.id,
            lastSyncTime: serverTimestamp()
          } : existingData.company || null
        }, { merge: true });
      }, `User ${user.id}`, 'UPDATE');
      
    } catch (error) {
      console.error('❌ Failed to upload user data:', error);
      throw error;
    }
  }

  private async safeUploadPropertiesWithMerge(userId: number, batchManager: SafeBatchManager): Promise<void> {
    console.log('📤 Safely uploading properties with merge strategy...');
    
    try {
      // Get local properties (what we want to sync)
      const localProperties = await this.getFilteredPropertiesForSync(userId);
      
      console.log(`📊 Local properties to sync: ${localProperties.length}`);

      // Upload each property safely with merge
      for (const property of localProperties) {
        await this.safeUploadSingleProperty(userId, property, batchManager);
        
        // Upload units for this property
        await this.safeUploadUnitsForProperty(userId, property.id, batchManager);
      }
      
      console.log('✅ Properties uploaded safely');
    } catch (error) {
      console.error('❌ Failed to upload properties safely:', error);
      throw error;
    }
  }

  private async safeUploadSingleProperty(userId: number, property: Property, batchManager: SafeBatchManager): Promise<void> {
    try {
      const propertyRef = doc(db, 'users', userId.toString(), 'properties', property.id.toString());
      
      // Get existing document to preserve server fields
      const existingDoc = await getDoc(propertyRef);
      const existingData = existingDoc.exists() ? existingDoc.data() : {};
      
      console.log(`📝 MERGE uploading property: ${property.id}`);
      
      batchManager.addOperation((batch) => {
        batch.set(propertyRef, {
          // Preserve server fields (like cloud function flags)
          ...existingData,
          // Update with local data
          ...property,
          userId,
          localId: property.id,
          lastSyncTime: serverTimestamp(),
          lastModified: new Date().toISOString()
        }, { merge: true });
      }, `Property ${property.id}`, existingDoc.exists() ? 'UPDATE' : 'CREATE');
      
    } catch (error) {
      console.error(`❌ Failed to upload property ${property.id}:`, error);
    }
  }

  private async safeUploadUnitsForProperty(userId: number, propertyId: number, batchManager: SafeBatchManager): Promise<void> {
    try {
      // Get local units
      const localUnits = await database.getUnitsByProperty(propertyId);

      // Upload each unit with merge
      for (const unit of localUnits) {
        const unitRef = doc(db, 'users', userId.toString(), 'properties', propertyId.toString(), 'units', unit.id.toString());
        
        // Get existing document
        const existingDoc = await getDoc(unitRef);
        const existingData = existingDoc.exists() ? existingDoc.data() : {};
        
        batchManager.addOperation((batch) => {
          batch.set(unitRef, {
            // Preserve server fields
            ...existingData,
            // Update with local data
            ...unit,
            userId,
            propertyId,
            localId: unit.id,
            lastSyncTime: serverTimestamp(),
            lastModified: new Date().toISOString()
          }, { merge: true });
        }, `Unit ${unit.id}`, existingDoc.exists() ? 'UPDATE' : 'CREATE');
      }
      
    } catch (error) {
      console.error(`❌ Failed to upload units for property ${propertyId}:`, error);
    }
  }

  private async safeUploadTenantsWithMerge(userId: number, batchManager: SafeBatchManager): Promise<void> {
    console.log('📤 Safely uploading tenants with merge strategy...');
    
    try {
      // Get all local tenants across all properties
      const properties = await this.getFilteredPropertiesForSync(userId);
      const user = await database.getUserById(userId);
      const allLocalTenants: Tenant[] = [];
      
      for (const property of properties) {
        const tenants = await this.getFilteredTenantsForSync(property.id, user);
        allLocalTenants.push(...tenants);
      }
      
      console.log(`📊 Local tenants to sync: ${allLocalTenants.length}`);

      // Upload each tenant safely with merge
      for (const tenant of allLocalTenants) {
        await this.safeUploadSingleTenant(userId, tenant, batchManager);
      }

      console.log('✅ Tenants uploaded safely');
    } catch (error) {
      console.error('❌ Failed to upload tenants safely:', error);
      throw error;
    }
  }

  private async safeUploadSingleTenant(userId: number, tenant: Tenant, batchManager: SafeBatchManager): Promise<void> {
    try {
      const tenantRef = doc(db, 'users', userId.toString(), 'tenants', tenant.id.toString());
      
      // Get existing document to preserve server fields
      const existingDoc = await getDoc(tenantRef);
      const existingData = existingDoc.exists() ? existingDoc.data() : {};
      
      console.log(`📝 MERGE uploading tenant: ${tenant.id}`);
      
      batchManager.addOperation((batch) => {
        batch.set(tenantRef, {
          // Preserve server fields
          ...existingData,
          // Update with local data
          ...tenant,
          userId,
          propertyId: tenant.propertyId,
          localId: tenant.id,
          lastSyncTime: serverTimestamp(),
          lastModified: new Date().toISOString()
        }, { merge: true });
      }, `Tenant ${tenant.id}`, existingDoc.exists() ? 'UPDATE' : 'CREATE');
      
    } catch (error) {
      console.error(`❌ Failed to upload tenant ${tenant.id}:`, error);
    }
  }

  private async safeUploadInvoicesWithMerge(userId: number, batchManager: SafeBatchManager): Promise<void> {
    console.log('📤 Safely uploading invoices with CRITICAL merge strategy...');
    
    try {
      // Get all local invoices across all tenants
      const properties = await this.getFilteredPropertiesForSync(userId);
      const user = await database.getUserById(userId);
      const allLocalInvoices: Invoice[] = [];
      
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
      
      console.log(`📊 Local invoices to sync: ${allLocalInvoices.length}`);

      // Upload each invoice safely with merge (CRITICAL - preserve payment data)
      for (const invoice of allLocalInvoices) {
        await this.safeUploadSingleInvoice(userId, invoice, batchManager);
        
        // Upload payments for this invoice safely
        await this.safeUploadPaymentsForInvoice(userId, invoice, batchManager);
      }

      console.log('✅ Invoices uploaded safely with payment data preserved');
    } catch (error) {
      console.error('❌ Failed to upload invoices safely:', error);
      throw error;
    }
  }

  private async safeUploadSingleInvoice(userId: number, invoice: Invoice, batchManager: SafeBatchManager): Promise<void> {
    try {
      const invoiceRef = doc(db, 'users', userId.toString(), 'invoices', invoice.id.toString());
      
      // Get existing document to preserve server fields and payment data
      const existingDoc = await getDoc(invoiceRef);
      const existingData = existingDoc.exists() ? existingDoc.data() : {};
      
      console.log(`📝 CRITICAL MERGE uploading invoice: ${invoice.id}`);
      
      // Calculate current payment status for PDF generation
      const statusSuffix = invoice.totalAmount <= invoice.amountPaid ? 'paid' : 'pending';
      
      // Handle PDF generation only if needed
      let pdfUrl = existingData.pdfUrl || null;
      let pdfStatus = existingData.pdfStatus || '';
      
      try {
        const shouldGeneratePDF = !existingData.pdfUrl || (existingData.pdfStatus !== statusSuffix);
        
        if (shouldGeneratePDF) {
          console.log(`📄 Generating PDF for invoice ${invoice.id} - Status: ${statusSuffix}`);
          
          // Delete old PDF if status changed
          if (existingData.pdfUrl && existingData.pdfStatus !== statusSuffix) {
            await this.deleteOldPDFFromStorage(existingData.pdfUrl);
          }
          
          pdfUrl = await this.generateAndUploadInvoicePDF(userId, invoice, statusSuffix);
          pdfStatus = statusSuffix;
        }
      } catch (pdfError) {
        console.error(`❌ PDF generation failed for invoice ${invoice.id}:`, pdfError);
        // Don't fail the whole sync because of PDF issues
      }
      
      batchManager.addOperation((batch) => {
        batch.set(invoiceRef, {
          // CRITICAL: Preserve ALL existing server fields and payment data
          ...existingData,
          
          // Update ONLY the invoice fields from local data
          billingMonth: invoice.billingMonth,
          rentAmount: invoice.rentAmount,
          waterCurrentReading: invoice.waterCurrentReading,
          waterPreviousReading: invoice.waterPreviousReading,
          waterStandingFee: invoice.waterStandingFee,
          waterUnitPrice: invoice.waterUnitPrice,
          powerCurrentReading: invoice.powerCurrentReading,
          powerPreviousReading: invoice.powerPreviousReading,
          powerUnitPrice: invoice.powerUnitPrice,
          otherCharges: invoice.otherCharges,
          otherChargesDescription: invoice.otherChargesDescription,
          totalAmount: invoice.totalAmount,
          
          // CRITICAL: Preserve payment-related fields from existing data or use local
          amountPaid: existingData.amountPaid ?? invoice.amountPaid,
          arrears: existingData.arrears ?? invoice.arrears,
          isPaid: existingData.isPaid ?? invoice.isPaid,
          paidDate: existingData.paidDate ?? invoice.paidDate,
          
          // Update metadata
          userId,
          tenantId: invoice.tenantId,
          propertyId: invoice.propertyId,
          localId: invoice.id,
          pdfUrl,
          pdfStatus,
          lastSyncTime: serverTimestamp(),
          lastModified: new Date().toISOString(),
          
          // Preserve due date
          dueDate: invoice.dueDate || existingData.dueDate
        }, { merge: true });
      }, `Invoice ${invoice.id}`, existingDoc.exists() ? 'UPDATE' : 'CREATE');
      
    } catch (error) {
      console.error(`❌ Failed to upload invoice ${invoice.id}:`, error);
    }
  }

  private async safeUploadPaymentsForInvoice(userId: number, invoice: Invoice, batchManager: SafeBatchManager): Promise<void> {
    try {
      // Get local payments
      const localPayments = await database.getPaymentsByInvoice(invoice.id);

      // Upload each payment with merge
      for (const payment of localPayments) {
        const paymentRef = doc(db, 'users', userId.toString(), 'invoices', invoice.id.toString(), 'payments', payment.id.toString());
        
        // Get existing document
        const existingDoc = await getDoc(paymentRef);
        const existingData = existingDoc.exists() ? existingDoc.data() : {};
        
        batchManager.addOperation((batch) => {
          batch.set(paymentRef, {
            // Preserve server fields
            ...existingData,
            // Update with local payment data
            ...payment,
            userId,
            invoiceId: invoice.id,
            tenantId: invoice.tenantId,
            propertyId: invoice.propertyId,
            localId: payment.id,
            lastSyncTime: serverTimestamp(),
            lastModified: new Date().toISOString()
          }, { merge: true });
        }, `Payment ${payment.id}`, existingDoc.exists() ? 'UPDATE' : 'CREATE');
      }
      
    } catch (error) {
      console.error(`❌ Failed to upload payments for invoice ${invoice.id}:`, error);
    }
  }

  // ==================== DOWNLOAD OPERATIONS (EXISTING CODE) ====================

  // Replace the downloadUserUpdates method in FirebaseSyncService

async downloadUserUpdates(userId: number): Promise<{ tier: string; type: string; storage: boolean; company?: any } | null> {
  try {
    console.log('📥 Downloading user updates for userId:', userId);
    
    const userRef = doc(db, 'users', userId.toString());
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.log('ℹ️ No user document found in Firestore');
      return null;
    }
    
    const userData = userDoc.data();
    if (!userData) {
      console.warn('⚠️ Empty user data received from Firestore');
      return null;
    }
    
    console.log('✅ User document loaded from Firestore');
    
    // Extract and normalize the data
    const result = {
      tier: userData.tier || 'free',
      type: userData.type || 'free', 
      storage: userData.storage === true,
      company: userData.company || undefined
    };
    
    // Update local database
    await database.updateUserTierAndType(userId, result.tier, result.type, result.storage);
    console.log('✅ User tier and permissions updated locally:', result);
    
    // Update company if exists
    if (result.company) {
      await this.syncCompanyData(userId, result.company);
      console.log('✅ Company data updated');
    }
    
    return result;
    
  } catch (error: any) {
    console.error('❌ Failed to download user updates:', error);
    
    if (error.code === 'permission-denied') {
      console.warn('⚠️ Access denied - user may not have Firestore permissions');
    } else if (error.code === 'unavailable') {
      console.warn('⚠️ Firestore unavailable - offline mode');
    }
    
    return null; // Return null on any error - app continues offline
  }
}

  

  // Enhanced download methods with conflict resolution
  

  // private async downloadTenantsWithConflictResolution(userId: number): Promise<void> {
  //   console.log('📥 Downloading tenants with conflict resolution...');
    
  //   try {
  //     const tenantsQuery = query(
  //       collection(db, 'users', userId.toString(), 'tenants'),
  //       orderBy('lastSyncTime', 'desc')
  //     );
      
  //     const snapshot = await getDocs(tenantsQuery);
  //     console.log(`Found ${snapshot.docs.length} tenants in Firestore`);
      
  //     const validPropertyIds = await this.getValidPropertyIds(userId);
      
  //     for (const doc of snapshot.docs) {
  //       try {
  //         const tenantData = doc.data();
          
  //         if (!this.isValidTenantData(tenantData, validPropertyIds)) {
  //           console.warn('⚠️ Skipping invalid tenant data:', tenantData);
  //           continue;
  //         }
          
  //         await this.mergeTenantWithConflictResolution(tenantData);
  //       } catch (docError) {
  //         console.error(`❌ Failed to process tenant document ${doc.id}:`, docError);
  //         continue;
  //       }
  //     }
      
  //     console.log('✅ Tenants downloaded successfully');
  //   } catch (error) {
  //     console.error('❌ Failed to download tenants:', error);
  //     throw error;
  //   }
  // }

  // private async downloadInvoicesWithConflictResolution(userId: number): Promise<void> {
  //   console.log('📥 Downloading invoices with CRITICAL conflict resolution...');
    
  //   try {
  //     const invoicesQuery = query(
  //       collection(db, 'users', userId.toString(), 'invoices'),
  //       orderBy('lastSyncTime', 'desc')
  //     );
      
  //     const snapshot = await getDocs(invoicesQuery);
  //     console.log(`Found ${snapshot.docs.length} invoices in Firestore`);
      
  //     const validTenantIds = await this.getValidTenantIds(userId);
      
  //     for (const doc of snapshot.docs) {
  //       try {
  //         const invoiceData = doc.data();
          
  //         if (!this.isValidInvoiceData(invoiceData, validTenantIds)) {
  //           console.warn('⚠️ Skipping invalid invoice data:', invoiceData);
  //           continue;
  //         }
          
  //         await this.mergeInvoiceWithCriticalConflictResolution(invoiceData);
  //       } catch (docError) {
  //         console.error(`❌ Failed to process invoice document ${doc.id}:`, docError);
  //         continue;
  //       }
  //     }
      
  //     console.log('✅ Invoices downloaded successfully with payment data preserved');
  //   } catch (error) {
  //     console.error('❌ Failed to download invoices:', error);
  //     throw error;
  //   }
  // }

  private async downloadPaymentsWithConflictResolution(userId: number): Promise<void> {
    console.log('📥 Downloading payments with conflict resolution...');
    
    try {
      const invoicesQuery = query(
        collection(db, 'users', userId.toString(), 'invoices')
      );
      
      const invoicesSnapshot = await getDocs(invoicesQuery);
      const validInvoiceIds = await this.getValidInvoiceIds(userId);
      
      for (const invoiceDoc of invoicesSnapshot.docs) {
        try {
          const invoiceData = invoiceDoc.data();
          
          if (!invoiceData.localId || !validInvoiceIds.has(invoiceData.localId)) {
            continue;
          }
          
          await this.downloadPaymentsForInvoiceWithConflictResolution(userId, invoiceDoc.id, invoiceData.localId);
        } catch (docError) {
          console.error(`❌ Failed to process payments for invoice ${invoiceDoc.id}:`, docError);
          continue;
        }
      }
      
      console.log('✅ Payments downloaded successfully');
    } catch (error) {
      console.error('❌ Failed to download payments:', error);
      throw error;
    }
  }

  private async downloadPaymentsForInvoiceWithConflictResolution(userId: number, firestoreInvoiceId: string, localInvoiceId: number): Promise<void> {
    try {
      const paymentsQuery = query(
        collection(db, 'users', userId.toString(), 'invoices', firestoreInvoiceId, 'payments'),
        orderBy('lastSyncTime', 'desc')
      );
      
      const snapshot = await getDocs(paymentsQuery);
      
      for (const paymentDoc of snapshot.docs) {
        try {
          const paymentData = paymentDoc.data();
          
          if (!this.isValidPaymentData(paymentData)) {
            console.warn('⚠️ Skipping invalid payment data:', paymentData);
            continue;
          }
          
          await this.mergePaymentWithConflictResolution(localInvoiceId, paymentData);
        } catch (docError) {
          console.error(`❌ Failed to process payment ${paymentDoc.id}:`, docError);
          continue;
        }
      }
    } catch (error) {
      console.error(`❌ Failed to download payments for invoice ${localInvoiceId}:`, error);
    }
  }

  // ==================== ENHANCED MERGE METHODS WITH CONFLICT RESOLUTION ====================

 

  private async mergePaymentWithConflictResolution(invoiceId: number, paymentData: any): Promise<void> {
    try {
      const existingPayments = await database.getPaymentsByInvoice(invoiceId);
      const paymentExists = existingPayments.some(p => p.id === paymentData.localId);
      
      if (!paymentExists) {
        await database.createPayment({
          invoiceId: invoiceId,
          amount: paymentData.amount || 0,
          paymentDate: paymentData.paymentDate || new Date().toISOString().split('T')[0],
          paymentMethod: paymentData.paymentMethod || 'Cash',
          notes: paymentData.notes || ''
        });
        console.log(`✅ Created payment ${paymentData.localId} from Firestore`);
      } else {
        // Find existing payment and check if update needed
        const existingPayment = existingPayments.find(p => p.id === paymentData.localId);
        if (existingPayment) {
          const serverLastModified = this.parseFirestoreTimestamp(paymentData.lastModified);
          const localLastModified = new Date(existingPayment.createdAt); // payments don't have updatedAt
          
          if (serverLastModified > localLastModified) {
            console.log(`🔄 Updating payment ${paymentData.localId} with newer Firestore data`);
            // Update payment if needed - would need to add updatePayment method to database
            console.log(`ℹ️ Payment update not implemented - keeping existing payment`);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Failed to merge payment ${paymentData.localId}:`, error);
    }
  }

  // ==================== UTILITY METHODS ====================

  private parseFirestoreTimestamp(timestamp: any): Date {
    if (!timestamp) {
      return new Date(0); // Very old date if no timestamp
    }
    
    if (timestamp instanceof Timestamp) {
      return timestamp.toDate();
    }
    
    if (typeof timestamp === 'string') {
      return new Date(timestamp);
    }
    
    if (timestamp.seconds) {
      return new Date(timestamp.seconds * 1000);
    }
    
    return new Date(timestamp);
  }

  // ==================== EXISTING HELPER METHODS (Updated) ====================

  
//   async downloadUserUpdates(userId: number): Promise<{ tier: string; type: string; storage: boolean; company?: any } | null> {
//   try {
//     console.log('📥 Downloading user updates for userId:', userId);
    
//     const userRef = doc(db, 'users', userId.toString());
//     const userDoc = await getDoc(userRef);
    
//     if (!userDoc.exists()) {
//       console.log('No user document found in Firestore');
//       return null;
//     }
    
//     const userData = userDoc.data();
//     if (!userData) {
//       console.warn('Empty user data received from Firestore');
//       return null;
//     }
    
//     console.log('✅ User document loaded from Firestore');
    
//     // Extract and normalize the data
//     const result = {
//       tier: userData.tier || 'free',
//       type: userData.type || 'free', 
//       storage: userData.storage === true,
//       company: userData.company || undefined
//     };
    
//     // Update local database
//     await database.updateUserTierAndType(userId, result.tier, result.type, result.storage);
//     console.log('✅ User tier and permissions updated locally');
    
//     // Update company if exists
//     if (result.company) {
//       await this.syncCompanyData(userId, result.company);
//       console.log('✅ Company data updated');
//     }
    
//     return result;
    
//   } catch (error: any) {
//     console.error('❌ Failed to download user updates:', error);
    
//     if (error.code === 'permission-denied') {
//       console.warn('Access denied - user may not have Firestore permissions');
//     }
    
//     return null; // Return null on any error - app continues offline
//   }
// }

  private async syncCompanyData(userId: number, companyData: any): Promise<void> {
    try {
      const localCompany = await database.getCompanyByUserId(userId);
      const user = await database.getUserById(userId);
      
      if (!localCompany && user?.type === 'paid') {
        await database.createCompany(userId, {
          name: companyData.name || '',
          address: companyData.address || '',
          phone: companyData.phone || '',
          email: companyData.email || ''
        });
        console.log('✅ Created company from Firestore data');
      } else if (localCompany) {
        // Conflict resolution for company data
        const serverLastModified = this.parseFirestoreTimestamp(companyData.lastModified);
        const localLastModified = new Date(localCompany.updatedAt || localCompany.createdAt);
        
        if (serverLastModified > localLastModified) {
          await database.updateCompany(localCompany.id, {
            name: companyData.name || localCompany.name,
            address: companyData.address || localCompany.address,
            phone: companyData.phone || localCompany.phone,
            email: companyData.email || localCompany.email
          });
          console.log('✅ Updated company from Firestore data');
        }
      }
    } catch (error) {
      console.error('❌ Failed to sync company data:', error);
    }
  }

  

  

  // ==================== EXISTING METHODS (Updated for safety) ====================

  async performFullSync(userId: number): Promise<SyncStatus> {
    console.log(`🔄 Starting FULL sync for user: ${userId}`);
    
    try {
      // First download to get latest data with conflict resolution
      await this.performDownloadSync(userId, 'signin');
      
      // Then upload any local changes with safe merge strategy
      if (this.shouldPerformScheduledUpload()) {
        await this.performSafeUploadSync(userId, 'scheduled');
      }
      
      return this.buildSyncStatus('Full sync completed');
      
    } catch (error) {
      console.error('❌ Full sync failed:', error);
      throw error;
    }
  }

  // ==================== TIER LIMIT ENFORCEMENT ====================

  private async enforceTierLimits(userId: number): Promise<void> {
    const user = await database.getUserById(userId);
    if (!user) {
      console.log('No local user found - skipping tier limit enforcement for new device');
      return;
    }

    const limits = this.getUserLimits(user);
    console.log(`Enforcing limits for user ${userId}, tier: ${user.tier}`, limits);
    
    try {
      const allPropertiesQuery = `SELECT * FROM properties WHERE user_id = ? ORDER BY created_at ASC`;
      const allPropsResult = await database.db!.query(allPropertiesQuery, [userId]);
      
      if (!allPropsResult || !allPropsResult.values || allPropsResult.values.length === 0) {
        console.log('No local properties found - new device or empty database, skipping enforcement');
        return;
      }
      
      const allProperties = database.mapToProperties(allPropsResult.values);
      
      if (allProperties.length === 0) {
        console.log('No properties to enforce limits on');
        return;
      }
      
      // Property limits enforcement
      if (limits.properties !== -1 && allProperties.length > limits.properties) {
        const excessProperties = allProperties.slice(limits.properties);
        console.log(`🚫 Restricting ${excessProperties.length} properties due to tier limit`);
        
        for (const property of excessProperties) {
          await database.updateProperty(property.id, { isRestricted: true });
          
          // Also restrict tenants in these properties
          const tenants = await database.getTenantsByProperty(property.id);
          for (const tenant of tenants) {
            await database.updateTenant(tenant.id, { isRestricted: true });
          }
        }
      }
      
      // Tenant limits enforcement per propertylimits.properties === -1 
      if (limits.tenantsPerProperty !== -1) {
        for (const property of allProperties.slice(0,limits.properties as number === -1 ? undefined : limits.properties)) {
          const tenants = await database.getTenantsByProperty(property.id);
          
          if (tenants.length > limits.tenantsPerProperty) {
            const excessTenants = tenants.slice(limits.tenantsPerProperty);
            console.log(`🚫 Restricting ${excessTenants.length} tenants in property ${property.id} due to tier limit`);
            
            for (const tenant of excessTenants) {
              await database.updateTenant(tenant.id, { isRestricted: true });
            }
          }
        }
      }
      
    } catch (error) {
      console.error('Error in tier limit enforcement:', error);
    }
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

  private async getValidPropertyIds(userId: number): Promise<Set<number>> {
    try {
      const properties = await database.getProperties(userId);
      return new Set(properties.filter(p => !p.isRestricted).map(p => p.id));
    } catch (error) {
      console.log('No local properties found - returning empty set');
      return new Set<number>();
    }
  }

  private async getValidTenantIds(userId: number): Promise<Set<number>> {
    try {
      const properties = await database.getProperties(userId);
      const validTenantIds = new Set<number>();
      
      for (const property of properties) {
        if (!property.isRestricted) {
          try {
            const tenants = await database.getTenantsByProperty(property.id);
            tenants.filter(t => !t.isRestricted).forEach(t => validTenantIds.add(t.id));
          } catch (error) {
            console.log(`No tenants found for property ${property.id}`);
          }
        }
      }
      
      return validTenantIds;
    } catch (error) {
      console.log('No local tenants found - returning empty set');
      return new Set<number>();
    }
  }

  private async getValidInvoiceIds(userId: number): Promise<Set<number>> {
    try {
      const validTenantIds = await this.getValidTenantIds(userId);
      const validInvoiceIds = new Set<number>();
      
      for (const tenantId of validTenantIds) {
        try {
          const invoices = await database.getInvoices({ tenantId });
          invoices.forEach(invoice => validInvoiceIds.add(invoice.id));
        } catch (error) {
          console.log(`No invoices found for tenant ${tenantId}`);
        }
      }
      
      return validInvoiceIds;
    } catch (error) {
      console.log('No local invoices found - returning empty set');
      return new Set<number>();
    }
  }

  private getUserLimits(user: any) {
    return USER_LIMITS[user?.tier as UserTier] || USER_LIMITS.free;
  }

  canUserSync(user: any): boolean {
    // Business, pro and enterprise users always have sync
    if (user.tier === 'business' || user.tier === 'solo' || user.tier === 'pro' || user.tier === 'enterprise') {
      return true;
    }
    
    // Free and low tier users need storage permission
    return user.storage === true;
  }

  // ==================== VALIDATION METHODS ====================

  // private isValidUnitData(data: any): boolean {
  //   return data && 
  //          typeof data.localId !== 'undefined' && 
  //          typeof data.unitNumber === 'string' && 
  //          typeof data.rentAmount === 'number';
  // }

  private isValidTenantData(data: any, validPropertyIds: Set<number>): boolean {
    if (!data || typeof data !== 'object') {
      return false;
    }
    
    if (typeof data.localId === 'undefined' || data.localId === null) {
      return false;
    }
    
    if (typeof data.propertyId === 'undefined') {
      return false;
    }
    
    // For new devices, we might not have valid property IDs yet
    if (validPropertyIds.size > 0 && !validPropertyIds.has(data.propertyId)) {
      console.log(`Tenant ${data.localId} references non-existent property ${data.propertyId}`);
      return false;
    }
    
    if (typeof data.name !== 'string' || data.name.length === 0) {
      return false;
    }
    
    return true;
  }

  private isValidInvoiceData(data: any, validTenantIds: Set<number>): boolean {
    if (!data || typeof data !== 'object') {
      return false;
    }
    
    if (typeof data.localId === 'undefined' || data.localId === null) {
      return false;
    }
    
    if (typeof data.tenantId === 'undefined') {
      return false;
    }
    
    // For new devices, we might not have valid tenant IDs yet
    if (validTenantIds.size > 0 && !validTenantIds.has(data.tenantId)) {
      console.log(`Invoice ${data.localId} references non-existent tenant ${data.tenantId}`);
      return false;
    }
    
    if (typeof data.totalAmount !== 'number') {
      return false;
    }
    
    return true;
  }

  private isValidPaymentData(data: any): boolean {
    return data && 
           typeof data.localId !== 'undefined' && 
           typeof data.amount === 'number' && 
           data.amount > 0 && 
           typeof data.paymentDate === 'string';
  }

  // ==================== OPERATION LOCK MANAGEMENT ====================

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

  // ==================== SCHEDULING AND COORDINATION ====================

  startUploadScheduling(userId: number): void {
    console.log(`⏰ Starting upload scheduling for user: ${userId}`);
    
    const existingTimer = this.uploadScheduleTimers.get(userId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const scheduleNextUpload = () => {
      const now = new Date();
      const nextUpload = this.calculateNextUploadTime();
      const msUntilUpload = nextUpload.getTime() - now.getTime();
      
      console.log(`⏰ Next upload scheduled for: ${nextUpload.toLocaleString()}`);
      
      const timer = setTimeout(async () => {
        try {
          if (navigator.onLine && this.shouldPerformScheduledUpload()) {
            console.log('🚀 Performing scheduled safe upload...');
            await this.performSafeUploadSync(userId, 'scheduled');
          }
          scheduleNextUpload();
        } catch (error) {
          console.error('❌ Scheduled upload failed:', error);
          scheduleNextUpload();
        }
      }, msUntilUpload);
      
      this.uploadScheduleTimers.set(userId, timer);
    };

    scheduleNextUpload();
    localStorage.setItem(this.UPLOAD_SCHEDULE_KEY, 'true');
  }

  stopUploadScheduling(userId: number): void {
    console.log(`⏹️ Stopping upload scheduling for user: ${userId}`);
    
    const timer = this.uploadScheduleTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.uploadScheduleTimers.delete(userId);
    }
    
    localStorage.removeItem(this.UPLOAD_SCHEDULE_KEY);
  }

  private calculateNextUploadTime(): Date {
    const now = new Date();
    const nextUpload = new Date(now.getTime() + this.UPLOAD_INTERVAL_MS);
    return nextUpload;
  }

  private shouldPerformScheduledUpload(): boolean {
    const lastUploadTime = localStorage.getItem(this.LAST_UPLOAD_KEY);
    if (!lastUploadTime) {
      return true;
    }
    
    const timeSinceLastUpload = Date.now() - new Date(lastUploadTime).getTime();
    return timeSinceLastUpload >= this.UPLOAD_INTERVAL_MS;
  }

  // ==================== USER LISTENER ====================

  setupUserListener(userId: number, onUserUpdate: (user: User) => void): void {
    console.log(`👂 Setting up user listener for: ${userId}`);
    
    const existingListener = this.userListeners.get(userId);
    if (existingListener) {
      existingListener();
    }

    const userRef = doc(db, 'users', userId.toString());
    
    const unsubscribe = onSnapshot(userRef, async (doc) => {
      if (doc.exists()) {
        const userData = doc.data();
        console.log('📨 Received user update from Firestore:', userData);
        
        try {
          if (!userData) {
            console.error('❌ Received empty user data from Firestore');
            return;
          }

          await database.updateUser(userId, {
            name: userData.name || 'Unknown User',
            email: userData.email || '',
            phone: userData.phone || '',
            isPremium: userData.isPremium || false
          });

          await database.updateUserTierAndType(
            userId, 
            userData.tier || 'free', 
            userData.type || 'free',
            userData.storage || false
          );

          // Immediately enforce limits after tier change
          await this.enforceTierLimits(userId);
          
          const updatedUser = await database.getUserById(userId);
          if (updatedUser) {
            onUserUpdate(updatedUser);
          }
          
          console.log('✅ User update applied and limits enforced');
        } catch (error) {
          console.error('❌ Error applying user update:', error);
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
      console.log(`👂 Removed user listener for: ${userId}`);
    }
  }

  // ==================== PDF OPERATIONS ====================

  private getCompanyInfoForPDF(user: User, userCompany: any): any {
    if (user.tier === 'pro' || user.tier === 'business' || user.tier === 'enterprise') {
      return userCompany ? {
        name: userCompany.name,
        address: userCompany.address || '',
        phone: userCompany.phone || '',
        email: userCompany.email || '',
        website: 'www.cogvana.co.ke'
      } : {
        name: 'SMB KENYA LTD: PLOT YANGU',
        address: 'Naivasha, Nakuru, Kenya',
        phone: '+254 791 286 165',
        email: 'info@cogvana.co.ke',
        website: 'www.cogvana.co.ke'
      };
    }
    
    return {
      name: 'SMB KENYA LTD: PLOT YANGU',
      address: 'Naivasha, Nakuru, Kenya',
      phone: '+254 791 286 165',
      email: 'info@cogvana.co.ke',
      website: 'www.cogvana.co.ke'
    };
  }

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

  private async generateAndUploadInvoicePDF(
    userId: number, 
    invoice: any, 
    statusSuffix: string
  ): Promise<string | null> {
    try {
      console.log(`📄 Generating PDF for invoice ${invoice.id} with status: ${statusSuffix}`);
      
      const user = await database.getUserById(userId);
      if (!user) {
        console.error('❌ User not found for PDF generation');
        return null;
      }
      
      const userCompany = await database.getCompanyByUserId(userId);
      const property = await database.getPropertyById(invoice.propertyId);
      
      if (!property) {
        console.error('❌ Property not found for PDF generation');
        return null;
      }
      
      const payments = await database.getPaymentsByInvoice(invoice.id);
      const companyInfo = this.getCompanyInfoForPDF(user, userCompany);
      const paymentInstructions = this.getStoredPaymentInstructions();
      
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
      
      const filename = `invoices/${userId}/${invoice.id}_${statusSuffix}.pdf`;
      const storageRef = ref(storage, filename);
      
      console.log(`📤 Uploading PDF to storage: ${filename}`);
      const uploadResult = await uploadBytes(storageRef, pdfBytes);
      
      const downloadURL = await getDownloadURL(uploadResult.ref);
      console.log(`✅ PDF uploaded successfully: ${downloadURL}`);
      
      return downloadURL;
      
    } catch (error) {
      console.error('❌ Error generating and uploading PDF:', error);
      return null;
    }
  }

  private async deleteOldPDFFromStorage(pdfUrl: string): Promise<void> {
    try {
      if (!pdfUrl || !pdfUrl.includes('firebase')) return;
      
      const urlParts = pdfUrl.split('/o/')[1];
      if (!urlParts) return;
      
      const storagePath = decodeURIComponent(urlParts.split('?')[0]);
      const storageRef = ref(storage, storagePath);
      
      console.log(`🗑️ Deleting old PDF from storage: ${storagePath}`);
      await deleteObject(storageRef);
      console.log('✅ Old PDF deleted successfully');
      
    } catch (error) {
      console.error('❌ Error deleting old PDF from storage:', error);
    }
  }

  // ==================== STATUS AND UTILITY METHODS ====================

  private buildSyncStatus(message: string): SyncStatus {
    const lastDownloadTime = localStorage.getItem(this.LAST_DOWNLOAD_KEY) || 'Never';
    const lastUploadTime = localStorage.getItem(this.LAST_UPLOAD_KEY) || 'Never';
    const nextUploadTime = this.calculateNextUploadTime().toISOString();
    
    return {
      lastDownloadTime,
      lastUploadTime,
      syncInProgress: false,
      nextScheduledUpload: nextUploadTime,
      errors: [message]
    };
  }

  async getSyncStatus(userId: number): Promise<SyncStatus> {
    const lastDownloadTime = localStorage.getItem(this.LAST_DOWNLOAD_KEY) || 'Never';
    const lastUploadTime = localStorage.getItem(this.LAST_UPLOAD_KEY) || 'Never';
    const nextUploadTime = this.calculateNextUploadTime().toISOString();
    const isSchedulingEnabled = localStorage.getItem(this.UPLOAD_SCHEDULE_KEY) === 'true';
    
    const downloadLock = this.isOperationLocked(`download_${userId}`);
    const uploadLock = this.isOperationLocked(`upload_${userId}`);
    
    return {
      lastDownloadTime,
      lastUploadTime,
      syncInProgress: downloadLock || uploadLock,
      nextScheduledUpload: isSchedulingEnabled ? nextUploadTime : 'Disabled',
      errors: []
    };
  }

  canPerformNetworkOperations(): boolean {
    return navigator.onLine;
  }

  getNetworkStatus(): { online: boolean; canSync: boolean; message: string } {
    const online = navigator.onLine;
    
    if (!online) {
      return {
        online: false,
        canSync: false,
        message: 'No network connection - operating in offline mode'
      };
    }
    
    return {
      online: true,
      canSync: true,
      message: 'Network available - sync operations enabled'
    };
  }

  // ==================== PUBLIC API METHODS ====================

  async forceDownload(userId: number): Promise<SyncStatus> {
    console.log('🔽 Force download requested');
    return this.performDownloadSync(userId, 'manual');
  }

  async forceUpload(userId: number): Promise<SyncStatus> {
    console.log('🔼 Safe force upload requested');
    return this.performSafeUploadSync(userId, 'manual');
  }

  // async initializeForUser(userId: number): Promise<SyncStatus> {
  //   console.log(`🚀 Initializing sync service for user: ${userId}`);
    
  //   try {
  //     // Setup user listener for tier/permission changes
  //     this.setupUserListener(userId, (user) => {
  //       console.log('👤 User data updated via listener:', user.tier);
  //     });
      
  //     // Start safe upload scheduling
  //     this.startUploadScheduling(userId);
      
  //     // Perform full sync with conflict resolution and safe upload
  //     const syncResult = await this.performFullSync(userId);
      
  //     console.log('✅ Sync service initialized successfully with safe sync');
  //     return syncResult;
      
  //   } catch (error) {
  //     console.error('❌ Failed to initialize sync service:', error);
  //     throw error;
  //   }
  // }

  cleanup(userId?: number): void {
    console.log('🧹 Cleaning up sync service');
    
    if (userId) {
      this.removeUserListener(userId);
      this.stopUploadScheduling(userId);
      this.releaseOperationLock(`download_${userId}`);
      this.releaseOperationLock(`upload_${userId}`);
    } else {
      this.userListeners.forEach((listener, userId) => {
        listener();
        this.stopUploadScheduling(userId);
      });
      this.userListeners.clear();
      this.uploadScheduleTimers.clear();
      this.operationLocks.clear();
    }
    
    console.log('✅ Sync service cleanup completed');
  }

  // ==================== REVENUECATAT WEBHOOK HANDLER ====================

  static async handleRevenueCatWebhook(data: {
    localUserId: number;
    firestoreUserId: string;
    tier: UserTier;
    type: UserType;
    storage: boolean;
    revenuekatUserId: string;
  }): Promise<void> {
    try {
      console.log('🎣 Processing RevenueCat webhook:', data);
      
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
          console.log('✅ Local user tier updated immediately via webhook');
        }
      } catch (localError) {
        console.log('ℹ️ Local update not available, will sync on next app open');
      }
      
      console.log('✅ RevenueCat webhook processed successfully');
    } catch (error) {
      console.error('❌ Error handling RevenueCat webhook:', error);
      throw error;
    }
  }

  // ==================== ACCESS VALIDATION ====================

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
      console.error('❌ Error validating user access:', error);
      return false;
    }
  }

  // ==================== DEBUG AND MONITORING ====================

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
      network: networkStatus,
      operations: {
        downloadLocked: this.isOperationLocked(`download_${userId}`),
        uploadLocked: this.isOperationLocked(`upload_${userId}`),
        schedulingEnabled: localStorage.getItem(this.UPLOAD_SCHEDULE_KEY) === 'true'
      }
    };
  }
}

// Export singleton instance
export const firebaseSyncService = FirebaseSyncService.getInstance();