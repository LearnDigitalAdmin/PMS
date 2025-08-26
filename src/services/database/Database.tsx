// Database.tsx - Complete SQLite Database Implementation
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

// ==================== TYPE INTERFACES ====================

export interface User {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  passwordHash?: string;
  isPremium: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Property {
  id: number;
  userId: number;
  name: string;
  address?: string;
  description?: string;
  agentCommissionRate: number;
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
  createdAt: string;
  updatedAt: string;
}

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
export interface PropertyInput {
  userId: number;
  name: string;
  address?: string;
  description?: string;
  agentCommissionRate?: number;
}

export interface TenantInput {
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
}

export interface InvoiceInput {
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
  name: string;
  address?: string;
  phone?: string;
  email?: string;
}

export interface UserWithCompanyInput {
  user: {
    name: string;
    email: string;
    phone?: string;
    password: string;
  };
  company?: CompanyInput;
}

export interface AuthResult {
  user: User;
  company?: Company;
}

// ==================== DATABASE MANAGER ====================

export class DatabaseManager {
  private sqlite: SQLiteConnection;
  private db: SQLiteDBConnection | null = null;
  private readonly DB_NAME = 'tenant_billing.db';
  private readonly DB_VERSION = 1;

  constructor() {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);
  }

  // ==================== INITIALIZATION ====================
  
