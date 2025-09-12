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
  
  // Automatic cleanup for old data (run monthly/quarterly)
  async cleanupOldData(): Promise<void> {
    const retentionMonths = 18; // Keep 1.5 years of data
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths);
    const cutoffMonth = cutoffDate.toISOString().slice(0, 7); // YYYY-MM format

    const cleanupQueries = [
      // Archive old invoices (older than 18 months)
      `DELETE FROM invoices WHERE billing_month < '${cutoffMonth}'`,
      
      // Clean old payment records
      `DELETE FROM payments WHERE payment_date < '${cutoffDate.toISOString().split('T')[0]}'`,
      
      // Archive old business expenses
      `DELETE FROM business_expenses WHERE month < '${cutoffMonth}'`,
      
      // Clean stale cache entries
      `DELETE FROM monthly_business_summaries WHERE month < '${cutoffMonth}' AND is_stale = 1`,
      
      // Archive old KPI history (keep last 2 years for trends)
      `DELETE FROM agent_kpi_history WHERE month < '${cutoffMonth}'`,
      
      // Clean old rent record sheets
      `DELETE FROM rent_record_sheets WHERE billing_month < '${cutoffMonth}'`,
      
      // Remove orphaned transcript items
      `DELETE FROM transcript_items WHERE transcript_id NOT IN (SELECT id FROM monthly_transcripts)`
    ];

    for (const query of cleanupQueries) {
      try {
        await database.db!.run(query);
        console.log('Cleanup completed for:', query.substring(0, 50) + '...');
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    }

    // Vacuum database after cleanup to reclaim space
    await database.db!.run('VACUUM');
    await database.db!.run('ANALYZE');
    console.log('Database maintenance completed');
  }

  // Clean stale cache entries (run daily/weekly)
  async cleanupStaleCache(): Promise<void> {
    const staleCutoff = new Date();
    staleCutoff.setHours(staleCutoff.getHours() - 24); // 24 hours old

    await database.db!.run(`
        DELETE FROM monthly_business_summaries 
        WHERE is_stale = 1 
        AND last_calculated < ?
        `, [staleCutoff.toISOString()]);
    
    console.log('Stale cache cleanup completed');
  }
}

export class Tables {

    async createTables(): Promise<void> {
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
            tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'low', 'business', 'pro', 'enterprise')),
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
            transcript_id INTEGER NOT NULL,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('rent', 'water', 'power', 'deductible', 'expense', 'custom')),
            category TEXT,
            is_deductible INTEGER DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (transcript_id) REFERENCES monthly_transcripts(id) ON DELETE CASCADE
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
    
        for (const query of queries) {
          await database.db!.run(query);
        }
      }
    
      async createIndexes(): Promise<void> {
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
    
        for (const index of indexes) {
          try {
            await database.db!.run(index);
          } catch (error) {
            // Index might already exist, continue
            console.log('Index creation skipped:', error);
          }
        }
      }

      // NEW: Initialize database optimizations
      async initializeOptimizations(): Promise<void> {
        if (!database.db) throw new Error('Database not initialized');

        const optimizations = [
          // WAL mode for better concurrency
          'PRAGMA journal_mode = WAL',
          
          // Optimize for performance over safety
          'PRAGMA synchronous = NORMAL',
          
          // Increase cache size (64MB cache)
          'PRAGMA cache_size = -64000',
          
          // Enable query optimization
          'PRAGMA optimize',
          
          // Set auto-vacuum for space reclamation
          'PRAGMA auto_vacuum = INCREMENTAL',
          
          // Optimize page size
          'PRAGMA page_size = 4096'
        ];

        for (const pragma of optimizations) {
          try {
            await database.db.run(pragma);
          } catch (error) {
            console.log('Optimization skipped:', error);
          }
        }

        console.log('Database optimizations applied');
      }
    
      async createAgentSummaryTriggers(): Promise<void> {
        if (!database.db) throw new Error('Database not initialized');
    
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
        try {
          // Add new columns to existing tables if they don't exist
          const migrations = [
            `ALTER TABLE users ADD COLUMN type TEXT DEFAULT 'free'`,
            `ALTER TABLE users ADD COLUMN tier TEXT DEFAULT 'free'`,
            `ALTER TABLE users ADD COLUMN storage INTEGER DEFAULT 0`,
            `ALTER TABLE users ADD COLUMN revenuecat_user_id TEXT`,
            `ALTER TABLE users ADD COLUMN selected_property_ids TEXT`,
            `ALTER TABLE users ADD COLUMN restricted_access INTEGER DEFAULT 0`,
            `ALTER TABLE properties ADD COLUMN is_restricted INTEGER DEFAULT 0`,
            `ALTER TABLE tenants ADD COLUMN is_restricted INTEGER DEFAULT 0`,
            // NEW: Add archival flags
            `ALTER TABLE monthly_transcripts ADD COLUMN is_archived INTEGER DEFAULT 0`,
            `ALTER TABLE rent_record_sheets ADD COLUMN is_archived INTEGER DEFAULT 0`
          ];
    
          for (const migration of migrations) {
            try {
              await database.db!.run(migration);
            } catch (error) {
              // Column might already exist, ignore error
              console.log('Migration skipped (column exists):', migration);
            }
          }
        } catch (error) {
          console.error('Migration error:', error);
        }
      }

      // NEW: Setup automatic maintenance
      setupMaintenanceSchedule(): void {
        const maintenance = new DatabaseMaintenance();
        
        // Clean stale cache every 6 hours
        setInterval(async () => {
          try {
            await maintenance.cleanupStaleCache();
          } catch (error) {
            console.error('Stale cache cleanup failed:', error);
          }
        }, 6 * 60 * 60 * 1000); // 6 hours

        // Full cleanup monthly (you can adjust this)
        setInterval(async () => {
          try {
            await maintenance.cleanupOldData();
          } catch (error) {
            console.error('Monthly cleanup failed:', error);
          }
        }, 30 * 24 * 60 * 60 * 1000); // 30 days

        console.log('Database maintenance schedule setup completed');
      }

      // NEW: Initialize everything with optimizations
      async initializeDatabase(): Promise<void> {
        await this.createTables();
        await this.createIndexes();
        await this.createAgentSummaryTriggers();
        await this.migrateExistingData();
        await this.initializeOptimizations();
        this.setupMaintenanceSchedule();
        
        console.log('Database initialization with optimizations completed');
      }
}

export const tables = new Tables();
export const maintenance = new DatabaseMaintenance();