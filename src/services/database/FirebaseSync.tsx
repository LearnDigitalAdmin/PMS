// services/sync/FirebaseSyncService.ts - SIMPLIFIED VERSION
import { initializeApp } from 'firebase/app';
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
  onSnapshot,
  type Unsubscribe,
  Timestamp
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
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
const storage = getStorage(app);

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
  private userListeners = new Map<number, Unsubscribe>();
  private uploadScheduleTimers = new Map<number, NodeJS.Timeout>();
  
  private readonly UPLOAD_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
  private readonly OPERATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
  
  private readonly LAST_UPLOAD_KEY = 'lastUploadTime';
  private readonly LAST_DOWNLOAD_KEY = 'lastDownloadTime';
  private readonly UPLOAD_SCHEDULE_KEY = 'uploadScheduleEnabled';

  static getInstance(): FirebaseSyncService {
    if (!this.instance) {
      this.instance = new FirebaseSyncService();
    }
    return this.instance;
  }

  // ==================== SIMPLIFIED DOWNLOAD - PARALLEL + ORPHAN CLEANUP ====================

  private async downloadAllData(userId: number): Promise<void> {
    console.log('📥 Starting PARALLEL download...');
    
    try {
      // Download everything in parallel - let the database handle relationships
      const [propertiesResult, tenantsResult, invoicesResult] = await Promise.all([
        this.downloadProperties(userId),
        this.downloadTenants(userId),
        this.downloadInvoices(userId)
      ]);

      console.log(`✅ Downloaded: ${propertiesResult} properties, ${tenantsResult} tenants, ${invoicesResult} invoices`);

      // Clean up orphans after download
      await this.purgeOrphans(userId);
      
      console.log('✅ Download complete with orphan cleanup');
      
    } catch (error) {
      console.error('❌ Download failed:', error);
      throw error;
    }
  }

  private async downloadProperties(userId: number): Promise<number> {
    try {
      const snapshot = await getDocs(
        query(collection(db, 'users', userId.toString(), 'properties'), orderBy('lastSyncTime', 'desc'))
      );
      
      let count = 0;
      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (!data?.localId) continue;
        
        await this.upsertProperty(userId, data);
        
        // Download units for this property
        //await this.downloadUnits(userId, doc.id, data.localId);
        count++;
      }
      
      return count;
    } catch (error) {
      console.error('❌ Properties download failed:', error);
      return 0;
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
      const snapshot = await getDocs(
        query(collection(db, 'users', userId.toString(), 'tenants'), orderBy('lastSyncTime', 'desc'))
      );
      
      let count = 0;
      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (!data?.localId || !data?.propertyId) continue;
        
        await this.upsertTenant(data);
        count++;
      }
      
      return count;
    } catch (error) {
      console.error('❌ Tenants download failed:', error);
      return 0;
    }
  }

  private async downloadInvoices(userId: number): Promise<number> {
    try {
      const snapshot = await getDocs(
        query(collection(db, 'users', userId.toString(), 'invoices'), orderBy('lastSyncTime', 'desc'))
      );
      
      let count = 0;
      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (!data?.localId || !data?.tenantId || !data?.propertyId) continue;
        
        await this.upsertInvoice(data);
        
        // Download payments for this invoice
        await this.downloadPayments(userId, doc.id, data.localId);
        count++;
      }
      
      return count;
    } catch (error) {
      console.error('❌ Invoices download failed:', error);
      return 0;
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

  // ==================== SIMPLE UPSERT OPERATIONS ====================

  private async upsertProperty(userId: number, data: any): Promise<void> {
    try {
      let local = null;
      try {
        local = await database.getPropertyById(data.localId);
      } catch {}
      
      if (!local) {
        const canCreate = await database.canCreateProperty?.(userId);
        if (canCreate?.allowed !== false) {
          await database.createProperty({
            userId: data.userId || userId,
            companyId: data.companyId,
            name: data.name || 'Restored Property',
            address: data.address || '',
            description: data.description || '',
            image: data.image,
            agentCommissionRate: data.agentCommissionRate || 0,
            maxUnits: data.maxUnits || 50
          });
        }
      } else if (!local.isRestricted && this.isNewer(data.lastModified, local.updatedAt)) {
        await database.updateProperty(data.localId, {
          name: data.name || local.name,
          address: data.address || local.address,
          description: data.description || local.description,
          image: data.image || local.image,
          agentCommissionRate: data.agentCommissionRate ?? local.agentCommissionRate,
          maxUnits: data.maxUnits || local.maxUnits
        });
      }
    } catch (error) {
      console.error(`❌ Upsert property ${data.localId} failed:`, error);
    }
  }

  // private async upsertUnit(propertyId: number, data: any): Promise<void> {
  //   try {
  //     const existing = await database.getUnitsByProperty(propertyId);
  //     const found = existing.find(u => u.id === data.localId);
      
  //     if (!found) {
  //       await database.createUnit(propertyId, {
  //         unitNumber: data.unitNumber || '',
  //         rentAmount: data.rentAmount || 0,
  //         status: data.status || 'vacant'
  //       });
  //     } else if (this.isNewer(data.lastModified, found.createdAt)) {
  //       await database.updateUnit(data.localId, {
  //         unitNumber: data.unitNumber || found.unitNumber,
  //         rentAmount: data.rentAmount ?? found.rentAmount,
  //         status: data.status || found.status
  //       });
  //     }
  //   } catch (error) {
  //     console.error(`❌ Upsert unit ${data.localId} failed:`, error);
  //   }
  // }

  private async upsertTenant(data: any): Promise<void> {
    try {
      let local = null;
      try {
        local = await database.getTenantById(data.localId);
      } catch {}
      
      if (!local) {
        await database.createTenant({
          id: data.localId,
          propertyId: data.propertyId,
          name: data.name || 'Restored Tenant',
          phone: data.phone || '',
          email: data.email || '',
          unitNumber: data.unitNumber || '',
          rentAmount: data.rentAmount || 0,
          standingFees: data.standingFees || 0,
          depositAmount: data.depositAmount || 0,
          leaseStart: data.leaseStart,
          leaseEnd: data.leaseEnd
        });
      } else if (!local.isRestricted && this.isNewer(data.lastModified, local.updatedAt)) {
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
      }
    } catch (error) {
      console.error(`❌ Upsert tenant ${data.localId} failed:`, error);
    }
  }

  private async upsertInvoice(data: any): Promise<void> {
    try {
      let local = null;
      try {
        local = await database.getInvoiceById(data.localId);
      } catch {}
      
      if (!local) {
        await database.createInvoice({
          id: data.localId,
          tenantId: data.tenantId,
          propertyId: data.propertyId,
          billingMonth: data.billingMonth || new Date().toISOString().substring(0, 7),
          rentAmount: data.rentAmount || 0,
          waterCurrentReading: data.waterCurrentReading || 0,
          waterPreviousReading: data.waterPreviousReading || 0,
          waterStandingFee: data.waterStandingFee || 0,
          waterUnitPrice: data.waterUnitPrice || 0,
          powerCurrentReading: data.powerCurrentReading || 0,
          powerPreviousReading: data.powerPreviousReading || 0,
          powerUnitPrice: data.powerUnitPrice || 0,
          otherCharges: data.otherCharges || 0,
          otherChargesDescription: data.otherChargesDescription || '',
          dueDate: data.dueDate,
          isPaid: data.isPaid || false
        });
        
        // Restore payment data
        if (data.amountPaid > 0 || data.arrears > 0) {
          await database.markInvoicePaid(data.localId, data.amountPaid, data.arrears);
          // await database.db!.run(
          //   `UPDATE invoices SET amount_paid = ?, arrears = ?, paid_date = ?, is_paid = ? WHERE id = ?`,
          //   [data.amountPaid, data.arrears, data.paidDate, data.isPaid, data.localId]
          // );
        }
      } else if (this.isNewer(data.lastModified, local.updatedAt)) {
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
        
        // Always sync payment data from server (authoritative)
        if (data.amountPaid > 0 || data.arrears > 0) {
          await database.markInvoicePaid(data.localId, data.amountPaid, data.arrears);
          // await database.db!.run(
          //   `UPDATE invoices SET amount_paid = ?, arrears = ?, paid_date = ?, is_paid = ? WHERE id = ?`,
          //   [data.amountPaid, data.arrears, data.paidDate, data.isPaid, data.localId]
          // );
        }
      }
    } catch (error) {
      console.error(`❌ Upsert invoice ${data.localId} failed:`, error);
    }
  }

  private async upsertPayment(invoiceId: number, data: any): Promise<void> {
    try {
      const existing = await database.getPaymentsByInvoice(invoiceId);
      const found = existing.find(p => p.id === data.localId);
      
      if (!found) {
        await database.createPayment({
          invoiceId,
          amount: data.amount || 0,
          paymentDate: data.paymentDate || new Date().toISOString().split('T')[0],
          paymentMethod: data.paymentMethod || 'Cash',
          notes: data.notes || ''
        });
      }
    } catch (error) {
      console.error(`❌ Upsert payment ${data.localId} failed:`, error);
    }
  }

  // ==================== ORPHAN CLEANUP ====================

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

  private async uploadProperties(userId: number, batchManager: SafeBatchManager): Promise<void> {
    const properties = await this.getFilteredPropertiesForSync(userId);
    
    for (const property of properties) {
      const ref = doc(db, 'users', userId.toString(), 'properties', property.id.toString());
      const existing = await getDoc(ref);
      
      batchManager.addOperation((batch) => {
        batch.set(ref, {
          ...(existing.exists() ? existing.data() : {}),
          ...property,
          userId,
          localId: property.id,
          lastSyncTime: serverTimestamp(),
          lastModified: new Date().toISOString()
        }, { merge: true });
      }, `Property ${property.id}`, existing.exists() ? 'UPDATE' : 'CREATE');
      
      // Upload units
      const units = await database.getUnitsByProperty(property.id);
      for (const unit of units) {
        const unitRef = doc(db, 'users', userId.toString(), 'properties', property.id.toString(), 'units', unit.id.toString());
        const existingUnit = await getDoc(unitRef);
        
        batchManager.addOperation((batch) => {
          batch.set(unitRef, {
            ...(existingUnit.exists() ? existingUnit.data() : {}),
            ...unit,
            userId,
            propertyId: property.id,
            localId: unit.id,
            lastSyncTime: serverTimestamp(),
            lastModified: new Date().toISOString()
          }, { merge: true });
        }, `Unit ${unit.id}`, existingUnit.exists() ? 'UPDATE' : 'CREATE');
      }
    }
  }

  private async uploadTenants(userId: number, batchManager: SafeBatchManager): Promise<void> {
    const properties = await this.getFilteredPropertiesForSync(userId);
    const user = await database.getUserById(userId);
    
    for (const property of properties) {
      const tenants = await this.getFilteredTenantsForSync(property.id, user);
      
      for (const tenant of tenants) {
        const ref = doc(db, 'users', userId.toString(), 'tenants', tenant.id.toString());
        const existing = await getDoc(ref);
        
        batchManager.addOperation((batch) => {
          batch.set(ref, {
            ...(existing.exists() ? existing.data() : {}),
            ...tenant,
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

  private async uploadInvoices(userId: number, batchManager: SafeBatchManager): Promise<void> {
    const properties = await this.getFilteredPropertiesForSync(userId);
    const user = await database.getUserById(userId);
    
    for (const property of properties) {
      const tenants = await this.getFilteredTenantsForSync(property.id, user);
      
      for (const tenant of tenants) {
        const invoices = await database.getInvoices({ tenantId: tenant.id });
        
        for (const invoice of invoices) {
          const ref = doc(db, 'users', userId.toString(), 'invoices', invoice.id.toString());
          const existing = await getDoc(ref);
          
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
              userId,
              tenantId: invoice.tenantId,
              propertyId: property.id,
              localId: invoice.id,
              pdfUrl,
              pdfStatus: statusSuffix,
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
      
      const payments = await database.getPaymentsByInvoice(invoice.id);
      const companyInfo = this.getCompanyInfo(user, company);
      const paymentInstructions = this.getPaymentInstructions();
      
      const pdfBytes = await generateInvoicePDF(
        invoice,
        property,
        payments,
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
      throw new Error('Download already in progress');
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
      throw new Error('Upload already in progress');
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

  // ==================== PUBLIC API - INITIALIZATION ====================

  async initializeForUser(userId: number): Promise<SyncStatus> {
    console.log(`🚀 Initializing sync for user ${userId}...`);
    
    try {
      this.setupUserListener(userId, (user) => {
        console.log('👤 User updated:', user.tier);
      });
      
      this.startUploadScheduling(userId);
      
      integrateWithFirebaseSync(userId);
      
      const result = await this.performFullSync(userId);
      
      console.log('✅ Sync initialized');
      return result;
    } catch (error) {
      console.error('❌ Sync initialization failed:', error);
      throw error;
    }
  }

  // ==================== PUBLIC API - FORCE OPERATIONS ====================

  async forceDownload(userId: number): Promise<SyncStatus> {
    return this.performDownloadSync(userId, 'manual');
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

  // ==================== CLEANUP ====================

  cleanup(userId?: number): void {
    if (userId) {
      this.removeUserListener(userId);
      this.stopUploadScheduling(userId);
      this.releaseOperationLock(`download_${userId}`);
      this.releaseOperationLock(`upload_${userId}`);
    } else {
      this.userListeners.forEach((listener, uid) => {
        listener();
        this.stopUploadScheduling(uid);
      });
      this.userListeners.clear();
      this.uploadScheduleTimers.clear();
      this.operationLocks.clear();
    }
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