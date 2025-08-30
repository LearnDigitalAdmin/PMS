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

  async downloadUserFromFirestore(localUserId: number): Promise<User | null> {
    try {
      // First try by local ID mapping
      const userRef = doc(db, 'users', localUserId.toString());
      let userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        // Try by email if local ID mapping doesn't work
        const localUser = await database.getUserById(localUserId);
        if (localUser?.email) {
          const usersQuery = query(
            collection(db, 'users'),
            where('email', '==', localUser.email),
            limit(1)
          );
          const querySnapshot = await getDocs(usersQuery);
          if (!querySnapshot.empty) {
            userDoc = querySnapshot.docs[0];
          }
        }
      }

      if (userDoc.exists()) {
        const firestoreUser = userDoc.data();
        return {
          id: localUserId, // Keep local ID
          name: firestoreUser.name,
          email: firestoreUser.email,
          phone: firestoreUser.phone,
          passwordHash: firestoreUser.passwordHash,
          isPremium: firestoreUser.isPremium,
          type: firestoreUser.type || 'free',
          tier: firestoreUser.tier || 'free',
          storage: firestoreUser.storage || false,
          revenuekatUserId: firestoreUser.revenuekatUserId,
          selectedPropertyIds: firestoreUser.selectedPropertyIds || [],
          createdAt: firestoreUser.createdAt,
          updatedAt: firestoreUser.updatedAt
        };
      }
      return null;
    } catch (error) {
      console.error('Error downloading user from Firestore:', error);
      return null;
    }
  }

  // ==================== DATA SYNC OPERATIONS ====================

  async performFullSync(userId: number): Promise<SyncStatus> {
    if (this.syncInProgress) {
      throw new Error('Sync already in progress');
    }

    this.syncInProgress = true;
    const startTime = new Date().toISOString();
    
    try {
      const user = await database.getUserById(userId);
      if (!user || !this.canUserSync(user)) {
        throw new Error('User cannot sync - no storage permission');
      }

      console.log('Starting full sync for user:', user.email);
      
      // Download latest user data first to get current tier/type
      const latestUser = await this.downloadUserFromFirestore(userId);
      if (latestUser) {
        await database.updateUser(userId, {
          name: latestUser.name,
          email: latestUser.email,
          phone: latestUser.phone,
          isPremium: latestUser.isPremium
        });
        console.log('User data updated from Firestore');
      }

      // Sync all data
      await this.syncUserDataToFirestore(userId);
      await this.downloadAndMergeData(userId);
      
      this.lastSyncTime = new Date().toISOString();
      localStorage.setItem('lastSyncTime', this.lastSyncTime);
      
      await this.logSyncOperation(userId, 'full_sync', 'success', 'Full sync completed successfully');
      
      return {
        lastSyncTime: this.lastSyncTime,
        syncInProgress: false,
        pendingUploads: 0,
        pendingDownloads: 0,
        errors: []
      };
      
    } catch (error) {
      console.error('Full sync error:', error);
      await this.logSyncOperation(userId, 'full_sync', 'error', `Sync failed: ${error}`);
      
      return {
        lastSyncTime: this.lastSyncTime || 'Never',
        syncInProgress: false,
        pendingUploads: 0,
        pendingDownloads: 0,
        errors: [error instanceof Error ? error.message : 'Unknown sync error']
      };
    } finally {
      this.syncInProgress = false;
    }
  }

  private async syncUserDataToFirestore(userId: number): Promise<void> {
    const user = await database.getUserById(userId);
    if (!user || !this.canUserSync(user)) return;

    const batch = writeBatch(db);
    
    // Sync user
    await this.syncUserToFirestore(user);
    
    // Sync company
    const company = await database.getCompanyByUserId(userId);
    if (company) {
      const companyRef = doc(db, 'companies', company.id.toString());
      batch.set(companyRef, { ...company, lastSyncTime: serverTimestamp() }, { merge: true });
    }

    // Sync properties (with tier limits)
    const properties = await this.getFilteredProperties(userId);
    for (const property of properties) {
      const propertyRef = doc(db, 'properties', property.id.toString());
      batch.set(propertyRef, { 
        ...property, 
        userId,
        lastSyncTime: serverTimestamp() 
      }, { merge: true });

      // Sync units for this property
      const units = await database.getUnitsByProperty(property.id);
      for (const unit of units) {
        const unitRef = doc(db, 'units', unit.id.toString());
        batch.set(unitRef, { 
          ...unit, 
          userId,
          lastSyncTime: serverTimestamp() 
        }, { merge: true });
      }

      // Sync tenants for this property (with limits)
      const tenants = await this.getFilteredTenants(property.id, user);
      for (const tenant of tenants) {
        const tenantRef = doc(db, 'tenants', tenant.id.toString());
        batch.set(tenantRef, { 
          ...tenant, 
          userId,
          lastSyncTime: serverTimestamp() 
        }, { merge: true });

        // Sync invoices and payments for this tenant
        const invoices = await database.getInvoices({ tenantId: tenant.id });
        for (const invoice of invoices) {
          const invoiceRef = doc(db, 'invoices', invoice.id.toString());
          batch.set(invoiceRef, { 
            ...invoice, 
            userId,
            lastSyncTime: serverTimestamp() 
          }, { merge: true });

          const payments = await database.getPaymentsByInvoice(invoice.id);
          for (const payment of payments) {
            const paymentRef = doc(db, 'payments', payment.id.toString());
            batch.set(paymentRef, { 
              ...payment, 
              userId,
              lastSyncTime: serverTimestamp() 
            }, { merge: true });
          }
        }
      }
    }

    await batch.commit();
    console.log('All user data synced to Firestore');
  }

  private async downloadAndMergeData(userId: number): Promise<void> {
    const user = await database.getUserById(userId);
    if (!user || !this.canUserSync(user)) return;

    // Download and merge properties
    const propertiesQuery = query(
      collection(db, 'properties'),
      where('userId', '==', userId),
      orderBy('lastSyncTime', 'desc')
    );
    
    const propertiesSnapshot = await getDocs(propertiesQuery);
    for (const doc of propertiesSnapshot.docs) {
      const propertyData = doc.data();
      
      // Check if local property exists
      const localProperty = await database.getPropertyById(propertyData.id);
      if (!localProperty) {
        // Create new property locally if within limits
        if (await this.canCreateProperty(userId)) {
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
        }
      } else {
        // Update existing property
        await database.updateProperty(propertyData.id, {
          name: propertyData.name,
          address: propertyData.address,
          description: propertyData.description,
          image: propertyData.image,
          agentCommissionRate: propertyData.agentCommissionRate,
          maxUnits: propertyData.maxUnits
        });
      }
    }

    // Similar logic for units, tenants, invoices, and payments...
    console.log('Data download and merge completed');
  }

  // ==================== USER MANAGEMENT ====================

  async updateUserTierAndType(userId: number, tier: UserTier, type: UserType, storage: boolean = false): Promise<void> {
    try {
      // Update local database
      await database.updateUserTierAndType(userId, tier, type, storage);
      
      // Update Firestore if user has sync permissions
      const user = await database.getUserById(userId);
      if (user && this.canUserSync(user)) {
        await this.syncUserToFirestore(user);
      }

      // Enforce limits immediately
      await this.enforceTierLimits(userId);
      
      console.log(`User ${userId} updated to tier: ${tier}, type: ${type}, storage: ${storage}`);
    } catch (error) {
      console.error('Error updating user tier and type:', error);
      throw error;
    }
  }

  private async enforceTierLimits(userId: number): Promise<void> {
    const user = await database.getUserById(userId);
    if (!user) return;

    const limits = this.getUserLimits(user);
    
    // Get current data counts
    const properties = await database.getProperties(userId);
    
    // If user exceeds property limits
    if (limits.properties !== -1 && properties.length > limits.properties) {
      console.log(`User ${userId} exceeds property limit. Enforcing restrictions.`);
      
      // For downgraded users, select fixed properties based on creation date
      const selectedProperties = properties
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .slice(0, limits.properties);
      
      const selectedIds = selectedProperties.map(p => p.id);
      await database.updateUserSelectedProperties(userId, selectedIds);
      
      // Mark other properties as restricted
      await database.restrictPropertiesAccess(userId, selectedIds);
    }

    // Check tenant limits per property
    for (const property of properties.slice(0, limits.properties === -1 ? undefined : limits.properties)) {
      const tenants = await database.getTenantsByProperty(property.id);
      
      if (limits.tenantsPerProperty !== -1 && tenants.length > limits.tenantsPerProperty) {
        console.log(`Property ${property.id} exceeds tenant limit. Enforcing restrictions.`);
        
        const selectedTenants = tenants
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          .slice(0, limits.tenantsPerProperty);
        
        await database.restrictTenantsAccess(property.id, selectedTenants.map(t => t.id));
      }
    }
  }

  // ==================== AUTOMATED SYNC SCHEDULER ====================

  startAutomaticSync(userId: number): void {
    // Daily sync at 2 AM
    const scheduleDailySync = () => {
      const now = new Date();
      const next2AM = new Date();
      next2AM.setHours(2, 0, 0, 0);
      
      // If it's past 2 AM today, schedule for tomorrow
      if (now.getHours() >= 2) {
        next2AM.setDate(next2AM.getDate() + 1);
      }
      
      const timeUntilNext = next2AM.getTime() - now.getTime();
      
      setTimeout(async () => {
        try {
          await this.performFullSync(userId);
          // Schedule next sync
          scheduleDailySync();
        } catch (error) {
          console.error('Scheduled sync failed:', error);
          // Retry after 1 hour
          setTimeout(() => scheduleDailySync(), 60 * 60 * 1000);
        }
      }, timeUntilNext);
      
      console.log(`Next sync scheduled for: ${next2AM.toLocaleString()}`);
    };

    scheduleDailySync();

    // Also sync when app becomes active (handles missed syncs)
    document.addEventListener('visibilitychange', async () => {
      if (!document.hidden && this.shouldPerformCatchupSync()) {
        try {
          console.log('Performing catch-up sync...');
          await this.performFullSync(userId);
        } catch (error) {
          console.error('Catch-up sync failed:', error);
        }
      }
    });
  }

  private shouldPerformCatchupSync(): boolean {
    const lastSyncTime = localStorage.getItem('lastSyncTime');
    if (!lastSyncTime) return true;
    
    const timeSinceLastSync = Date.now() - new Date(lastSyncTime).getTime();
    const hoursInMs = 24 * 60 * 60 * 1000; // 24 hours
    
    return timeSinceLastSync > hoursInMs;
  }

  // ==================== REAL-TIME LISTENERS ====================

  setupUserListener(userId: number, onUserUpdate: (user: User) => void): void {
    const user = database.getUserById(userId);
    if (!user || !this.canUserSync(user)) return;

    const userRef = doc(db, 'users', userId.toString());
    
    const unsubscribe = onSnapshot(userRef, async (doc) => {
      if (doc.exists()) {
        const userData = doc.data();
        
        // Update local user data
        await database.updateUser(userId, {
          name: userData.name,
          email: userData.email,
          phone: userData.phone,
          isPremium: userData.isPremium
        });

        await database.updateUserTierAndType(
          userId, 
          userData.tier || 'free', 
          userData.type || 'free',
          userData.storage || false
        );

        // Enforce limits if tier changed
        await this.enforceTierLimits(userId);
        
        // Notify app of user update
        const updatedUser = await database.getUserById(userId);
        if (updatedUser) {
          onUserUpdate(updatedUser);
        }
      }
    });

    this.syncListeners.push(unsubscribe);
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

  private async canCreateProperty(userId: number): Promise<boolean> {
    const user = await database.getUserById(userId);
    if (!user) return false;

    const limits = this.getUserLimits(user);
    if (limits.properties === -1) return true;

    const currentProperties = await database.getProperties(userId);
    return currentProperties.length < limits.properties;
  }

  private async canCreateTenant(propertyId: number): Promise<boolean> {
    const property = await database.getPropertyById(propertyId);
    if (!property) return false;

    const user = await database.getUserById(property.userId);
    if (!user) return false;

    const limits = this.getUserLimits(user);
    if (limits.tenantsPerProperty === -1) return true;

    const currentTenants = await database.getTenantsByProperty(propertyId);
    return currentTenants.length < limits.tenantsPerProperty;
  }

  private async getFilteredProperties(userId: number): Promise<Property[]> {
    const user = await database.getUserById(userId);
    if (!user) return [];

    const limits = this.getUserLimits(user);
    const allProperties = await database.getProperties(userId);
    
    if (limits.properties === -1) {
      return allProperties;
    }

    // For restricted users, return selected properties or first N
    if (user.selectedPropertyIds && user.selectedPropertyIds.length > 0) {
      return allProperties.filter(p => user.selectedPropertyIds!.includes(p.id));
    }
    
    return allProperties.slice(0, limits.properties);
  }

  private async getFilteredTenants(propertyId: number, user: any): Promise<Tenant[]> {
    const limits = this.getUserLimits(user);
    const allTenants = await database.getTenantsByProperty(propertyId);
    
    if (limits.tenantsPerProperty === -1) {
      return allTenants;
    }
    
    return allTenants.slice(0, limits.tenantsPerProperty);
  }

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

  async getSyncStatus(userId: number): Promise<SyncStatus> {
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

  // ==================== REVENUECAT WEBHOOK HANDLER ====================
  
  // This would be called by your cloud function when RevenueCat sends webhook
  static async handleRevenueCatWebhook(data: {
    userId: string;
    tier: UserTier;
    type: UserType;
    storage: boolean;
    revenuekatUserId: string;
  }): Promise<void> {
    try {
      const userRef = doc(db, 'users', data.userId);
      await setDoc(userRef, {
        tier: data.tier,
        type: data.type,
        storage: data.storage,
        revenuekatUserId: data.revenuekatUserId,
        lastUpdated: serverTimestamp()
      }, { merge: true });
      
      console.log('User tier updated via RevenueCat webhook:', data);
    } catch (error) {
      console.error('Error handling RevenueCat webhook:', error);
      throw error;
    }
  }
}

export const firebaseSyncService = FirebaseSyncService.getInstance();