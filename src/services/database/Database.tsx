// Database.tsx - Complete SQLite Database Implementation with Transaction Fixes
import { type capSQLiteChanges } from '@capacitor-community/sqlite';
//import SQLiteConnectionManager from './Initializer';SQLiteDBConnection, t
import { db, USER_LIMITS, type UserTier, type UserType } from './FirebaseSync';
import { deleteDoc, doc } from 'firebase/firestore';
import { tables } from './Tables';
import { argon2id, argon2Verify } from 'hash-wasm';
import { 
  UniversalConnectionManager as SQLiteConnectionManager,
  type UniversalSQLiteConnection  // Import the interface
} from './UniversalSQLiteAdapter';

// ==================== TYPE INTERFACES ====================
export interface User {
  id: number;
  name: string;
  email?: string;
  phone?: number;
  passwordHash?: string;
  isPremium: boolean;
  type: UserType; // New field for user type
  tier: UserTier; // 'free' | 'low' | 'business' | 'enterprise'
  storage: boolean; // Cloud storage and multi-device sync permission
  revenuekatUserId?: string; // RevenueCat user identifier
  selectedPropertyIds?: number[]; // For restricted users
  restrictedAccess: boolean; // When user exceeds limits
  createdAt: string;
  updatedAt: string;
}

// Keep existing interfaces but add access control fields where needed
export interface Property {
  id: number;
  userId: number;
  companyId?: number;
  name: string;
  address?: string;
  description?: string;
  image?: string;
  agentCommissionRate: number;
  maxUnits: number;
  billingMode: 'rent_only' | 'full'; // 'rent_only': invoices are rent-only, no water/power metering. 'full': itemized billing (default).
  isRestricted?: boolean; // Added for access control
  createdAt: string;
  updatedAt: string;
}

export interface Tenant {
  id: number;
  propertyId: number;
  name: string;
  phone?: string;
  email?: string;
  unitNumber?: string;
  rentAmount: number;
  standingFees: number;
  depositAmount: number;
  leaseStart?: string;
  leaseEnd?: string;
  isActive: boolean;
  isRestricted?: boolean; // Added for access control
  createdAt: string;
  updatedAt: string;
}

// Enhanced input interface with validation
export interface UserWithCompanyInput {
  user: {
    id: number;
    name: string;
    email: string;
    phone?: number;
    password: string;
    type?: "free" | "paid";
    tier?: UserTier;
  };
  company?: CompanyInput;
}

// export interface User {
//   id: number;
//   name: string;
//   email?: string;
//   phone?: string;
//   passwordHash?: string;
//   isPremium: boolean;
//   createdAt: string;
//   updatedAt: string;
// }

// // export interface Property {
// //   id: number;
// //   userId: number;
// //   name: string;
// //   address?: string;
// //   description?: string;
// //   agentCommissionRate: number;
// //   createdAt: string;
// //   updatedAt: string;
// // }


// export interface Property {
//   id: number;
//   userId: number;
//   companyId?: number;
//   name: string;
//   address?: string;
//   description?: string;
//   image?: string; // Base64 encoded image
//   agentCommissionRate: number;
//   maxUnits: number;
//   createdAt: string;
//   updatedAt: string;
// }

export interface Unit {
  id: number;
  propertyId: number;
  unitNumber: string;
  rentAmount: number;
  isOccupied: boolean;
  createdAt: string;
  updatedAt: string;
}

// Updated input interfaces
export interface PropertyInput {
  userId: number;
  companyId?: number;
  name: string;
  address?: string;
  description?: string;
  image?: string;
  agentCommissionRate?: number;
  maxUnits?: number;
  billingMode?: 'rent_only' | 'full';
  isRestricted?: boolean; // Added for access control
}

export interface UnitInput {
  propertyId: number;
  unitNumber: string;
  rentAmount: number;
}

export interface PropertyWithUnits {
  id: number;
  userId: number;
  companyId?: number;
  name: string;
  address?: string;
  description?: string;
  image?: string; //extends Property  Base64 encoded image
  agentCommissionRate: number;
  maxUnits: number;
  billingMode: 'rent_only' | 'full';
  createdAt: string;
  updatedAt: string;
  units: Unit[];
  monthlyRevenue: number;
  occupancyRate: number;
}


// export interface Tenant {
//   id: number;
//   propertyId: number;
//   name: string;
//   phone?: string;
//   email?: string;
//   unitNumber?: string;
//   rentAmount: number;
//   standingFees: number;
//   depositAmount: number;
//   leaseStart?: string;
//   leaseEnd?: string;
//   isActive: boolean;
//   createdAt: string;
//   updatedAt: string;
// }

export interface Invoice {
  id: number;
  tenantId: number;
  propertyId: number;
  invoiceNumber: string;
  billingMonth: string; // YYYY-MM format
  rentAmount: number;
  waterCurrentReading: number;
  waterPreviousReading: number;
  waterStandingFee: number;
  waterUnitPrice: number;
  powerCurrentReading: number;
  powerPreviousReading: number;
  powerUnitPrice: number;
  otherCharges: number;
  otherChargesDescription?: string;
  totalAmount: number;
  amountPaid: number;
  arrears: number;
  isPaid: boolean;
  dueDate?: string;
  paidDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceInput {
  id: number; 
  tenantId: number;
  propertyId: number;
  billingMonth: string;
  rentAmount: number;
  waterCurrentReading?: number;
  waterPreviousReading?: number;
  waterStandingFee?: number;
  waterUnitPrice?: number;
  powerCurrentReading?: number;
  powerPreviousReading?: number;
  powerUnitPrice?: number;
  otherCharges?: number;
  otherChargesDescription?: string;
  dueDate?: string;
  isPaid?: string;
  invoiceNumber?: string;
  totalAmount?: number;
}

export interface Payment {
  id: number;
  invoiceId: number;
  amount: number;
  paymentDate: string;
  paymentMethod?: string;
  notes?: string;
  createdAt: string;
}

// Input interfaces for creation
// export interface PropertyInput {
//   userId: number;
//   name: string;
//   address?: string;
//   description?: string;
//   agentCommissionRate?: number;
// }

export interface TenantInput {
  id?: number; // Optional for creation
  propertyId: number;
  name: string;
  phone?: string;
  email?: string;
  unitNumber?: string;
  rentAmount: number;
  standingFees?: number;
  depositAmount?: number;
  leaseStart?: string;
  leaseEnd?: string;
  isRestricted?: boolean;
}

// Dashboard and analytics interfaces
export interface DashboardData {
  totalProperties: number;
  totalTenants: number;
  monthlyRevenue: number;
  totalArrears: number;
  paidInvoices: number;
  unpaidInvoices: number;
  occupancyRate: number;
}

export interface MonthlyStats {
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
  paidCount: number;
  unpaidCount: number;
}

export interface InvoiceFilters {
  propertyId?: number;
  tenantId?: number;
  billingMonth?: string;
  isPaid?: boolean;
  startDate?: string;
  endDate?: string;
}

export interface PropertyWithTenants extends Property {
  tenants: Tenant[];
  monthlyRevenue: number;
  agentIncome: number;
  occupancyRate: number;
}

export interface TenantWithInvoices extends Tenant {
  currentInvoice?: Invoice;
  totalArrears: number;
  lastPaymentDate?: string;
}

export interface InvoiceWithDetails extends Invoice {
  tenantName: string;
  propertyName: string;
  tenantPhone?: string;
  tenantEmail?: string;
}

export interface Company {
  id: number;
  userId: number;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyInput {
  //id: number;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
}

// export interface UserWithCompanyInput {
//   user: {
//     id: number;
//     name: string;
//     email: string;
//     phone?: string;
//     password: string;
//   };
//   company?: CompanyInput;
// }

export interface AuthResult {
  user: User;
  company?: Company;
}



// ==================== DATABASE MANAGER ====================

export class DatabaseManager {
  private connectionManager: SQLiteConnectionManager;
  //public db: SQLiteDBConnection | null = null;
  public db: UniversalSQLiteConnection | null = null;
  private readonly DB_NAME = 'Plot';
  private fireDB = db;
  // 2. FIX: Add missing USER_LIMITS constant
USER_LIMITS: any = {USER_LIMITS};

  constructor() {
    this.connectionManager = SQLiteConnectionManager.getInstance();
  }

  async initializeDatabase(): Promise<void> {
    try {
      console.log('Initializing Database...');
      
      this.db = await this.connectionManager.getConnection(this.DB_NAME);
      
      await tables.initializeDatabase();

      //await this.cleanupStaleCache();
      await this.optimizeAgentSummaryTables();
      
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Error initializing database:', error);
      throw error;
    }
  }

