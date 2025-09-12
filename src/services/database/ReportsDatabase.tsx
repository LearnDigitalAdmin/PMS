// ReportsDatabase.tsx - Professional Transcripts and Rent Record Sheets Manager
import { database, type Property } from './Database';

// ==================== TYPE INTERFACES ====================

export interface TranscriptItem {
  id: number;
  transcriptId: number; // Keep for backward compatibility - will be 0 for dynamic
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
  description: string;
  amount: number;
  type: 'rent' | 'water' | 'power' | 'deductible' | 'custom';
  category?: string;
  isDeductible: boolean;
  sortOrder?: number;
  billingMonth: string;
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

  // ==================== DYNAMIC TRANSCRIPT GENERATION ====================
  // Transcripts are now generated dynamically from live data, like rent record sheets

  async generateMonthlyTranscript(input: MonthlyTranscriptInput, userId: number): Promise<TranscriptWithDetails> {
    try {
      console.log(`[Transcript] Starting dynamic generation for property ${input.propertyId}, month ${input.billingMonth}`);
      
      // Get property and validate access
      const property = await database.getPropertyById(input.propertyId);
      if (!property) {
        console.error(`[Transcript] Property ${input.propertyId} not found`);
        throw new Error('Property not found');
      }

      if (property.isRestricted) {
        console.error(`[Transcript] Property ${input.propertyId} is restricted`);
        throw new Error('Cannot generate transcript for restricted property');
      }

      console.log(`[Transcript] Property found: ${property.name}`);

      // ALWAYS generate from live data - no database persistence for main transcript
      const transcript = await this.generateDynamicTranscript(input, userId, property);
      
      // SPECIAL: Save a summary transcript for SummariesService compatibility
      await this.saveSummaryTranscript(transcript, input, userId);
      
      console.log(`[Transcript] Successfully generated dynamic transcript with ${transcript.items.length} items`);
      
      return transcript;
    } catch (error) {
      console.error('[Transcript] Error generating monthly transcript:', error);
      throw error;
    }
  }

