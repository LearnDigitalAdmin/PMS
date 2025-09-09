// ReportsDatabase.tsx - Professional Transcripts and Rent Record Sheets Manager
//import { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { database, type Property } from './Database';

// ==================== TYPE INTERFACES ====================

export interface TranscriptItem {
  id: number;
  transcriptId: number;
  description: string;
  amount: number;
  type: 'rent' | 'water' | 'power' | 'deductible' | 'expense' | 'custom';
  category?: string;
  isDeductible: boolean; // If true, reduces landlord payment
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyTranscript {
  id: number;
  propertyId: number;
  billingMonth: string; // YYYY-MM format
  landlordName: string;
  landlordContact?: string;
  agentCommissionRate: number;
  grossRentCollected: number;
  totalWaterCharges: number;
  totalPowerCharges: number;
  totalOtherCharges: number;
  totalDeductibles: number; // Agent expenses, maintenance, etc.
  agentCommission: number;
  netAmountToLandlord: number;
  status: 'draft' | 'finalized' | 'sent' | 'acknowledged';
  notes?: string;
  generatedBy: number; // User ID of agent/PMC
  sentDate?: string;
  acknowledgedDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RentRecordSheet {
  id: number;
  propertyId: number;
  billingMonth: string; // YYYY-MM format
  totalUnits: number;
  occupiedUnits: number;
  totalRentExpected: number;
  totalRentCollected: number;
  totalArrears: number;
  collectionRate: number; // Percentage
  status: 'current' | 'archived';
  generatedBy: number; // User ID
  createdAt: string;
  updatedAt: string;
}

export interface RentRecordEntry {
  id: number;
  recordSheetId: number;
  tenantId: number;
  tenantName: string;
  unitNumber: string;
  rentAmount: number;
  waterCharges: number;
  powerCharges: number;
  otherCharges: number;
  totalDue: number;
  amountPaid: number;
  balance: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid' | 'overpaid';
  paymentDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Input interfaces
export interface TranscriptItemInput {
  transcriptId: number;
  description: string;
  amount: number;
  type: 'rent' | 'water' | 'power' | 'deductible' | 'custom';
  category?: string;
  isDeductible: boolean;
  sortOrder?: number;
}

export interface MonthlyTranscriptInput {
  propertyId: number;
  billingMonth: string;
  landlordName: string;
  landlordContact?: string;
  notes?: string;
  customItems?: TranscriptItemInput[];
}

// Extended interfaces with related data| 'expense' 
export interface TranscriptWithDetails extends MonthlyTranscript {
  property: Property;
  items: TranscriptItem[];
  tenantSummary: {
    totalTenants: number;
    activeTenants: number;
    paidInvoices: number;
    unpaidInvoices: number;
  };
}

export interface RentRecordWithDetails extends RentRecordSheet {
  property: Property;
  entries: RentRecordEntry[];
  summary: {
    onTimePayments: number;
    latePayments: number;
    defaulters: number;
    averageCollectionDays: number;
  };
}

// Report generation options
export interface ReportGenerationOptions {
  includeTenantDetails: boolean;
  includePaymentHistory: boolean;
  includeArrearsBreakdown: boolean;
  customBranding?: {
    companyName: string;
    logo?: string;
    contactInfo: string;
  };
  reportPeriod?: {
    startMonth: string;
    endMonth: string;
  };
}

// ==================== REPORTS DATABASE MANAGER ====================

export class ReportsDatabase {
  // private db: SQLiteDBConnection | null = null;

  // constructor(dbConnection: SQLiteDBConnection) {
  //   this.db = dbConnection;
  // }

  // ==================== INITIALIZATION ====================

  // async initializeReportsTables(): Promise<void> {
  //   const queries = [
  //     // Monthly Transcripts table
  //     `CREATE TABLE IF NOT EXISTS monthly_transcripts (
  //       id INTEGER PRIMARY KEY AUTOINCREMENT,
  //       property_id INTEGER NOT NULL,
  //       billing_month TEXT NOT NULL,
  //       landlord_name TEXT NOT NULL,
  //       landlord_contact TEXT,
  //       agent_commission_rate REAL NOT NULL,
  //       gross_rent_collected REAL NOT NULL DEFAULT 0,
  //       total_water_charges REAL NOT NULL DEFAULT 0,
  //       total_power_charges REAL NOT NULL DEFAULT 0,
  //       total_other_charges REAL NOT NULL DEFAULT 0,
  //       total_deductibles REAL NOT NULL DEFAULT 0,
  //       agent_commission REAL NOT NULL DEFAULT 0,
  //       net_amount_to_landlord REAL NOT NULL DEFAULT 0,
  //       status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'sent', 'acknowledged')),
  //       notes TEXT,
  //       generated_by INTEGER NOT NULL,
  //       sent_date DATE,
  //       acknowledged_date DATE,
  //       created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  //       updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  //       FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  //       FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE CASCADE,
  //       UNIQUE(property_id, billing_month)
  //     )`,

  //     // Transcript Items table (for custom deductibles and expenses)
  //     `CREATE TABLE IF NOT EXISTS transcript_items (
  //       id INTEGER PRIMARY KEY AUTOINCREMENT,
  //       transcript_id INTEGER NOT NULL,
  //       description TEXT NOT NULL,
  //       amount REAL NOT NULL,
  //       type TEXT NOT NULL CHECK (type IN ('rent', 'water', 'power', 'deductible', 'expense', 'custom')),
  //       category TEXT,
  //       is_deductible INTEGER DEFAULT 0,
  //       sort_order INTEGER DEFAULT 0,
  //       created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  //       updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  //       FOREIGN KEY (transcript_id) REFERENCES monthly_transcripts(id) ON DELETE CASCADE
  //     )`,

  //     // Rent Record Sheets table
  //     `CREATE TABLE IF NOT EXISTS rent_record_sheets (
  //       id INTEGER PRIMARY KEY AUTOINCREMENT,
  //       property_id INTEGER NOT NULL,
  //       billing_month TEXT NOT NULL,
  //       total_units INTEGER NOT NULL DEFAULT 0,
  //       occupied_units INTEGER NOT NULL DEFAULT 0,
  //       total_rent_expected REAL NOT NULL DEFAULT 0,
  //       total_rent_collected REAL NOT NULL DEFAULT 0,
  //       total_arrears REAL NOT NULL DEFAULT 0,
  //       collection_rate REAL NOT NULL DEFAULT 0,
  //       status TEXT DEFAULT 'current' CHECK (status IN ('current', 'archived')),
  //       generated_by INTEGER NOT NULL,
  //       created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  //       updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  //       FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  //       FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE CASCADE,
  //       UNIQUE(property_id, billing_month)
  //     )`,

  //     // Rent Record Entries table (individual tenant records)
  //     `CREATE TABLE IF NOT EXISTS rent_record_entries (
  //       id INTEGER PRIMARY KEY AUTOINCREMENT,
  //       record_sheet_id INTEGER NOT NULL,
  //       tenant_id INTEGER NOT NULL,
  //       tenant_name TEXT NOT NULL,
  //       unit_number TEXT NOT NULL,
  //       rent_amount REAL NOT NULL,
  //       water_charges REAL NOT NULL DEFAULT 0,
  //       power_charges REAL NOT NULL DEFAULT 0,
  //       other_charges REAL NOT NULL DEFAULT 0,
  //       total_due REAL NOT NULL,
  //       amount_paid REAL NOT NULL DEFAULT 0,
  //       balance REAL NOT NULL DEFAULT 0,
  //       payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('paid', 'partial', 'unpaid', 'overpaid')),
  //       payment_date DATE,
  //       notes TEXT,
  //       created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  //       updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  //       FOREIGN KEY (record_sheet_id) REFERENCES rent_record_sheets(id) ON DELETE CASCADE,
  //       FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  //     )`
  //   ];

  //   for (const query of queries) {
  //     await this.db!.run(query);
  //   }

  //   await this.createReportsIndexes();
  // }

  // private async createReportsIndexes(): Promise<void> {
  //   const indexes = [
  //     'CREATE INDEX IF NOT EXISTS idx_transcripts_property_month ON monthly_transcripts(property_id, billing_month)',
  //     'CREATE INDEX IF NOT EXISTS idx_transcripts_status ON monthly_transcripts(status)',
  //     'CREATE INDEX IF NOT EXISTS idx_transcripts_generated_by ON monthly_transcripts(generated_by)',
  //     'CREATE INDEX IF NOT EXISTS idx_transcript_items_transcript_id ON transcript_items(transcript_id)',
  //     'CREATE INDEX IF NOT EXISTS idx_transcript_items_type ON transcript_items(type)',
  //     'CREATE INDEX IF NOT EXISTS idx_record_sheets_property_month ON rent_record_sheets(property_id, billing_month)',
  //     'CREATE INDEX IF NOT EXISTS idx_record_sheets_status ON rent_record_sheets(status)',
  //     'CREATE INDEX IF NOT EXISTS idx_record_entries_sheet_id ON rent_record_entries(record_sheet_id)',
  //     'CREATE INDEX IF NOT EXISTS idx_record_entries_tenant_id ON rent_record_entries(tenant_id)',
  //     'CREATE INDEX IF NOT EXISTS idx_record_entries_payment_status ON rent_record_entries(payment_status)'
  //   ];

  //   for (const index of indexes) {
  //     await this.db!.run(index);
  //   }
  // }

  // ==================== MONTHLY TRANSCRIPT OPERATIONS ====================

  async generateMonthlyTranscript(input: MonthlyTranscriptInput, userId: number): Promise<TranscriptWithDetails> {
    try {
      // Get property and validate access
      const property = await database.getPropertyById(input.propertyId);
      if (!property) {
        throw new Error('Property not found');
      }

      if (property.isRestricted) {
        throw new Error('Cannot generate transcript for restricted property');
      }

      // Get all invoices for the billing month
      const invoices = await database.getInvoices({
        propertyId: input.propertyId,
        billingMonth: input.billingMonth
      });

      // Calculate totals from invoices
      const grossRentCollected = invoices
        .filter(inv => inv.isPaid)
        .reduce((sum, inv) => sum + inv.rentAmount, 0);

      const totalWaterCharges = invoices
        .filter(inv => inv.isPaid)
        .reduce((sum, inv) => {
          const waterAmount = (inv.waterCurrentReading - inv.waterPreviousReading) * 
            inv.waterUnitPrice + inv.waterStandingFee;
          return sum + waterAmount;
        }, 0);

      const totalPowerCharges = invoices
        .filter(inv => inv.isPaid)
        .reduce((sum, inv) => {
          const powerAmount = (inv.powerCurrentReading - inv.powerPreviousReading) * 
            inv.powerUnitPrice;
          return sum + powerAmount;
        }, 0);

      const totalOtherCharges = invoices
        .filter(inv => inv.isPaid)
        .reduce((sum, inv) => sum + inv.otherCharges, 0);

      const agentCommission = grossRentCollected * (property.agentCommissionRate / 100);
      let totalDeductibles = 0;
      let netAmountToLandlord = grossRentCollected + totalWaterCharges + totalPowerCharges + 
        totalOtherCharges - agentCommission;

      // Create transcript record
      const transcriptQuery = `
        INSERT INTO monthly_transcripts (
          property_id, billing_month, landlord_name, landlord_contact,
          agent_commission_rate, gross_rent_collected, total_water_charges,
          total_power_charges, total_other_charges, total_deductibles,
          agent_commission, net_amount_to_landlord, notes, generated_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const result = await database.db!.run(transcriptQuery, [
        input.propertyId,
        input.billingMonth,
        input.landlordName,
        input.landlordContact || '',
        property.agentCommissionRate,
        grossRentCollected,
        totalWaterCharges,
        totalPowerCharges,
        totalOtherCharges,
        totalDeductibles,
        agentCommission,
        netAmountToLandlord,
        input.notes || '',
        userId
      ]);

      const transcriptId = result.changes!.lastId!;

      // Add auto-generated items (rent, water, power, other, commission)
      const autoItems = [
        {
          description: 'Rent Collected',
          amount: grossRentCollected,
          type: 'rent' as const,
          isDeductible: false,
          sortOrder: 1
        },
        {
          description: 'Water Charges',
          amount: totalWaterCharges,
          type: 'water' as const,
          isDeductible: false,
          sortOrder: 2
        },
        {
          description: 'Power Charges',
          amount: totalPowerCharges,
          type: 'power' as const,
          isDeductible: false,
          sortOrder: 3
        },
        {
          description: 'Other Charges',
          amount: totalOtherCharges,
          type: 'custom' as const,
          isDeductible: false,
          sortOrder: 4
        },
        {
          description: `Agent Commission (${property.agentCommissionRate}%)`,
          amount: agentCommission,
          type: 'deductible' as const,
          isDeductible: true,
          sortOrder: 5
        }
      ];

      // Add custom items if provided
      let sortOrder = 6;
      if (input.customItems) {
        for (const item of input.customItems) {
          autoItems.push({
            description: item.description,
            amount: item.amount,
            type: item.type,
            isDeductible: item.isDeductible,
            sortOrder: item.sortOrder || sortOrder++
          });
        }
      }

      // Insert all items
      for (const item of autoItems) {
        await this.addTranscriptItem({
          transcriptId,
          description: item.description,
          amount: item.amount,
          type: item.type,
          isDeductible: item.isDeductible,
          sortOrder: item.sortOrder
        });
      }

      // Recalculate totals including custom deductibles
      await this.recalculateTranscriptTotals(transcriptId);

      // Return full transcript with details
      return await this.getTranscriptWithDetails(transcriptId);
    } catch (error) {
      console.error('Error generating monthly transcript:', error);
      throw error;
    }
  }

  async addTranscriptItem(item: TranscriptItemInput): Promise<TranscriptItem> {
    const query = `
      INSERT INTO transcript_items (
        transcript_id, description, amount, type, category, 
        is_deductible, sort_order
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await database.db!.run(query, [
      item.transcriptId,
      item.description,
      item.amount,
      item.type,
      item.category || '',
      item.isDeductible ? 1 : 0,
      item.sortOrder || 0
    ]);

    // Recalculate transcript totals
    await this.recalculateTranscriptTotals(item.transcriptId);

    return await this.getTranscriptItemById(result.changes!.lastId!);
  }

  private async recalculateTranscriptTotals(transcriptId: number): Promise<void> {
    // Get all items for this transcript
    const itemsQuery = `SELECT * FROM transcript_items WHERE transcript_id = ?`;
    const result = await database.db!.query(itemsQuery, [transcriptId]);
    const items = result.values || [];

    let totalDeductibles = 0;
    let grossIncome = 0;

    for (const item of items) {
      if (item.is_deductible) {
        totalDeductibles += item.amount;
      } else {
        grossIncome += item.amount;
      }
    }

    const netAmountToLandlord = grossIncome - totalDeductibles;

    // Update transcript totals
    const updateQuery = `
      UPDATE monthly_transcripts 
      SET total_deductibles = ?, net_amount_to_landlord = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    await database.db!.run(updateQuery, [totalDeductibles, netAmountToLandlord, transcriptId]);
  }

  async getTranscriptWithDetails(transcriptId: number): Promise<TranscriptWithDetails> {
    const transcript = await this.getTranscriptById(transcriptId);
    if (!transcript) {
      throw new Error('Transcript not found');
    }

    const property = await database.getPropertyById(transcript.propertyId);
    if (!property) {
      throw new Error('Property not found');
    }

    const items = await this.getTranscriptItems(transcriptId);
    
    // Get tenant summary for the billing month
    const invoices = await database.getInvoices({
      propertyId: transcript.propertyId,
      billingMonth: transcript.billingMonth
    });

    const tenantSummary = {
      totalTenants: invoices.length,
      activeTenants: invoices.filter(inv => inv.isPaid || inv.amountPaid > 0).length,
      paidInvoices: invoices.filter(inv => inv.isPaid).length,
      unpaidInvoices: invoices.filter(inv => !inv.isPaid).length
    };

    return {
      ...transcript,
      property,
      items,
      tenantSummary
    };
  }

  async finalizeTranscript(transcriptId: number): Promise<void> {
    const query = `
      UPDATE monthly_transcripts 
      SET status = 'finalized', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'draft'
    `;
    await database.db!.run(query, [transcriptId]);
  }

  async markTranscriptSent(transcriptId: number): Promise<void> {
    const query = `
      UPDATE monthly_transcripts 
      SET status = 'sent', sent_date = CURRENT_DATE, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'finalized'
    `;
    await database.db!.run(query, [transcriptId]);
  }

  // ==================== RENT RECORD SHEET OPERATIONS ====================

  async generateRentRecordSheet(propertyId: number, billingMonth: string, userId: number): Promise<RentRecordWithDetails> {
    try {
      // Get property and validate access
      const property = await database.getPropertyById(propertyId);
      if (!property) {
        throw new Error('Property not found');
      }

      if (property.isRestricted) {
        throw new Error('Cannot generate record sheet for restricted property');
      }

      // Get all tenants for this property
      const tenants = await database.getTenantsByProperty(propertyId);
      
      // Get all invoices for the billing month
      const invoices = await database.getInvoices({
        propertyId,
        billingMonth
      });

      // Calculate sheet totals
      let totalRentExpected = 0;
      let totalRentCollected = 0;
      let totalArrears = 0;
      const occupiedUnits = tenants.filter(t => t.isActive).length;

      for (const tenant of tenants) {
        const invoice = invoices.find(inv => inv.tenantId === tenant.id);
        if (invoice) {
          totalRentExpected += invoice.totalAmount;
          totalRentCollected += invoice.amountPaid;
          totalArrears += invoice.arrears;
        }
      }

      const collectionRate = totalRentExpected > 0 ? 
        (totalRentCollected / totalRentExpected) * 100 : 0;

      // Create record sheet
      const sheetQuery = `
        INSERT INTO rent_record_sheets (
          property_id, billing_month, total_units, occupied_units,
          total_rent_expected, total_rent_collected, total_arrears,
          collection_rate, generated_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const result = await database.db!.run(sheetQuery, [
        propertyId,
        billingMonth,
        property.maxUnits,
        occupiedUnits,
        totalRentExpected,
        totalRentCollected,
        totalArrears,
        collectionRate,
        userId
      ]);

      const recordSheetId = result.changes!.lastId!;

      // Create entries for each tenant
      for (const tenant of tenants) {
        const invoice = invoices.find(inv => inv.tenantId === tenant.id);
        
        let waterCharges = 0;
        let powerCharges = 0;
        let totalDue = tenant.rentAmount;
        let amountPaid = 0;
        let paymentStatus: 'paid' | 'partial' | 'unpaid' | 'overpaid' = 'unpaid';
        let paymentDate: string | undefined;

        if (invoice) {
          waterCharges = (invoice.waterCurrentReading - invoice.waterPreviousReading) * 
            invoice.waterUnitPrice + invoice.waterStandingFee;
          powerCharges = (invoice.powerCurrentReading - invoice.powerPreviousReading) * 
            invoice.powerUnitPrice;
          totalDue = invoice.totalAmount;
          amountPaid = invoice.amountPaid;
          paymentDate = invoice.paidDate || undefined;

          if (invoice.isPaid) {
            paymentStatus = 'paid';
          } else if (amountPaid > 0) {
            paymentStatus = amountPaid > totalDue ? 'overpaid' : 'partial';
          }
        }

        const balance = totalDue - amountPaid;

        await this.addRentRecordEntry({
          recordSheetId,
          tenantId: tenant.id,
          tenantName: tenant.name,
          unitNumber: tenant.unitNumber || '',
          rentAmount: tenant.rentAmount,
          waterCharges,
          powerCharges,
          otherCharges: invoice?.otherCharges || 0,
          totalDue,
          amountPaid,
          balance,
          paymentStatus,
          paymentDate
        });
      }

      return await this.getRentRecordWithDetails(recordSheetId);
    } catch (error) {
      console.error('Error generating rent record sheet:', error);
      throw error;
    }
  }

  private async addRentRecordEntry(entry: {
    recordSheetId: number;
    tenantId: number;
    tenantName: string;
    unitNumber: string;
    rentAmount: number;
    waterCharges: number;
    powerCharges: number;
    otherCharges: number;
    totalDue: number;
    amountPaid: number;
    balance: number;
    paymentStatus: 'paid' | 'partial' | 'unpaid' | 'overpaid';
    paymentDate?: string;
    notes?: string;
  }): Promise<void> {
    const query = `
      INSERT INTO rent_record_entries (
        record_sheet_id, tenant_id, tenant_name, unit_number,
        rent_amount, water_charges, power_charges, other_charges,
        total_due, amount_paid, balance, payment_status, payment_date, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await database.db!.run(query, [
      entry.recordSheetId,
      entry.tenantId,
      entry.tenantName,
      entry.unitNumber,
      entry.rentAmount,
      entry.waterCharges,
      entry.powerCharges,
      entry.otherCharges,
      entry.totalDue,
      entry.amountPaid,
      entry.balance,
      entry.paymentStatus,
      entry.paymentDate || null,
      entry.notes || ''
    ]);
  }

  async getRentRecordWithDetails(recordSheetId: number): Promise<RentRecordWithDetails> {
    const recordSheet = await this.getRentRecordById(recordSheetId);
    if (!recordSheet) {
      throw new Error('Rent record sheet not found');
    }

    const property = await database.getPropertyById(recordSheet.propertyId);
    if (!property) {
      throw new Error('Property not found');
    }

    const entries = await this.getRentRecordEntries(recordSheetId);

    // Calculate summary statistics
    const onTimePayments = entries.filter(e => e.paymentStatus === 'paid' && 
      e.paymentDate && new Date(e.paymentDate) <= new Date(`${recordSheet.billingMonth}-05`)).length;
    const latePayments = entries.filter(e => e.paymentStatus === 'paid' && 
      e.paymentDate && new Date(e.paymentDate) > new Date(`${recordSheet.billingMonth}-05`)).length;
    const defaulters = entries.filter(e => e.paymentStatus === 'unpaid').length;

    // Calculate average collection days (simplified)
    let totalDays = 0;
    let paidCount = 0;
    for (const entry of entries) {
      if (entry.paymentStatus === 'paid' && entry.paymentDate) {
        const paymentDate = new Date(entry.paymentDate);
        const monthStart = new Date(`${recordSheet.billingMonth}-01`);
        const days = Math.ceil((paymentDate.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24));
        totalDays += days;
        paidCount++;
      }
    }

    const averageCollectionDays = paidCount > 0 ? Math.round(totalDays / paidCount) : 0;

    return {
      ...recordSheet,
      property,
      entries,
      summary: {
        onTimePayments,
        latePayments,
        defaulters,
        averageCollectionDays
      }
    };
  }

  // ==================== QUERY METHODS ====================

  async getTranscriptsByProperty(propertyId: number, limit: number = 12): Promise<MonthlyTranscript[]> {
    const query = `
      SELECT * FROM monthly_transcripts 
      WHERE property_id = ? 
      ORDER BY billing_month DESC 
      LIMIT ?
    `;
    const result = await database.db!.query(query, [propertyId, limit]);
    return this.mapToTranscripts(result.values || []);
  }

  async getTranscriptsByUser(userId: number, limit: number = 50): Promise<MonthlyTranscript[]> {
    const query = `
      SELECT mt.* FROM monthly_transcripts mt
      JOIN properties p ON mt.property_id = p.id
      WHERE p.user_id = ? AND p.is_restricted = 0
      ORDER BY mt.billing_month DESC 
      LIMIT ?
    `;
    const result = await database.db!.query(query, [userId, limit]);
    return this.mapToTranscripts(result.values || []);
  }

  async getRentRecordsByProperty(propertyId: number, limit: number = 12): Promise<RentRecordSheet[]> {
    const query = `
      SELECT * FROM rent_record_sheets 
      WHERE property_id = ? 
      ORDER BY billing_month DESC 
      LIMIT ?
    `;
    const result = await database.db!.query(query, [propertyId, limit]);
    return this.mapToRentRecords(result.values || []);
  }

  // ==================== PRIVATE QUERY METHODS ====================

  private async getTranscriptById(id: number): Promise<MonthlyTranscript | null> {
    const query = 'SELECT * FROM monthly_transcripts WHERE id = ?';
    const result = await database.db!.query(query, [id]);
    
    if (result.values && result.values.length > 0) {
      return this.mapToTranscript(result.values[0]);
    }
    return null;
  }

  private async getTranscriptItems(transcriptId: number): Promise<TranscriptItem[]> {
    const query = `
      SELECT * FROM transcript_items 
      WHERE transcript_id = ? 
      ORDER BY sort_order ASC
    `;
    const result = await database.db!.query(query, [transcriptId]);
    return this.mapToTranscriptItems(result.values || []);
  }

  private async getTranscriptItemById(id: number): Promise<TranscriptItem> {
    const query = 'SELECT * FROM transcript_items WHERE id = ?';
    const result = await database.db!.query(query, [id]);
    
    if (result.values && result.values.length > 0) {
      return this.mapToTranscriptItem(result.values[0]);
    }
    throw new Error('Transcript item not found');
  }

  private async getRentRecordById(id: number): Promise<RentRecordSheet | null> {
    const query = 'SELECT * FROM rent_record_sheets WHERE id = ?';
    const result = await database.db!.query(query, [id]);
    
    if (result.values && result.values.length > 0) {
      return this.mapToRentRecord(result.values[0]);
    }
    return null;
  }

  private async getRentRecordEntries(recordSheetId: number): Promise<RentRecordEntry[]> {
    const query = `
      SELECT * FROM rent_record_entries 
      WHERE record_sheet_id = ? 
      ORDER BY unit_number ASC
    `;
    const result = await database.db!.query(query, [recordSheetId]);
    return this.mapToRentRecordEntries(result.values || []);
  }

  // ==================== UPDATE OPERATIONS ====================

  async updateTranscriptItem(id: number, updates: Partial<TranscriptItemInput>): Promise<void> {
    const fields = [];
    const values = [];

    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.amount !== undefined) {
      fields.push('amount = ?');
      values.push(updates.amount);
    }
    if (updates.type !== undefined) {
      fields.push('type = ?');
      values.push(updates.type);
    }
    if (updates.category !== undefined) {
      fields.push('category = ?');
      values.push(updates.category);
    }
    if (updates.isDeductible !== undefined) {
      fields.push('is_deductible = ?');
      values.push(updates.isDeductible ? 1 : 0);
    }
    if (updates.sortOrder !== undefined) {
      fields.push('sort_order = ?');
      values.push(updates.sortOrder);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const query = `UPDATE transcript_items SET ${fields.join(', ')} WHERE id = ?`;
    await database.db!.run(query, values);

    // Get transcript ID and recalculate totals
    const itemQuery = 'SELECT transcript_id FROM transcript_items WHERE id = ?';
    const itemResult = await database.db!.query(itemQuery, [id]);
    if (itemResult.values && itemResult.values.length > 0) {
      await this.recalculateTranscriptTotals(itemResult.values[0].transcript_id);
    }
  }

  async deleteTranscriptItem(id: number): Promise<void> {
    // Get transcript ID before deleting
    const itemQuery = 'SELECT transcript_id FROM transcript_items WHERE id = ?';
    const itemResult = await database.db!.query(itemQuery, [id]);
    
    if (itemResult.values && itemResult.values.length > 0) {
      const transcriptId = itemResult.values[0].transcript_id;
      
      await database.db!.run('DELETE FROM transcript_items WHERE id = ?', [id]);
      await this.recalculateTranscriptTotals(transcriptId);
    }
  }

  async updateTranscriptStatus(
    transcriptId: number,
    status: "draft" | "finalized" | "sent" | "acknowledged",
    transcriptNotes?: string,
    _notes?: string
    ): Promise<void> {
        let query = `UPDATE monthly_transcripts SET status = ?, updated_at = CURRENT_TIMESTAMP`;
        const values: ["draft" | "finalized" | "sent" | "acknowledged", ...string[]] = [status];

        if (status === "sent") {
            query += ", sent_date = CURRENT_DATE";
        } else if (status === "acknowledged") {
            query += ", acknowledged_date = CURRENT_DATE";
        }

        if (transcriptNotes !== undefined) {
            query += ", notes = ?";
            values.push(transcriptNotes);
        }

        query += " WHERE id = ?";
        values.push(transcriptId.toString());

        await database.db!.run(query, values);
    }

  async updateRentRecordEntry(entryId: number, updates: Partial<{
    amountPaid: number;
    paymentStatus: 'paid' | 'partial' | 'unpaid' | 'overpaid';
    paymentDate: string;
    notes: string;
  }>): Promise<void> {
    const fields = [];
    const values = [];

    if (updates.amountPaid !== undefined) {
      fields.push('amount_paid = ?');
      values.push(updates.amountPaid);
      
      // Recalculate balance
      const entryQuery = 'SELECT total_due FROM rent_record_entries WHERE id = ?';
      const entryResult = await database.db!.query(entryQuery, [entryId]);
      if (entryResult.values && entryResult.values.length > 0) {
        const totalDue = entryResult.values[0].total_due;
        const balance = totalDue - updates.amountPaid;
        fields.push('balance = ?');
        values.push(balance);
      }
    }

    if (updates.paymentStatus !== undefined) {
      fields.push('payment_status = ?');
      values.push(updates.paymentStatus);
    }
    if (updates.paymentDate !== undefined) {
      fields.push('payment_date = ?');
      values.push(updates.paymentDate);
    }
    if (updates.notes !== undefined) {
      fields.push('notes = ?');
      values.push(updates.notes);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(entryId);

    const query = `UPDATE rent_record_entries SET ${fields.join(', ')} WHERE id = ?`;
    await database.db!.run(query, values);

    // Recalculate record sheet totals
    await this.recalculateRecordSheetTotals(entryId);
  }

  private async recalculateRecordSheetTotals(entryId: number): Promise<void> {
    // Get record sheet ID
    const entryQuery = 'SELECT record_sheet_id FROM rent_record_entries WHERE id = ?';
    const entryResult = await database.db!.query(entryQuery, [entryId]);
    
    if (!entryResult.values || entryResult.values.length === 0) return;
    
    const recordSheetId = entryResult.values[0].record_sheet_id;

    // Recalculate totals from all entries
    const totalsQuery = `
      SELECT 
        SUM(total_due) as total_expected,
        SUM(amount_paid) as total_collected,
        SUM(balance) as total_arrears
      FROM rent_record_entries 
      WHERE record_sheet_id = ?
    `;
    const totalsResult = await database.db!.query(totalsQuery, [recordSheetId]);
    
    if (totalsResult.values && totalsResult.values.length > 0) {
      const totals = totalsResult.values[0];
      const collectionRate = totals.total_expected > 0 ? 
        (totals.total_collected / totals.total_expected) * 100 : 0;

      const updateQuery = `
        UPDATE rent_record_sheets 
        SET total_rent_expected = ?, total_rent_collected = ?, 
            total_arrears = ?, collection_rate = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      await database.db!.run(updateQuery, [
        totals.total_expected || 0,
        totals.total_collected || 0,
        totals.total_arrears || 0,
        collectionRate,
        recordSheetId
      ]);
    }
  }

  // ==================== DELETION OPERATIONS ====================

  async deleteTranscript(transcriptId: number): Promise<void> {
    // Check if transcript can be deleted (only drafts)
    const transcript = await this.getTranscriptById(transcriptId);
    if (!transcript) {
      throw new Error('Transcript not found');
    }

    if (transcript.status !== 'draft') {
      throw new Error('Only draft transcripts can be deleted');
    }

    await database.db!.run('DELETE FROM monthly_transcripts WHERE id = ?', [transcriptId]);
  }

  async archiveRentRecord(recordSheetId: number): Promise<void> {
    const query = `
      UPDATE rent_record_sheets 
      SET status = 'archived', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    await database.db!.run(query, [recordSheetId]);
  }

  // ==================== REPORTING & ANALYTICS ====================

  async getPropertyPerformanceReport(propertyId: number, startMonth: string, endMonth: string): Promise<{
    property: Property;
    monthlyData: Array<{
      month: string;
      rentCollected: number;
      collectionRate: number;
      totalTenants: number;
      paidTenants: number;
      agentCommission: number;
      netToLandlord: number;
    }>;
    summary: {
      totalPeriodRent: number;
      averageCollectionRate: number;
      totalCommissionEarned: number;
      totalRemittedToLandlord: number;
    };
  }> {
    const property = await database.getPropertyById(propertyId);
    if (!property) {
      throw new Error('Property not found');
    }

    const query = `
      SELECT 
        rrs.billing_month,
        rrs.total_rent_collected,
        rrs.collection_rate,
        rrs.occupied_units,
        COUNT(CASE WHEN rre.payment_status = 'paid' THEN 1 END) as paid_tenants,
        mt.agent_commission,
        mt.net_amount_to_landlord
      FROM rent_record_sheets rrs
      LEFT JOIN rent_record_entries rre ON rrs.id = rre.record_sheet_id
      LEFT JOIN monthly_transcripts mt ON rrs.property_id = mt.property_id AND rrs.billing_month = mt.billing_month
      WHERE rrs.property_id = ? AND rrs.billing_month BETWEEN ? AND ?
      GROUP BY rrs.billing_month
      ORDER BY rrs.billing_month ASC
    `;

    const result = await database.db!.query(query, [propertyId, startMonth, endMonth]);
    const monthlyData = (result.values || []).map(row => ({
      month: row.billing_month,
      rentCollected: row.total_rent_collected || 0,
      collectionRate: row.collection_rate || 0,
      totalTenants: row.occupied_units || 0,
      paidTenants: row.paid_tenants || 0,
      agentCommission: row.agent_commission || 0,
      netToLandlord: row.net_amount_to_landlord || 0
    }));

    // Calculate summary
    const totalPeriodRent = monthlyData.reduce((sum, month) => sum + month.rentCollected, 0);
    const averageCollectionRate = monthlyData.length > 0 ? 
      monthlyData.reduce((sum, month) => sum + month.collectionRate, 0) / monthlyData.length : 0;
    const totalCommissionEarned = monthlyData.reduce((sum, month) => sum + month.agentCommission, 0);
    const totalRemittedToLandlord = monthlyData.reduce((sum, month) => sum + month.netToLandlord, 0);

    return {
      property,
      monthlyData,
      summary: {
        totalPeriodRent,
        averageCollectionRate,
        totalCommissionEarned,
        totalRemittedToLandlord
      }
    };
  }

  async getAgentCommissionReport(userId: number, year: number): Promise<{
    totalCommission: number;
    monthlyBreakdown: Array<{
      month: string;
      commission: number;
      propertiesManaged: number;
      totalRentCollected: number;
      averageCommissionRate: number;
    }>;
    topPerformingProperties: Array<{
      propertyName: string;
      totalCommission: number;
      collectionRate: number;
    }>;
  }> {
    const monthlyQuery = `
      SELECT 
        mt.billing_month,
        SUM(mt.agent_commission) as total_commission,
        COUNT(DISTINCT mt.property_id) as properties_managed,
        SUM(mt.gross_rent_collected) as total_rent_collected,
        AVG(mt.agent_commission_rate) as avg_commission_rate
      FROM monthly_transcripts mt
      JOIN properties p ON mt.property_id = p.id
      WHERE p.user_id = ? AND p.is_restricted = 0 
        AND mt.billing_month LIKE ? 
        AND mt.status IN ('finalized', 'sent', 'acknowledged')
      GROUP BY mt.billing_month
      ORDER BY mt.billing_month ASC
    `;

    const yearPattern = `${year}-%`;
    const monthlyResult = await database.db!.query(monthlyQuery, [userId, yearPattern]);
    
    const monthlyBreakdown = (monthlyResult.values || []).map(row => ({
      month: row.billing_month,
      commission: row.total_commission || 0,
      propertiesManaged: row.properties_managed || 0,
      totalRentCollected: row.total_rent_collected || 0,
      averageCommissionRate: row.avg_commission_rate || 0
    }));

    const totalCommission = monthlyBreakdown.reduce((sum, month) => sum + month.commission, 0);

    // Top performing properties
    const topPropertiesQuery = `
      SELECT 
        p.name as property_name,
        SUM(mt.agent_commission) as total_commission,
        AVG(rrs.collection_rate) as avg_collection_rate
      FROM monthly_transcripts mt
      JOIN properties p ON mt.property_id = p.id
      LEFT JOIN rent_record_sheets rrs ON p.id = rrs.property_id AND mt.billing_month = rrs.billing_month
      WHERE p.user_id = ? AND p.is_restricted = 0 
        AND mt.billing_month LIKE ?
        AND mt.status IN ('finalized', 'sent', 'acknowledged')
      GROUP BY p.id, p.name
      ORDER BY total_commission DESC
      LIMIT 10
    `;

    const topPropertiesResult = await database.db!.query(topPropertiesQuery, [userId, yearPattern]);
    
    const topPerformingProperties = (topPropertiesResult.values || []).map(row => ({
      propertyName: row.property_name,
      totalCommission: row.total_commission || 0,
      collectionRate: row.avg_collection_rate || 0
    }));

    return {
      totalCommission,
      monthlyBreakdown,
      topPerformingProperties
    };
  }

  async getLandlordRemittanceHistory(propertyId: number, limit: number = 12): Promise<Array<{
    month: string;
    grossIncome: number;
    totalDeductions: number;
    agentCommission: number;
    netRemitted: number;
    status: string;
    sentDate?: string;
    acknowledgedDate?: string;
  }>> {
    const query = `
      SELECT 
        billing_month,
        gross_rent_collected + total_water_charges + total_power_charges + total_other_charges as gross_income,
        total_deductibles,
        agent_commission,
        net_amount_to_landlord,
        status,
        sent_date,
        acknowledged_date
      FROM monthly_transcripts 
      WHERE property_id = ?
      ORDER BY billing_month DESC 
      LIMIT ?
    `;

    const result = await database.db!.query(query, [propertyId, limit]);
    
    return (result.values || []).map(row => ({
      month: row.billing_month,
      grossIncome: row.gross_income || 0,
      totalDeductions: row.total_deductibles || 0,
      agentCommission: row.agent_commission || 0,
      netRemitted: row.net_amount_to_landlord || 0,
      status: row.status,
      sentDate: row.sent_date,
      acknowledgedDate: row.acknowledged_date
    }));
  }

  // ==================== EXPORT FUNCTIONALITY ====================

  async exportTranscriptToPDF(transcriptId: number): Promise<{
    transcript: TranscriptWithDetails;
    pdfData: string; // Base64 encoded PDF data
  }> {
    const transcript = await this.getTranscriptWithDetails(transcriptId);
    
    // This would integrate with a PDF generation library
    // For now, return the transcript data that can be used by a PDF component
    const pdfData = `data:application/pdf;base64,${this.generateTranscriptPDFBase64(transcript)}`;
    
    return {
      transcript,
      pdfData
    };
  }

  async exportRentRecordToPDF(recordSheetId: number): Promise<{
    recordSheet: RentRecordWithDetails;
    pdfData: string; // Base64 encoded PDF data
  }> {
    const recordSheet = await this.getRentRecordWithDetails(recordSheetId);
    
    // This would integrate with a PDF generation library
    const pdfData = `data:application/pdf;base64,${this.generateRentRecordPDFBase64(recordSheet)}`;
    
    return {
      recordSheet,
      pdfData
    };
  }

  private generateTranscriptPDFBase64(transcript: TranscriptWithDetails): string {
    // Placeholder for PDF generation logic
    // In a real implementation, this would use libraries like PDFKit or jsPDF
    // to generate a professional transcript document
    return btoa(`Professional Transcript for ${transcript.property.name} - ${transcript.billingMonth}`);
  }

  private generateRentRecordPDFBase64(recordSheet: RentRecordWithDetails): string {
    // Placeholder for PDF generation logic
    // In a real implementation, this would generate a professional rent record sheet
    return btoa(`Rent Record Sheet for ${recordSheet.property.name} - ${recordSheet.billingMonth}`);
  }

  // ==================== MAPPING FUNCTIONS ====================

  private mapToTranscript(row: any): MonthlyTranscript {
    return {
      id: row.id,
      propertyId: row.property_id,
      billingMonth: row.billing_month,
      landlordName: row.landlord_name,
      landlordContact: row.landlord_contact,
      agentCommissionRate: row.agent_commission_rate,
      grossRentCollected: row.gross_rent_collected,
      totalWaterCharges: row.total_water_charges,
      totalPowerCharges: row.total_power_charges,
      totalOtherCharges: row.total_other_charges,
      totalDeductibles: row.total_deductibles,
      agentCommission: row.agent_commission,
      netAmountToLandlord: row.net_amount_to_landlord,
      status: row.status,
      notes: row.notes,
      generatedBy: row.generated_by,
      sentDate: row.sent_date,
      acknowledgedDate: row.acknowledged_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapToTranscripts(rows: any[]): MonthlyTranscript[] {
    return rows.map(row => this.mapToTranscript(row));
  }

  private mapToTranscriptItem(row: any): TranscriptItem {
    return {
      id: row.id,
      transcriptId: row.transcript_id,
      description: row.description,
      amount: row.amount,
      type: row.type,
      category: row.category,
      isDeductible: Boolean(row.is_deductible),
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapToTranscriptItems(rows: any[]): TranscriptItem[] {
    return rows.map(row => this.mapToTranscriptItem(row));
  }

  private mapToRentRecord(row: any): RentRecordSheet {
    return {
      id: row.id,
      propertyId: row.property_id,
      billingMonth: row.billing_month,
      totalUnits: row.total_units,
      occupiedUnits: row.occupied_units,
      totalRentExpected: row.total_rent_expected,
      totalRentCollected: row.total_rent_collected,
      totalArrears: row.total_arrears,
      collectionRate: row.collection_rate,
      status: row.status,
      generatedBy: row.generated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapToRentRecords(rows: any[]): RentRecordSheet[] {
    return rows.map(row => this.mapToRentRecord(row));
  }

  private mapToRentRecordEntry(row: any): RentRecordEntry {
    return {
      id: row.id,
      recordSheetId: row.record_sheet_id,
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      unitNumber: row.unit_number,
      rentAmount: row.rent_amount,
      waterCharges: row.water_charges,
      powerCharges: row.power_charges,
      otherCharges: row.other_charges,
      totalDue: row.total_due,
      amountPaid: row.amount_paid,
      balance: row.balance,
      paymentStatus: row.payment_status,
      paymentDate: row.payment_date,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapToRentRecordEntries(rows: any[]): RentRecordEntry[] {
    return rows.map(row => this.mapToRentRecordEntry(row));
  }

  // ==================== UTILITY METHODS ====================

  async getTranscriptSummaryStats(userId: number, year?: number): Promise<{
    totalTranscripts: number;
    draftTranscripts: number;
    finalizedTranscripts: number;
    sentTranscripts: number;
    totalCommissionEarned: number;
    totalAmountRemitted: number;
    averageProcessingTime: number; // Days from creation to sending
  }> {
    let whereClause = `WHERE p.user_id = ? AND p.is_restricted = 0`;
    const params: string[] = [userId.toString()];

    if (year) {
      whereClause += ` AND mt.billing_month LIKE ?`;
      params.push(`${year}-%`);
    }

    const query = `
      SELECT 
        COUNT(*) as total_transcripts,
        COUNT(CASE WHEN mt.status = 'draft' THEN 1 END) as draft_transcripts,
        COUNT(CASE WHEN mt.status = 'finalized' THEN 1 END) as finalized_transcripts,
        COUNT(CASE WHEN mt.status = 'sent' THEN 1 END) as sent_transcripts,
        SUM(mt.agent_commission) as total_commission,
        SUM(mt.net_amount_to_landlord) as total_remitted,
        AVG(
          CASE WHEN mt.sent_date IS NOT NULL 
          THEN julianday(mt.sent_date) - julianday(mt.created_at)
          ELSE NULL END
        ) as avg_processing_days
      FROM monthly_transcripts mt
      JOIN properties p ON mt.property_id = p.id
      ${whereClause}
    `;

    const result = await database.db!.query(query, params);
    const stats = result.values?.[0] || {};

    return {
      totalTranscripts: stats.total_transcripts || 0,
      draftTranscripts: stats.draft_transcripts || 0,
      finalizedTranscripts: stats.finalized_transcripts || 0,
      sentTranscripts: stats.sent_transcripts || 0,
      totalCommissionEarned: stats.total_commission || 0,
      totalAmountRemitted: stats.total_remitted || 0,
      averageProcessingTime: Math.round(stats.avg_processing_days || 0)
    };
  }

  async getRentCollectionTrends(propertyId: number, months: number = 12): Promise<Array<{
    month: string;
    expectedAmount: number;
    collectedAmount: number;
    collectionRate: number;
    tenantCount: number;
    onTimePayments: number;
  }>> {
    const query = `
      SELECT 
        rrs.billing_month,
        rrs.total_rent_expected,
        rrs.total_rent_collected,
        rrs.collection_rate,
        rrs.occupied_units,
        COUNT(CASE WHEN rre.payment_status = 'paid' 
              AND rre.payment_date <= date(rrs.billing_month || '-05') THEN 1 END) as on_time_payments
      FROM rent_record_sheets rrs
      LEFT JOIN rent_record_entries rre ON rrs.id = rre.record_sheet_id
      WHERE rrs.property_id = ?
      GROUP BY rrs.billing_month
      ORDER BY rrs.billing_month DESC
      LIMIT ?
    `;

    const result = await database.db!.query(query, [propertyId, months]);
    
    return (result.values || []).map(row => ({
      month: row.billing_month,
      expectedAmount: row.total_rent_expected || 0,
      collectedAmount: row.total_rent_collected || 0,
      collectionRate: row.collection_rate || 0,
      tenantCount: row.occupied_units || 0,
      onTimePayments: row.on_time_payments || 0
    })).reverse(); // Show oldest to newest for trend visualization
  }
}

// ==================== SINGLETON INSTANCE ====================
export const reportsDatabase = new ReportsDatabase();