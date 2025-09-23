import { database } from './Database';

const AGENT_SUMMARY_TRIGGERS = [
  // Update timestamp trigger for business expenses
  `CREATE TRIGGER IF NOT EXISTS trigger_business_expenses_updated_at
    AFTER UPDATE ON business_expenses
    FOR EACH ROW
  BEGIN
    UPDATE business_expenses 
    SET updated_at = CURRENT_TIMESTAMP 
    WHERE id = NEW.id;
  END`,

  // OPTIMIZED Cache invalidation triggers - only invalidate when values actually change
  `CREATE TRIGGER IF NOT EXISTS trigger_smart_cache_invalidation
    AFTER UPDATE ON business_expenses
    FOR EACH ROW
    WHEN NEW.amount != OLD.amount OR NEW.category != OLD.category OR NEW.month != OLD.month
  BEGIN
    UPDATE monthly_business_summaries 
    SET is_stale = 1, last_calculated = CURRENT_TIMESTAMP
    WHERE user_id = NEW.user_id 
    AND (month = NEW.month OR month = OLD.month)
    AND (property_filter IS NULL OR property_filter = NEW.property_id);
  END`,

  `CREATE TRIGGER IF NOT EXISTS trigger_invalidate_cache_on_expense_insert
    AFTER INSERT ON business_expenses
    FOR EACH ROW
  BEGIN
    UPDATE monthly_business_summaries 
    SET is_stale = 1 
    WHERE user_id = NEW.user_id 
    AND month = NEW.month
    AND (property_filter IS NULL OR property_filter = NEW.property_id);
  END`,

  `CREATE TRIGGER IF NOT EXISTS trigger_invalidate_cache_on_expense_delete
    AFTER DELETE ON business_expenses
    FOR EACH ROW
  BEGIN
    UPDATE monthly_business_summaries 
    SET is_stale = 1 
    WHERE user_id = OLD.user_id 
    AND month = OLD.month
    AND (property_filter IS NULL OR property_filter = OLD.property_id);
  END`
];

// NEW: Database maintenance class
export class DatabaseMaintenance {
  private lastFullCleanup: Date | null = null;
  private lastCacheCleanup: Date | null = null;
  private cleanupRunning = false;

  // Check if cleanup is needed before running
  private needsFullCleanup(): boolean {
    if (!this.lastFullCleanup) return true;
    const daysSinceCleanup = (Date.now() - this.lastFullCleanup.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceCleanup >= 30; // Only run monthly
  }

  private needsCacheCleanup(): boolean {
    if (!this.lastCacheCleanup) return true;
    const hoursSinceCleanup = (Date.now() - this.lastCacheCleanup.getTime()) / (1000 * 60 * 60);
    return hoursSinceCleanup >= 6; // Only run every 6 hours
  }

  // Automatic cleanup for old data (run monthly/quarterly)
  async cleanupOldData(): Promise<void> {
    if (this.cleanupRunning || !this.needsFullCleanup()) {
      console.log('Skipping cleanup - not needed or already running');
      return;
    }

    this.cleanupRunning = true;
    console.log('Starting database cleanup...');

    try {
      if (!database.db) {
        throw new Error('Database not initialized');
      }

      const retentionMonths = 18; // Keep 1.5 years of data
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths);
      const cutoffMonth = cutoffDate.toISOString().slice(0, 7); // YYYY-MM format

      const cleanupQueries = [
        // Archive old invoices (older than 18 months)
        { query: `DELETE FROM invoices WHERE billing_month < ?`, params: [cutoffMonth] },
        
        // Clean old payment records
        { query: `DELETE FROM payments WHERE payment_date < ?`, params: [cutoffDate.toISOString().split('T')[0]] },
        
        // Archive old business expenses
        { query: `DELETE FROM business_expenses WHERE month < ?`, params: [cutoffMonth] },
        
        // Clean stale cache entries
        { query: `DELETE FROM monthly_business_summaries WHERE month < ? AND is_stale = 1`, params: [cutoffMonth] },
        
        // Archive old KPI history (keep last 2 years for trends)
        { query: `DELETE FROM agent_kpi_history WHERE month < ?`, params: [cutoffMonth] },
        
        // Clean old rent record sheets
        { query: `DELETE FROM rent_record_sheets WHERE billing_month < ?`, params: [cutoffMonth] },
        
        // Remove orphaned transcript items
        { query: `DELETE FROM transcript_items WHERE transcript_id NOT IN (SELECT id FROM monthly_transcripts)`, params: [] }
      ];

      let totalDeleted = 0;
      for (const { query, params } of cleanupQueries) {
        try {
          const result = await database.db.run(query, params);
          const deleted = result.changes || 0;
          totalDeleted += (deleted as number);
          if ((deleted as number) > 0) {
            console.log(`Cleanup: ${deleted} records deleted from query: ${query.substring(0, 50)}...`);
          }
        } catch (error) {
          console.error('Cleanup error for query:', query, error);
        }
      }

      // Only vacuum if we actually deleted something
      if (totalDeleted > 0) {
        console.log('Running database optimization...');
        await database.db.run('PRAGMA incremental_vacuum');
        await database.db.run('ANALYZE');
      }

      this.lastFullCleanup = new Date();
      console.log(`Database cleanup completed. ${totalDeleted} total records removed.`);
    } catch (error) {
      console.error('Database cleanup failed:', error);
    } finally {
      this.cleanupRunning = false;
    }
  }