  private async generateDynamicTranscript(
    input: MonthlyTranscriptInput,
    userId: number,
    property: any
  ): Promise<TranscriptWithDetails> {
    console.log(`[Transcript] Generating dynamic transcript from live data`);
    
    // Get fresh invoice data
    const invoiceData = await this.getCurrentInvoiceData(input.propertyId, input.billingMonth);
    const { 
      grossRentCollected, 
      totalOtherCharges,
      invoices 
    } = invoiceData;

    // Calculate commission
    const agentCommission = grossRentCollected * (property.agentCommissionRate / 100);

    // Clear and rebuild items for this month
    await this.rebuildTranscriptItemsForMonth(input.propertyId, input.billingMonth, invoiceData, property, input.customItems);

    // Get fresh items
    const items = await this.getTranscriptItemsByMonth(input.propertyId, input.billingMonth);

    // Calculate totals from items
    let totalDeductibles = 0;
    let totalWaterCharges = 0;
    let totalPowerCharges = 0;

    for (const item of items) {
      if (item.isDeductible) {
        totalDeductibles += item.amount;
      }
      if (item.type === 'water') {
        totalWaterCharges += item.amount;
      } else if (item.type === 'power') {
        totalPowerCharges += item.amount;
      }
    }

    // Calculate net amount
    const totalIncome = grossRentCollected + totalOtherCharges;
    const netAmountToLandlord = totalIncome - totalDeductibles;

    // Create dynamic transcript
    const transcript: MonthlyTranscript = {
      id: 0, // Dynamic - no DB persistence for main transcript
      propertyId: input.propertyId,
      billingMonth: input.billingMonth,
      landlordName: input.landlordName,
      landlordContact: input.landlordContact || '',
      agentCommissionRate: property.agentCommissionRate,
      grossRentCollected,
      totalWaterCharges,
      totalPowerCharges,
      totalOtherCharges,
      totalDeductibles,
      agentCommission,
      netAmountToLandlord,
      status: 'draft',
      notes: input.notes || '',
      generatedBy: userId,
      sentDate: undefined,
      acknowledgedDate: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Generate tenant summary
    const tenantSummary = {
      totalTenants: invoices.length,
      activeTenants: invoices.filter((inv: any) => inv.isPaid || inv.amountPaid > 0).length,
      paidInvoices: invoices.filter((inv: any) => inv.isPaid).length,
      unpaidInvoices: invoices.filter((inv: any) => !inv.isPaid).length
    };

    console.log(`[Transcript] Dynamic transcript generated - Net: ${netAmountToLandlord}, Items: ${items.length}`);

    return {
      ...transcript,
      property,
      items,
      tenantSummary
    };
  }

  private async saveSummaryTranscript(transcript: TranscriptWithDetails, input: MonthlyTranscriptInput, userId: number): Promise<void> {
    console.log(`[Transcript] Saving summary transcript for SummariesService compatibility`);
    
    try {
      // Check if summary transcript exists
      const existingQuery = `
        SELECT id FROM monthly_transcripts 
        WHERE property_id = ? AND billing_month = ?
      `;
      const existingResult = await database.db!.query(existingQuery, [input.propertyId, input.billingMonth]);

      if (existingResult.values && existingResult.values.length > 0) {
        // Update existing summary transcript
        const transcriptId = existingResult.values[0].id;
        console.log(`[Transcript] Updating existing summary transcript ${transcriptId}`);
        
        const updateQuery = `
          UPDATE monthly_transcripts SET
            landlord_name = ?,
            landlord_contact = ?,
            agent_commission_rate = ?,
            gross_rent_collected = ?,
            total_water_charges = ?,
            total_power_charges = ?,
            total_other_charges = ?,
            total_deductibles = ?,
            agent_commission = ?,
            net_amount_to_landlord = ?,
            notes = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `;
        
        await database.db!.run(updateQuery, [
          transcript.landlordName,
          transcript.landlordContact,
          transcript.agentCommissionRate,
          transcript.grossRentCollected,
          transcript.totalWaterCharges,
          transcript.totalPowerCharges,
          transcript.totalOtherCharges,
          transcript.totalDeductibles,
          transcript.agentCommission,
          transcript.netAmountToLandlord,
          transcript.notes,
          transcriptId
        ]);
      } else {
        // Create new summary transcript
        console.log(`[Transcript] Creating new summary transcript`);
        
        const insertQuery = `
          INSERT INTO monthly_transcripts (
            property_id, billing_month, landlord_name, landlord_contact,
            agent_commission_rate, gross_rent_collected, total_water_charges,
            total_power_charges, total_other_charges, total_deductibles,
            agent_commission, net_amount_to_landlord, notes, generated_by, status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
        `;

        await database.db!.run(insertQuery, [
          input.propertyId,
          input.billingMonth,
          transcript.landlordName,
          transcript.landlordContact,
          transcript.agentCommissionRate,
          transcript.grossRentCollected,
          transcript.totalWaterCharges,
          transcript.totalPowerCharges,
          transcript.totalOtherCharges,
          transcript.totalDeductibles,
          transcript.agentCommission,
          transcript.netAmountToLandlord,
          transcript.notes,
          userId
        ]);
      }
    } catch (error) {
      console.warn('[Transcript] Error saving summary transcript (non-critical):', error);
    }
  }

  private async rebuildTranscriptItemsForMonth(
    propertyId: number,
    billingMonth: string,
    invoiceData: any,
    property: any, 
    customItems?: TranscriptItemInput[]
  ): Promise<void> {
    console.log(`[Transcript] Rebuilding items for property ${propertyId}, month ${billingMonth}`);
    
    // DELETE ALL EXISTING ITEMS FOR THIS MONTH AND PROPERTY
    await database.db!.run(
      'DELETE FROM transcript_items WHERE billing_month = ? AND property_id = ?', 
      [billingMonth, propertyId]
    );
    
    const { 
      grossRentCollected, 
      invoiceWaterCharges, 
      invoicePowerCharges, 
      totalOtherCharges,
      totalArrears 
    } = invoiceData;

    let sortOrder = 1;
    const agentCommission = grossRentCollected * (property.agentCommissionRate / 100);

    // Add rent collected item (always income)
    if (grossRentCollected > 0) {
      await this.addTranscriptItemForMonth({
        propertyId,
        description: 'Collectable Rent',
        amount: grossRentCollected,
        type: 'rent',
        isDeductible: false,
        sortOrder: sortOrder++,
        billingMonth
      });
    }

    // Add other charges if any
    if (totalOtherCharges > 0) {
      await this.addTranscriptItemForMonth({
        propertyId,
        description: 'Other Charges',
        amount: totalOtherCharges,
        type: 'custom',
        isDeductible: false,
        sortOrder: sortOrder++,
        billingMonth
      });
    }

    // Add commission deduction (always deductible)
    if (agentCommission > 0) {
      await this.addTranscriptItemForMonth({
        propertyId,
        description: `Agent Commission (${property.agentCommissionRate}%)`,
        amount: agentCommission,
        type: 'deductible',
        isDeductible: true,
        sortOrder: sortOrder++,
        billingMonth
      });
    }

    // Add arrears as deduction if any
    if (totalArrears > 0) {
      await this.addTranscriptItemForMonth({
        propertyId,
        description: 'Outstanding Arrears',
        amount: totalArrears,
        type: 'deductible',
        category: 'Deductions',
        isDeductible: true,
        sortOrder: sortOrder++,
        billingMonth
      });
    }

    // Process custom items or use defaults
    if (customItems && customItems.length > 0) {
      const waterItem = customItems.find(item => item.type === 'water');
      const powerItem = customItems.find(item => item.type === 'power');

      // Add default water if not overridden by custom
      if (!waterItem && invoiceWaterCharges > 0) {
        await this.addTranscriptItemForMonth({
          propertyId,
          description: 'Water Charges',
          amount: invoiceWaterCharges,
          type: 'water',
          category: 'Utilities',
          isDeductible: false,
          sortOrder: sortOrder++,
          billingMonth
        });
      }

      // Add default power if not overridden by custom
      if (!powerItem && invoicePowerCharges > 0) {
        await this.addTranscriptItemForMonth({
          propertyId,
          description: 'Power Charges',
          amount: invoicePowerCharges,
          type: 'power',
          category: 'Utilities',
          isDeductible: false,
          sortOrder: sortOrder++,
          billingMonth
        });
      }

      // Add all custom items
      for (const item of customItems) {
        await this.addTranscriptItemForMonth({
          propertyId,
          description: item.description,
          amount: item.amount,
          type: item.type,
          category: item.category,
          isDeductible: item.isDeductible,
          sortOrder: item.sortOrder || sortOrder++,
          billingMonth
        });
      }
    } else {
      // No custom items, use invoice defaults
      if (invoiceWaterCharges > 0) {
        await this.addTranscriptItemForMonth({
          propertyId,
          description: 'Water Charges',
          amount: invoiceWaterCharges,
          type: 'water',
          category: 'Utilities',
          isDeductible: false,
          sortOrder: sortOrder++,
          billingMonth
        });
      }

      if (invoicePowerCharges > 0) {
        await this.addTranscriptItemForMonth({
          propertyId,
          description: 'Power Charges',
          amount: invoicePowerCharges,
          type: 'power',
          category: 'Utilities',
          isDeductible: false,
          sortOrder: sortOrder++,
          billingMonth
        });
      }
    }

    console.log(`[Transcript] Rebuilt items for ${billingMonth}`);
  }

  async getTranscriptWithDetails(transcriptId: number): Promise<TranscriptWithDetails> {
    // For backward compatibility - if called with ID 0, treat as dynamic request
    if (transcriptId === 0) {
      throw new Error('Dynamic transcripts should be generated via generateMonthlyTranscript');
    }

    // Legacy DB-based lookup for SummariesService compatibility
    const transcript = await this.getTranscriptById(transcriptId);
    if (!transcript) {
      throw new Error('Transcript not found');
    }

    const property = await database.getPropertyById(transcript.propertyId);
    if (!property) {
      throw new Error('Property not found');
    }
    
    // Get items by month instead of transcript ID
    const items = await this.getTranscriptItemsByMonth(transcript.propertyId, transcript.billingMonth);
    
    // Get tenant summary using fresh invoice data
    const invoiceData = await this.getCurrentInvoiceData(transcript.propertyId, transcript.billingMonth);
    const tenantSummary = {
      totalTenants: invoiceData.invoices.length,
      activeTenants: invoiceData.invoices.filter((inv: any) => inv.isPaid || inv.amountPaid > 0).length,
      paidInvoices: invoiceData.invoices.filter((inv: any) => inv.isPaid).length,
      unpaidInvoices: invoiceData.invoices.filter((inv: any) => !inv.isPaid).length
    };

    return {
      ...transcript,
      property,
      items: items.map(item => ({ ...item, transcriptId })), // Map for backward compatibility
      tenantSummary
    };
  }

  // NEW METHOD: Add items by month instead of transcript ID
  private async addTranscriptItemForMonth(item: TranscriptItemInput & { propertyId: number }): Promise<TranscriptItem> {
    const query = `
      INSERT INTO transcript_items (
        transcript_id, property_id, billing_month, description, amount, type, category, 
        is_deductible, sort_order
      )
      VALUES (0, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await database.db!.run(query, [
      item.propertyId,
      item.billingMonth,
      item.description,
      item.amount,
      item.type,
      item.category || '',
      item.isDeductible ? 1 : 0,
      item.sortOrder || 0
    ]);

    return await this.getTranscriptItemById(result.changes!.lastId!);
  }

  // NEW METHOD: Get items by month and property instead of transcript ID
  private async getTranscriptItemsByMonth(propertyId: number, billingMonth: string): Promise<TranscriptItem[]> {
    const query = `
      SELECT * FROM transcript_items 
      WHERE property_id = ? AND billing_month = ?
      ORDER BY sort_order ASC
    `;
    const result = await database.db!.query(query, [propertyId, billingMonth]);
    return this.mapToTranscriptItems(result.values || []);
  }

  // UPDATED: Add property_id and billing_month columns to legacy addTranscriptItem for backward compatibility
  async addTranscriptItem(item: TranscriptItemInput): Promise<TranscriptItem> {
    // This method is kept for backward compatibility but not recommended for new code
    console.warn('[Transcript] addTranscriptItem is deprecated, use month-based items instead');
    
    const query = `
      INSERT INTO transcript_items (
        transcript_id, property_id, billing_month, description, amount, type, category, 
        is_deductible, sort_order
      )
      VALUES (0, NULL, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await database.db!.run(query, [
      item.billingMonth,
      item.description,
      item.amount,
      item.type,
      item.category || '',
      item.isDeductible ? 1 : 0,
      item.sortOrder || 0
    ]);

    return await this.getTranscriptItemById(result.changes!.lastId!);
  }

  private async getCurrentInvoiceData(propertyId: number, billingMonth: string) {
    // Always get fresh invoice data to reflect any changes
    const invoices = await database.getInvoices({
      propertyId,
      billingMonth
    });

    const grossRentCollected = invoices
      .filter(inv => inv.isPaid)
      .reduce((sum, inv) => sum + inv.rentAmount, 0);

    const invoiceWaterCharges = invoices
      .filter(inv => inv.isPaid)
      .reduce((sum, inv) => {
        const waterAmount = (inv.waterCurrentReading - inv.waterPreviousReading) * 
          inv.waterUnitPrice + inv.waterStandingFee;
        return sum + waterAmount;
      }, 0);

    const invoicePowerCharges = invoices
      .filter(inv => inv.isPaid)
      .reduce((sum, inv) => {
        const powerAmount = (inv.powerCurrentReading - inv.powerPreviousReading) * 
          inv.powerUnitPrice;
        return sum + powerAmount;
      }, 0);

    const totalOtherCharges = invoices
      .filter(inv => inv.isPaid)
      .reduce((sum, inv) => sum + inv.otherCharges, 0);

    // Calculate total arrears from all invoices (paid and unpaid)
    const totalArrears = invoices
      .reduce((sum, inv) => sum + inv.arrears, 0);

    return {
      invoices,
      grossRentCollected,
      invoiceWaterCharges,
      invoicePowerCharges,
      totalOtherCharges,
      totalArrears
    };
  }

  // ==================== BACKWARD COMPATIBILITY METHODS ====================
  // These methods maintain compatibility with existing components and SummariesService

  async finalizeTranscript(transcriptId: number): Promise<void> {
    // For dynamic transcripts, update the summary transcript status
    if (transcriptId === 0) {
      console.log('[Transcript] Cannot finalize dynamic transcript without specific property/month');
      return;
    }

    const query = `
      UPDATE monthly_transcripts 
      SET status = 'finalized', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'draft'
    `;
    await database.db!.run(query, [transcriptId]);
  }

  async markTranscriptSent(transcriptId: number): Promise<void> {
    // For dynamic transcripts, update the summary transcript status
    if (transcriptId === 0) {
      console.log('[Transcript] Cannot mark dynamic transcript as sent without specific property/month');
      return;
    }

    const query = `
      UPDATE monthly_transcripts 
      SET status = 'sent', sent_date = CURRENT_DATE, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'finalized'
    `;
    await database.db!.run(query, [transcriptId]);
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

  // UPDATED: For backward compatibility, generate dynamic list like rent record sheets
  async getTranscriptsByProperty(propertyId: number, limit: number = 12): Promise<MonthlyTranscript[]> {
    console.log(`[Transcript] Generating dynamic transcript list for property ${propertyId}`);
    
    const property = await database.getPropertyById(propertyId);
    if (!property) {
      return [];
    }

    // Generate transcripts for the last 12 months dynamically
    const transcripts: MonthlyTranscript[] = [];
    const currentDate = new Date();
    
    for (let i = 0; i < limit; i++) {
      const monthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const billingMonth = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
      
      // Check if there's any invoice data for this month
      const invoices = await database.getInvoices({
        propertyId,
        billingMonth
      });

      // Only include months with invoice data
      if (invoices.length > 0) {
        try {
          // Get the summary transcript if it exists, otherwise create a minimal one
          const summaryTranscript = await this.getSummaryTranscript(propertyId, billingMonth);
          
          if (summaryTranscript) {
            transcripts.push({
              ...summaryTranscript,
              id: i + 1 // Dynamic ID for UI consistency
            });
          } else {
            // Create minimal transcript for display
            const invoiceData = await this.getCurrentInvoiceData(propertyId, billingMonth);
            const agentCommission = invoiceData.grossRentCollected * (property.agentCommissionRate / 100);
            
            transcripts.push({
              id: i + 1, // Dynamic ID for UI consistency
              propertyId,
              billingMonth,
              landlordName: '',
              landlordContact: '',
              agentCommissionRate: property.agentCommissionRate,
              grossRentCollected: invoiceData.grossRentCollected,
              totalWaterCharges: invoiceData.invoiceWaterCharges,
              totalPowerCharges: invoiceData.invoicePowerCharges,
              totalOtherCharges: invoiceData.totalOtherCharges,
              totalDeductibles: agentCommission + invoiceData.totalArrears,
              agentCommission,
              netAmountToLandlord: invoiceData.grossRentCollected + invoiceData.totalOtherCharges - agentCommission - invoiceData.totalArrears,
              status: 'draft',
              notes: '',
              generatedBy: property.userId,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
          }
        } catch (error) {
          console.warn(`[Transcript] Could not generate transcript for ${billingMonth}:`, error);
        }
      }
    }

    return transcripts.sort((a, b) => b.billingMonth.localeCompare(a.billingMonth));
  }

  async getTranscriptsByUser(userId: number, limit: number = 50): Promise<MonthlyTranscript[]> {
    console.log(`[Transcript] Getting transcripts for user ${userId} - using DB summaries for compatibility`);
    
    // Use DB-stored summaries for SummariesService compatibility
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

  private async getSummaryTranscript(propertyId: number, billingMonth: string): Promise<MonthlyTranscript | null> {
    const query = `
      SELECT * FROM monthly_transcripts 
      WHERE property_id = ? AND billing_month = ?
    `;
    const result = await database.db!.query(query, [propertyId, billingMonth]);
    
    if (result.values && result.values.length > 0) {
      return this.mapToTranscript(result.values[0]);
    }
    return null;
  }

  // ==================== ITEM MANAGEMENT (BACKWARD COMPATIBILITY) ====================

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

    // Update summary transcript totals if exists
    const itemQuery = 'SELECT property_id, billing_month FROM transcript_items WHERE id = ?';
    const itemResult = await database.db!.query(itemQuery, [id]);
    if (itemResult.values && itemResult.values.length > 0) {
      const { property_id, billing_month } = itemResult.values[0];
      await this.updateSummaryTranscriptTotals(property_id, billing_month);
    }
  }

  async deleteTranscriptItem(id: number): Promise<void> {
    // Get property and month before deleting
    const itemQuery = 'SELECT property_id, billing_month FROM transcript_items WHERE id = ?';
    const itemResult = await database.db!.query(itemQuery, [id]);
    
    if (itemResult.values && itemResult.values.length > 0) {
      const { property_id, billing_month } = itemResult.values[0];
      
      await database.db!.run('DELETE FROM transcript_items WHERE id = ?', [id]);
      await this.updateSummaryTranscriptTotals(property_id, billing_month);
    }
  }

  private async updateSummaryTranscriptTotals(propertyId: number, billingMonth: string): Promise<void> {
    console.log(`[Transcript] Updating summary transcript totals for ${propertyId}/${billingMonth}`);
    
    // Get all items for this month/property
    const items = await this.getTranscriptItemsByMonth(propertyId, billingMonth);
    
    let totalDeductibles = 0;
    let totalWaterCharges = 0;
    let totalPowerCharges = 0;
    let agentCommission = 0;
    let totalIncome = 0;

    for (const item of items) {
      if (item.isDeductible) {
        totalDeductibles += item.amount;
        // Track commission separately
        if (item.description.toLowerCase().includes('commission')) {
          agentCommission = item.amount;
        }
      } else {
        totalIncome += item.amount;
        // Track utilities separately for reporting
        if (item.type === 'water') {
          totalWaterCharges += item.amount;
        } else if (item.type === 'power') {
          totalPowerCharges += item.amount;
        }
      }
    }

    // Calculate net amount: Total Income - Total Deductions
    const netAmountToLandlord = totalIncome - totalDeductibles;

    // Update summary transcript if it exists
    const updateQuery = `
      UPDATE monthly_transcripts 
      SET total_deductibles = ?, net_amount_to_landlord = ?, 
          total_water_charges = ?, total_power_charges = ?,
          agent_commission = ?, updated_at = CURRENT_TIMESTAMP
      WHERE property_id = ? AND billing_month = ?
    `;

    await database.db!.run(updateQuery, [
      totalDeductibles, 
      netAmountToLandlord, 
      totalWaterCharges, 
      totalPowerCharges,
      agentCommission,
      propertyId,
      billingMonth
    ]);
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

    // Delete summary transcript and associated items
    await database.db!.run('DELETE FROM transcript_items WHERE property_id = ? AND billing_month = ?', 
      [transcript.propertyId, transcript.billingMonth]);
    await database.db!.run('DELETE FROM monthly_transcripts WHERE id = ?', [transcriptId]);
  }

  // ==================== UTILITY METHOD - Dynamic Availability Check ====================

  async isDynamicTranscriptAvailable(propertyId: number, billingMonth: string): Promise<boolean> {
    try {
      const property = await database.getPropertyById(propertyId);
      if (!property || property.isRestricted) {
        return false;
      }

      const invoices = await database.getInvoices({
        propertyId,
        billingMonth
      });

      return invoices.length > 0;
    } catch (error) {
      console.error('[Transcript] Error checking dynamic availability:', error);
      return false;
    }
  }

  // ==================== RENT RECORD METHODS (UNCHANGED) ====================
  // These methods remain unchanged as they were already dynamic

  async generateRentRecordSheet(propertyId: number, billingMonth: string): Promise<RentRecordWithDetails> {
    try {
      console.log(`[RentRecord] Starting dynamic generation for property ${propertyId}, month ${billingMonth}`);
      
      // Get property and validate access
      const property = await database.getPropertyById(propertyId);
      if (!property) {
        console.error(`[RentRecord] Property ${propertyId} not found`);
        throw new Error('Property not found');
      }

      if (property.isRestricted) {
        console.error(`[RentRecord] Property ${propertyId} is restricted`);
        throw new Error('Cannot generate record sheet for restricted property');
      }

      console.log(`[RentRecord] Property found: ${property.name}, max units: ${property.maxUnits}`);

      // ALWAYS generate from live data - no database persistence
      const recordSheet = await this.generateDynamicRentRecord(propertyId, billingMonth, property);
      
      console.log(`[RentRecord] Successfully generated dynamic record sheet with ${recordSheet.entries.length} entries`);
      
      return recordSheet;
    } catch (error) {
      console.error('[RentRecord] Error generating rent record sheet:', error);
      throw error;
    }
  }

  private async generateDynamicRentRecord(
    propertyId: number, 
    billingMonth: string, 
    property: any
  ): Promise<RentRecordWithDetails> {
    console.log(`[RentRecord] Generating dynamic record from live data`);
    
    // Get ALL current tenants (fresh data)
    const tenants = await database.getTenantsByProperty(propertyId);
    console.log(`[RentRecord] Found ${tenants.length} tenants for property ${propertyId}`);
    
    // Get fresh invoice data
    const invoiceData = await this.getCurrentInvoiceData(propertyId, billingMonth);
    const { invoices } = invoiceData;
    
    console.log(`[RentRecord] Found ${invoices.length} invoices for ${billingMonth}`);

    // Calculate fresh totals
    let totalRentExpected = 0;
    let totalRentCollected = 0;
    let totalArrears = 0;
    const occupiedUnits = tenants.filter(t => t.isActive).length;

    // Generate entries dynamically from live data
    const entries: RentRecordEntry[] = [];
    let entryId = 1; // Dynamic ID for consistent interface

    for (const tenant of tenants) {
      const invoice = invoices.find(inv => inv.tenantId === tenant.id);
      
      let waterCharges = 0;
      let powerCharges = 0;
      let totalDue = tenant.rentAmount;
      let amountPaid = 0;
      let paymentStatus: 'paid' | 'partial' | 'unpaid' | 'overpaid' = 'unpaid';
      let paymentDate: string | undefined;
      let invoiceArrears = 0;

      if (invoice) {
        waterCharges = (invoice.waterCurrentReading - invoice.waterPreviousReading) * 
          invoice.waterUnitPrice + invoice.waterStandingFee;
        powerCharges = (invoice.powerCurrentReading - invoice.powerPreviousReading) * 
          invoice.powerUnitPrice;
        totalDue = invoice.totalAmount;
        amountPaid = invoice.amountPaid;
        invoiceArrears = invoice.arrears || 0;
        paymentDate = invoice.paidDate || undefined;

        if (invoice.isPaid) {
          paymentStatus = 'paid';
        } else if (amountPaid > 0) {
          paymentStatus = amountPaid > totalDue ? 'overpaid' : 'partial';
        }
      }

      // Calculate balance: what's still owed
      const balance = totalDue - amountPaid;
      
      // Update running totals
      totalRentExpected += totalDue;
      totalRentCollected += amountPaid;
      totalArrears += invoiceArrears;

      console.log(`[RentRecord] Tenant ${tenant.id}: Expected ${totalDue}, Collected ${amountPaid}, Arrears ${invoiceArrears}, Balance ${balance}`);

      // Create dynamic entry
      entries.push({
        id: entryId++,
        recordSheetId: 0, // Dynamic - no DB persistence
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
        paymentDate,
        notes: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    const collectionRate = totalRentExpected > 0 ? 
      (totalRentCollected / totalRentExpected) * 100 : 0;

    console.log(`[RentRecord] Final totals - Expected: ${totalRentExpected}, Collected: ${totalRentCollected}, Arrears: ${totalArrears}, Rate: ${collectionRate.toFixed(2)}%`);

    // Create dynamic record sheet
    const recordSheet: RentRecordSheet = {
      id: 0, // Dynamic - no DB persistence
      propertyId,
      billingMonth,
      totalUnits: property.maxUnits,
      occupiedUnits,
      totalRentExpected,
      totalRentCollected,
      totalArrears,
      collectionRate,
      status: 'current',
      generatedBy: 0, // Dynamic
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Calculate summary statistics
    const onTimePayments = entries.filter(e => e.paymentStatus === 'paid' && 
      e.paymentDate && new Date(e.paymentDate) <= new Date(`${billingMonth}-05`)).length;
    const latePayments = entries.filter(e => e.paymentStatus === 'paid' && 
      e.paymentDate && new Date(e.paymentDate) > new Date(`${billingMonth}-05`)).length;
    const defaulters = entries.filter(e => e.paymentStatus === 'unpaid').length;

    // Calculate average collection days
    let totalDays = 0;
    let paidCount = 0;
    for (const entry of entries) {
      if (entry.paymentStatus === 'paid' && entry.paymentDate) {
        const paymentDate = new Date(entry.paymentDate);
        const monthStart = new Date(`${billingMonth}-01`);
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

  async getRentRecordWithDetails(recordSheetId: number): Promise<RentRecordWithDetails> {
    // For backward compatibility - if called with ID 0, treat as dynamic request
    if (recordSheetId === 0) {
      throw new Error('Dynamic rent records should be generated via generateRentRecordSheet');
    }

    // Legacy DB-based lookup (backward compatibility)
    const recordSheet = await this.getRentRecordById(recordSheetId);
    if (!recordSheet) {
      console.error(`[RentRecord] Record sheet ${recordSheetId} not found when fetching details`);
      throw new Error('Rent record sheet not found');
    }

    const property = await database.getPropertyById(recordSheet.propertyId);
    if (!property) {
      console.error(`[RentRecord] Property ${recordSheet.propertyId} not found when fetching details`);
      throw new Error('Property not found');
    }

    // For legacy records, regenerate dynamically to ensure fresh data
    console.log(`[RentRecord] Converting legacy record ${recordSheetId} to dynamic generation`);
    return await this.generateDynamicRentRecord(recordSheet.propertyId, recordSheet.billingMonth, property);
  }

  async getRentRecordsByProperty(propertyId: number, limit: number = 12): Promise<RentRecordSheet[]> {
    // For backward compatibility, return dynamic records based on recent months
    console.log(`[RentRecord] Generating dynamic rent records list for property ${propertyId}`);
    
    const property = await database.getPropertyById(propertyId);
    if (!property) {
      return [];
    }

    // Generate records for the last 12 months dynamically
    const records: RentRecordSheet[] = [];
    const currentDate = new Date();
    
    for (let i = 0; i < limit; i++) {
      const monthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const billingMonth = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
      
      // Check if there's any invoice data for this month
      const invoices = await database.getInvoices({
        propertyId,
        billingMonth
      });

      // Only include months with invoice data
      if (invoices.length > 0) {
        try {
          const dynamicRecord = await this.generateDynamicRentRecord(propertyId, billingMonth, property);
          records.push({
            id: i + 1, // Dynamic ID for UI consistency
            propertyId: dynamicRecord.propertyId,
            billingMonth: dynamicRecord.billingMonth,
            totalUnits: dynamicRecord.totalUnits,
            occupiedUnits: dynamicRecord.occupiedUnits,
            totalRentExpected: dynamicRecord.totalRentExpected,
            totalRentCollected: dynamicRecord.totalRentCollected,
            totalArrears: dynamicRecord.totalArrears,
            collectionRate: dynamicRecord.collectionRate,
            status: dynamicRecord.status,
            generatedBy: dynamicRecord.generatedBy,
            createdAt: dynamicRecord.createdAt,
            updatedAt: dynamicRecord.updatedAt
          });
        } catch (error) {
          console.warn(`[RentRecord] Could not generate record for ${billingMonth}:`, error);
        }
      }
    }

    return records.sort((a, b) => b.billingMonth.localeCompare(a.billingMonth));
  }

  async archiveRentRecord(recordSheetId: number): Promise<void> {
    // For backward compatibility - archiving dynamic records is not applicable
    console.warn('[RentRecord] archiveRentRecord called on dynamic record - operation not applicable');
    
    if (recordSheetId === 0) {
      console.log('[RentRecord] Dynamic records do not need archiving');
      return;
    }

    // Legacy DB archiving for existing records
    const query = `
      UPDATE rent_record_sheets 
      SET status = 'archived', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    await database.db!.run(query, [recordSheetId]);
  }

  async isDynamicRentRecordAvailable(propertyId: number, billingMonth: string): Promise<boolean> {
    try {
      const property = await database.getPropertyById(propertyId);
      if (!property || property.isRestricted) {
        return false;
      }

      const invoices = await database.getInvoices({
        propertyId,
        billingMonth
      });

      return invoices.length > 0;
    } catch (error) {
      console.error('[RentRecord] Error checking dynamic availability:', error);
      return false;
    }
  }

  // ==================== REPORTING & ANALYTICS (BACKWARD COMPATIBILITY) ====================

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

    // Generate dynamic data for the period
    const monthlyData = [];
    let currentDate = new Date(startMonth + '-01');
    const endDate = new Date(endMonth + '-01');

    while (currentDate <= endDate) {
      const month = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
      
      try {
        // Check if data exists for this month
        const isAvailable = await this.isDynamicRentRecordAvailable(propertyId, month);
        
        if (isAvailable) {
          const rentRecord = await this.generateDynamicRentRecord(propertyId, month, property);
          const summaryTranscript = await this.getSummaryTranscript(propertyId, month);
          
          monthlyData.push({
            month,
            rentCollected: rentRecord.totalRentCollected,
            collectionRate: rentRecord.collectionRate,
            totalTenants: rentRecord.occupiedUnits,
            paidTenants: rentRecord.entries.filter(e => e.paymentStatus === 'paid').length,
            agentCommission: summaryTranscript?.agentCommission || 0,
            netToLandlord: summaryTranscript?.netAmountToLandlord || 0
          });
        }
      } catch (error) {
        console.warn(`Error generating report data for ${month}:`, error);
      }

      currentDate.setMonth(currentDate.getMonth() + 1);
    }

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
    // Use DB-stored summaries for compatibility
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
        AVG(
          CASE WHEN EXISTS (
            SELECT 1 FROM transcript_items ti 
            WHERE ti.property_id = p.id AND ti.billing_month = mt.billing_month
          ) THEN 85.0 ELSE 0 END
        ) as avg_collection_rate
      FROM monthly_transcripts mt
      JOIN properties p ON mt.property_id = p.id
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
    // Use DB-stored summaries for compatibility
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
    // Generate dynamic trends
    const trends = [];
    const property = await database.getPropertyById(propertyId);
    if (!property) return [];

    const currentDate = new Date();
    
    for (let i = months - 1; i >= 0; i--) {
      const monthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const month = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
      
      try {
        const isAvailable = await this.isDynamicRentRecordAvailable(propertyId, month);
        
        if (isAvailable) {
          const rentRecord = await this.generateDynamicRentRecord(propertyId, month, property);
          
          trends.push({
            month,
            expectedAmount: rentRecord.totalRentExpected,
            collectedAmount: rentRecord.totalRentCollected,
            collectionRate: rentRecord.collectionRate,
            tenantCount: rentRecord.occupiedUnits,
            onTimePayments: rentRecord.summary.onTimePayments
          });
        }
      } catch (error) {
        console.warn(`Error generating trend data for ${month}:`, error);
      }
    }

    return trends;
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

  // private async getTranscriptItems(transcriptId: number): Promise<TranscriptItem[]> {
  //   console.warn('[Transcript] getTranscriptItems by transcriptId is deprecated, use getTranscriptItemsByMonth instead');
    
  //   // For backward compatibility, try to get items by transcript ID
  //   const query = `
  //     SELECT * FROM transcript_items 
  //     WHERE transcript_id = ? 
  //     ORDER BY sort_order ASC
  //   `;
  //   const result = await database.db!.query(query, [transcriptId]);
  //   return this.mapToTranscriptItems(result.values || []);
  // }

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
      transcriptId: row.transcript_id || 0, // For backward compatibility
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
}

// ==================== SINGLETON INSTANCE ====================
export const reportsDatabase = new ReportsDatabase();