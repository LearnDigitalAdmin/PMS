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
  type Unsubscribe
} from 'firebase/firestore';
import { database } from '../database/Database';
import type { 
  User, 
  Property, 
  Tenant} from '../database/Database';

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
    properties: 2, 
    tenantsPerProperty: 12, 
    totalTenants: 24,
    storage: false 
  },
  low: { 
    properties: 7, 
    tenantsPerProperty: 15, 
    totalTenants: 105,
    storage: false // Can be upgraded with IAP
  },
  business: { 
    properties: 15, 
    tenantsPerProperty: 20, 
    totalTenants: 300,
    storage: true 
  },
  enterprise: { 
    properties: -1, // unlimited
    tenantsPerProperty: -1, // unlimited
    totalTenants: -1, // unlimited
    storage: true 
  }
} as const;

export type UserType = 'free' | 'premium';
export type UserTier = 'free' | 'low' | 'business' | 'enterprise';

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

  // ==================== USER SYNC OPERATIONS ====================

  async syncUserToFirestore(user: User): Promise<void> {
    if (!this.canUserSync(user)) {
      console.log('User cannot sync - no storage permission');
      return;
    }

    try {
      const userRef = doc(db, 'users', user.id.toString());
      const userData = {
        ...user,
        lastSyncTime: serverTimestamp(),
        localId: user.id // Keep reference to local ID
      };

      await setDoc(userRef, userData, { merge: true });
      console.log('User synced to Firestore:', user.email);
    } catch (error) {
      console.error('Error syncing user to Firestore:', error);
      throw error;
    }
  }


  // ==================== CRITICAL FIXES FOR FIREBASESYNC.TSX ====================

// 1. FIX: Complete syncUserDataToFirestore with ALL data types
private async syncUserDataToFirestore(userId: number): Promise<void> {
  const user = await database.getUserById(userId);
  if (!user || !this.canUserSync(user)) {
    console.log('User cannot sync - no storage permission');
    return;
  }

  try {
    console.log('Starting complete data upload for user:', user.email);
    
    // Create multiple batches to handle large datasets
    const batches = [];
    let currentBatch = writeBatch(db);
    let operationCount = 0;
    const maxBatchSize = 400; // Stay under Firestore's 500 operation limit

    const addToBatch = (ref: any, data: any) => {
      if (operationCount >= maxBatchSize) {
        batches.push(currentBatch);
        currentBatch = writeBatch(db);
        operationCount = 0;
      }
      currentBatch.set(ref, data, { merge: true });
      operationCount++;
    };

    // 1. Sync user data first
    const userRef = doc(db, 'users', userId.toString());
    addToBatch(userRef, {
      ...user,
      lastSyncTime: serverTimestamp(),
      localId: user.id
    });

    // 2. Sync company data
    const company = await database.getCompanyByUserId(userId);
    if (company) {
      const companyRef = doc(db, 'companies', `${userId}_${company.id}`);
      addToBatch(companyRef, {
        ...company,
        userId,
        localId: company.id,
        lastSyncTime: serverTimestamp()
      });
    }

    // 3. Sync ALL accessible properties (respecting tier limits)
    const properties = await this.getFilteredPropertiesForSync(userId);
    for (const property of properties) {
      const propertyRef = doc(db, 'properties', `${userId}_${property.id}`);
      addToBatch(propertyRef, {
        ...property,
        userId,
        localId: property.id,
        lastSyncTime: serverTimestamp()
      });

      // 4. Sync units for each property
      const units = await database.getUnitsByProperty(property.id);
      for (const unit of units) {
        const unitRef = doc(db, 'units', `${userId}_${unit.id}`);
        addToBatch(unitRef, {
          ...unit,
          userId,
          propertyLocalId: property.id,
          localId: unit.id,
          lastSyncTime: serverTimestamp()
        });
      }

      // 5. Sync ALL accessible tenants for each property
      const tenants = await this.getFilteredTenantsForSync(property.id, user);
      for (const tenant of tenants) {
        const tenantRef = doc(db, 'tenants', `${userId}_${tenant.id}`);
        addToBatch(tenantRef, {
          ...tenant,
          userId,
          propertyLocalId: property.id,
          localId: tenant.id,
          lastSyncTime: serverTimestamp()
        });

        // 6. Sync ALL invoices for each tenant
        const invoices = await database.getInvoices({ tenantId: tenant.id });
        for (const invoice of invoices) {
          const invoiceRef = doc(db, 'invoices', `${userId}_${invoice.id}`);
          addToBatch(invoiceRef, {
            ...invoice,
            userId,
            tenantLocalId: tenant.id,
            propertyLocalId: property.id,
            localId: invoice.id,
            lastSyncTime: serverTimestamp()
          });

          // 7. Sync ALL payments for each invoice
          const payments = await database.getPaymentsByInvoice(invoice.id);
          for (const payment of payments) {
            const paymentRef = doc(db, 'payments', `${userId}_${payment.id}`);
            addToBatch(paymentRef, {
              ...payment,
              userId,
              invoiceLocalId: invoice.id,
              tenantLocalId: tenant.id,
              propertyLocalId: property.id,
              localId: payment.id,
              lastSyncTime: serverTimestamp()
            });
          }
        }
      }
    }

    // Execute all batches
    batches.push(currentBatch);
    console.log(`Executing ${batches.length} batch(es) with total ${operationCount} operations`);
    
    for (let i = 0; i < batches.length; i++) {
      await batches[i].commit();
      console.log(`Batch ${i + 1}/${batches.length} committed successfully`);
    }

    console.log('Complete user data synced to Firestore');
  } catch (error) {
    console.error('Error syncing user data to Firestore:', error);
    throw error;
  }
}

