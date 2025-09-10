// services/sync/FirebaseSyncService.ts - COMPLETE REDESIGN
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
  onSnapshot,
  type Unsubscribe} from 'firebase/firestore';
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from 'firebase/storage';
import { database } from '../database/Database';
import { generateInvoicePDF } from '../pdf/PDFService';
import type { User, Property, Tenant, InvoiceInput } from '../database/Database';

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

class BatchManager {
  private batches: any[] = [];
  private currentBatch: any;
  private operationCount = 0;
  private readonly MAX_BATCH_SIZE = 450;

  constructor() {
    this.currentBatch = writeBatch(db);
  }

  addOperation(operation: (batch: any) => void, description: string): void {
    if (this.operationCount >= this.MAX_BATCH_SIZE) {
      this.batches.push(this.currentBatch);
      this.currentBatch = writeBatch(db);
      this.operationCount = 0;
    }
    
    operation(this.currentBatch);
    this.operationCount++;
    console.log(`➕ Added to batch: ${description} (${this.operationCount}/${this.MAX_BATCH_SIZE})`);
  }

  async commitAll(): Promise<void> {
    // Add current batch if it has operations
    if (this.operationCount > 0) {
      this.batches.push(this.currentBatch);
    }

    console.log(`🚀 Executing ${this.batches.length} batch(es)...`);
    
    for (let i = 0; i < this.batches.length; i++) {
      await this.batches[i].commit();
      console.log(`✅ Batch ${i + 1}/${this.batches.length} committed`);
    }
  }
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

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
    tenantsPerProperty: 18, 
    totalTenants: 75,
    storage: false 
  },
  business: { 
    properties: 10, 
    tenantsPerProperty: 23, 
    totalTenants: 230,
    storage: true 
  },
  pro: { 
    properties: 20, 
    tenantsPerProperty: 26, 
    totalTenants: 500,
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
export type UserTier = 'free' | 'low' | 'business' | 'pro' | 'enterprise';

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
  
  // Sync state management
  private operationLocks = new Map<string, boolean>();
  private userListeners = new Map<number, Unsubscribe>();
  private uploadScheduleTimers = new Map<number, NodeJS.Timeout>();
  
  // Constants
  //private readonly UPLOAD_INTERVAL_HOURS = 12;
  private readonly UPLOAD_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
  private readonly OPERATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  
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

  // ==================== CORE SYNC OPERATIONS ====================

  /**
   * DOWNLOAD ONLY - Triggered by sign-in or manual force download
   * Downloads and merges Firestore data into local database
   */
  async performDownloadSync(userId: number, source: 'signin' | 'manual' = 'manual'): Promise<SyncStatus> {
    const lockKey = `download_${userId}`;
    
    if (this.isOperationLocked(lockKey)) {
      throw new Error('Download already in progress');
    }

    console.log(`🔽 Starting DOWNLOAD sync (${source}) for user: ${userId}`);
    
    try {
      await this.acquireOperationLock(lockKey);
      
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

      // STEP 1: Download user updates first (tier changes, etc.)
      await this.downloadUserUpdates(userId);

      // STEP 2: Download and merge all data in proper dependency order
      await this.downloadAllData(userId);

      // STEP 3: Enforce tier limits after download
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

  /**
   * UPLOAD ONLY - Scheduled every 12 hours or manual force upload
   * Uploads local data to Firestore with critical delete strategy
   */
  async performUploadSync(userId: number, source: 'scheduled' | 'manual' = 'manual'): Promise<SyncStatus> {
    const lockKey = `upload_${userId}`;
    
    if (this.isOperationLocked(lockKey)) {
      throw new Error('Upload already in progress');
    }

    console.log(`🔼 Starting UPLOAD sync (${source}) for user: ${userId}`);
    
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

      // UPLOAD: Use local data as authoritative source
      await this.uploadAllDataWithCriticalDelete(userId);

      const now = new Date().toISOString();
      localStorage.setItem(this.LAST_UPLOAD_KEY, now);
      
      console.log('✅ Upload sync completed successfully');
      
      return this.buildSyncStatus('Upload completed');
      
    } catch (error) {
      console.error('❌ Upload sync failed:', error);
      throw error;
    } finally {
      this.releaseOperationLock(lockKey);
    }
  }

  /**
   * FULL SYNC - Download then Upload (used for sign-in)
   */
  async performFullSync(userId: number): Promise<SyncStatus> {
    console.log(`🔄 Starting FULL sync for user: ${userId}`);
    
    try {
      // First download to get latest data
      await this.performDownloadSync(userId, 'signin');
      
      // Then upload any local changes (if upload is due)
      if (this.shouldPerformScheduledUpload()) {
        await this.performUploadSync(userId, 'scheduled');
      }
      
      return this.buildSyncStatus('Full sync completed');
      
    } catch (error) {
      console.error('❌ Full sync failed:', error);
      throw error;
    }
  }

  // Fixed downloadProperties method with proper error handling and data validation

private async downloadProperties(userId: number): Promise<void> {
  console.log('📥 Downloading properties...');
  
  try {
    const propertiesQuery = query(
      collection(db, 'users', userId.toString(), 'properties'),
      orderBy('lastSyncTime', 'desc')
    );
    
    const snapshot = await getDocs(propertiesQuery);
    console.log(`Found ${snapshot.docs.length} properties in Firestore`);
    
    // Check if snapshot exists and has docs
    if (!snapshot || !snapshot.docs) {
      console.log('No properties found in Firestore for user:', userId);
      return;
    }
    
    for (const doc of snapshot.docs) {
      try {
        const propertyData = doc.data();
        
        // Add comprehensive data validation
        if (!propertyData) {
          console.warn('⚠️ Empty property data for document:', doc.id);
          continue;
        }
        
        // if (!this.isValidPropertyData(propertyData)) {
        //   console.warn('⚠️ Skipping invalid property data:', propertyData);
        //   continue;
        // }
        
        await this.mergeProperty(userId, propertyData);
        
        // Only try to download units if property merge was successful
        if (propertyData.localId) {
          await this.downloadUnitsForProperty(userId, doc.id, propertyData.localId);
        }
      } catch (docError) {
        console.error(`❌ Failed to process property document ${doc.id}:`, docError);
        // Continue with other properties instead of failing completely
        continue;
      }
    }
    
    console.log('✅ Properties downloaded successfully');
  } catch (error:any) {
    console.error('❌ Failed to download properties:', error);
    // Don't throw here - let the caller handle the error
    throw new Error(`Properties download failed: ${error.message || 'Unknown error'}`);
  }
}

// Also fix the downloadUserUpdates method to handle missing data gracefully
async downloadUserUpdates(userId: number): Promise<void> {
  try {
    console.log('📥 Downloading user updates...');
    
    const userRef = doc(db, 'users', userId.toString());
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.log('No user document found in Firestore for userId:', userId);
      return;
    }
    
    const userData = userDoc.data();
    
    // Enhanced validation with multiple checks
    if (!userData || typeof userData !== 'object') {
      console.warn('⚠️ Invalid or empty user data received from Firestore:', userData);
      return;
    }
    
    // Log successful data retrieval
    console.log('✅ User document loaded from Firestore');
    
    // Update tier and type if changed (with defaults)
    const tier = userData.tier || 'free';
    const type = userData.type || 'free';
    const storage = userData.storage !== undefined ? userData.storage : false;
    
    if (userData.tier || userData.type || userData.storage !== undefined) {
      await database.updateUserTierAndType(userId, tier, type, storage);
      console.log('✅ User tier and permissions updated');
    }
    
    // Update company data if exists and is valid
    if (userData.company && 
        typeof userData.company === 'object' && 
        userData.company !== null) {
      await this.syncCompanyData(userId, userData.company);
    }
    
    // Handle properties field if it exists (legacy format) - FIXED
    // if (userData.properties && 
    //     typeof userData.properties === 'object' && 
    //     userData.properties !== null) {
    //   console.log('Found legacy properties field in user document');
      
    //   // Only process if properties has actual data
    //   try {
    //     // Check if properties object has any actual property data
    //     const propertiesKeys = Object.keys(userData.properties);
    //     if (propertiesKeys.length > 0) {
    //       console.log(`Processing ${propertiesKeys.length} legacy properties`);
    //       // Add your legacy property processing logic here if needed
    //       // For now, just log that we found them
    //     }
    //   } catch (propertiesError) {
    //     console.error('❌ Error processing legacy properties:', propertiesError);
    //     // Don't throw - continue with sync
    //   }
    // }
    
  } catch (error: any) {
    console.error('❌ Failed to download user updates:', error);
    
    // Provide more specific error messages
    if (error.code === 'permission-denied') {
      throw new Error(`User updates download failed: Access denied for user ${userId}`);
    } else if (error.code === 'unavailable') {
      //throw new Error(`User updates download failed: Firestore service unavailable`);
    } else {
      //throw new Error(`User updates download failed: ${error.message || 'Unknown error'}`);
    }
  }
}

// Enhanced validation method
// private isValidPropertyData(data: any): boolean {
//   if (!data || typeof data !== 'object') {
//     console.warn('Property data is not an object:', data);
//     return false;
//   }
  
//   if (typeof data.localId === 'undefined' || data.localId === null) {
//     console.warn('Property data missing localId:', data);
//     return false;
//   }
  
//   if (typeof data.name !== 'string' || data.name.length === 0) {
//     console.warn('Property data missing or invalid name:', data);
//     return false;
//   }
  
//   return true;
// }

// Add error boundaries to the main download method
private async downloadAllData(userId: number): Promise<void> {
  console.log('📥 Downloading all data in proper order...');
  
  const errors: string[] = [];
  
  try {
    // STEP 1: Properties and Units
    try {
      await this.downloadProperties(userId);
    } catch (error: any) {
      errors.push(`Properties: ${error.message}`);
      console.error('❌ Properties download failed, continuing with other data');
    }
    
    // STEP 2: Tenants (depends on properties)
    try {
      await this.downloadTenants(userId);
    } catch (error: any) {
      errors.push(`Tenants: ${error.message}`);
      console.error('❌ Tenants download failed, continuing with other data');
    }
    
    // STEP 3: Invoices (depends on tenants)
    try {
      await this.downloadInvoices(userId);
    } catch (error: any) {
      errors.push(`Invoices: ${error.message}`);
      console.error('❌ Invoices download failed, continuing with other data');
    }
    
    // STEP 4: Payments (depends on invoices)
    try {
      await this.downloadPayments(userId);
    } catch (error: any) {
      errors.push(`Payments: ${error.message}`);
      console.error('❌ Payments download failed');
    }
    
    if (errors.length > 0) {
      console.warn('⚠️ Some data downloads failed:', errors);
      // Don't throw error here - partial sync is better than no sync
    } else {
      console.log('✅ All data downloaded successfully');
    }
  } catch (error) {
    console.error('❌ Failed to download all data:', error);
    throw new Error(`Data download failed: ${errors.join(', ')}`);
  }
}

// Fixed methods to handle new device scenarios where local database is empty

private async enforceTierLimits(userId: number): Promise<void> {
  const user = await database.getUserById(userId);
  if (!user) {
    console.log('No local user found - skipping tier limit enforcement for new device');
    return;
  }

  const limits = this.getUserLimits(user);
  console.log(`Enforcing limits for user ${userId}, tier: ${user.tier}`, limits);
  
  try {
    // Get ALL properties (including restricted ones) for limit calculation
    const allPropertiesQuery = `SELECT * FROM properties WHERE user_id = ? ORDER BY created_at ASC`;
    const allPropsResult = await database.db!.query(allPropertiesQuery, [userId]);
    
    // Handle new device case - no local data yet
    if (!allPropsResult || !allPropsResult.values || allPropsResult.values.length === 0) {
      console.log('No local properties found - new device or empty database, skipping enforcement');
      return;
    }
    
    const allProperties = database.mapToProperties(allPropsResult.values);
    
    // Rest of enforcement logic only runs if we have local data
    if (allProperties.length === 0) {
      console.log('No properties to enforce limits on');
      return;
    }
    
    // Continue with existing enforcement logic...
    if (limits.properties !== -1 && allProperties.length > limits.properties) {
      // ... existing enforcement code
    }
    
  } catch (error) {
    console.error('Error in tier limit enforcement:', error);
    // Don't throw - allow sync to continue even if enforcement fails
  }
}

// Fixed merge methods to handle creating from scratch
private async mergeProperty(userId: number, propertyData: any): Promise<void> {
  try {
    // Check if property exists locally first
    let localProperty = null;
    try {
      localProperty = await database.getPropertyById(propertyData.localId);
    } catch (error) {
      console.log('Property not found locally, will create new one');
      localProperty = null;
    }
    
    if (!localProperty) {
      // NEW DEVICE: Create property from Firestore data
      console.log(`Creating property ${propertyData.localId} from Firestore backup`);
      
      // Check if user can create properties (tier limits)
      const canCreate = await database.canCreateProperty?.(userId);
      if (canCreate?.allowed !== false) {
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
        console.log(`Created property ${propertyData.localId} from backup`);
      } else {
        console.log(`Cannot create property ${propertyData.localId} - tier limit reached`);
      }
    } else if (!localProperty.isRestricted) {
      // Update existing property
      await database.updateProperty(propertyData.localId, {
        name: propertyData.name || localProperty.name,
        address: propertyData.address || localProperty.address,
        description: propertyData.description || localProperty.description,
        image: propertyData.image || localProperty.image,
        agentCommissionRate: propertyData.agentCommissionRate !== undefined ? 
          propertyData.agentCommissionRate : localProperty.agentCommissionRate,
        maxUnits: propertyData.maxUnits || localProperty.maxUnits
      });
      console.log(`Updated property ${propertyData.localId} from Firestore`);
    }
  } catch (error) {
    console.error(`Failed to merge property ${propertyData.localId}:`, error);
    // Don't throw - continue with other properties
  }
}

private async mergeTenant(tenantData: any): Promise<void> {
  try {
    // Check if tenant exists locally
    let localTenant = null;
    try {
      localTenant = await database.getTenantById(tenantData.localId);
    } catch (error) {
      console.log('Tenant not found locally, will create new one');
      localTenant = null;
    }
    
    if (!localTenant) {
      // NEW DEVICE: Create tenant from Firestore data
      console.log(`Creating tenant ${tenantData.localId} from Firestore backup`);
      
      await database.createTenant({
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
      console.log(`Created tenant ${tenantData.localId} from backup`);
    } else if (!localTenant.isRestricted) {
      // Update existing tenant
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
      console.log(`Updated tenant ${tenantData.localId} from Firestore`);
    }
  } catch (error) {
    console.error(`Failed to merge tenant ${tenantData.localId}:`, error);
    // Don't throw - continue with other tenants
  }
}

// Fixed helper methods to handle empty database
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

// Enhanced validation that doesn't require local data
private isValidTenantData(data: any, validPropertyIds: Set<number>): boolean {
  if (!data || typeof data !== 'object') {
    return false;
  }
  
  // if (typeof data.localId === 'undefined' || data.localId === null) {
  //   return false;
  // }
  
  if (typeof data.propertyId === 'undefined') {
    return false;
  }
  
  // For new devices, we might not have valid property IDs yet
  // So we allow the tenant if validPropertyIds is empty (new device scenario)
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
  
  // if (typeof data.localId === 'undefined' || data.localId === null) {
  //   return false;
  // }
  
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

  // ==================== DOWNLOAD OPERATIONS ====================

  private async downloadUnitsForProperty(userId: number, firestorePropertyId: string, localPropertyId: number): Promise<void> {
    try {
      const unitsQuery = query(
        collection(db, 'users', userId.toString(), 'properties', firestorePropertyId, 'units'),
        orderBy('lastSyncTime', 'desc')
      );
      
      const snapshot = await getDocs(unitsQuery);
      
      for (const unitDoc of snapshot.docs) {
        const unitData = unitDoc.data();
        
        if (!this.isValidUnitData(unitData)) {
          console.warn('⚠️ Skipping invalid unit data:', unitData);
          continue;
        }
        
        await this.mergeUnit(localPropertyId, unitData);
      }
    } catch (error) {
      console.error(`❌ Failed to download units for property ${localPropertyId}:`, error);
    }
  }

  private async downloadTenants(userId: number): Promise<void> {
    console.log('📥 Downloading tenants...');
    
    try {
      const tenantsQuery = query(
        collection(db, 'users', userId.toString(), 'tenants'),
        orderBy('lastSyncTime', 'desc')
      );
      
      const snapshot = await getDocs(tenantsQuery);
      console.log(`Found ${snapshot.docs.length} tenants in Firestore`);
      
      // Get valid property IDs for validation
      const validPropertyIds = await this.getValidPropertyIds(userId);
      
      for (const doc of snapshot.docs) {
        const tenantData = doc.data();
        
        if (!this.isValidTenantData(tenantData, validPropertyIds)) {
          console.warn('⚠️ Skipping invalid tenant data:', tenantData);
          continue;
        }
        
        await this.mergeTenant(tenantData);
      }
      
      console.log('✅ Tenants downloaded successfully');
    } catch (error) {
      console.error('❌ Failed to download tenants:', error);
      throw error;
    }
  }

  private async downloadInvoices(userId: number): Promise<void> {
    console.log('📥 Downloading invoices...');
    
    try {
      const invoicesQuery = query(
        collection(db, 'users', userId.toString(), 'invoices'),
        orderBy('lastSyncTime', 'desc')
      );
      
      const snapshot = await getDocs(invoicesQuery);
      console.log(`Found ${snapshot.docs.length} invoices in Firestore`);
      
      // Get valid tenant IDs for validation
      const validTenantIds = await this.getValidTenantIds(userId);
      
      for (const doc of snapshot.docs) {
        const invoiceData = doc.data();
        
        if (!this.isValidInvoiceData(invoiceData, validTenantIds)) {
          console.warn('⚠️ Skipping invalid invoice data:', invoiceData);
          continue;
        }
        
        await this.mergeInvoice(invoiceData);
      }
      
      console.log('✅ Invoices downloaded successfully');
    } catch (error) {
      console.error('❌ Failed to download invoices:', error);
      throw error;
    }
  }

  private async downloadPayments(userId: number): Promise<void> {
    console.log('📥 Downloading payments...');
    
    try {
      // Get all invoices to download their payments
      const invoicesQuery = query(
        collection(db, 'users', userId.toString(), 'invoices')
      );
      
      const invoicesSnapshot = await getDocs(invoicesQuery);
      const validInvoiceIds = await this.getValidInvoiceIds(userId);
      
      for (const invoiceDoc of invoicesSnapshot.docs) {
        const invoiceData = invoiceDoc.data();
        
        if (!invoiceData.localId || !validInvoiceIds.has(invoiceData.localId)) {
          continue;
        }
        
        await this.downloadPaymentsForInvoice(userId, invoiceDoc.id, invoiceData.localId);
      }
      
      console.log('✅ Payments downloaded successfully');
    } catch (error) {
      console.error('❌ Failed to download payments:', error);
      throw error;
    }
  }

  private async downloadPaymentsForInvoice(userId: number, firestoreInvoiceId: string, localInvoiceId: number): Promise<void> {
    try {
      const paymentsQuery = query(
        collection(db, 'users', userId.toString(), 'invoices', firestoreInvoiceId, 'payments'),
        orderBy('lastSyncTime', 'desc')
      );
      
      const snapshot = await getDocs(paymentsQuery);
      
      for (const paymentDoc of snapshot.docs) {
        const paymentData = paymentDoc.data();
        
        if (!this.isValidPaymentData(paymentData)) {
          console.warn('⚠️ Skipping invalid payment data:', paymentData);
          continue;
        }
        
        await this.mergePayment(localInvoiceId, paymentData);
      }
    } catch (error) {
      console.error(`❌ Failed to download payments for invoice ${localInvoiceId}:`, error);
    }
  }

  // ==================== UPLOAD OPERATIONS ====================

  private async uploadAllDataWithCriticalDelete(userId: number): Promise<void> {
  console.log('📤 Uploading all data with critical delete...');
  
  try {
    const user = await database.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Create batch manager
    const batchManager = new BatchManager();

    // STEP 1: Upload user data
    await this.uploadUserData(userId, user, batchManager);

    // STEP 2: Upload properties with critical delete
    await this.uploadPropertiesWithCriticalDelete(userId, batchManager);

    // STEP 3: Upload tenants with critical delete
    await this.uploadTenantsWithCriticalDelete(userId, batchManager);

    // STEP 4: Upload invoices with critical delete
    await this.uploadInvoicesWithCriticalDelete(userId, batchManager);

    // Execute all batches
    await batchManager.commitAll();

    console.log('✅ All data uploaded successfully');
  } catch (error) {
    console.error('❌ Failed to upload all data:', error);
    throw error;
  }
}

// ==================== REPLACE uploadUserData METHOD ====================
private async uploadUserData(userId: number, user: User, batchManager: BatchManager): Promise<void> {
  console.log('📤 Uploading user data...');
  
  try {
    const company = await database.getCompanyByUserId(userId);
    const userRef = doc(db, 'users', userId.toString());
    
    batchManager.addOperation((batch) => {
      batch.set(userRef, {
        ...user,
        lastSyncTime: serverTimestamp(),
        localId: user.id,
        company: company ? {
          ...company,
          localId: company.id,
          lastSyncTime: serverTimestamp()
        } : null
      }, { merge: true });
    }, `User ${user.id}`);
    
  } catch (error) {
    console.error('❌ Failed to upload user data:', error);
    throw error;
  }
}

// ==================== REPLACE uploadPropertiesWithCriticalDelete METHOD ====================
private async uploadPropertiesWithCriticalDelete(userId: number, batchManager: BatchManager): Promise<void> {
  console.log('📤 Uploading properties with critical delete...');
  
  try {
    // Get local properties (authoritative source)
    const localProperties = await this.getFilteredPropertiesForSync(userId);
    const localPropertyIds = new Set(localProperties.map(p => p.id.toString()));
    
    // Get existing Firestore properties
    const firestorePropertiesQuery = query(
      collection(db, 'users', userId.toString(), 'properties')
    );
    const firestoreSnapshot = await getDocs(firestorePropertiesQuery);
    
    console.log(`📊 Local properties: ${localPropertyIds.size}, Firestore properties: ${firestoreSnapshot.docs.length}`);

    // STEP 1: DELETE properties that exist in Firestore but not locally
    for (const firestoreDoc of firestoreSnapshot.docs) {
      const data = firestoreDoc.data();
      if (!data.localId || !localPropertyIds.has(data.localId.toString())) {
        console.log(`🗑️ DELETING property: ${firestoreDoc.id} (localId: ${data.localId})`);
        
        // Delete all units in this property first
        await this.deleteAllUnitsInProperty(userId, firestoreDoc.id, batchManager);
        
        // Delete the property
        batchManager.addOperation((batch) => {
          batch.delete(firestoreDoc.ref);
        }, `DELETE Property ${firestoreDoc.id}`);
      }
    }

    // STEP 2: ADD/REPLACE all local properties
    for (const property of localProperties) {
      console.log(`📝 UPLOADING property: ${property.id}`);
      
      const propertyRef = doc(db, 'users', userId.toString(), 'properties', property.id.toString());
      
      batchManager.addOperation((batch) => {
        batch.set(propertyRef, {
          ...property,
          userId,
          localId: property.id,
          lastSyncTime: serverTimestamp()
        });
      }, `Property ${property.id}`);

      // Upload units for this property
      await this.uploadUnitsForProperty(userId, property.id, batchManager);
    }
    
    console.log('✅ Properties uploaded successfully');
  } catch (error) {
    console.error('❌ Failed to upload properties:', error);
    throw error;
  }
}

// ==================== REPLACE uploadUnitsForProperty METHOD ====================
private async uploadUnitsForProperty(userId: number, propertyId: number, batchManager: BatchManager): Promise<void> {
  try {
    // Get local units (authoritative source)
    const localUnits = await database.getUnitsByProperty(propertyId);
    const localUnitIds = new Set(localUnits.map(u => u.id.toString()));

    // Get existing Firestore units
    const firestoreUnitsQuery = query(
      collection(db, 'users', userId.toString(), 'properties', propertyId.toString(), 'units')
    );
    const firestoreUnitsSnapshot = await getDocs(firestoreUnitsQuery);

    // DELETE units that exist in Firestore but not locally
    for (const unitDoc of firestoreUnitsSnapshot.docs) {
      const data = unitDoc.data();
      if (!data.localId || !localUnitIds.has(data.localId.toString())) {
        console.log(`🗑️ DELETING unit: ${unitDoc.id} (localId: ${data.localId})`);
        batchManager.addOperation((batch) => {
          batch.delete(unitDoc.ref);
        }, `DELETE Unit ${unitDoc.id}`);
      }
    }

    // ADD/REPLACE all local units
    for (const unit of localUnits) {
      const unitRef = doc(db, 'users', userId.toString(), 'properties', propertyId.toString(), 'units', unit.id.toString());
      batchManager.addOperation((batch) => {
        batch.set(unitRef, {
          ...unit,
          userId,
          propertyId,
          localId: unit.id,
          lastSyncTime: serverTimestamp()
        });
      }, `Unit ${unit.id}`);
    }
  } catch (error) {
    console.error(`❌ Failed to upload units for property ${propertyId}:`, error);
  }
}

// ==================== REPLACE uploadTenantsWithCriticalDelete METHOD ====================
private async uploadTenantsWithCriticalDelete(userId: number, batchManager: BatchManager): Promise<void> {
  console.log('📤 Uploading tenants with critical delete...');
  
  try {
    // Get all local tenants across all properties (authoritative source)
    const properties = await this.getFilteredPropertiesForSync(userId);
    const user = await database.getUserById(userId);
    const allLocalTenants: Tenant[] = [];
    
    for (const property of properties) {
      const tenants = await this.getFilteredTenantsForSync(property.id, user);
      allLocalTenants.push(...tenants);
    }
    
    const localTenantIds = new Set(allLocalTenants.map(t => t.id.toString()));
    
    // Get existing Firestore tenants
    const firestoreTenantsQuery = query(
      collection(db, 'users', userId.toString(), 'tenants')
    );
    const firestoreTenantsSnapshot = await getDocs(firestoreTenantsQuery);

    console.log(`📊 Local tenants: ${localTenantIds.size}, Firestore tenants: ${firestoreTenantsSnapshot.docs.length}`);

    // STEP 1: DELETE tenants that exist in Firestore but not locally
    for (const tenantDoc of firestoreTenantsSnapshot.docs) {
      const data = tenantDoc.data();
      if (!data.localId || !localTenantIds.has(data.localId.toString())) {
        console.log(`🗑️ DELETING tenant: ${tenantDoc.id} (localId: ${data.localId})`);
        
        // This will cascade delete all invoices and payments for this tenant
        await this.deleteAllInvoicesForTenant(userId, data.localId?.toString() || tenantDoc.id, batchManager);
        
        // Delete the tenant document
        batchManager.addOperation((batch) => {
          batch.delete(tenantDoc.ref);
        }, `DELETE Tenant ${tenantDoc.id}`);
      }
    }

    // STEP 2: ADD/REPLACE all local tenants
    for (const tenant of allLocalTenants) {
      console.log(`📝 UPLOADING tenant: ${tenant.id}`);
      
      const tenantRef = doc(db, 'users', userId.toString(), 'tenants', tenant.id.toString());
      batchManager.addOperation((batch) => {
        batch.set(tenantRef, {
          ...tenant,
          userId,
          propertyId: tenant.propertyId,
          localId: tenant.id,
          lastSyncTime: serverTimestamp()
        });
      }, `Tenant ${tenant.id}`);
    }

    console.log('✅ Tenants uploaded successfully');
  } catch (error) {
    console.error('❌ Failed to upload tenants:', error);
    throw error;
  }
}

// ==================== REPLACE uploadInvoicesWithCriticalDelete METHOD ====================
private async uploadInvoicesWithCriticalDelete(userId: number, batchManager: BatchManager): Promise<void> {
  console.log('📤 Uploading invoices with critical delete...');
  
  try {
    // Get all local invoices across all tenants (authoritative source)
    const properties = await this.getFilteredPropertiesForSync(userId);
    const user = await database.getUserById(userId);
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

    console.log(`📊 Local invoices: ${localInvoiceIds.size}, Firestore invoices: ${firestoreInvoicesSnapshot.docs.length}`);

    // STEP 1: DELETE invoices that exist in Firestore but not locally
    for (const invoiceDoc of firestoreInvoicesSnapshot.docs) {
      const data = invoiceDoc.data();
      if (!data.localId || !localInvoiceIds.has(data.localId.toString())) {
        console.log(`🗑️ DELETING invoice: ${invoiceDoc.id} (localId: ${data.localId})`);
        
        // Delete old PDF if exists
        if (data.pdfUrl) {
          await this.deleteOldPDFFromStorage(data.pdfUrl);
        }
        
        // Delete all payments for this invoice
        await this.deleteAllPaymentsForInvoice(userId, invoiceDoc.id, batchManager);
        
        // Delete the invoice document
        batchManager.addOperation((batch) => {
          batch.delete(invoiceDoc.ref);
        }, `DELETE Invoice ${invoiceDoc.id}`);
      }
    }

    // STEP 2: ADD/REPLACE all local invoices
    for (const invoice of allLocalInvoices) {
      console.log(`📝 UPLOADING invoice: ${invoice.id}`);
      
      const invoiceRef = doc(db, 'users', userId.toString(), 'invoices', invoice.id.toString());
      
      // Handle PDF generation
      let pdfUrl = null;
      const statusSuffix = invoice.totalAmount <= invoice.amountPaid ? 'paid' : 'pending';
      
      try {
        const existingInvoiceDoc = await getDoc(invoiceRef);
        const existingInvoice = existingInvoiceDoc.exists() ? existingInvoiceDoc.data() : null;
        
        const shouldGeneratePDF = !existingInvoice || (existingInvoice.pdfStatus !== statusSuffix);
        
        if (shouldGeneratePDF) {
          console.log(`📄 Generating PDF for invoice ${invoice.id} - Status: ${statusSuffix}`);
          
          if (existingInvoice && existingInvoice.pdfUrl && existingInvoice.pdfStatus !== statusSuffix) {
            await this.deleteOldPDFFromStorage(existingInvoice.pdfUrl);
          }
          
          pdfUrl = await this.generateAndUploadInvoicePDF(userId, invoice, statusSuffix);
        } else {
          pdfUrl = existingInvoice?.pdfUrl || null;
        }
      } catch (pdfError) {
        console.error(`❌ PDF generation failed for invoice ${invoice.id}:`, pdfError);
        pdfUrl = null;
      }
      
      batchManager.addOperation((batch) => {
        batch.set(invoiceRef, {
          ...invoice,
          userId,
          tenantId: invoice.tenantId,
          propertyId: invoice.propertyId,
          localId: invoice.id,
          pdfUrl: pdfUrl,
          pdfStatus: statusSuffix,
          lastSyncTime: serverTimestamp()
        });
      }, `Invoice ${invoice.id}`);

      // Upload payments for this invoice
      await this.uploadPaymentsForInvoice(userId, invoice, batchManager);
    }

    console.log('✅ Invoices uploaded successfully');
  } catch (error) {
    console.error('❌ Failed to upload invoices:', error);
    throw error;
  }
}

// ==================== REPLACE uploadPaymentsForInvoice METHOD ====================
private async uploadPaymentsForInvoice(userId: number, invoice: any, batchManager: BatchManager): Promise<void> {
  try {
    // Get local payments (authoritative source)
    const localPayments = await database.getPaymentsByInvoice(invoice.id);
    const localPaymentIds = new Set(localPayments.map(p => p.id.toString()));

    // Get existing Firestore payments
    const firestorePaymentsQuery = query(
      collection(db, 'users', userId.toString(), 'invoices', invoice.id.toString(), 'payments')
    );
    const firestorePaymentsSnapshot = await getDocs(firestorePaymentsQuery);

    // DELETE payments that exist in Firestore but not locally
    for (const paymentDoc of firestorePaymentsSnapshot.docs) {
      const data = paymentDoc.data();
      if (!data.localId || !localPaymentIds.has(data.localId.toString())) {
        console.log(`🗑️ DELETING payment: ${paymentDoc.id} (localId: ${data.localId})`);
        batchManager.addOperation((batch) => {
          batch.delete(paymentDoc.ref);
        }, `DELETE Payment ${paymentDoc.id}`);
      }
    }

    // ADD/REPLACE all local payments
    for (const payment of localPayments) {
      const paymentRef = doc(db, 'users', userId.toString(), 'invoices', invoice.id.toString(), 'payments', payment.id.toString());
      batchManager.addOperation((batch) => {
        batch.set(paymentRef, {
          ...payment,
          userId,
          invoiceId: invoice.id,
          tenantId: invoice.tenantId,
          propertyId: invoice.propertyId,
          localId: payment.id,
          lastSyncTime: serverTimestamp()
        });
      }, `Payment ${payment.id}`);
    }
  } catch (error) {
    console.error(`❌ Failed to upload payments for invoice ${invoice.id}:`, error);
  }
}

// ==================== REPLACE CLEANUP METHODS ====================
private async deleteAllUnitsInProperty(userId: number, firestorePropertyId: string, batchManager: BatchManager): Promise<void> {
  try {
    const unitsQuery = query(
      collection(db, 'users', userId.toString(), 'properties', firestorePropertyId, 'units')
    );
    const unitsSnapshot = await getDocs(unitsQuery);
    
    unitsSnapshot.docs.forEach(unitDoc => {
      batchManager.addOperation((batch) => {
        batch.delete(unitDoc.ref);
      }, `DELETE Unit ${unitDoc.id} from property ${firestorePropertyId}`);
    });
    
    console.log(`🗑️ Marked ${unitsSnapshot.docs.length} units for deletion from property ${firestorePropertyId}`);
  } catch (error) {
    console.error(`❌ Error marking units for deletion in property ${firestorePropertyId}:`, error);
  }
}

private async deleteAllInvoicesForTenant(userId: number, tenantId: string, batchManager: BatchManager): Promise<void> {
  try {
    const invoicesQuery = query(
      collection(db, 'users', userId.toString(), 'invoices'),
      where('localId', '==', parseInt(tenantId))
    );
    const invoicesSnapshot = await getDocs(invoicesQuery);
    
    for (const invoiceDoc of invoicesSnapshot.docs) {
      // Delete all payments for this invoice first
      await this.deleteAllPaymentsForInvoice(userId, invoiceDoc.id, batchManager);
      
      // Delete PDF if exists
      const invoiceData = invoiceDoc.data();
      if (invoiceData.pdfUrl) {
        await this.deleteOldPDFFromStorage(invoiceData.pdfUrl);
      }
      
      // Delete the invoice
      batchManager.addOperation((batch) => {
        batch.delete(invoiceDoc.ref);
      }, `DELETE Invoice ${invoiceDoc.id} for tenant ${tenantId}`);
    }
    
    console.log(`🗑️ Marked ${invoicesSnapshot.docs.length} invoices for deletion for tenant ${tenantId}`);
  } catch (error) {
    console.error(`❌ Error marking invoices for deletion for tenant ${tenantId}:`, error);
  }
}

private async deleteAllPaymentsForInvoice(userId: number, firestoreInvoiceId: string, batchManager: BatchManager): Promise<void> {
  try {
    const paymentsQuery = query(
      collection(db, 'users', userId.toString(), 'invoices', firestoreInvoiceId, 'payments')
    );
    const paymentsSnapshot = await getDocs(paymentsQuery);
    
    paymentsSnapshot.docs.forEach(paymentDoc => {
      batchManager.addOperation((batch) => {
        batch.delete(paymentDoc.ref);
      }, `DELETE Payment ${paymentDoc.id} from invoice ${firestoreInvoiceId}`);
    });
    
    console.log(`🗑️ Marked ${paymentsSnapshot.docs.length} payments for deletion from invoice ${firestoreInvoiceId}`);
  } catch (error) {
    console.error(`❌ Error marking payments for deletion for invoice ${firestoreInvoiceId}:`, error);
  }
}

  // ==================== MERGE OPERATIONS (DOWNLOAD) ====================

  // ==================== FIXED MERGE OPERATIONS (DOWNLOAD) ====================


private async mergeUnit(propertyId: number, unitData: any): Promise<void> {
  try {
    const localUnit = await database.getUnitById(unitData.localId);
    
    if (!localUnit) {
      // Create new unit - removed 'id' field as it's not in UnitInput
      await database.createUnit({
        propertyId: propertyId,
        unitNumber: unitData.unitNumber || 'Unknown',
        rentAmount: unitData.rentAmount || 0
      });
      console.log(`✅ Created unit ${unitData.localId} from Firestore`);
    } else {
      // Update existing unit - removed isOccupied as it's not in UnitInput
      await database.updateUnit(unitData.localId, {
        unitNumber: unitData.unitNumber || localUnit.unitNumber,
        rentAmount: unitData.rentAmount !== undefined ? unitData.rentAmount : localUnit.rentAmount
      });
      console.log(`✅ Updated unit ${unitData.localId} from Firestore`);
    }
  } catch (error) {
    console.error(`❌ Failed to merge unit ${unitData.localId}:`, error);
  }
}

private async mergeInvoice(invoiceData: any): Promise<void> {
  try {
    const localInvoice = await database.getInvoiceById(invoiceData.localId);
    
    if (!localInvoice) {
      // Create new invoice - matches InvoiceInput interface exactly
      await database.createInvoice({
        id: invoiceData.localId, // This is required in InvoiceInput
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
        isPaid: invoiceData.isPaid,
      });
      console.log(`✅ Created invoice ${invoiceData.localId} from Firestore`);
    } else {
      // Update existing invoice - use the database's updateInvoice method which handles totals
      const updateData: Partial<InvoiceInput> = {};
      
      if (invoiceData.billingMonth) updateData.billingMonth = invoiceData.billingMonth;
      if (invoiceData.rentAmount !== undefined) updateData.rentAmount = invoiceData.rentAmount;
      if (invoiceData.waterCurrentReading !== undefined) updateData.waterCurrentReading = invoiceData.waterCurrentReading;
      if (invoiceData.waterPreviousReading !== undefined) updateData.waterPreviousReading = invoiceData.waterPreviousReading;
      if (invoiceData.waterStandingFee !== undefined) updateData.waterStandingFee = invoiceData.waterStandingFee;
      if (invoiceData.waterUnitPrice !== undefined) updateData.waterUnitPrice = invoiceData.waterUnitPrice;
      if (invoiceData.powerCurrentReading !== undefined) updateData.powerCurrentReading = invoiceData.powerCurrentReading;
      if (invoiceData.powerPreviousReading !== undefined) updateData.powerPreviousReading = invoiceData.powerPreviousReading;
      if (invoiceData.powerUnitPrice !== undefined) updateData.powerUnitPrice = invoiceData.powerUnitPrice;
      if (invoiceData.otherCharges !== undefined) updateData.otherCharges = invoiceData.otherCharges;
      if (invoiceData.otherChargesDescription) updateData.otherChargesDescription = invoiceData.otherChargesDescription;
      if (invoiceData.dueDate) updateData.dueDate = invoiceData.dueDate;
      if (invoiceData.isPaid) updateData.isPaid = invoiceData.isPaid;
      
      if (Object.keys(updateData).length > 0) {
        await database.updateInvoice(invoiceData.localId, updateData);
        console.log(`✅ Updated invoice ${invoiceData.localId} from Firestore`);
      }
    }
  } catch (error) {
    console.error(`❌ Failed to merge invoice ${invoiceData.localId}:`, error);
  }
}

  private async mergePayment(invoiceId: number, paymentData: any): Promise<void> {
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
        // Optionally update existing payment
        console.log(`ℹ️ Payment ${paymentData.localId} already exists, skipping`);
      }
    } catch (error) {
      console.error(`❌ Failed to merge payment ${paymentData.localId}:`, error);
    }
  }

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
        await database.updateCompany(localCompany.id, {
          name: companyData.name || localCompany.name,
          address: companyData.address || localCompany.address,
          phone: companyData.phone || localCompany.phone,
          email: companyData.email || localCompany.email
        });
        console.log('✅ Updated company from Firestore data');
      }
    } catch (error) {
      console.error('❌ Failed to sync company data:', error);
    }
  }

  // ==================== SCHEDULING AND COORDINATION ====================

  /**
   * Start automatic upload scheduling for a user
   * Only uploads - no downloads unless manually triggered
   */
  startUploadScheduling(userId: number): void {
    console.log(`⏰ Starting upload scheduling for user: ${userId}`);
    
    // Clear any existing timer for this user
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
            console.log('🚀 Performing scheduled upload...');
            await this.performUploadSync(userId, 'scheduled');
          }
          scheduleNextUpload(); // Schedule next upload
        } catch (error) {
          console.error('❌ Scheduled upload failed:', error);
          scheduleNextUpload(); // Continue scheduling despite errors
        }
      }, msUntilUpload);
      
      this.uploadScheduleTimers.set(userId, timer);
    };

    scheduleNextUpload();
    
    // Mark scheduling as enabled
    localStorage.setItem(this.UPLOAD_SCHEDULE_KEY, 'true');
  }

  /**
   * Stop automatic upload scheduling for a user
   */
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
      return true; // Never uploaded before
    }
    
    const timeSinceLastUpload = Date.now() - new Date(lastUploadTime).getTime();
    return timeSinceLastUpload >= this.UPLOAD_INTERVAL_MS;
  }

  // ==================== USER LISTENER (ONLY FOR USER DATA) ====================

  /**
   * Setup user listener for tier/permission changes ONLY
   * Does not trigger data downloads - only updates user info
   */
  setupUserListener(userId: number, onUserUpdate: (user: User) => void): void {
    console.log(`👂 Setting up user listener for: ${userId}`);
    
    // Clean up existing listener
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

          // Update local user data
          await database.updateUser(userId, {
            name: userData.name || 'Unknown User',
            email: userData.email || '',
            phone: userData.phone || '',
            isPremium: userData.isPremium || false
          });

          // Update tier and type
          await database.updateUserTierAndType(
            userId, 
            userData.tier || 'free', 
            userData.type || 'free',
            userData.storage || false
          );

          // CRITICAL: Immediately enforce limits after tier change
          await this.enforceTierLimits(userId);
          
          // Get updated user and notify app
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

  // ==================== TIER LIMIT ENFORCEMENT ====================

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

  // ==================== VALIDATION METHODS ====================

  private isValidUnitData(data: any): boolean {
    return data && 
           typeof data.localId !== 'undefined' && 
           typeof data.unitNumber === 'string' && 
           typeof data.rentAmount === 'number';
  }

  private isValidPaymentData(data: any): boolean {
    return data && 
           typeof data.localId !== 'undefined' && 
           typeof data.amount === 'number' && 
           data.amount > 0 && 
           typeof data.paymentDate === 'string';
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

  private getUserLimits(user: any) {
    return USER_LIMITS[user?.tier as UserTier] || USER_LIMITS.free;
  }

  canUserSync(user: any): boolean {
    // Business and enterprise users always have sync
    if (user.tier === 'business' || user.tier === 'pro' || user.tier === 'enterprise') {
      return true;
    }
    
    // Free and low tier users need storage permission
    return user.storage === true;
  }

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

  // ==================== PDF OPERATIONS ====================

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
      
      // Get user and company data
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
      console.log(`📤 Uploading PDF to storage: ${filename}`);
      const uploadResult = await uploadBytes(storageRef, pdfBytes);
      
      // Get download URL
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
      
      // Extract storage path from download URL
      const urlParts = pdfUrl.split('/o/')[1];
      if (!urlParts) return;
      
      const storagePath = decodeURIComponent(urlParts.split('?')[0]);
      const storageRef = ref(storage, storagePath);
      
      console.log(`🗑️ Deleting old PDF from storage: ${storagePath}`);
      await deleteObject(storageRef);
      console.log('✅ Old PDF deleted successfully');
      
    } catch (error) {
      console.error('❌ Error deleting old PDF from storage:', error);
      // Don't throw error - continue with sync even if delete fails
    }
  }

  // ==================== PUBLIC API METHODS ====================

  /**
   * Get current sync status for a user
   */
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

  /**
   * Force manual download - downloads and merges Firestore data
   */
  async forceDownload(userId: number): Promise<SyncStatus> {
    console.log('🔽 Force download requested');
    return this.performDownloadSync(userId, 'manual');
  }

  /**
   * Force manual upload - uploads local data to Firestore
   */
  async forceUpload(userId: number): Promise<SyncStatus> {
    console.log('🔼 Force upload requested');
    return this.performUploadSync(userId, 'manual');
  }

  /**
   * Initialize sync service for a user (called on sign-in)
   */
  async initializeForUser(userId: number): Promise<SyncStatus> {
    console.log(`🚀 Initializing sync service for user: ${userId}`);
    
    try {
      // 1. Setup user listener for tier/permission changes
      this.setupUserListener(userId, (user) => {
        console.log('👤 User data updated via listener:', user.tier);
      });
      
      // 2. Start upload scheduling
      this.startUploadScheduling(userId);
      
      // 3. Perform full sync (download + conditional upload)
      const syncResult = await this.performFullSync(userId);
      
      console.log('✅ Sync service initialized successfully');
      return syncResult;
      
    } catch (error) {
      console.error('❌ Failed to initialize sync service:', error);
      throw error;
    }
  }

  /**
   * Cleanup sync service for a user (called on sign-out)
   */
  cleanup(userId?: number): void {
    console.log('🧹 Cleaning up sync service');
    
    if (userId) {
      // Cleanup specific user
      this.removeUserListener(userId);
      this.stopUploadScheduling(userId);
      
      // Release any locks for this user
      this.releaseOperationLock(`download_${userId}`);
      this.releaseOperationLock(`upload_${userId}`);
    } else {
      // Cleanup all users
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

  // ==================== USER ACCESS VALIDATION ====================

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

  // ==================== NETWORK CONNECTIVITY HANDLING ====================

  /**
   * Check if sync operations can be performed
   */
  canPerformNetworkOperations(): boolean {
    return navigator.onLine;
  }

  /**
   * Get network status and sync readiness
   */
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

  // ==================== DEBUG AND MONITORING ====================

  /**
   * Get detailed sync information for debugging
   */
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