  // Clean stale cache entries (run daily/weekly)
  async cleanupStaleCache(): Promise<void> {
    if (!this.needsCacheCleanup()) {
      return; // Skip if not needed
    }

    try {
      if (!database.db) {
        throw new Error('Database not initialized');
      }

      const staleCutoff = new Date();
      staleCutoff.setHours(staleCutoff.getHours() - 24); // 24 hours old

      const result = await database.db.run(`
        DELETE FROM monthly_business_summaries 
        WHERE is_stale = 1 
        AND last_calculated < ?
      `, [staleCutoff.toISOString()]);

      const deleted = result.changes || 0;
      if ((deleted as number) > 0) {
        console.log(`Stale cache cleanup: ${deleted} entries removed`);
      }

      this.lastCacheCleanup = new Date();
    } catch (error) {
      console.error('Stale cache cleanup failed:', error);
    }
  }

  // Manual cleanup trigger (for immediate cleanup if needed)
  async forceCleanup(): Promise<void> {
    this.lastFullCleanup = null; // Reset to force cleanup
    await this.cleanupOldData();
  }
}

export class Tables {
  private maintenanceScheduled = false;

  async createTables(): Promise<void> {
    if (!database.db) {
      throw new Error('Database not initialized');
    }

    console.log('Creating database tables...');
    const queries = [

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

      // New Units table
      `CREATE TABLE IF NOT EXISTS units (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        property_id INTEGER NOT NULL,
        unit_number TEXT NOT NULL,
        rent_amount REAL NOT NULL,
        is_occupied INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
        UNIQUE(property_id, unit_number)
      )`,

      `CREATE TABLE IF NOT EXISTS users (
        id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        password_hash TEXT NOT NULL,
        is_premium INTEGER DEFAULT 0,
        type TEXT DEFAULT 'free' CHECK (type IN ('free', 'paid')),
        tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'low', 'business', 'pro', 'solo', 'enterprise')),
        storage INTEGER DEFAULT 0,
        revenuecat_user_id TEXT,
        selected_property_ids TEXT, -- JSON array of property IDs for restricted users
        restricted_access INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Add access control to properties
      `CREATE TABLE IF NOT EXISTS properties (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        company_id INTEGER,
        name TEXT NOT NULL,
        address TEXT,
        description TEXT,
        image TEXT,
        agent_commission_rate REAL DEFAULT 0,
        max_units INTEGER DEFAULT 1,
        is_restricted INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
      )`,

      // Add access control to tenants
      `CREATE TABLE IF NOT EXISTS tenants (
        id INTEGER PRIMARY KEY,
        property_id INTEGER NOT NULL,
        unit_id INTEGER,
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
        is_restricted INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
        FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL
      )`,

      // Invoices table
      `CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY,
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
      )`,

      `CREATE TABLE IF NOT EXISTS monthly_transcripts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        property_id INTEGER NOT NULL,
        billing_month TEXT NOT NULL,
        landlord_name TEXT NOT NULL,
        landlord_contact TEXT,
        agent_commission_rate REAL NOT NULL,
        gross_rent_collected REAL NOT NULL DEFAULT 0,
        total_water_charges REAL NOT NULL DEFAULT 0,
        total_power_charges REAL NOT NULL DEFAULT 0,
        total_other_charges REAL NOT NULL DEFAULT 0,
        total_deductibles REAL NOT NULL DEFAULT 0,
        agent_commission REAL NOT NULL DEFAULT 0,
        net_amount_to_landlord REAL NOT NULL DEFAULT 0,
        status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'sent', 'acknowledged')),
        notes TEXT,
        generated_by INTEGER NOT NULL,
        sent_date DATE,
        acknowledged_date DATE,
        is_archived INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
        FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(property_id, billing_month)
      )`,

      // Transcript Items table (for custom deductibles and expenses)
      `CREATE TABLE IF NOT EXISTS transcript_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        billing_month TEXT NOT NULL,
        property_id INTEGER NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('rent', 'water', 'power', 'deductible', 'expense', 'custom')),
        category TEXT,
        is_deductible INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (property_id) REFERENCES properties(id) on DELETE CASCADE
      )`,

      // Rent Record Sheets table
      `CREATE TABLE IF NOT EXISTS rent_record_sheets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        property_id INTEGER NOT NULL,
        billing_month TEXT NOT NULL,
        total_units INTEGER NOT NULL DEFAULT 0,
        occupied_units INTEGER NOT NULL DEFAULT 0,
        total_rent_expected REAL NOT NULL DEFAULT 0,
        total_rent_collected REAL NOT NULL DEFAULT 0,
        total_arrears REAL NOT NULL DEFAULT 0,
        collection_rate REAL NOT NULL DEFAULT 0,
        status TEXT DEFAULT 'current' CHECK (status IN ('current', 'archived')),
        is_archived INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
        UNIQUE(property_id, billing_month)
      )`,

      // Rent Record Entries table (individual tenant records)
      `CREATE TABLE IF NOT EXISTS rent_record_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_sheet_id INTEGER NOT NULL,
        tenant_id INTEGER NOT NULL,
        tenant_name TEXT NOT NULL,
        unit_number TEXT NOT NULL,
        rent_amount REAL NOT NULL,
        water_charges REAL NOT NULL DEFAULT 0,
        power_charges REAL NOT NULL DEFAULT 0,
        other_charges REAL NOT NULL DEFAULT 0,
        total_due REAL NOT NULL,
        amount_paid REAL NOT NULL DEFAULT 0,
        balance REAL NOT NULL DEFAULT 0,
        payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('paid', 'partial', 'unpaid', 'overpaid')),
        payment_date DATE,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (record_sheet_id) REFERENCES rent_record_sheets(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS business_expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        company_id INTEGER,
        property_id INTEGER,
        month TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL CHECK (amount > 0),
        category TEXT NOT NULL CHECK (category IN (
          'office', 'marketing', 'maintenance', 'utilities', 
          'transport', 'professional', 'insurance', 'software', 
          'legal', 'other'
        )),
        is_recurring INTEGER DEFAULT 0 CHECK (is_recurring IN (0, 1)),
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
      )`,

      // Agent Commission Summary Cache
      `CREATE TABLE IF NOT EXISTS agent_commission_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        company_id INTEGER,
        property_id INTEGER NOT NULL,
        month TEXT NOT NULL,
        property_name TEXT NOT NULL,
        total_units INTEGER NOT NULL DEFAULT 0,
        occupied_units INTEGER NOT NULL DEFAULT 0,
        gross_rent_collected REAL NOT NULL DEFAULT 0,
        commission_rate REAL NOT NULL DEFAULT 0,
        commission_amount REAL NOT NULL DEFAULT 0,
        occupancy_rate REAL NOT NULL DEFAULT 0,
        collection_rate REAL NOT NULL DEFAULT 0,
        average_rent_per_unit REAL NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
        UNIQUE(user_id, property_id, month)
      )`,

      // Agent Other Income Summary
      `CREATE TABLE IF NOT EXISTS agent_other_income_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        company_id INTEGER,
        property_id INTEGER NOT NULL,
        month TEXT NOT NULL,
        property_name TEXT NOT NULL,
        income_source TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
      )`,

      // Monthly Business Summary Cache
      `CREATE TABLE IF NOT EXISTS monthly_business_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        company_id INTEGER,
        month TEXT NOT NULL,
        property_filter INTEGER,
        total_commission_revenue REAL NOT NULL DEFAULT 0,
        total_other_income_revenue REAL NOT NULL DEFAULT 0,
        total_gross_revenue REAL NOT NULL DEFAULT 0,
        total_properties_managed INTEGER NOT NULL DEFAULT 0,
        total_units_managed INTEGER NOT NULL DEFAULT 0,
        total_occupied_units INTEGER NOT NULL DEFAULT 0,
        portfolio_occupancy_rate REAL NOT NULL DEFAULT 0,
        average_commission_rate REAL NOT NULL DEFAULT 0,
        total_business_expenses REAL NOT NULL DEFAULT 0,
        net_income REAL NOT NULL DEFAULT 0,
        profit_margin REAL NOT NULL DEFAULT 0,
        revenue_per_property REAL NOT NULL DEFAULT 0,
        revenue_per_unit REAL NOT NULL DEFAULT 0,
        expense_ratio REAL NOT NULL DEFAULT 0,
        last_calculated DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_stale INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
        FOREIGN KEY (property_filter) REFERENCES properties(id) ON DELETE CASCADE,
        UNIQUE(user_id, month, property_filter)
      )`,

      // Agent KPI History
      `CREATE TABLE IF NOT EXISTS agent_kpi_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        company_id INTEGER,
        month TEXT NOT NULL,
        portfolio_occupancy_rate REAL NOT NULL DEFAULT 0,
        average_commission_rate REAL NOT NULL DEFAULT 0,
        properties_under_management INTEGER NOT NULL DEFAULT 0,
        units_under_management INTEGER NOT NULL DEFAULT 0,
        monthly_recurring_revenue REAL NOT NULL DEFAULT 0,
        revenue_per_property REAL NOT NULL DEFAULT 0,
        revenue_per_unit REAL NOT NULL DEFAULT 0,
        profit_margin REAL NOT NULL DEFAULT 0,
        expense_ratio REAL NOT NULL DEFAULT 0,
        collection_rate REAL NOT NULL DEFAULT 0,
        turnover_rate REAL NOT NULL DEFAULT 0,
        revenue_growth_rate REAL,
        property_growth_rate REAL,
        unit_growth_rate REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
        UNIQUE(user_id, month)
      )`
    ];

    // Create tables in batches to improve performance
    const batchSize = 5;
    for (let i = 0; i < queries.length; i += batchSize) {
      const batch = queries.slice(i, i + batchSize);
      await Promise.all(batch.map(query => database.db!.run(query)));
    }

    console.log('Tables created successfully');
  }

  async createIndexes(): Promise<void> {
    if (!database.db) {
      throw new Error('Database not initialized');
    }

    console.log('Creating database indexes...');
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
      'CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date)',

      'CREATE INDEX IF NOT EXISTS idx_transcripts_property_month ON monthly_transcripts(property_id, billing_month)',
      'CREATE INDEX IF NOT EXISTS idx_transcripts_status ON monthly_transcripts(status)',
      'CREATE INDEX IF NOT EXISTS idx_transcripts_generated_by ON monthly_transcripts(generated_by)',
      'CREATE INDEX IF NOT EXISTS idx_transcript_items_transcript_id ON transcript_items(transcript_id)',
      'CREATE INDEX IF NOT EXISTS idx_transcript_items_type ON transcript_items(type)',
      'CREATE INDEX IF NOT EXISTS idx_record_sheets_property_month ON rent_record_sheets(property_id, billing_month)',
      'CREATE INDEX IF NOT EXISTS idx_record_sheets_status ON rent_record_sheets(status)',
      'CREATE INDEX IF NOT EXISTS idx_record_entries_sheet_id ON rent_record_entries(record_sheet_id)',
      'CREATE INDEX IF NOT EXISTS idx_record_entries_tenant_id ON rent_record_entries(tenant_id)',
      'CREATE INDEX IF NOT EXISTS idx_record_entries_payment_status ON rent_record_entries(payment_status)',

      'CREATE INDEX IF NOT EXISTS idx_business_expenses_user_month ON business_expenses(user_id, month)',
      'CREATE INDEX IF NOT EXISTS idx_business_expenses_property_month ON business_expenses(property_id, month)',
      'CREATE INDEX IF NOT EXISTS idx_business_expenses_category ON business_expenses(category)',
      'CREATE INDEX IF NOT EXISTS idx_business_expenses_recurring ON business_expenses(is_recurring)',
      'CREATE INDEX IF NOT EXISTS idx_business_expenses_created_at ON business_expenses(created_at)',

      // Commission Summaries Indexes
      'CREATE INDEX IF NOT EXISTS idx_commission_summaries_user_month ON agent_commission_summaries(user_id, month)',
      'CREATE INDEX IF NOT EXISTS idx_commission_summaries_property_month ON agent_commission_summaries(property_id, month)',
      'CREATE INDEX IF NOT EXISTS idx_commission_summaries_user_property ON agent_commission_summaries(user_id, property_id)',

      // Other Income Summaries Indexes
      'CREATE INDEX IF NOT EXISTS idx_other_income_summaries_user_month ON agent_other_income_summaries(user_id, month)',
      'CREATE INDEX IF NOT EXISTS idx_other_income_summaries_property_month ON agent_other_income_summaries(property_id, month)',
      'CREATE INDEX IF NOT EXISTS idx_other_income_summaries_source ON agent_other_income_summaries(income_source)',

      // Business Summaries Cache Indexes
      'CREATE INDEX IF NOT EXISTS idx_business_summaries_user_month ON monthly_business_summaries(user_id, month)',
      'CREATE INDEX IF NOT EXISTS idx_business_summaries_stale ON monthly_business_summaries(is_stale)',
      'CREATE INDEX IF NOT EXISTS idx_business_summaries_last_calculated ON monthly_business_summaries(last_calculated)',

      // KPI History Indexes
      'CREATE INDEX IF NOT EXISTS idx_kpi_history_user_month ON agent_kpi_history(user_id, month)',
      'CREATE INDEX IF NOT EXISTS idx_kpi_history_created_at ON agent_kpi_history(created_at)',

      // NEW PERFORMANCE INDEXES
      // Composite indexes for common query patterns
      'CREATE INDEX IF NOT EXISTS idx_invoices_property_month_paid ON invoices(property_id, billing_month, is_paid)',
      'CREATE INDEX IF NOT EXISTS idx_tenants_property_active ON tenants(property_id, is_active)',
      'CREATE INDEX IF NOT EXISTS idx_business_expenses_user_month_category ON business_expenses(user_id, month, category)',
      
      // Partial indexes for active records only (more efficient)
      'CREATE INDEX IF NOT EXISTS idx_tenants_active_only ON tenants(property_id, name) WHERE is_active = 1',
      'CREATE INDEX IF NOT EXISTS idx_invoices_unpaid_only ON invoices(property_id, billing_month, due_date) WHERE is_paid = 0'
    ];

    // Create indexes in smaller batches to avoid blocking
    const batchSize = 10;
    for (let i = 0; i < indexes.length; i += batchSize) {
      const batch = indexes.slice(i, i + batchSize);
      await Promise.all(batch.map(async (index) => {
        try {
          await database.db!.run(index);
        } catch (error) {
          // Index might already exist, continue silently
        }
      }));
    }

    console.log('Indexes created successfully');
  }

  // NEW: Initialize database optimizations
  async initializeOptimizations(): Promise<void> {
    if (!database.db) throw new Error('Database not initialized');

    console.log('Applying database optimizations...');
    const optimizations = [
      // WAL mode for better concurrency
      'PRAGMA journal_mode = WAL',
      
      // Optimize for performance over safety
      'PRAGMA synchronous = NORMAL',
      
      // Increase cache size (32MB cache - reduced from 64MB to use less memory)
      'PRAGMA cache_size = -32000',
      
      // Set auto-vacuum for space reclamation
      'PRAGMA auto_vacuum = INCREMENTAL',
      
      // Optimize page size
      'PRAGMA page_size = 4096',

      // Enable memory-mapped I/O for faster reads
      'PRAGMA mmap_size = 268435456', // 256MB

      // Optimize temp storage
      'PRAGMA temp_store = MEMORY'
    ];

    for (const pragma of optimizations) {
      try {
        await database.db.run(pragma);
      } catch (error) {
        console.log('Optimization skipped:', pragma, error);
      }
    }

    // Run optimization at the end
    try {
      await database.db.run('PRAGMA optimize');
      console.log('Database optimizations applied successfully');
    } catch (error) {
      console.log('Final optimization skipped:', error);
    }
  }

  async createAgentSummaryTriggers(): Promise<void> {
    if (!database.db) throw new Error('Database not initialized');

    console.log('Creating agent summary triggers...');
    try {
      for (const query of AGENT_SUMMARY_TRIGGERS) {
        await database.db.run(query);
      }
      console.log('Agent summary triggers created successfully');
    } catch (error) {
      console.error('Error creating agent summary triggers:', error);
      throw error;
    }
  }

  async migrateExistingData(): Promise<void> {
    if (!database.db) throw new Error('Database not initialized');

    console.log('Running database migrations...');
    try {
      // Add new columns to existing tables if they don't exist
      const migrations = [
        { query: `ALTER TABLE users ADD COLUMN type TEXT DEFAULT 'free'`, column: 'type' },
        { query: `ALTER TABLE users ADD COLUMN tier TEXT DEFAULT 'free'`, column: 'tier' },
        { query: `ALTER TABLE users ADD COLUMN storage INTEGER DEFAULT 0`, column: 'storage' },
        { query: `ALTER TABLE users ADD COLUMN revenuecat_user_id TEXT`, column: 'revenuecat_user_id' },
        { query: `ALTER TABLE users ADD COLUMN selected_property_ids TEXT`, column: 'selected_property_ids' },
        { query: `ALTER TABLE users ADD COLUMN restricted_access INTEGER DEFAULT 0`, column: 'restricted_access' },
        { query: `ALTER TABLE properties ADD COLUMN is_restricted INTEGER DEFAULT 0`, column: 'is_restricted' },
        { query: `ALTER TABLE tenants ADD COLUMN is_restricted INTEGER DEFAULT 0`, column: 'is_restricted' },
        // NEW: Add archival flags
        { query: `ALTER TABLE monthly_transcripts ADD COLUMN is_archived INTEGER DEFAULT 0`, column: 'is_archived' },
        { query: `ALTER TABLE rent_record_sheets ADD COLUMN is_archived INTEGER DEFAULT 0`, column: 'is_archived' }
      ];

      for (const migration of migrations) {
        try {
          await database.db.run(migration.query);
        } catch (error) {
          // Column might already exist, ignore error
          console.log(`Migration skipped (${migration.column} exists)`);
        }
      }
      console.log('Database migrations completed successfully');
    } catch (error) {
      console.error('Migration error:', error);
    }
  }

  // NEW: Setup automatic maintenance (FIXED - no infinite loops)
  setupMaintenanceSchedule(): void {
    if (this.maintenanceScheduled) {
      console.log('Maintenance schedule already setup, skipping...');
      return;
    }

    const maintenance = new DatabaseMaintenance();
    
    // Clean stale cache every 6 hours (but only if needed)
    const cacheCleanupInterval = setInterval(async () => {
      try {
        await maintenance.cleanupStaleCache();
      } catch (error) {
        console.error('Stale cache cleanup failed:', error);
      }
    }, 6 * 60 * 60 * 1000); // 6 hours

    // Full cleanup check every 24 hours (but only run if needed)
    const fullCleanupInterval = setInterval(async () => {
      try {
        await maintenance.cleanupOldData();
      } catch (error) {
        console.error('Full cleanup failed:', error);
      }
    }, 24 * 60 * 60 * 1000); // 24 hours

    // Store intervals for potential cleanup later
    (globalThis as any).__maintenanceIntervals = {
      cacheCleanupInterval,
      fullCleanupInterval
    };

    this.maintenanceScheduled = true;
    console.log('Database maintenance schedule setup completed');
  }

  // NEW: Cleanup maintenance intervals
  clearMaintenanceSchedule(): void {
    const intervals = (globalThis as any).__maintenanceIntervals;
    if (intervals) {
      clearInterval(intervals.cacheCleanupInterval);
      clearInterval(intervals.fullCleanupInterval);
      delete (globalThis as any).__maintenanceIntervals;
      this.maintenanceScheduled = false;
      console.log('Maintenance schedule cleared');
    }
  }

  // NEW: Lightweight initialization for faster app startup
  async quickInitialize(): Promise<void> {
    console.log('Starting quick database initialization...');
    
    // Only run essential setup
    await this.initializeOptimizations();
    await this.createTables();
    
    // Skip heavy operations on startup
    console.log('Quick database initialization completed');
    
    // Schedule the heavy operations for later
    setTimeout(async () => {
      try {
        console.log('Running deferred initialization...');
        await this.createIndexes();
        await this.createAgentSummaryTriggers();
        await this.migrateExistingData();
        this.setupMaintenanceSchedule();
        console.log('Deferred initialization completed');
      } catch (error) {
        console.error('Deferred initialization failed:', error);
      }
    }, 2000); // Run after 2 seconds
  }

  // NEW: Full initialization (use this for production)
  async initializeDatabase(): Promise<void> {
    console.log('Starting full database initialization...');
    
    try {
      await this.initializeOptimizations();
      await this.createTables();
      await this.createIndexes();
      await this.createAgentSummaryTriggers();
      await this.migrateExistingData();
      this.setupMaintenanceSchedule();
      
      console.log('Database initialization completed successfully');
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  }

  // NEW: Check if database needs initialization
//   async needsInitialization(): Promise<boolean> {
//     if (!database.db) return true;
    
//     try {
//       // Check if core tables exist
//       const result = await database.db.get(`
//         SELECT COUNT(*) as count 
//         FROM sqlite_master 
//         WHERE type='table' AND name IN ('users', 'properties', 'tenants', 'invoices')
//       `);
      
//       return result.count < 4; // If less than 4 core tables exist
//     } catch (error) {
//       return true; // Assume needs initialization if check fails
//     }
//   }

  // NEW: Health check for database
  

  // NEW: Force stop all maintenance (emergency cleanup)
  emergencyStop(): void {
    this.clearMaintenanceSchedule();
    console.log('Emergency stop executed - all maintenance stopped');
  }
}

export const tables = new Tables();
export const maintenance = new DatabaseMaintenance();

// Export utility functions for external use
export const DatabaseUtils = {
  // Quick check if app startup can be fast
//   async canUseFastStartup(): Promise<boolean> {
//     return !(await tables.needsInitialization());
//   },
  
  // Get database health status
//   async getHealthStatus() {
//     return await tables.healthCheck();
//   },
  
  // Force immediate maintenance
  async runMaintenance() {
    await maintenance.forceCleanup();
  },
  
  // Emergency stop all operations
  emergencyStop() {
    tables.emergencyStop();
  }
};