// 2. FIX: Complete downloadAndMergeData with ALL data types
private async downloadAndMergeData(userId: number): Promise<void> {
  const user = await database.getUserById(userId);
  if (!user || !this.canUserSync(user)) {
    console.log('User cannot sync - no storage permission');
    return;
  }

  try {
    console.log('Starting complete data download for user:', user.email);
    
    // 1. Download and merge company data
    const companyQuery = query(
      collection(db, 'companies'),
      where('userId', '==', userId),
      orderBy('lastSyncTime', 'desc'),
      limit(1)
    );
    
    const companySnapshot = await getDocs(companyQuery);
    if (!companySnapshot.empty) {
      const companyData = companySnapshot.docs[0].data();
      const localCompany = await database.getCompanyByUserId(userId);
      
      if (!localCompany && user.type === 'premium') {
        // Create company if user is premium and doesn't have one locally
        await database.createCompany(userId, {
          name: companyData.name,
          address: companyData.address,
          phone: companyData.phone,
          email: companyData.email
        });
      } else if (localCompany) {
        // Update existing company
        await database.updateCompany(localCompany.id, {
          name: companyData.name,
          address: companyData.address,
          phone: companyData.phone,
          email: companyData.email
        });
      }
    }

    // 2. Download and merge properties
    const propertiesQuery = query(
      collection(db, 'properties'),
      where('userId', '==', userId),
      orderBy('lastSyncTime', 'desc')
    );
    
    const propertiesSnapshot = await getDocs(propertiesQuery);
    const propertyIdMapping: { [cloudId: string]: number } = {};
    
    for (const doc of propertiesSnapshot.docs) {
      const propertyData = doc.data();
      const localProperty = await database.getPropertyById(propertyData.localId);
      
      if (!localProperty) {
        // Create new property if within limits
        const canCreate = await database.canCreateProperty?.(userId);
        if (canCreate?.allowed !== false) {
          try {
            const createdProperty = await database.createProperty({
              userId: propertyData.userId,
              companyId: propertyData.companyId,
              name: propertyData.name,
              address: propertyData.address,
              description: propertyData.description,
              image: propertyData.image,
              agentCommissionRate: propertyData.agentCommissionRate,
              maxUnits: propertyData.maxUnits
            });
            propertyIdMapping[doc.id] = createdProperty.id;
          } catch (error) {
            console.error('Failed to create property during sync:', error);
          }
        }
      } else {
        // Update existing property if not restricted
        if (!localProperty.isRestricted) {
          await database.updateProperty(propertyData.localId, {
            name: propertyData.name,
            address: propertyData.address,
            description: propertyData.description,
            image: propertyData.image,
            agentCommissionRate: propertyData.agentCommissionRate,
            maxUnits: propertyData.maxUnits
          });
        }
        propertyIdMapping[doc.id] = localProperty.id;
      }
    }

    // 3. Download and merge units
    const unitsQuery = query(
      collection(db, 'units'),
      where('userId', '==', userId),
      orderBy('lastSyncTime', 'desc')
    );
    
    const unitsSnapshot = await getDocs(unitsQuery);
    const unitIdMapping: { [cloudId: string]: number } = {};
    
    for (const doc of unitsSnapshot.docs) {
      const unitData = doc.data();
      const localPropertyId = propertyIdMapping[`${userId}_${unitData.propertyLocalId}`] || unitData.propertyLocalId;
      
      // Only sync units for accessible properties
      const property = await database.getPropertyById(localPropertyId);
      if (property && !property.isRestricted) {
        const localUnit = await database.getUnitById(unitData.localId);
        
        if (!localUnit) {
          try {
            const createdUnit = await database.createUnit({
              propertyId: localPropertyId,
              unitNumber: unitData.unitNumber,
              rentAmount: unitData.rentAmount
            });
            unitIdMapping[doc.id] = createdUnit.id;
          } catch (error) {
            console.error('Failed to create unit during sync:', error);
          }
        } else {
          await database.updateUnit(unitData.localId, {
            unitNumber: unitData.unitNumber,
            rentAmount: unitData.rentAmount
          });
          unitIdMapping[doc.id] = localUnit.id;
        }
      }
    }

    // 4. Download and merge tenants
    const tenantsQuery = query(
      collection(db, 'tenants'),
      where('userId', '==', userId),
      orderBy('lastSyncTime', 'desc')
    );
    
    const tenantsSnapshot = await getDocs(tenantsQuery);
    const tenantIdMapping: { [cloudId: string]: number } = {};
    
    for (const doc of tenantsSnapshot.docs) {
      const tenantData = doc.data();
      const localPropertyId = propertyIdMapping[`${userId}_${tenantData.propertyLocalId}`] || tenantData.propertyLocalId;
      
      // Only sync tenants for accessible properties
      const property = await database.getPropertyById(localPropertyId);
      if (property && !property.isRestricted) {
        const localTenant = await database.getTenantById(tenantData.localId);
        
        if (!localTenant) {
          const canCreate = await database.canCreateTenant?.(localPropertyId);
          if (canCreate?.allowed !== false) {
            try {
              const createdTenant = await database.createTenant({
                propertyId: localPropertyId,
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
              tenantIdMapping[doc.id] = createdTenant.id;
            } catch (error) {
              console.error('Failed to create tenant during sync:', error);
            }
          }
        } else {
          // Update existing tenant if not restricted
          if (!localTenant.isRestricted) {
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
          }
          tenantIdMapping[doc.id] = localTenant.id;
        }
      }
    }

    // 5. Download and merge invoices
    const invoicesQuery = query(
      collection(db, 'invoices'),
      where('userId', '==', userId),
      orderBy('lastSyncTime', 'desc')
    );
    
    const invoicesSnapshot = await getDocs(invoicesQuery);
    const invoiceIdMapping: { [cloudId: string]: number } = {};
    
    for (const doc of invoicesSnapshot.docs) {
      const invoiceData = doc.data();
      const localTenantId = tenantIdMapping[`${userId}_${invoiceData.tenantLocalId}`] || invoiceData.tenantLocalId;
      const localPropertyId = propertyIdMapping[`${userId}_${invoiceData.propertyLocalId}`] || invoiceData.propertyLocalId;
      
      // Only sync invoices for accessible tenants and properties
      const tenant = await database.getTenantById(localTenantId);
      const property = await database.getPropertyById(localPropertyId);
      
      if (tenant && property && !tenant.isRestricted && !property.isRestricted) {
        const localInvoice = await database.getInvoiceById(invoiceData.localId);
        
        if (!localInvoice) {
          try {
            const createdInvoice = await database.createInvoice({
              id: invoiceData.localId, // Use the cloud ID structure
              tenantId: localTenantId,
              propertyId: localPropertyId,
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
            invoiceIdMapping[doc.id] = createdInvoice.id;
          } catch (error) {
            console.error('Failed to create invoice during sync:', error);
          }
        } else {
          // Update existing invoice
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
          invoiceIdMapping[doc.id] = localInvoice.id;
        }
      }
    }

    // 6. Download and merge payments
    const paymentsQuery = query(
      collection(db, 'payments'),
      where('userId', '==', userId),
      orderBy('lastSyncTime', 'desc')
    );
    
    const paymentsSnapshot = await getDocs(paymentsQuery);
    
    for (const doc of paymentsSnapshot.docs) {
      const paymentData = doc.data();
      const localInvoiceId = invoiceIdMapping[`${userId}_${paymentData.invoiceLocalId}`] || paymentData.invoiceLocalId;
      
      // Only sync payments for accessible invoices
      const invoice = await database.getInvoiceById(localInvoiceId);
      if (invoice) {
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
    }

    console.log('Complete data download and merge completed');
  } catch (error) {
    console.error('Error in downloadAndMergeData:', error);
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
private async getFilteredTenantsForSync(propertyId: number, user: User): Promise<Tenant[]> {
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
async performFullSync(userId: number): Promise<SyncStatus> {
  if (this.syncInProgress) {
    throw new Error('Sync already in progress');
  }

  this.syncInProgress = true;
  //const startTime = new Date().toISOString();
  const errors: string[] = [];
  
  try {
    const user = await database.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    if (!this.canUserSync(user)) {
      throw new Error('User does not have sync permissions. Upgrade to business or enterprise tier, or purchase cloud storage.');
    }

    console.log('Starting complete full sync for user:', user.email);
    
    // Step 1: Download and apply any tier/type updates from Firestore first
    try {
      const latestUser = await this.downloadUserFromFirestore(userId);
      if (latestUser) {
        await database.updateUser(userId, {
          name: latestUser.name,
          email: latestUser.email,
          phone: latestUser.phone?.toString() || '',
          isPremium: latestUser.isPremium
        });
        
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

    // Step 2: Upload all local data to Firestore
    try {
      await this.syncUserDataToFirestore(userId);
      console.log('Upload to Firestore completed');
    } catch (error) {
      errors.push(`Failed to upload data: ${error}`);
      console.error('Error uploading data:', error);
    }

    // Step 3: Download and merge remote data
    try {
      await this.downloadAndMergeData(userId);
      console.log('Download from Firestore completed');
    } catch (error) {
      errors.push(`Failed to download data: ${error}`);
      console.error('Error downloading data:', error);
    }

    // Step 4: Final enforcement of limits (critical security step)
    try {
      await this.enforceTierLimits(userId);
      console.log('Final limit enforcement completed');
    } catch (error) {
      errors.push(`Failed to enforce limits: ${error}`);
      console.error('Error enforcing limits:', error);
    }
    
    this.lastSyncTime = new Date().toISOString();
    localStorage.setItem('lastSyncTime', this.lastSyncTime);
    
    await this.logSyncOperation(
      userId, 
      'full_sync', 
      errors.length > 0 ? 'error' : 'success', 
      errors.length > 0 ? 'Full sync completed with errors' : 'Full sync completed successfully',
      errors.length > 0 ? errors.join('; ') : undefined
    );
    
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
    
    await this.logSyncOperation(userId, 'full_sync', 'error', `Sync failed: ${error}`);
    
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

// 11. FIX: RevenueCat webhook handler with immediate local enforcement
static async handleRevenueCatWebhook(data: {
  localUserId: number;
  firestoreUserId: string;
  tier: UserTier;
  type: UserType;
  storage: boolean;
  revenuekatUserId: string;
}): Promise<void> {
  try {
    // Update Firestore
    const userRef = doc(db, 'users', data.firestoreUserId);
    await setDoc(userRef, {
      tier: data.tier,
      type: data.type,
      storage: data.storage,
      revenuekatUserId: data.revenuekatUserId,
      isPremium: data.type === 'premium',
      lastUpdated: serverTimestamp()
    }, { merge: true });
    
    // CRITICAL: If we have local access, update immediately
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

// 14. FIX: Enhanced downloadUserFromFirestore with better error handling
async downloadUserFromFirestore(localUserId: number): Promise<User | null> {
  try {
    console.log('Downloading user data from Firestore for user ID:', localUserId);
    
    // First try by local ID mapping
    const userRef = doc(db, 'users', localUserId.toString());
    let userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      // Try by email if local ID mapping doesn't work
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
        id: localUserId, // Keep local ID
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
    // Don't throw - allow offline operation
    return null;
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

// 17. FIX: Enhanced error handling and recovery
// private async handleSyncError(userId: number, operation: string, error: any): Promise<void> {
//   console.error(`Sync error during ${operation}:`, error);
  
//   // Log error but don't break offline functionality
//   try {
//     await this.logSyncOperation(
//       userId, 
//       'full_sync', 
//       'error', 
//       `${operation} failed`,
//       error instanceof Error ? error.message : 'Unknown error'
//     );
//   } catch (logError) {
//     console.error('Failed to log sync error:', logError);
//   }

//   // Set app to graceful offline mode
//   localStorage.setItem('syncStatus', 'offline');
//   localStorage.setItem('lastSyncError', new Date().toISOString());
// }


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
    if (user.tier === 'business' || user.tier === 'enterprise') {
      return true;
    }
    
    // Free and low tier users need storage permission
    return user.storage === true;
  }

  private getUserLimits(user: any) {
    return USER_LIMITS[user.tier as UserTier] || USER_LIMITS.free;
  }

  // private async canCreateTenant(propertyId: number): Promise<boolean> {
  //   const property = await database.getPropertyById(propertyId);
  //   if (!property) return false;

  //   const user = await database.getUserById(property.userId);
  //   if (!user) return false;

  //   const limits = this.getUserLimits(user);
  //   if (limits.tenantsPerProperty === -1) return true;

  //   const currentTenants = await database.getTenantsByProperty(propertyId);
  //   return currentTenants.length < limits.tenantsPerProperty;
  // }

  // private async getFilteredProperties(userId: number): Promise<Property[]> {
  //   const user = await database.getUserById(userId);
  //   if (!user) return [];

  //   const limits = this.getUserLimits(user);
  //   const allProperties = await database.getProperties(userId);
    
  //   if (limits.properties === -1) {
  //     return allProperties;
  //   }

  //   // For restricted users, return selected properties or first N
  //   if (user.selectedPropertyIds && user.selectedPropertyIds.length > 0) {
  //     return allProperties.filter(p => user.selectedPropertyIds!.includes(p.id));
  //   }
    
  //   return allProperties.slice(0, limits.properties);
  // }

  // private async getFilteredTenants(propertyId: number, user: any): Promise<Tenant[]> {
  //   const limits = this.getUserLimits(user);
  //   const allTenants = await database.getTenantsByProperty(propertyId);
    
  //   if (limits.tenantsPerProperty === -1) {
  //     return allTenants;
  //   }
    
  //   return allTenants.slice(0, limits.tenantsPerProperty);
  // }

  private async logSyncOperation(
    userId: number, 
    action: 'upload' | 'download' | 'full_sync', 
    status: 'success' | 'error',
    details: string,
    errorMessage?: string
  ): Promise<void> {
    try {
      const logRef = doc(collection(db, 'syncLogs'));
      await setDoc(logRef, {
        userId,
        action,
        status,
        details,
        errorMessage: errorMessage || null,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Error logging sync operation:', error);
    }
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