  async initializeDatabase(): Promise<void> {
    try {
      // Create connection
      this.db = await this.sqlite.createConnection(
        this.DB_NAME,
        false,
        'no-encryption',
        this.DB_VERSION,
        false
      );

      // Open database
      await this.db.open();

      // Create tables
      await this.createTables();
      
      // Create indexes for performance
      await this.createIndexes();

      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  }

    private async createTables(): Promise<void> {
    const queries = [
      // Users table (updated)
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        password_hash TEXT NOT NULL,
        is_premium INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Companies table (new)
      `CREATE TABLE IF NOT EXISTS companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        address TEXT,
        phone TEXT,
        email TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,

      // Properties table (updated with user_id reference)
      `CREATE TABLE IF NOT EXISTS properties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        address TEXT,
        description TEXT,
        agent_commission_rate REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,

      // Tenants table
      `CREATE TABLE IF NOT EXISTS tenants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        property_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        unit_number TEXT,
        rent_amount REAL NOT NULL,
        standing_fees REAL DEFAULT 0,
        deposit_amount REAL DEFAULT 0,
        lease_start DATE,
        lease_end DATE,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
      )`,

      // Invoices table
      `CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        property_id INTEGER NOT NULL,
        invoice_number TEXT UNIQUE NOT NULL,
        billing_month TEXT NOT NULL,
        rent_amount REAL NOT NULL,
        water_current_reading REAL DEFAULT 0,
        water_previous_reading REAL DEFAULT 0,
        water_standing_fee REAL DEFAULT 0,
        water_unit_price REAL DEFAULT 0,
        power_current_reading REAL DEFAULT 0,
        power_previous_reading REAL DEFAULT 0,
        power_unit_price REAL DEFAULT 0,
        other_charges REAL DEFAULT 0,
        other_charges_description TEXT,
        total_amount REAL NOT NULL,
        amount_paid REAL DEFAULT 0,
        arrears REAL DEFAULT 0,
        is_paid INTEGER DEFAULT 0,
        due_date DATE,
        paid_date DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
      )`,

      // Payments table
      `CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        payment_date DATE NOT NULL,
        payment_method TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
      )`
    ];

    for (const query of queries) {
      await this.db!.run(query);
    }
  }

// ==================== UPDATE createIndexes METHOD ====================

  private async createIndexes(): Promise<void> {
    const indexes = [
      // User indexes
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
      
      // Company indexes
      'CREATE INDEX IF NOT EXISTS idx_companies_user_id ON companies(user_id)',
      
      // Property indexes
      'CREATE INDEX IF NOT EXISTS idx_properties_user_id ON properties(user_id)',
      
      // Tenant indexes
      'CREATE INDEX IF NOT EXISTS idx_tenants_property_id ON tenants(property_id)',
      'CREATE INDEX IF NOT EXISTS idx_tenants_active ON tenants(is_active)',
      'CREATE INDEX IF NOT EXISTS idx_tenants_name ON tenants(name)',
      
      // Invoice indexes
      'CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id ON invoices(tenant_id)',
      'CREATE INDEX IF NOT EXISTS idx_invoices_property_id ON invoices(property_id)',
      'CREATE INDEX IF NOT EXISTS idx_invoices_billing_month ON invoices(billing_month)',
      'CREATE INDEX IF NOT EXISTS idx_invoices_is_paid ON invoices(is_paid)',
      'CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date)',
      'CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number)',
      
      // Payment indexes
      'CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id)',
      'CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date)'
    ];

    for (const index of indexes) {
      await this.db!.run(index);
    }
  }


    async createUserWithCompany(data: UserWithCompanyInput): Promise<AuthResult> {
    try {
      // Start transaction
      await this.db!.run('BEGIN TRANSACTION');

      // Check if user already exists
      const existingUser = await this.getUserByEmail(data.user.email);
      if (existingUser) {
        await this.db!.run('ROLLBACK');
        throw new Error('User with this email already exists');
      }

      // Hash password (simple implementation - in production use bcrypt)
      const passwordHash = await this.hashPassword(data.user.password);

      // Create user
      const userQuery = `
        INSERT INTO users (name, email, phone, password_hash, is_premium)
        VALUES (?, ?, ?, ?, 0)
      `;
      
      const userResult = await this.db!.run(userQuery, [
        data.user.name,
        data.user.email,
        data.user.phone || '',
        passwordHash
      ]);

      const userId = userResult.changes!.lastId!;
      const user = await this.getUserById(userId);
      
      if (!user) {
        await this.db!.run('ROLLBACK');
        throw new Error('Failed to create user');
      }

      let company: Company | undefined;

      // Create company if provided
      if (data.company && data.company.name) {
        const companyQuery = `
          INSERT INTO companies (user_id, name, address, phone, email)
          VALUES (?, ?, ?, ?, ?)
        `;
        
        const companyResult = await this.db!.run(companyQuery, [
          userId,
          data.company.name,
          data.company.address || '',
          data.company.phone || '',
          data.company.email || ''
        ]);

        const companyId = companyResult.changes!.lastId!;
        company = (await this.getCompanyById(companyId)) ?? undefined;
      }

      // Commit transaction
      await this.db!.run('COMMIT');

      return { user, company };
    } catch (error) {
      await this.db!.run('ROLLBACK');
      throw error;
    }
  }

  async authenticateUser(email: string, password: string): Promise<AuthResult | null> {
    try {
      const user = await this.getUserByEmail(email);
      if (!user || !user.passwordHash) {
        return null;
      }

      const isValidPassword = await this.verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        return null;
      }

      const company = (await this.getCompanyByUserId(user.id)) ?? undefined;

      return { user, company };
    } catch (error) {
      console.error('Authentication error:', error);
      return null;
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE email = ?';
    const result = await this.db!.query(query, [email]);
    
    if (result.values && result.values.length > 0) {
      return this.mapToUser(result.values[0]);
    }
    return null;
  }

  async getUserById(id: number): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE id = ?';
    const result = await this.db!.query(query, [id]);
    
    if (result.values && result.values.length > 0) {
      return this.mapToUser(result.values[0]);
    }
    return null;
  }