  // ==================== INITIALIZATION ====================
  // ==================== ADDITIONAL DATABASE.TSX SECURITY PATCHES ====================

// 1. FIX: Secure getPropertiesWithUnits (prevents data leakage)
async getPropertiesWithUnits(userId: number): Promise<PropertyWithUnits[]> {
  try {
    const user = await this.getUserById(userId);
    if (!user) return [];

    // CRITICAL: Only get accessible properties
    let query = `
      SELECT 
        p.*,
        COUNT(u.id) as unit_count,
        COUNT(CASE WHEN u.is_occupied = 1 THEN 1 END) as occupied_units,
        SUM(CASE WHEN u.is_occupied = 1 THEN u.rent_amount ELSE 0 END) as monthly_revenue
      FROM properties p
      LEFT JOIN units u ON p.id = u.property_id
      WHERE p.user_id = ? AND p.is_restricted = 0
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;
    
    const result = await this.db!.query(query, [userId]);
    const properties = result.values || [];
    
    const propertiesWithUnits: PropertyWithUnits[] = [];
    
    for (const prop of properties) {
      const units = await this.getUnitsByProperty(prop.id);
      propertiesWithUnits.push({
        ...this.mapToProperty(prop),
        units,
        monthlyRevenue: prop.monthly_revenue || 0,
        occupancyRate: prop.unit_count > 0 ? (prop.occupied_units / prop.unit_count) * 100 : 0
      });
    }
    
    return propertiesWithUnits;
  } catch (error) {
    console.error('Error getting properties with units:', error);
    return [];
  }
}

// 2. FIX: Secure getPropertiesWithTenants (prevents data leakage)
async getPropertiesWithTenants(userId: number): Promise<PropertyWithTenants[]> {
  try {
    const user = await this.getUserById(userId);
    if (!user) return [];

    // CRITICAL: Only accessible properties and tenants
    const query = `
      SELECT 
        p.*,
        COUNT(CASE WHEN t.is_restricted = 0 THEN t.id END) as tenant_count,
        SUM(CASE WHEN t.is_restricted = 0 THEN t.rent_amount ELSE 0 END) as monthly_revenue,
        COUNT(CASE WHEN t.is_active = 1 AND t.is_restricted = 0 THEN 1 END) as active_tenants
      FROM properties p
      LEFT JOIN tenants t ON p.id = t.property_id
      WHERE p.user_id = ? AND p.is_restricted = 0
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;
    
    const result = await this.db!.query(query, [userId]);
    const properties = result.values || [];
    
    const propertiesWithTenants: PropertyWithTenants[] = [];
    
    for (const prop of properties) {
      const tenants = await this.getTenantsByProperty(prop.id);
      const monthlyRevenue = prop.monthly_revenue || 0;
      
      propertiesWithTenants.push({
        ...this.mapToProperty(prop),
        tenants,
        monthlyRevenue,
        agentIncome: monthlyRevenue * (prop.agent_commission_rate || 0) / 100,
        occupancyRate: prop.max_units > 0 ? (prop.active_tenants / prop.max_units) * 100 : 0
      });
    }
    
    return propertiesWithTenants;
  } catch (error) {
    console.error('Error getting properties with tenants:', error);
    return [];
  }
}

// 3. FIX: Secure createUnit with property validation
async createUnit(unit: UnitInput): Promise<Unit> {
  // CRITICAL: Validate property access before creating unit
  const property = await this.getPropertyById(unit.propertyId);
  if (!property) {
    throw new Error('Property not found');
  }
  
  if (property.isRestricted) {
    throw new Error('Cannot create unit for restricted property. Upgrade your plan to access.');
  }

  // Check if property has reached max units
  const existingUnits = await this.getUnitsByProperty(unit.propertyId);
  if (existingUnits.length >= property.maxUnits) {
    throw new Error(`Property has reached maximum units limit (${property.maxUnits})`);
  }

  const query = `
    INSERT INTO units (property_id, unit_number, rent_amount)
    VALUES (?, ?, ?)
  `;
  
  const result = await this.db!.run(query, [
    unit.propertyId,
    unit.unitNumber,
    unit.rentAmount
  ]);

  const createdUnit = await this.getUnitById(result.changes!.lastId!);
  if (!createdUnit) {
    throw new Error('Failed to retrieve created unit');
  }
  return createdUnit;
}

// 4. FIX: Secure getUnitsByProperty (prevents access to restricted properties)
async getUnitsByProperty(propertyId: number): Promise<Unit[]> {
  try {
    const property = await this.getPropertyById(propertyId);
    if (!property || property.isRestricted) {
      return []; // Return empty for restricted properties
    }

    const query = `
      SELECT * FROM units 
      WHERE property_id = ? 
      ORDER BY unit_number ASC
    `;
    
    const result = await this.db!.query(query, [propertyId]);
    return this.mapToUnits(result.values || []);
  } catch (error) {
    console.error('Error getting units by property:', error);
    return [];
  }
}

// 5. FIX: Secure updateUnit with validation
async updateUnit(id: number, unit: Partial<UnitInput>): Promise<void> {
  // CRITICAL: Validate unit access through property
  const existingUnit = await this.getUnitById(id);
  if (!existingUnit) {
    throw new Error('Unit not found');
  }
  
  const property = await this.getPropertyById(existingUnit.propertyId);
  if (!property || property.isRestricted) {
    throw new Error('Cannot update unit for restricted property. Upgrade your plan to access.');
  }

  const fields = [];
  const values = [];
  
  if (unit.unitNumber !== undefined) {
    fields.push('unit_number = ?');
    values.push(unit.unitNumber);
  }
  if (unit.rentAmount !== undefined) {
    fields.push('rent_amount = ?');
    values.push(unit.rentAmount);
  }
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  
  const query = `UPDATE units SET ${fields.join(', ')} WHERE id = ?`;
  await this.db!.run(query, values);
}

// 6. FIX: Secure deleteUnit with validation
async deleteUnit(id: number): Promise<void> {
  const unit = await this.getUnitById(id);
  if (!unit) {
    throw new Error('Unit not found');
  }
  
  const property = await this.getPropertyById(unit.propertyId);
  if (!property || property.isRestricted) {
    throw new Error('Cannot delete unit for restricted property. Upgrade your plan to access.');
  }
  
  await this.db!.run('DELETE FROM units WHERE id = ?', [id]);
}

// 7. FIX: Secure getTenantsWithInvoices (prevents data leakage)
async getTenantsWithInvoices(propertyId: number, billingMonth?: string): Promise<TenantWithInvoices[]> {
  try {
    const property = await this.getPropertyById(propertyId);
    if (!property || property.isRestricted) {
      return []; // Return empty for restricted properties
    }

    const query = `
      SELECT 
        t.*,
        i.id as current_invoice_id,
        i.total_amount as current_invoice_total,
        i.is_paid as current_invoice_paid,
        SUM(i.arrears) as total_arrears,
        MAX(p.payment_date) as last_payment_date
      FROM tenants t
      LEFT JOIN invoices i ON t.id = i.tenant_id ${billingMonth ? 'AND i.billing_month = ?' : ''}
      LEFT JOIN payments p ON i.id = p.invoice_id
      WHERE t.property_id = ? AND t.is_restricted = 0
      GROUP BY t.id
      ORDER BY t.name ASC
    `;
    
    const params = billingMonth ? [billingMonth, propertyId] : [propertyId];
    const result = await this.db!.query(query, params);
    
    const tenantsWithInvoices: TenantWithInvoices[] = [];
    
    for (const row of result.values || []) {
      const tenant = this.mapToTenant(row);
      const currentInvoice = row.current_invoice_id ? 
        await this.getInvoiceById(row.current_invoice_id) : undefined;
      
      tenantsWithInvoices.push({
        ...tenant,
        currentInvoice: currentInvoice || undefined,
        totalArrears: row.total_arrears || 0,
        lastPaymentDate: row.last_payment_date
      });
    }
    
    return tenantsWithInvoices;
  } catch (error) {
    console.error('Error getting tenants with invoices:', error);
    return [];
  }
}

// 8. FIX: Secure searchTenants (respects restrictions)
async searchTenants(propertyId: number, searchTerm: string): Promise<Tenant[]> {
  try {
    const property = await this.getPropertyById(propertyId);
    if (!property || property.isRestricted) {
      return []; // Return empty for restricted properties
    }

    const query = `
      SELECT * FROM tenants 
      WHERE property_id = ? AND is_restricted = 0 AND (
        name LIKE ? OR 
        unit_number LIKE ? OR 
        phone LIKE ?
      )
      ORDER BY name ASC
    `;
    
    const searchPattern = `%${searchTerm}%`;
    const result = await this.db!.query(query, [
      propertyId, searchPattern, searchPattern, searchPattern
    ]);
    
    return this.mapToTenants(result.values || []);
  } catch (error) {
    console.error('Error searching tenants:', error);
    return [];
  }
}

// 9. FIX: Secure getMonthlyStats (only accessible data)
async getMonthlyStats(propertyId: number, year: number): Promise<MonthlyStats[]> {
  try {
    const property = await this.getPropertyById(propertyId);
    if (!property || property.isRestricted) {
      return []; // Return empty for restricted properties
    }

    const query = `
      SELECT 
        i.billing_month as month,
        SUM(CASE WHEN i.is_paid = 1 THEN i.total_amount ELSE 0 END) as revenue,
        0 as expenses,
        SUM(CASE WHEN i.is_paid = 1 THEN i.total_amount ELSE 0 END) as profit,
        COUNT(CASE WHEN i.is_paid = 1 THEN 1 END) as paid_count,
        COUNT(CASE WHEN i.is_paid = 0 THEN 1 END) as unpaid_count
      FROM invoices i
      JOIN tenants t ON i.tenant_id = t.id AND t.is_restricted = 0
      WHERE i.property_id = ? AND i.billing_month LIKE ?
      GROUP BY i.billing_month
      ORDER BY i.billing_month ASC
    `;
    
    const result = await this.db!.query(query, [propertyId, `${year}-%`]);
    
    return (result.values || []).map(row => ({
      month: row.month,
      revenue: row.revenue || 0,
      expenses: row.expenses || 0,
      profit: row.profit || 0,
      paidCount: row.paid_count || 0,
      unpaidCount: row.unpaid_count || 0
    }));
  } catch (error) {
    console.error('Error getting monthly stats:', error);
    return [];
  }
}

// 10. FIX: Add offline capability check method
async checkOfflineCapabilities(userId: number): Promise<{
  canWorkOffline: boolean;
  localDataCount: {
    properties: number;
    tenants: number;
    invoices: number;
    payments: number;
  };
  syncStatus: 'online' | 'offline' | 'sync_available' | 'sync_restricted';
}> {
  const user = await this.getUserById(userId);
  if (!user) {
    return {
      canWorkOffline: false,
      localDataCount: { properties: 0, tenants: 0, invoices: 0, payments: 0 },
      syncStatus: 'offline'
    };
  }

  // Count local accessible data
  const propertiesQuery = `SELECT COUNT(*) as count FROM properties WHERE user_id = ? AND is_restricted = 0`;
  const propResult = await this.db!.query(propertiesQuery, [userId]);
  const propertyCount = propResult.values?.[0]?.count || 0;

  const tenantsQuery = `
    SELECT COUNT(*) as count FROM tenants t 
    JOIN properties p ON t.property_id = p.id 
    WHERE p.user_id = ? AND t.is_restricted = 0 AND p.is_restricted = 0
  `;
  const tenantResult = await this.db!.query(tenantsQuery, [userId]);
  const tenantCount = tenantResult.values?.[0]?.count || 0;

  const invoicesQuery = `
    SELECT COUNT(*) as count FROM invoices i
    JOIN tenants t ON i.tenant_id = t.id AND t.is_restricted = 0
    JOIN properties p ON i.property_id = p.id AND p.is_restricted = 0
    WHERE p.user_id = ?
  `;
  const invoiceResult = await this.db!.query(invoicesQuery, [userId]);
  const invoiceCount = invoiceResult.values?.[0]?.count || 0;

  const paymentsQuery = `
    SELECT COUNT(*) as count FROM payments pay
    JOIN invoices i ON pay.invoice_id = i.id
    JOIN tenants t ON i.tenant_id = t.id AND t.is_restricted = 0
    JOIN properties p ON i.property_id = p.id AND p.is_restricted = 0
    WHERE p.user_id = ?
  `;
  const paymentResult = await this.db!.query(paymentsQuery, [userId]);
  const paymentCount = paymentResult.values?.[0]?.count || 0;

  // Determine sync status
  let syncStatus: 'online' | 'offline' | 'sync_available' | 'sync_restricted';
  if (!navigator.onLine) {
    syncStatus = 'offline';
  } else if (!this.canUserSync(user)) {
    syncStatus = 'sync_restricted';
  } else {
    syncStatus = 'sync_available';
  }

  return {
    canWorkOffline: true, // App ALWAYS works offline
    localDataCount: {
      properties: propertyCount,
      tenants: tenantCount,
      invoices: invoiceCount,
      payments: paymentCount
    },
    syncStatus
  };
}

// 11. FIX: Batch operations with proper validation
async createMultipleInvoicesForProperty(
  propertyId: number, 
  billingMonth: string,
  invoiceData: Partial<InvoiceInput>[]
): Promise<{ created: Invoice[]; errors: string[] }> {
  const property = await this.getPropertyById(propertyId);
  if (!property || property.isRestricted) {
    throw new Error('Cannot create invoices for restricted property. Upgrade your plan to access.');
  }

  const tenants = await this.getTenantsByProperty(propertyId);
  const created: Invoice[] = [];
  const errors: string[] = [];

  for (const tenant of tenants) {
    if (tenant.isRestricted) {
      errors.push(`Skipped restricted tenant: ${tenant.name}`);
      continue;
    }

    try {
      const invoice = await this.createInvoice({
        id: 0, // Will be auto-generated
        tenantId: tenant.id,
        propertyId: propertyId,
        billingMonth,
        rentAmount: tenant.rentAmount,
        ...invoiceData[0] // Apply default invoice data
      });
      created.push(invoice);
    } catch (error) {
      errors.push(`Failed to create invoice for ${tenant.name}: ${error}`);
    }
  }

  return { created, errors };
}

// 12. FIX: Enhanced updateUser method with tier validation
async updateUser(id: number, user: Partial<{
  name: string;
  email: string;
  phone: string;
  password: string;
  isPremium: boolean;
}>): Promise<void> {
  // CRITICAL: Get current user to preserve tier/type restrictions
  const currentUser = await this.getUserById(id);
  if (!currentUser) {
    throw new Error('User not found');
  }

  const fields = [];
  const values = [];
  
  if (user.name !== undefined) {
    fields.push('name = ?');
    values.push(user.name);
  }
  if (user.email !== undefined) {
    fields.push('email = ?');
    values.push(user.email.toLowerCase().trim());
  }
  if (user.phone !== undefined) {
    fields.push('phone = ?');
    values.push(user.phone);
  }
  if (user.password !== undefined) {
    const passwordHash = await this.hashPassword(user.password);
    fields.push('password_hash = ?');
    values.push(passwordHash);
  }
  if (user.isPremium !== undefined) {
    fields.push('is_premium = ?');
    values.push(user.isPremium ? 1 : 0);
  }
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  
  const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
  await this.db!.run(query, values);

  // CRITICAL: Re-enforce limits after any user update
  await this.enforceTierLimitsImmediate(id);
}

// 13. FIX: Secure deletion with cascade validation


// 14. FIX: Secure payment operations with validation
async markInvoicePaid(id: number, paidAmount: number, arrears: number = 0): Promise<void> {
  const invoice = await this.getInvoiceById(id);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  // Validate access through tenant and property
  const tenant = await this.getTenantById(invoice.tenantId);
  const property = await this.getPropertyById(invoice.propertyId);
  
  if (!tenant || !property || tenant.isRestricted || property.isRestricted) {
    throw new Error('Cannot update invoice for restricted tenant/property. Upgrade your plan to access.');
  }

  const query = `
    UPDATE invoices 
    SET is_paid = 1, amount_paid = ?, arrears = ?, paid_date = CURRENT_DATE, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;
  await this.db!.run(query, [paidAmount, arrears, id]);
}

// 15. FIX: Enhanced offline data export (for user data portability)
async exportUserDataOffline(userId: number): Promise<{
  user: User;
  companies: Company[];
  properties: Property[];
  units: Unit[];
  tenants: Tenant[];
  invoices: Invoice[];
  payments: Payment[];
  exportDate: string;
}> {
  const user = await this.getUserById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Export only accessible data (respects tier limits)
  const companies = user.type === 'paid' ? 
    [await this.getCompanyByUserId(userId)].filter(Boolean) as Company[] : [];
  
  const properties = await this.getProperties(userId);
  const units: Unit[] = [];
  const tenants: Tenant[] = [];
  const invoices: Invoice[] = [];
  const payments: Payment[] = [];

  // Collect all related data for accessible properties only
  for (const property of properties) {
    if (!property.isRestricted) {
      // Get units
      const propertyUnits = await this.getUnitsByProperty(property.id);
      units.push(...propertyUnits);

      // Get tenants
      const propertyTenants = await this.getTenantsByProperty(property.id);
      tenants.push(...propertyTenants);

      // Get invoices and payments for each tenant
      for (const tenant of propertyTenants) {
        if (!tenant.isRestricted) {
          const tenantInvoices = await this.getInvoices({ tenantId: tenant.id });
          invoices.push(...tenantInvoices);

          for (const invoice of tenantInvoices) {
            const invoicePayments = await this.getPaymentsByInvoice(invoice.id);
            payments.push(...invoicePayments);
          }
        }
      }
    }
  }

  return {
    user,
    companies,
    properties,
    units,
    tenants,
    invoices,
    payments,
    exportDate: new Date().toISOString()
  };
}
  
  

  

  async cleanupStaleCache(): Promise<void> {
  if (!this.db) throw new Error('Database not initialized');

  try {
    const query = `
      DELETE FROM monthly_business_summaries 
      WHERE is_stale = 1 
      AND last_calculated < datetime('now', '-7 days')
    `;
    
    const result = await this.db.run(query);
    console.log(`Cleaned up ${result.changes} stale cache entries`);
  } catch (error) {
    console.error('Error cleaning up stale cache:', error);
    throw error;
  }
}

// Method to get database statistics for monitoring
async getAgentSummaryStats(): Promise<{
  businessExpenses: number;
  commissionSummaries: number;
  otherIncomeSummaries: number;
  businessSummaries: number;
  kpiHistory: number;
  staleCacheEntries: number;
}> {
  if (!this.db) throw new Error('Database not initialized');

  try {
    const queries = [
      'SELECT COUNT(*) as count FROM business_expenses',
      'SELECT COUNT(*) as count FROM agent_commission_summaries',
      'SELECT COUNT(*) as count FROM agent_other_income_summaries',
      'SELECT COUNT(*) as count FROM monthly_business_summaries',
      'SELECT COUNT(*) as count FROM agent_kpi_history',
      'SELECT COUNT(*) as count FROM monthly_business_summaries WHERE is_stale = 1'
    ];

    const results = await Promise.all(
      queries.map(query => this.db!.query(query))
    );

    return {
      businessExpenses: results[0].values?.[0]?.count || 0,
      commissionSummaries: results[1].values?.[0]?.count || 0,
      otherIncomeSummaries: results[2].values?.[0]?.count || 0,
      businessSummaries: results[3].values?.[0]?.count || 0,
      kpiHistory: results[4].values?.[0]?.count || 0,
      staleCacheEntries: results[5].values?.[0]?.count || 0
    };
  } catch (error) {
    console.error('Error getting agent summary stats:', error);
    throw error;
  }
}

// Method to vacuum and optimize the database
async optimizeAgentSummaryTables(): Promise<void> {
  if (!this.db) throw new Error('Database not initialized');

  try {
    // Analyze tables to update query planner statistics
    const tables = [
      'business_expenses',
      'agent_commission_summaries', 
      'agent_other_income_summaries',
      'monthly_business_summaries',
      'agent_kpi_history'
    ];

    for (const table of tables) {
      await this.db.run(`ANALYZE ${table}`);
    }

    console.log('Agent summary tables optimized successfully');
  } catch (error) {
    console.error('Error optimizing agent summary tables:', error);
    throw error;
  }
}

  // ==================== ENHANCED USER OPERATIONS ====================

  // ==================== CRITICAL FIXES FOR DATABASE.TSX ====================

// 1. FIX: Missing updateUserTierAndType implementation
async updateUserTierAndType(userId: number, tier: UserTier, type: UserType, storage: boolean = false): Promise<void> {
  const query = `
    UPDATE users 
    SET tier = ?, type = ?, storage = ?, is_premium = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;
  
  const isPremium = type === 'paid' ? 1 : 0;
  await this.db!.run(query, [tier, type, storage ? 1 : 0, isPremium, userId]);
  
  await this.enforceTierLimitsImmediate(userId);
}

// 3. FIX: Immediate limit enforcement (no bypasses)
private async enforceTierLimitsImmediate(userId: number): Promise<void> {
  const user = await this.getUserById(userId);
  if (!user) return;

  const limits = this.USER_LIMITS[user.tier] || this.USER_LIMITS.free;
  const properties = await this.getProperties(userId);
  
  // CRITICAL: Enforce property limits immediately
  if (limits.properties !== -1 && properties.length > limits.properties) {
    // Select allowed properties (oldest first to maintain user's core data)
    const allowedProperties = properties
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(0, limits.properties);
    
    const allowedIds = allowedProperties.map(p => p.id);
    
    // Update user restrictions
    await this.db!.run(`
      UPDATE users 
      SET selected_property_ids = ?, restricted_access = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [JSON.stringify(allowedIds), userId]);
    
    // Mark properties as restricted/unrestricted
    await this.db!.run(`UPDATE properties SET is_restricted = 1 WHERE user_id = ?`, [userId]);
    if (allowedIds.length > 0) {
      const placeholders = allowedIds.map(() => '?').join(',');
      await this.db!.run(
        `UPDATE properties SET is_restricted = 0 WHERE id IN (${placeholders})`,
        allowedIds
      );
    }
  }

  // CRITICAL: Enforce tenant limits per property
  for (const property of properties.slice(0, limits.properties === -1 ? undefined : limits.properties)) {
    const tenants = await database.getTenantsByProperty(property.id);
    
    if (limits.tenantsPerProperty !== -1 && tenants.length > limits.tenantsPerProperty) {
      const allowedTenants = tenants
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .slice(0, limits.tenantsPerProperty);
      
      const allowedTenantIds = allowedTenants.map(t => t.id);
      
      // Mark tenants as restricted/unrestricted
      await this.db!.run(`UPDATE tenants SET is_restricted = 1 WHERE property_id = ?`, [property.id]);
      if (allowedTenantIds.length > 0) {
        const placeholders = allowedTenantIds.map(() => '?').join(',');
        await this.db!.run(
          `UPDATE tenants SET is_restricted = 0 WHERE id IN (${placeholders})`,
          allowedTenantIds
        );
      }
    }
  }
}

// 4. FIX: Secure getProperties method (prevent bypasses)
async getProperties(userId: number): Promise<Property[]> {
  try {
    const user = await this.getUserById(userId);
    if (!user) return [];

    // CRITICAL: Always check current limits from database, not cached values
    const limits = USER_LIMITS[user.tier] || USER_LIMITS.free;
    
    let query = `SELECT * FROM properties WHERE user_id = ?`;
    let params = [userId];

    // Apply restrictions based on user status
    if (user.restrictedAccess && user.selectedPropertyIds && user.selectedPropertyIds.length > 0) {
      // User is restricted to specific properties
      const placeholders = user.selectedPropertyIds.map(() => '?').join(',');
      query += ` AND id IN (${placeholders}) AND is_restricted = 0`;
      params.push(...user.selectedPropertyIds);
    } else if (limits.properties !== -1) {
      // Apply tier limits for non-unlimited users
      query += ` AND is_restricted = 0`;
    } else {
      // For unlimited users, still filter out restricted properties
      query += ` AND is_restricted = 0`;
    }

    // Add ORDER BY and LIMIT at the end
    query += ` ORDER BY created_at DESC`;
    
    // Apply limit only if not unlimited
    if (limits.properties !== -1) {
      query += ` LIMIT ${limits.properties}`;
    }
    
    const result = await this.db!.query(query, params);
    return this.mapToProperties(result.values || []);
  } catch (error) {
    console.error('Error getting properties:', error);
    return [];
  }
}

// 5. FIX: Secure getTenantsByProperty method (prevent bypasses)
async getTenantsByProperty(propertyId: number): Promise<Tenant[]> {
  try {
    const property = await this.getPropertyById(propertyId);
    if (!property) return [];

    // CRITICAL: Check if property is restricted
    if (property.isRestricted) {
      return []; // Return empty array for restricted properties
    }

    const user = await this.getUserById(property.userId);
    if (!user) return [];

    const limits = USER_LIMITS[user.tier] || USER_LIMITS.free;
    
    let query = `SELECT * FROM tenants WHERE property_id = ? AND is_restricted = 0`;
    let params = [propertyId];

    // Apply tenant limits
    if (limits.tenantsPerProperty !== -1) {
      query += ` ORDER BY created_at ASC LIMIT ${limits.tenantsPerProperty}`;
    } else {
      query += ` ORDER BY name ASC`;
    }
    
    const result = await this.db!.query(query, params);
    return this.mapToTenants(result.values || []);
  } catch (error) {
    console.error('Error getting tenants by property:', error);
    return [];
  }
}

// 6. FIX: Enhanced canCreateProperty with real-time validation
public async canCreateProperty(userId: number): Promise<{ allowed: boolean; reason: string }> {
  const user = await this.getUserById(userId);
  if (!user) {
    return { allowed: false, reason: 'User not found' };
  }

  // CRITICAL: Always get fresh limits, never trust cached values
  const limits = USER_LIMITS[user.tier] || USER_LIMITS.free;
  
  if (limits.properties === -1) {
    return { allowed: true, reason: 'Unlimited properties allowed' };
  }

  // Count ONLY non-restricted properties
  const currentQuery = `
    SELECT COUNT(*) as count 
    FROM properties 
    WHERE user_id = ? AND is_restricted = 0
  `;
  const result = await this.db!.query(currentQuery, [userId]);
  const currentCount = result.values?.[0]?.count || 0;
  
  if (currentCount >= limits.properties) {
    return { 
      allowed: false, 
      reason: `${user.tier.charAt(0).toUpperCase() + user.tier.slice(1)} tier allows maximum ${limits.properties} properties. Upgrade your plan to add more.` 
    };
  }

  return { allowed: true, reason: 'Within limits' };
}

// 7. FIX: Enhanced canCreateTenant with real-time validation
private async generateTenantId(): Promise<number> {
  const query = `SELECT MAX(id) as max_id FROM tenants WHERE id >= 11111 AND id <= 1111109`;
  const result = await this.db!.query(query);
  const maxId = result.values?.[0]?.max_id || 11110;
  
  if (maxId >= 1111109) {
    throw new Error('Maximum tenants limit reached (1.1M). Cannot create more tenants.');
  }
  
  return maxId + 1;
}

public async canCreateTenant(propertyId: number): Promise<{ allowed: boolean; reason: string }> {
  const property = await this.getPropertyById(propertyId);
  if (!property) {
    return { allowed: false, reason: 'Property not found' };
  }

  // CRITICAL: Check if property is restricted
  if (property.isRestricted) {
    return { 
      allowed: false, 
      reason: 'This property is restricted due to plan limitations. Upgrade to access.' 
    };
  }

  const user = await this.getUserById(property.userId);
  if (!user) {
    return { allowed: false, reason: 'User not found' };
  }

  const limits = USER_LIMITS[user.tier] || USER_LIMITS.free;
  
  if (limits.tenantsPerProperty === -1) {
    return { allowed: true, reason: 'Unlimited tenants allowed' };
  }

  // Count ONLY non-restricted tenants
  const currentQuery = `
    SELECT COUNT(*) as count 
    FROM tenants 
    WHERE property_id = ? AND is_restricted = 0
  `;
  const result = await this.db!.query(currentQuery, [propertyId]);
  const currentCount = result.values?.[0]?.count || 0;

  if (currentCount >= limits.tenantsPerProperty) {
    return { 
      allowed: false, 
      reason: `${user.tier.charAt(0).toUpperCase() + user.tier.slice(1)} tier allows maximum ${limits.tenantsPerProperty} tenants per property. Upgrade your plan to add more.` 
    };
  }

  return { allowed: true, reason: 'Within limits' };
}

// 8. FIX: Secure invoice operations (must respect restrictions)
async getInvoices(filters: InvoiceFilters = {}): Promise<InvoiceWithDetails[]> {
  try {
    let query = `
      SELECT 
        i.*,
        t.name as tenant_name,
        t.phone as tenant_phone,
        t.email as tenant_email,
        p.name as property_name
      FROM invoices i
      JOIN tenants t ON i.tenant_id = t.id AND t.is_restricted = 0
      JOIN properties p ON i.property_id = p.id AND p.is_restricted = 0
      WHERE 1=1
    `;
    
    const params = [];
    
    if (filters.propertyId) {
      query += ' AND i.property_id = ?';
      params.push(filters.propertyId);
    }
    
    if (filters.tenantId) {
      query += ' AND i.tenant_id = ?';
      params.push(filters.tenantId);
    }
    
    if (filters.billingMonth) {
      query += ' AND i.billing_month = ?';
      params.push(filters.billingMonth);
    }
    
    if (filters.isPaid !== undefined) {
      query += ' AND i.is_paid = ?';
      params.push(filters.isPaid ? 1 : 0);
    }
    
    if (filters.startDate) {
      query += ' AND i.created_at >= ?';
      params.push(filters.startDate);
    }
    
    if (filters.endDate) {
      query += ' AND i.created_at <= ?';
      params.push(filters.endDate);
    }
    
    query += ' ORDER BY i.created_at DESC';
    
    const result = await this.db!.query(query, params);
    return this.mapToInvoicesWithDetails(result.values || []);
  } catch (error) {
    console.error('Error getting invoices:', error);
    return [];
  }
}

// 9. FIX: Secure dashboard data (only count accessible data)


async getDashboardData(userId: number, propertyId?: number, month?: string): Promise<DashboardData> {
  try {
    
    // Build the base query
    let query = `
      SELECT 
        COUNT(DISTINCT p.id) as total_properties,
        COUNT(DISTINCT CASE WHEN t.is_restricted = 0 THEN t.id END) as total_tenants,
        SUM(CASE WHEN i.is_paid = 1 AND t.is_restricted = 0 THEN i.total_amount ELSE 0 END) as monthly_revenue,
        SUM(CASE WHEN t.is_restricted = 0 THEN i.arrears ELSE 0 END) as total_arrears,
        COUNT(CASE WHEN i.is_paid = 1 AND t.is_restricted = 0 THEN 1 END) as paid_invoices,
        COUNT(CASE WHEN t.is_restricted = 0 THEN 1 END) as unpaid_invoices,
        COUNT(CASE WHEN t.is_active = 1 AND t.is_restricted = 0 THEN 1 END) as active_tenants,
        SUM(CASE WHEN p.is_restricted = 0 THEN p.max_units ELSE 0 END) as total_max_units
      FROM properties p
      LEFT JOIN tenants t ON p.id = t.property_id
      LEFT JOIN invoices i ON t.id = i.tenant_id`;

    // Add month filter to JOIN condition if specifiedi.is_paid = 0 AND 
    if (month) {
      query = query.replace(
        'LEFT JOIN invoices i ON t.id = i.tenant_id',
        'LEFT JOIN invoices i ON t.id = i.tenant_id AND i.billing_month = ?'
      );
    }

    // Add WHERE clause
    query += ` WHERE p.user_id = ? AND p.is_restricted = 0`;

    // Add property filter if specified
    if (propertyId) {
      //const propertyData = await this.getPropertyById(propertyId);
      query += ` AND p.id = ?`;
    }

    // Build parameters array in correct order
    const params: (number | string)[] = [];
    
    // First add month parameter if it's in the JOIN
    if (month) {
      params.push(month);
    }
    
    // Then add userId (always present)
    params.push(userId);
    
    // Finally add propertyId if specified
    if (propertyId) {
      params.push(propertyId);
    }

    const result = await this.db!.query(query, params);
    const row = result.values?.[0] || {};

    // Calculate net monthly revenue (revenue minus arrears)
    const grossRevenue = row.monthly_revenue || 0;
    const totalArrears = row.total_arrears || 0;
    const netMonthlyRevenue = Math.max(0, grossRevenue - totalArrears);

    // Calculate occupancy rate based on max_units
    const activeTenants = row.active_tenants || 0;
    const totalMaxUnits = row.total_max_units || 0;
    //const occupancyRate = propertyData.maxUnits > 0 ? (occupiedUnits / propertyData.maxUnits) * 100 : 0;
    const occupancyRate = totalMaxUnits > 0 ? (activeTenants / totalMaxUnits) * 100 : 0;

    return {
      totalProperties: row.total_properties || 0,
      totalTenants: row.total_tenants || 0,
      monthlyRevenue: netMonthlyRevenue, // Now returns net revenue (after deducting arrears)
      totalArrears: totalArrears,
      paidInvoices: row.paid_invoices || 0,
      unpaidInvoices: row.unpaid_invoices || 0,
      occupancyRate: occupancyRate,// Round to 2 decimal places
    };
  } catch (error) {
    console.error('Error getting dashboard data:', error);
    return {
      totalProperties: 0,
      totalTenants: 0,
      monthlyRevenue: 0,
      totalArrears: 0,
      paidInvoices: 0,
      unpaidInvoices: 0,
      occupancyRate: 0
    };
  }
}

/**
 * Lifetime (all-time, not month-scoped) read-only totals for the trial
 * stats banner: total invoices ever created, total tenants, and total
 * amount actually collected (paid invoices only). Pure SELECT — never
 * writes to the local database. Safe to call frequently; the caller is
 * expected to cache the result (e.g. in localStorage) for offline use.
 */
async getTrialStats(userId: number): Promise<{ totalInvoices: number; totalTenants: number; amountCollected: number }> {
  try {
    const query = `
      SELECT
        COUNT(DISTINCT CASE WHEN t.is_restricted = 0 THEN i.id END) as total_invoices,
        COUNT(DISTINCT CASE WHEN t.is_restricted = 0 THEN t.id END) as total_tenants,
        SUM(CASE WHEN i.is_paid = 1 AND t.is_restricted = 0 THEN i.total_amount ELSE 0 END) as amount_collected
      FROM properties p
      LEFT JOIN tenants t ON p.id = t.property_id
      LEFT JOIN invoices i ON t.id = i.tenant_id
      WHERE p.user_id = ? AND p.is_restricted = 0`;

    const result = await this.db!.query(query, [userId]);
    const row = result.values?.[0] || {};

    return {
      totalInvoices: row.total_invoices || 0,
      totalTenants: row.total_tenants || 0,
      amountCollected: row.amount_collected || 0,
    };
  } catch (error) {
    console.error('Error getting trial stats:', error);
    return { totalInvoices: 0, totalTenants: 0, amountCollected: 0 };
  }
}

// 10. FIX: Secure createInvoice with validation
async deleteInvoice(id: number, userId: number): Promise<void> {
  const invoice = await this.getInvoiceById(id);
  if (!invoice) {
    throw new Error('Invoice not found');
  }

  // Validate access through tenant and property
  const tenant = await this.getTenantById(invoice.tenantId);
  const property = await this.getPropertyById(invoice.propertyId);
  
  if (!tenant || !property || tenant.isRestricted || property.isRestricted) {
    throw new Error('Cannot delete invoice for restricted tenant/property. Upgrade your plan to access.');
  }
  
  // Delete from SQLite first
  await this.db!.run('DELETE FROM invoices WHERE id = ?', [id]);
  
  // Delete from Firestore
  try {
    const docRef = doc(this.fireDB, 'users', userId.toString(), 'invoices', id.toString());
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting invoice from Firestore:', error);
    // Consider whether to rollback SQLite deletion or continue
  }
}

async deleteTenant(id: number, userId: number): Promise<void> {
  const tenant = await this.getTenantById(id);
  if (!tenant) {
    throw new Error('Tenant not found');
  }
  
  if (tenant.isRestricted) {
    throw new Error('Cannot delete restricted tenant. Upgrade your plan to access.');
  }
  
  // Delete from SQLite first
  await this.db!.run('DELETE FROM tenants WHERE id = ? AND is_restricted = 0', [id]);
  
  // Delete from Firestore
  try {
    const docRef = doc(this.fireDB, 'users', userId.toString(), 'tenants', id.toString());
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting tenant from Firestore:', error);
    // Consider whether to rollback SQLite deletion or continue
  }
}

async deleteProperty(id: number, userId: number): Promise<void> {
  const property = await this.getPropertyById(id);
  if (!property) {
    throw new Error('Property not found');
  }
  
  if (property.isRestricted) {
    throw new Error('Cannot delete restricted property. Upgrade your plan to access.');
  }

  // Get associated tenants and invoices before deletion
  const associatedTenants = await this.db!.query(
    'SELECT id FROM tenants WHERE property_id = ?', 
    [id]
  );
  const associatedInvoices = await this.db!.query(
    'SELECT id FROM invoices WHERE property_id = ?', 
    [id]
  );

  // Delete from SQLite (cascade delete)
  await this.db!.run('DELETE FROM invoices WHERE property_id = ?', [id]);
  await this.db!.run('DELETE FROM tenants WHERE property_id = ?', [id]);
  await this.db!.run('DELETE FROM properties WHERE id = ? AND is_restricted = 0', [id]);
  
  // Delete from Firestore
  try {
    // Delete property
    const propertyDocRef = doc(this.fireDB, 'users', userId.toString(), 'properties', id.toString());
    await deleteDoc(propertyDocRef);
    
    // Delete associated tenants from Firestore
    if (associatedTenants.values) {
      for (const tenant of associatedTenants.values) {
        const tenantDocRef = doc(this.fireDB, 'users', userId.toString(), 'tenants', tenant.id.toString());
        await deleteDoc(tenantDocRef);
      }
    }
    
    // Delete associated invoices from Firestore
    if (associatedInvoices.values) {
      for (const invoice of associatedInvoices.values) {
        const invoiceDocRef = doc(this.fireDB, 'users', userId.toString(), 'invoices', invoice.id.toString());
        await deleteDoc(invoiceDocRef);
      }
    }
    
  } catch (error) {
    console.error('Error deleting property and associations from Firestore:', error);
    // Consider whether to rollback SQLite deletions or continue
  }
}

async createInvoice(invoice: InvoiceInput): Promise<Invoice> {
  // CRITICAL: Validate tenant and property access before creating invoice
  const tenant = await this.getTenantById(invoice.tenantId);
  if (!tenant) {
    alert('Tenant not found. Please select a valid tenant.');
    throw new Error('Tenant not found');
  }
  
  if (tenant.isRestricted) {
    alert('Cannot create invoice for restricted tenant. Please upgrade your plan to access.');
    throw new Error('Cannot create invoice for restricted tenant. Upgrade your plan to access.');
  }
  
  const property = await this.getPropertyById(invoice.propertyId);
  if (!property) {
    alert('Property not found. Please select a valid property.'); 
    throw new Error('Property not found');
  }
  
  if (property.isRestricted) {
    throw new Error('Cannot create invoice for restricted property. Upgrade your plan to access.');
  }

  const invoiceNumber = await this.generateInvoiceNumber();
  const invoiceId = await this.generateInvoiceId();
  
  // Calculate total amount
  const waterAmount = ((invoice.waterCurrentReading || 0) - (invoice.waterPreviousReading || 0)) * 
                     (invoice.waterUnitPrice || 0) + (invoice.waterStandingFee || 0);
  const powerAmount = ((invoice.powerCurrentReading || 0) - (invoice.powerPreviousReading || 0)) * 
                     (invoice.powerUnitPrice || 0);
  const totalAmount = invoice.rentAmount + waterAmount + powerAmount + (invoice.otherCharges || 0);
  
  const query = `
    INSERT INTO invoices (
      id, tenant_id, property_id, invoice_number, billing_month, rent_amount,
      water_current_reading, water_previous_reading, water_standing_fee, water_unit_price,
      power_current_reading, power_previous_reading, power_unit_price,
      other_charges, other_charges_description, total_amount, due_date
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const result = await this.db!.run(query, [
    invoiceId,
    invoice.tenantId,
    invoice.propertyId,
    invoice.invoiceNumber || invoiceNumber,
    invoice.billingMonth,
    invoice.rentAmount,
    invoice.waterCurrentReading || 0,
    invoice.waterPreviousReading || 0,
    invoice.waterStandingFee || 0,
    invoice.waterUnitPrice || 0,
    invoice.powerCurrentReading || 0,
    invoice.powerPreviousReading || 0,
    invoice.powerUnitPrice || 0,
    invoice.otherCharges || 0,
    invoice.otherChargesDescription || '',
    invoice.totalAmount || totalAmount,
    invoice.dueDate || null,
    //invoice.isPaid
  ]);

  const createdInvoice = await this.getInvoiceById(result.changes!.lastId!);
  if (!createdInvoice) {
    throw new Error('Failed to retrieve created invoice');
  }

  // Auto-sync if enabled
  await this.autoSyncAfterChange(createdInvoice.id, 'invoice');
  
  return createdInvoice;
}

// Bulk-create rent invoices for every active tenant in a property in one go.
// Used by the "All Tenants" invoice-creation flow: rent is forked from each
// tenant's own rentAmount (never a shared amount), water/power metering is
// never included, and otherCharges/otherChargesDescription (if provided) are
// applied identically to every generated invoice (flat per tenant, not split).
async createBulkRentInvoices(options: {
  propertyId: number;
  billingMonth: string;
  dueDate?: string;
  otherCharges?: number;
  otherChargesDescription?: string;
}): Promise<{ created: Invoice[]; skipped: { tenantId: number; name: string; reason: string }[] }> {
  const property = await this.getPropertyById(options.propertyId);
  if (!property) {
    throw new Error('Property not found');
  }
  if (property.isRestricted) {
    throw new Error('Cannot create invoices for restricted property. Upgrade your plan to access.');
  }

  const tenants = await this.getTenantsByProperty(options.propertyId);
  const activeTenants = tenants.filter(t => t.isActive);

  const created: Invoice[] = [];
  const skipped: { tenantId: number; name: string; reason: string }[] = [];

  for (const tenant of activeTenants) {
    try {
      const existingForMonth = await this.getInvoices({
        tenantId: tenant.id,
        billingMonth: options.billingMonth
      });

      if (existingForMonth.length > 0) {
        skipped.push({
          tenantId: tenant.id,
          name: tenant.name,
          reason: 'Invoice already exists for this billing month'
        });
        continue;
      }

      const invoice = await this.createInvoice({
        id: tenant.id,
        tenantId: tenant.id,
        propertyId: options.propertyId,
        billingMonth: options.billingMonth,
        rentAmount: tenant.rentAmount, // Forked from this tenant's own record — never shared across tenants
        otherCharges: options.otherCharges || 0,
        otherChargesDescription: options.otherChargesDescription || '',
        dueDate: options.dueDate
      });

      created.push(invoice);
    } catch (error: any) {
      skipped.push({
        tenantId: tenant.id,
        name: tenant.name,
        reason: error?.message || 'Failed to create invoice'
      });
    }
  }

  return { created, skipped };
}

private async generateInvoiceId(): Promise<number> {
  const query = `SELECT MAX(id) as max_id FROM invoices WHERE id >= 1111111`;
  const result = await this.db!.query(query);
  const maxId = result.values?.[0]?.max_id || 1111110;
  
  return maxId + 1;
}

private async generateInvoiceNumber(): Promise<string> {
  try {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const currentPrefix = `INV-${year}${month}-`;
    
    // Get the highest invoice number for current month/year
    const query = `
      SELECT invoice_number 
      FROM invoices 
      WHERE invoice_number LIKE ? 
      ORDER BY invoice_number DESC 
      LIMIT 1
    `;
    
    const result = await this.db!.query(query, [`${currentPrefix}%`]);
    
    let nextNumber = 1;
    if (result.values && result.values.length > 0) {
      const lastInvoiceNumber = result.values[0].invoice_number as string;
      // Extract the number part (last 4 digits)
      const lastNumber = parseInt(lastInvoiceNumber.slice(-4));
      nextNumber = lastNumber + 1;
    }
    
    return `${currentPrefix}${nextNumber.toString().padStart(4, '0')}`;
  } catch (error) {
    console.error('Error generating invoice number:', error);
    return `INV-${Date.now()}`;
  }
}

async updateInvoice(id: number, invoice: Partial<InvoiceInput>): Promise<void> {
    const fields = [];
    const values = [];
    
    // Recalculate total if any amounts change
    if (invoice.rentAmount !== undefined || 
        invoice.waterCurrentReading !== undefined ||
        invoice.waterPreviousReading !== undefined ||
        invoice.waterUnitPrice !== undefined ||
        invoice.waterStandingFee !== undefined ||
        invoice.powerCurrentReading !== undefined ||
        invoice.powerPreviousReading !== undefined ||
        invoice.powerUnitPrice !== undefined ||
        invoice.otherCharges !== undefined) {
      
      const currentInvoice = await this.getInvoiceById(id);
      if (currentInvoice) {
        const rentAmount = invoice.rentAmount ?? currentInvoice.rentAmount;
        const waterAmount = ((invoice.waterCurrentReading ?? currentInvoice.waterCurrentReading) - 
                            (invoice.waterPreviousReading ?? currentInvoice.waterPreviousReading)) * 
                           (invoice.waterUnitPrice ?? currentInvoice.waterUnitPrice) + 
                           (invoice.waterStandingFee ?? currentInvoice.waterStandingFee);
        const powerAmount = ((invoice.powerCurrentReading ?? currentInvoice.powerCurrentReading) - 
                            (invoice.powerPreviousReading ?? currentInvoice.powerPreviousReading)) * 
                           (invoice.powerUnitPrice ?? currentInvoice.powerUnitPrice);
        const totalAmount = rentAmount + waterAmount + powerAmount + 
                           (invoice.otherCharges ?? currentInvoice.otherCharges);
        
        fields.push('total_amount = ?');
        values.push(totalAmount);
      }
    }
    
    // Add other fields
    Object.entries(invoice).forEach(([key, value]) => {
      if (value !== undefined) {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        fields.push(`${dbKey} = ?`);
        values.push(value);
      }
    });
    
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    
    const query = `UPDATE invoices SET ${fields.join(', ')} WHERE id = ?`;
    await this.db!.run(query, values);
  }

// 11. FIX: Secure update operations with validation
async updateProperty(id: number, property: Partial<PropertyInput>): Promise<void> {
  // CRITICAL: Validate property access before update
  const existingProperty = await this.getPropertyById(id);
  if (!existingProperty) {
    throw new Error('Property not found');
  }
  
  if (existingProperty.isRestricted) {
    throw new Error('Cannot update restricted property. Upgrade your plan to access.');
  }

  const fields = [];
  const values = [];
  
  if (property.name !== undefined) {
    fields.push('name = ?');
    values.push(property.name);
  }
  if (property.address !== undefined) {
    fields.push('address = ?');
    values.push(property.address);
  }
  if (property.description !== undefined) {
    fields.push('description = ?');
    values.push(property.description);
  }
  if (property.image !== undefined) {
    fields.push('image = ?');
    values.push(property.image);
  }
  if (property.agentCommissionRate !== undefined) {
    fields.push('agent_commission_rate = ?');
    values.push(property.agentCommissionRate);
  }
  if (property.maxUnits !== undefined) {
    fields.push('max_units = ?');
    values.push(property.maxUnits);
  }
  if (property.billingMode !== undefined) {
    fields.push('billing_mode = ?');
    values.push(property.billingMode === 'rent_only' ? 'rent_only' : 'full');
  }
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  
  const query = `UPDATE properties SET ${fields.join(', ')} WHERE id = ? AND is_restricted = 0`;
  await this.db!.run(query, values);

  // Auto-sync if enabled
  await this.autoSyncAfterChange(id, 'property');
}

// 12. FIX: Secure updateTenant with validation
async updateTenant(id: number, tenant: Partial<TenantInput>): Promise<void> {
  // CRITICAL: Validate tenant access before update
  const existingTenant = await this.getTenantById(id);
  if (!existingTenant) {
    throw new Error('Tenant not found');
  }
  
  if (existingTenant.isRestricted) {
    throw new Error('Cannot update restricted tenant. Upgrade your plan to access.');
  }

  const fields = [];
  const values = [];
  
  if (tenant.name !== undefined) {
    fields.push('name = ?');
    values.push(tenant.name);
  }
  if (tenant.phone !== undefined) {
    fields.push('phone = ?');
    values.push(tenant.phone);
  }
  if (tenant.email !== undefined) {
    fields.push('email = ?');
    values.push(tenant.email);
  }
  if (tenant.unitNumber !== undefined) {
    fields.push('unit_number = ?');
    values.push(tenant.unitNumber);
  }
  if (tenant.rentAmount !== undefined) {
    fields.push('rent_amount = ?');
    values.push(tenant.rentAmount);
  }
  if (tenant.standingFees !== undefined) {
    fields.push('standing_fees = ?');
    values.push(tenant.standingFees);
  }
  if (tenant.depositAmount !== undefined) {
    fields.push('deposit_amount = ?');
    values.push(tenant.depositAmount);
  }
  if (tenant.leaseStart !== undefined) {
    fields.push('lease_start = ?');
    values.push(tenant.leaseStart);
  }
  if (tenant.leaseEnd !== undefined) {
    fields.push('lease_end = ?');
    values.push(tenant.leaseEnd);
  }
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  
  const query = `UPDATE tenants SET ${fields.join(', ')} WHERE id = ? AND is_restricted = 0`;
  await this.db!.run(query, values);

  // Auto-sync if enabled
  await this.autoSyncAfterChange(id, 'tenant');
}

// 13. FIX: Secure deletion methods




// 14. FIX: Enhanced checkUserLimits with real-time data
async checkUserLimits(userId: number): Promise<{
  properties: { current: number; max: number; exceeded: boolean };
  tenants: { current: number; max: number; exceeded: boolean };
  canSync: boolean;
  tierInfo: { tier: UserTier; type: UserType; storage: boolean };
}> {
  const user = await this.getUserById(userId);
  if (!user) {
    return {
      properties: { current: 0, max: 0, exceeded: true },
      tenants: { current: 0, max: 0, exceeded: true },
      canSync: false,
      tierInfo: { tier: 'free', type: 'free', storage: false }
    };
  }

  const limits = USER_LIMITS[user.tier] || USER_LIMITS.free;
  
  // Count ONLY accessible data
  const propertiesQuery = `
    SELECT COUNT(*) as count 
    FROM properties 
    WHERE user_id = ? AND is_restricted = 0
  `;
  const propResult = await this.db!.query(propertiesQuery, [userId]);
  const propertyCount = propResult.values?.[0]?.count || 0;

  const tenantsQuery = `
    SELECT COUNT(*) as count 
    FROM tenants t
    JOIN properties p ON t.property_id = p.id
    WHERE p.user_id = ? AND t.is_restricted = 0 AND p.is_restricted = 0
  `;
  const tenantResult = await this.db!.query(tenantsQuery, [userId]);
  const tenantCount = tenantResult.values?.[0]?.count || 0;

  return {
    properties: {
      current: propertyCount,
      max: limits.properties,
      exceeded: limits.properties !== -1 && propertyCount > limits.properties
    },
    tenants: {
      current: tenantCount,
      max: limits.totalTenants,
      exceeded: limits.totalTenants !== -1 && tenantCount > limits.totalTenants
    },
    canSync: this.canUserSync(user),
    tierInfo: {
      tier: user.tier,
      type: user.type,
      storage: user.storage
    }
  };
}

















  // ==================== STANDARD MAPPING FUNCTIONS ====================

  private mapToCompany(row: any): Company {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      address: row.address,
      phone: row.phone,
      email: row.email,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapToInvoice(row: any): Invoice {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      propertyId: row.property_id,
      invoiceNumber: row.invoice_number,
      billingMonth: row.billing_month,
      rentAmount: row.rent_amount,
      waterCurrentReading: row.water_current_reading,
      waterPreviousReading: row.water_previous_reading,
      waterStandingFee: row.water_standing_fee,
      waterUnitPrice: row.water_unit_price,
      powerCurrentReading: row.power_current_reading,
      powerPreviousReading: row.power_previous_reading,
      powerUnitPrice: row.power_unit_price,
      otherCharges: row.other_charges,
      otherChargesDescription: row.other_charges_description,
      totalAmount: row.total_amount,
      amountPaid: row.amount_paid,
      arrears: row.arrears,
      isPaid: Boolean(row.is_paid),
      dueDate: row.due_date,
      paidDate: row.paid_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapToPayment(row: any): Payment {
    return {
      id: row.id,
      invoiceId: row.invoice_id,
      amount: row.amount,
      paymentDate: row.payment_date,
      paymentMethod: row.payment_method,
      notes: row.notes,
      createdAt: row.created_at
    };
  }

  private mapToPayments(rows: any[]): Payment[] {
    return rows.map(row => this.mapToPayment(row));
  }

  // ==================== DELEGATION METHODS ====================
  
  

  private mapToInvoicesWithDetails(rows: any[]): InvoiceWithDetails[] {
    return rows.map(row => ({
      ...this.mapToInvoice(row),
      tenantName: row.tenant_name,
      propertyName: row.property_name,
      tenantPhone: row.tenant_phone,
      tenantEmail: row.tenant_email
    }));
  }

  async closeConnection(): Promise<void> {
    try {
      if (this.db) {
        await this.db.close();
        this.db = null;
        console.log('Database connection closed');
      }
    } catch (error) {
      console.error('Error closing database connection:', error);
    }
  }

  async updateUserSelectedProperties(userId: number, propertyIds: number[]): Promise<void> {
    const query = `
      UPDATE users 
      SET selected_property_ids = ?, restricted_access = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    await this.db!.run(query, [JSON.stringify(propertyIds), userId]);
  }

  async restrictPropertiesAccess(userId: number, allowedPropertyIds: number[]): Promise<void> {
    // Mark all properties as restricted first
    await this.db!.run(`UPDATE properties SET is_restricted = 1 WHERE user_id = ?`, [userId]);
    
    // Unrestrict allowed properties
    if (allowedPropertyIds.length > 0) {
      const placeholders = allowedPropertyIds.map(() => '?').join(',');
      await this.db!.run(
        `UPDATE properties SET is_restricted = 0 WHERE id IN (${placeholders})`,
        allowedPropertyIds
      );
    }
  }

  async restrictTenantsAccess(propertyId: number, allowedTenantIds: number[]): Promise<void> {
    // Mark all tenants as restricted first
    await this.db!.run(`UPDATE tenants SET is_restricted = 1 WHERE property_id = ?`, [propertyId]);
    
    // Unrestrict allowed tenants
    if (allowedTenantIds.length > 0) {
      const placeholders = allowedTenantIds.map(() => '?').join(',');
      await this.db!.run(
        `UPDATE tenants SET is_restricted = 0 WHERE id IN (${placeholders})`,
        allowedTenantIds
      );
    }
  }

  // ==================== ENHANCED PROPERTY OPERATIONS ====================
  private async generatePropertyId(): Promise<number> {
  const query = `SELECT MAX(id) as max_id FROM properties WHERE id >= 111 AND id <= 11109`;
  const result = await this.db!.query(query);
  const maxId = result.values?.[0]?.max_id || 110;
  
  if (maxId >= 11109) {
    throw new Error('Maximum properties limit reached (11,000). Cannot create more properties.');
  }
  
  return maxId + 1;
}

  async createProperty(property: PropertyInput): Promise<Property> {
    // Check limits before creation
    const canCreate = await this.canCreateProperty(property.userId);
    if (!canCreate.allowed) {
      throw new Error(canCreate.reason);
    }
    const newPropertyId = await this.generatePropertyId();

    const query = `
      INSERT INTO properties (id, user_id, company_id, name, address, description, image, agent_commission_rate, max_units, billing_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const result = await this.db!.run(query, [
      newPropertyId,
      property.userId,
      property.companyId || null,
      property.name,
      property.address || '',
      property.description || '',
      property.image || '',
      property.agentCommissionRate || 0,
      property.maxUnits || 1,
      property.billingMode === 'rent_only' ? 'rent_only' : 'full'
    ]);

    const createdProperty = await this.getPropertyById(result.changes!.lastId!);
    if (!createdProperty) {
      throw new Error('Failed to retrieve created property');
    }

    // Sync to Firebase if user has permission
    // const user = await this.getUserById(property.userId);
    // if (user && this.canUserSync(user)) {
    //   try {
    //     await firebaseSyncService.syncUserToFirestore(user);
    //   } catch (error) {
    //     console.error('Failed to sync after property creation:', error);
    //   }
    // }

    return createdProperty;
  }

  // ==================== ENHANCED TENANT OPERATIONS ====================

  async createTenant(tenant: TenantInput): Promise<Tenant> {
    // Check limits before creation
    const canCreate = await this.canCreateTenant(tenant.propertyId);
    if (!canCreate.allowed) {
      throw new Error(canCreate.reason);
    }

    const newTenantId = await this.generateTenantId();

    const query = `
      INSERT INTO tenants (
        id, property_id, name, phone, email, unit_number, 
        rent_amount, standing_fees, deposit_amount, lease_start, lease_end
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const result = await this.db!.run(query, [
      tenant.id || newTenantId,
      tenant.propertyId,
      tenant.name,
      tenant.phone || '',
      tenant.email || '',
      tenant.unitNumber || '',
      tenant.rentAmount,
      tenant.standingFees || 0,
      tenant.depositAmount || 0,
      tenant.leaseStart || null,
      tenant.leaseEnd || null
    ]);

    const createdTenant = await this.getTenantById(result.changes!.lastId!);
    if (!createdTenant) {
      throw new Error('Failed to retrieve created tenant');
    }

    // Sync to Firebase if user has permission
    // const property = await this.getPropertyById(tenant.propertyId);
    // if (property) {
    //   const user = await this.getUserById(property.userId);
    //   if (user && this.canUserSync(user)) {
    //     try {
    //       await firebaseSyncService.syncUserToFirestore(user);
    //     } catch (error) {
    //       console.error('Failed to sync after tenant creation:', error);
    //     }
    //   }
    // }

    return createdTenant;
  }

  // ==================== ENHANCED AUTHENTICATION ====================

  async createUserWithCompany(data: UserWithCompanyInput): Promise<AuthResult> {
  // Normalize email
  const normalizedEmail = data.user.email.toLowerCase().trim();
  
  // Check if user exists first
  const existingUserQuery = 'SELECT * FROM users WHERE LOWER(email) = ?';
  const existingUserResult = await this.db!.query(existingUserQuery, [normalizedEmail]);
  
  if (existingUserResult.values && existingUserResult.values.length > 0) {
    throw new Error('User with this email already exists');
  }

  const passwordHash = await this.hashPassword(data.user.password);

  const statements = [
    {
      statement: `
        INSERT INTO users (id, name, email, phone, password_hash, is_premium, type, tier, storage)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?, 0)
      `,
      values: [
        data.user.id,
        data.user.name.trim(),
        normalizedEmail,
        data.user.phone || '',
        passwordHash,
        data.user.type || 'free',
        data.user.tier || 'free'
      ]
    }
  ];

  if (data.company && data.company.name?.trim()) {
    statements.push({
      statement: `
        INSERT INTO companies (user_id, name, address, phone, email)
        VALUES (?, ?, ?, ?, ?)
      `,
      values: [
        data.user.id, // Use the actual user ID instead of last_insert_rowid()
        data.company.name.trim(),
        data.company.address?.trim() || '',
        data.company.phone?.trim() || '',
        data.company.email?.toLowerCase().trim() || ''
      ]
    });
  }

  await this.executeInTransaction(statements);

  const user = await this.getUserById(data.user.id); //const results =  Use the actual user ID
  if (!user) {
    throw new Error('Failed to retrieve created user');
  }

  // Only get company for premium users
  const company = (user.type === 'paid' && data.company) ? 
    await this.getCompanyByUserId(data.user.id) : null; // Use the actual user ID

  return { user, company: company || undefined };
}

  async authenticateUser(email: string, password: string): Promise<AuthResult | null> {
    try {
      console.log('Authenticating user:', email);
      
      const normalizedEmail = email.toLowerCase().trim();
      const user = await this.getUserByEmail(normalizedEmail);
      
      if (!user || !user.passwordHash) {
        console.log('User not found or no password hash');
        return null;
      }

      const isValidPassword = await this.verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        console.log('Invalid password');
        return null;
      }

      // Check for sync updates if user has cloud storage
      // if (this.canUserSync(user)) {
      //   try {
      //     const cloudUser = await firebaseSyncService.downloadUserFromFirestore(user.id);
      //     if (cloudUser) {
      //       // Update local user with cloud data
      //       await this.updateUser(user.id, {
      //         name: cloudUser.name,
      //         email: cloudUser.email,
      //         phone: cloudUser.phone?.toString() || '',
      //         isPremium: cloudUser.isPremium
      //       });
            
      //       await this.updateUserTierAndType(
      //         user.id, 
      //         cloudUser.tier, 
      //         cloudUser.type, 
      //         cloudUser.storage
      //       );
            
      //       // Get updated user
      //       const updatedUser = await this.getUserById(user.id);
      //       if (updatedUser) {
      //         user.type = updatedUser.type;
      //         user.tier = updatedUser.tier;
      //         user.storage = updatedUser.storage;
      //         user.isPremium = updatedUser.isPremium;
      //       }
      //     }
      //   } catch (syncError) {
      //     console.error('Failed to sync during login:', syncError);
      //     // Continue with local login even if sync fails
      //   }
      // }

      // Get company only for premium users
      const company = user.type === 'paid' ? 
        await this.getCompanyByUserId(user.id) : null;
      
      console.log('Authentication successful for user:', normalizedEmail);
      return { user, company: company || undefined };
      
    } catch (error) {
      console.error('Authentication error:', error);
      return null;
    }
  }

  // ==================== ENHANCED CRUD WITH SYNC ====================

  

  private async autoSyncAfterChange(entityId: number, entityType: 'property' | 'tenant' | 'invoice'): Promise<void> {
    try {
      let userId: number;
      
      switch (entityType) {
        case 'property':
          const property = await this.getPropertyById(entityId);
          userId = property?.userId || 0;
          break;
        case 'tenant':
          const tenant = await this.getTenantById(entityId);
          if (tenant) {
            const tenantProperty = await this.getPropertyById(tenant.propertyId);
            userId = tenantProperty?.userId || 0;
          } else {
            return;
          }
          break;
        case 'invoice':
          const invoice = await this.getInvoiceById(entityId);
          if (invoice) {
            const invoiceProperty = await this.getPropertyById(invoice.propertyId);
            userId = invoiceProperty?.userId || 0;
          } else {
            return;
          }
          break;
        default:
          return;
      }

      await this.getUserById(userId);
      // if (user && this.canUserSync(user)) {
      //   // Schedule sync (don't await to avoid blocking UI)
      //   setTimeout(async () => {
      //     try {
      //       await firebaseSyncService.forceSyncUserData(userId);
      //     } catch (error) {
      //       console.error('Auto-sync failed:', error);
      //     }
      //   }, 1000);
      // }
    } catch (error) {
      console.error('Auto-sync error:', error);
    }
  }

  // ==================== ACCESS CONTROL HELPERS ====================

  private canUserSync(user: User): boolean {
    // Business and enterprise users always have sync
    if (user.tier === 'business' || user.tier === 'pro' || user.tier === 'solo' || user.tier === 'enterprise') {
      return true;
    }
    
    // Free and low tier users need storage permission
    return user.storage === true;
  }

  // ==================== ENHANCED USER RETRIEVAL ====================

  // async getUserById(id: number): Promise<User | null> {
  //   try {
  //     const query = 'SELECT * FROM users WHERE id = ?';
  //     const result = await this.db!.query(query, [id]);
      
  //     if (result.values && result.values.length > 0) {
  //       return this.mapToEnhancedUser(result.values[0]);
  //     }
  //     return null;
  //   } catch (error) {
  //     console.error('Error getting user by ID:', error);
  //     return null;
  //   }
  // }

  async getUserById(id: number): Promise<User | null> {
  console.log('getUserById called for ID:', id);
  
  // Try to get from localStorage first
  try {
    const cachedUser = localStorage.getItem('currentUser');
    if (cachedUser) {
      const user = JSON.parse(cachedUser);
      console.log('Returning user from localStorage:', user);
      return user;
    }
  } catch (error) {
    console.log('Error reading from localStorage:', error);
  }
  
  // If not in localStorage or failed, fetch from database
  console.log('Fetching user from database for ID:', id);
  
  try {
    
    const query = 'SELECT * FROM users WHERE id = ?';
    const result = await this.db!.query(query, [id]);
    console.log('Raw result:', result);
    
    if (result.values && result.values.length > 0) {
      const user = this.mapToEnhancedUser(result.values[0]);
      
      // Store in localStorage for future calls
      try {
        localStorage.setItem('currentUser', JSON.stringify(user));
        console.log('User stored in localStorage');
      } catch (storageError) {
        console.log('Error storing to localStorage:', storageError);
      }
      
      return user;
    }
    
    return null;
  } catch (error) {
    console.error('Database error for ID:', id, error);
    return null;
  }
}

// Optional: Method to clear localStorage when user logs out
clearCurrentUser(): void {
  localStorage.removeItem('currentUser');
}

// Optional: Method to refresh user data (clears cache and refetches)
async refreshCurrentUser(id: number): Promise<User | null> {
  this.clearCurrentUser();
  return this.getUserById(id);
}

  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      const query = 'SELECT * FROM users WHERE LOWER(email) = ?';
      const result = await this.db!.query(query, [normalizedEmail]);
      
      if (result.values && result.values.length > 0) {
        return this.mapToEnhancedUser(result.values[0]);
      }
      return null;
    } catch (error) {
      console.error('Error getting user by email:', error);
      return null;
    }
  }

  // ==================== TRANSACTION HELPER ====================

  private async executeInTransaction(statements: { statement: string; values?: any[] }[]): Promise<capSQLiteChanges> {
    try {
      console.log('Starting transaction...');
      const results = await this.db!.executeSet(statements, true);
      console.log('Transaction completed successfully');
      return results;
    } catch (error) {
      console.error('Transaction error:', error);
      throw error;
    }
  }

  // ==================== ENHANCED MAPPING FUNCTIONS ====================

  private mapToEnhancedUser(row: any): User {
    let selectedPropertyIds: number[] = [];
    try {
      if (row.selected_property_ids) {
        selectedPropertyIds = JSON.parse(row.selected_property_ids);
      }
    } catch (error) {
      console.error('Error parsing selected property IDs:', error);
    }

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      passwordHash: row.password_hash,
      isPremium: Boolean(row.is_premium),
      type: row.type || 'free',
      tier: row.tier || 'free',
      storage: Boolean(row.storage),
      revenuekatUserId: row.revenuecat_user_id,
      selectedPropertyIds,
      restrictedAccess: Boolean(row.restricted_access),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapToProperty(row: any): Property {
    return {
      id: row.id,
      userId: row.user_id,
      companyId: row.company_id,
      name: row.name,
      address: row.address,
      description: row.description,
      image: row.image,
      agentCommissionRate: row.agent_commission_rate,
      maxUnits: row.max_units || 1,
      billingMode: row.billing_mode === 'rent_only' ? 'rent_only' : 'full',
      isRestricted: Boolean(row.is_restricted),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  public mapToProperties(rows: any[]): Property[] {
    return rows.map(row => this.mapToProperty(row));
  }

  private mapToTenant(row: any): Tenant {
    return {
      id: row.id,
      propertyId: row.property_id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      unitNumber: row.unit_number,
      rentAmount: row.rent_amount,
      standingFees: row.standing_fees,
      depositAmount: row.deposit_amount,
      leaseStart: row.lease_start,
      leaseEnd: row.lease_end,
      isActive: Boolean(row.is_active),
      isRestricted: Boolean(row.is_restricted),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  public mapToTenants(rows: any[]): Tenant[] {
    return rows.map(row => this.mapToTenant(row));
  }

  // ==================== PASSWORD METHODS ====================

  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      const result = await argon2Verify({
        password: password,
        hash: hash
      });

      return result === true;
    } catch (error) {
      console.error('Error verifying password:', error);
      return false;
    }
  }

  private async hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const result = await argon2id({
    password: password,
    salt: salt,
    hashLength: 32,
    iterations: 3,
    memorySize: 65536, // 64 MB in KB
    parallelism: 1,
    outputType: 'encoded'
  });
  return result;
}

  // ==================== DELEGATION TO EXISTING METHODS ====================
  
  // Delegate unchanged methods to maintain compatibility
  async getCompanyByUserId(userId: number): Promise<Company | null> {
    try {
      const query = 'SELECT * FROM companies WHERE user_id = ?';
      const result = await this.db!.query(query, [userId]);
      
      if (result.values && result.values.length > 0) {
        return this.mapToCompany(result.values[0]);
      }
      return null;
    } catch (error) {
      console.error('Error getting company by user ID:', error);
      return null;
    }
  }

  async getPropertyById(id: number): Promise<Property | null> {
    try {
      const query = 'SELECT * FROM properties WHERE id = ?';
      const result = await this.db!.query(query, [id]);
      
      if (result.values && result.values.length > 0) {
        return this.mapToProperty(result.values[0]);
      }
      return null;
    } catch (error) {
      console.error('Error getting property by ID:', error);
      return null;
    }
  }

  async getTenantById(id: number): Promise<Tenant | null> {
    try {
      const query = 'SELECT * FROM tenants WHERE id = ?';
      const result = await this.db!.query(query, [id]);
      
      if (result.values && result.values.length > 0) {
        return this.mapToTenant(result.values[0]);
      }
      return null;
    } catch (error) {
      console.error('Error getting tenant by ID:', error);
      return null;
    }
  }

async getUnitById(id: number): Promise<Unit | null> {
  try {
    const query = 'SELECT * FROM units WHERE id = ?';
    const result = await this.db!.query(query, [id]);
    
    if (result.values && result.values.length > 0) {
      return this.mapToUnit(result.values[0]);
    }
    return null;
  } catch (error) {
    console.error('Error getting unit by ID:', error);
    return null;
  }
}

async setUnitOccupancy(id: number, isOccupied: boolean): Promise<void> {
  const query = `
    UPDATE units 
    SET is_occupied = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;
  await this.db!.run(query, [isOccupied ? 1 : 0, id]);
}

// ==================== UPDATED MAPPING FUNCTIONS ====================

private mapToUnit(row: any): Unit {
  return {
    id: row.id,
    propertyId: row.property_id,
    unitNumber: row.unit_number,
    rentAmount: row.rent_amount,
    isOccupied: Boolean(row.is_occupied),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

private mapToUnits(rows: any[]): Unit[] {
  return rows.map(row => this.mapToUnit(row));
}

  // ==================== COMPANY OPERATIONS ====================

  async createCompany(userId: number, company: CompanyInput): Promise<Company> {
    const query = `
      INSERT INTO companies (user_id, name, address, phone, email)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    const result = await this.db!.run(query, [
      userId,
      company.name,
      company.address || '',
      company.phone || '',
      company.email || ''
    ]);

    const createdCompany = await this.getCompanyById(result.changes!.lastId!);
    if (!createdCompany) {
      throw new Error('Failed to retrieve created company');
    }
    return createdCompany;
  }

  async getCompanyById(id: number): Promise<Company | null> {
    try {
      const query = 'SELECT * FROM companies WHERE id = ?';
      const result = await this.db!.query(query, [id]);
      
      if (result.values && result.values.length > 0) {
        return this.mapToCompany(result.values[0]);
      }
      return null;
    } catch (error) {
      console.error('Error getting company by ID:', error);
      return null;
    }
  }

  async updateCompany(id: number, company: Partial<CompanyInput>): Promise<void> {
    const fields = [];
    const values = [];
    
    if (company.name !== undefined) {
      fields.push('name = ?');
      values.push(company.name);
    }
    if (company.address !== undefined) {
      fields.push('address = ?');
      values.push(company.address);
    }
    if (company.phone !== undefined) {
      fields.push('phone = ?');
      values.push(company.phone);
    }
    if (company.email !== undefined) {
      fields.push('email = ?');
      values.push(company.email);
    }
    
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    
    const query = `UPDATE companies SET ${fields.join(', ')} WHERE id = ?`;
    await this.db!.run(query, values);
  }

  async deleteCompany(id: number): Promise<void> {
    await this.db!.run('DELETE FROM companies WHERE id = ?', [id]);
  }

  // ==================== INVOICE OPERATIONS ====================
  // Fixed createPayment method - ONLY create payment record, don't update invoice
async createPayment(payment: {
  invoiceId: number;
  amount: number;
  paymentDate: string;
  paymentMethod?: string;
  notes?: string;
}): Promise<Payment> {
  // ONLY insert the payment record - don't update the invoice
  const query = `
    INSERT INTO payments (invoice_id, amount, payment_date, payment_method, notes)
    VALUES (?, ?, ?, ?, ?)
  `;
  
  const result = await this.db!.run(query, [
    payment.invoiceId,
    payment.amount,
    payment.paymentDate,
    payment.paymentMethod || '',
    payment.notes || ''
  ]);

  const createdPayment = await this.db!.query(
    'SELECT * FROM payments WHERE id = ?', 
    [result.changes!.lastId!]
  );
  
  if (!createdPayment.values || createdPayment.values.length === 0) {
    throw new Error('Failed to retrieve created payment');
  }
  
  return this.mapToPayment(createdPayment.values[0]);
}

  async getInvoiceById(id: number): Promise<Invoice | null> {
    try {
      const query = 'SELECT * FROM invoices WHERE id = ?';
      const result = await this.db!.query(query, [id]);
      
      if (result.values && result.values.length > 0) {
        return this.mapToInvoice(result.values[0]);
      }
      return null;
    } catch (error) {
      console.error('Error getting invoice by ID:', error);
      return null;
    }
  }

  async markInvoiceUnpaid(id: number): Promise<void> {
    const query = `
      UPDATE invoices 
      SET is_paid = 0, paid_date = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    await this.db!.run(query, [id]);
  }

  

  async getPaymentsByInvoice(invoiceId: number): Promise<Payment[]> {
    try {
      const query = `
        SELECT * FROM payments 
        WHERE invoice_id = ? 
        ORDER BY payment_date DESC
      `;
      
      const result = await this.db!.query(query, [invoiceId]);
      return this.mapToPayments(result.values || []);
    } catch (error) {
      console.error('Error getting payments by invoice:', error);
      return [];
    }
  }
}

// ==================== SINGLETON INSTANCE ====================
export const database = new DatabaseManager();