  async updateUser(id: number, user: Partial<{
    name: string;
    email: string;
    phone: string;
    password: string;
    isPremium: boolean;
  }>): Promise<void> {
    const fields = [];
    const values = [];
    
    if (user.name !== undefined) {
      fields.push('name = ?');
      values.push(user.name);
    }
    if (user.email !== undefined) {
      fields.push('email = ?');
      values.push(user.email);
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

  async getCompanyByUserId(userId: number): Promise<Company | null> {
    const query = 'SELECT * FROM companies WHERE user_id = ?';
    const result = await this.db!.query(query, [userId]);
    
    if (result.values && result.values.length > 0) {
      return this.mapToCompany(result.values[0]);
    }
    return null;
  }

  async getCompanyById(id: number): Promise<Company | null> {
    const query = 'SELECT * FROM companies WHERE id = ?';
    const result = await this.db!.query(query, [id]);
    
    if (result.values && result.values.length > 0) {
      return this.mapToCompany(result.values[0]);
    }
    return null;
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

  // ==================== PASSWORD UTILITIES ====================

  private async hashPassword(password: string): Promise<string> {
    // Simple hash implementation for demo purposes
    // In production, use bcrypt or similar
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'propertyflow_salt_2024');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    const passwordHash = await this.hashPassword(password);
    return passwordHash === hash;
  }

  // ==================== ADDITIONAL MAPPING FUNCTIONS ====================

  private mapToUser(row: any): User {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      passwordHash: row.password_hash,
      isPremium: Boolean(row.is_premium),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

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

  // ==================== PROPERTY OPERATIONS ====================

  async createProperty(property: PropertyInput): Promise<Property> {
    const query = `
      INSERT INTO properties (user_id, name, address, description, agent_commission_rate)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    const result = await this.db!.run(query, [
      property.userId,
      property.name,
      property.address || '',
      property.description || '',
      property.agentCommissionRate || 0
    ]);

    const createdProperty = await this.getPropertyById(result.changes!.lastId!);
    if (!createdProperty) {
      throw new Error('Failed to retrieve created property');
    }
    return createdProperty;
  }

  async getProperties(userId: number): Promise<Property[]> {
    const query = `
      SELECT * FROM properties 
      WHERE user_id = ? 
      ORDER BY created_at DESC
    `;
    
    const result = await this.db!.query(query, [userId]);
    return this.mapToProperties(result.values || []);
  }

  async getPropertyById(id: number): Promise<Property | null> {
    const query = 'SELECT * FROM properties WHERE id = ?';
    const result = await this.db!.query(query, [id]);
    
    if (result.values && result.values.length > 0) {
      return this.mapToProperty(result.values[0]);
    }
    return null;
  }

  async getPropertiesWithTenants(userId: number): Promise<PropertyWithTenants[]> {
    const query = `
      SELECT 
        p.*,
        COUNT(t.id) as tenant_count,
        SUM(t.rent_amount) as monthly_revenue,
        COUNT(CASE WHEN t.is_active = 1 THEN 1 END) as active_tenants
      FROM properties p
      LEFT JOIN tenants t ON p.id = t.property_id
      WHERE p.user_id = ?
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;
    
    const result = await this.db!.query(query, [userId]);
    const properties = result.values || [];
    
    const propertiesWithTenants: PropertyWithTenants[] = [];
    
    for (const prop of properties) {
      const tenants = await this.getTenantsByProperty(prop.id);
      propertiesWithTenants.push({
        ...this.mapToProperty(prop),
        tenants,
        monthlyRevenue: prop.monthly_revenue || 0,
        occupancyRate: tenants.length > 0 ? (prop.active_tenants / tenants.length) * 100 : 0
      });
    }
    
    return propertiesWithTenants;
  }

  async updateProperty(id: number, property: Partial<PropertyInput>): Promise<void> {
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
    if (property.agentCommissionRate !== undefined) {
      fields.push('agent_commission_rate = ?');
      values.push(property.agentCommissionRate);
    }
    
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    
    const query = `UPDATE properties SET ${fields.join(', ')} WHERE id = ?`;
    await this.db!.run(query, values);
  }

  async deleteProperty(id: number): Promise<void> {
    await this.db!.run('DELETE FROM properties WHERE id = ?', [id]);
  }

  // ==================== TENANT OPERATIONS ====================

  async createTenant(tenant: TenantInput): Promise<Tenant> {
    const query = `
      INSERT INTO tenants (
        property_id, name, phone, email, unit_number, 
        rent_amount, standing_fees, deposit_amount, lease_start, lease_end
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const result = await this.db!.run(query, [
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
    return createdTenant;
  }

  async getTenantsByProperty(propertyId: number): Promise<Tenant[]> {
    const query = `
      SELECT * FROM tenants 
      WHERE property_id = ? 
      ORDER BY name ASC
    `;
    
    const result = await this.db!.query(query, [propertyId]);
    return this.mapToTenants(result.values || []);
  }

  async getTenantsWithInvoices(propertyId: number, billingMonth?: string): Promise<TenantWithInvoices[]> {
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
      WHERE t.property_id = ?
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
  }

  async getTenantById(id: number): Promise<Tenant | null> {
    const query = 'SELECT * FROM tenants WHERE id = ?';
    const result = await this.db!.query(query, [id]);
    
    if (result.values && result.values.length > 0) {
      return this.mapToTenant(result.values[0]);
    }
    return null;
  }

  async updateTenant(id: number, tenant: Partial<TenantInput>): Promise<void> {
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
    
    const query = `UPDATE tenants SET ${fields.join(', ')} WHERE id = ?`;
    await this.db!.run(query, values);
  }

  async deleteTenant(id: number): Promise<void> {
    await this.db!.run('DELETE FROM tenants WHERE id = ?', [id]);
  }

  async searchTenants(propertyId: number, searchTerm: string): Promise<Tenant[]> {
    const query = `
      SELECT * FROM tenants 
      WHERE property_id = ? AND (
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
  }

  // ==================== INVOICE OPERATIONS ====================

  async createInvoice(invoice: InvoiceInput): Promise<Invoice> {
    const invoiceNumber = await this.generateInvoiceNumber();
    
    // Calculate total amount
    const waterAmount = ((invoice.waterCurrentReading || 0) - (invoice.waterPreviousReading || 0)) * 
                       (invoice.waterUnitPrice || 0) + (invoice.waterStandingFee || 0);
    const powerAmount = ((invoice.powerCurrentReading || 0) - (invoice.powerPreviousReading || 0)) * 
                       (invoice.powerUnitPrice || 0);
    const totalAmount = invoice.rentAmount + waterAmount + powerAmount + (invoice.otherCharges || 0);
    
    const query = `
      INSERT INTO invoices (
        tenant_id, property_id, invoice_number, billing_month, rent_amount,
        water_current_reading, water_previous_reading, water_standing_fee, water_unit_price,
        power_current_reading, power_previous_reading, power_unit_price,
        other_charges, other_charges_description, total_amount, due_date
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const result = await this.db!.run(query, [
      invoice.tenantId,
      invoice.propertyId,
      invoiceNumber,
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
      totalAmount,
      invoice.dueDate || null
    ]);

    const createdInvoice = await this.getInvoiceById(result.changes!.lastId!);
    if (!createdInvoice) {
      throw new Error('Failed to retrieve created invoice');
    }
    return createdInvoice;
  }

  async getInvoices(filters: InvoiceFilters = {}): Promise<InvoiceWithDetails[]> {
    let query = `
      SELECT 
        i.*,
        t.name as tenant_name,
        t.phone as tenant_phone,
        t.email as tenant_email,
        p.name as property_name
      FROM invoices i
      JOIN tenants t ON i.tenant_id = t.id
      JOIN properties p ON i.property_id = p.id
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
  }

  async getInvoiceById(id: number): Promise<Invoice | null> {
    const query = 'SELECT * FROM invoices WHERE id = ?';
    const result = await this.db!.query(query, [id]);
    
    if (result.values && result.values.length > 0) {
      return this.mapToInvoice(result.values[0]);
    }
    return null;
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

  async markInvoicePaid(id: number, paidAmount: number, arrears: number = 0): Promise<void> {
    const query = `
      UPDATE invoices 
      SET is_paid = 1, amount_paid = ?, arrears = ?, paid_date = CURRENT_DATE, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    await this.db!.run(query, [paidAmount, arrears, id]);
  }

  async markInvoiceUnpaid(id: number): Promise<void> {
    const query = `
      UPDATE invoices 
      SET is_paid = 0, paid_date = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    await this.db!.run(query, [id]);
  }

  async deleteInvoice(id: number): Promise<void> {
    await this.db!.run('DELETE FROM invoices WHERE id = ?', [id]);
  }

  private async generateInvoiceNumber(): Promise<string> {
    const query = 'SELECT COUNT(*) as count FROM invoices';
    const result = await this.db!.query(query);
    const count = result.values?.[0]?.count || 0;
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `INV-${year}${month}-${(count + 1).toString().padStart(4, '0')}`;
  }

  // ==================== PAYMENT OPERATIONS ====================

  async createPayment(payment: {
    invoiceId: number;
    amount: number;
    paymentDate: string;
    paymentMethod?: string;
    notes?: string;
  }): Promise<Payment> {
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

    const createdPayment = await this.getPaymentById(result.changes!.lastId!);
    if (!createdPayment) {
      throw new Error('Failed to retrieve created payment');
    }
    return createdPayment;
  }

  async getPaymentsByInvoice(invoiceId: number): Promise<Payment[]> {
    const query = `
      SELECT * FROM payments 
      WHERE invoice_id = ? 
      ORDER BY payment_date DESC
    `;
    
    const result = await this.db!.query(query, [invoiceId]);
    return this.mapToPayments(result.values || []);
  }

  private async getPaymentById(id: number): Promise<Payment | null> {
    const query = 'SELECT * FROM payments WHERE id = ?';
    const result = await this.db!.query(query, [id]);
    
    if (result.values && result.values.length > 0) {
      return this.mapToPayment(result.values[0]);
    }
    return null;
  }

  // ==================== DASHBOARD & ANALYTICS ====================

  async getDashboardData(propertyId?: number, month?: string): Promise<DashboardData> {
    let propertyFilter = propertyId ? 'AND p.id = ?' : '';
    let monthFilter = month ? 'AND i.billing_month = ?' : '';
    
    const query = `
      SELECT 
        COUNT(DISTINCT p.id) as total_properties,
        COUNT(DISTINCT t.id) as total_tenants,
        SUM(CASE WHEN i.is_paid = 1 THEN i.total_amount ELSE 0 END) as monthly_revenue,
        SUM(i.arrears) as total_arrears,
        COUNT(CASE WHEN i.is_paid = 1 THEN 1 END) as paid_invoices,
        COUNT(CASE WHEN i.is_paid = 0 THEN 1 END) as unpaid_invoices,
        COUNT(CASE WHEN t.is_active = 1 THEN 1 END) as active_tenants,
        COUNT(t.id) as total_tenant_spaces
      FROM properties p
      LEFT JOIN tenants t ON p.id = t.property_id
      LEFT JOIN invoices i ON t.id = i.tenant_id ${monthFilter}
      WHERE 1=1 ${propertyFilter}
    `;
    
    const params = [];
    if (month) params.push(month);
    if (propertyId) params.push(propertyId);
    
    const result = await this.db!.query(query, params);
    const row = result.values?.[0] || {};
    
    return {
      totalProperties: row.total_properties || 0,
      totalTenants: row.total_tenants || 0,
      monthlyRevenue: row.monthly_revenue || 0,
      totalArrears: row.total_arrears || 0,
      paidInvoices: row.paid_invoices || 0,
      unpaidInvoices: row.unpaid_invoices || 0,
      occupancyRate: row.total_tenant_spaces > 0 ? 
        (row.active_tenants / row.total_tenant_spaces) * 100 : 0
    };
  }

  async getMonthlyStats(propertyId: number, year: number): Promise<MonthlyStats[]> {
    const query = `
      SELECT 
        i.billing_month as month,
        SUM(CASE WHEN i.is_paid = 1 THEN i.total_amount ELSE 0 END) as revenue,
        0 as expenses,
        SUM(CASE WHEN i.is_paid = 1 THEN i.total_amount ELSE 0 END) as profit,
        COUNT(CASE WHEN i.is_paid = 1 THEN 1 END) as paid_count,
        COUNT(CASE WHEN i.is_paid = 0 THEN 1 END) as unpaid_count
      FROM invoices i
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
  }

  // ==================== UTILITY METHODS ====================

  async closeConnection(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }

  // ==================== MAPPING FUNCTIONS ====================

  private mapToProperty(row: any): Property {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      address: row.address,
      description: row.description,
      agentCommissionRate: row.agent_commission_rate,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapToProperties(rows: any[]): Property[] {
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
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapToTenants(rows: any[]): Tenant[] {
    return rows.map(row => this.mapToTenant(row));
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

//   private mapToInvoices(rows: any[]): Invoice[] {
//     return rows.map(row => this.mapToInvoice(row));
//   }

  private mapToInvoiceWithDetails(row: any): InvoiceWithDetails {
    return {
      ...this.mapToInvoice(row),
      tenantName: row.tenant_name,
      propertyName: row.property_name,
      tenantPhone: row.tenant_phone,
      tenantEmail: row.tenant_email
    };
  }

  private mapToInvoicesWithDetails(rows: any[]): InvoiceWithDetails[] {
    return rows.map(row => this.mapToInvoiceWithDetails(row));
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
}

// ==================== SINGLETON INSTANCE ====================
export const database = new DatabaseManager();