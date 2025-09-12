// ReportsDatabase.tsx - Professional Transcripts and Rent Record Sheets Manager
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

    // Check if transcript already exists for this property/month
    const existingTranscriptQuery = `
      SELECT id FROM monthly_transcripts 
      WHERE property_id = ? AND billing_month = ?
    `;
    const existingResult = await database.db!.query(existingTranscriptQuery, [input.propertyId, input.billingMonth]);

    let transcriptId: number;

    if (existingResult.values && existingResult.values.length > 0) {
      // Update existing transcript
      transcriptId = existingResult.values[0].id;
      console.log(`[Transcript] Updating existing transcript ${transcriptId}`);
      
      // Update basic transcript info
      const updateQuery = `
        UPDATE monthly_transcripts SET
          landlord_name = ?,
          landlord_contact = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      await database.db!.run(updateQuery, [
        input.landlordName,
        input.landlordContact || '',
        input.notes || '',
        transcriptId
      ]);
    } else {
      // Create new transcript
      console.log(`[Transcript] Creating new transcript for property ${input.propertyId}, month ${input.billingMonth}`);
      
      const transcriptQuery = `
        INSERT INTO monthly_transcripts (
          property_id, billing_month, landlord_name, landlord_contact,
          agent_commission_rate, gross_rent_collected, total_water_charges,
          total_power_charges, total_other_charges, total_deductibles,
          agent_commission, net_amount_to_landlord, notes, generated_by
        )
        VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, ?, ?)
      `;

      const result = await database.db!.run(transcriptQuery, [
        input.propertyId,
        input.billingMonth,
        input.landlordName,
        input.landlordContact || '',
        property.agentCommissionRate,
        input.notes || '',
        userId
      ]);

      transcriptId = result.changes!.lastId!;
    }

    // Always rebuild items with fresh data (this handles new/updated invoices)
    await this.rebuildTranscriptItems(transcriptId, input.propertyId, input.billingMonth, property, input.customItems);

    // Return full transcript with details
    return await this.getTranscriptWithDetails(transcriptId);
  } catch (error) {
    console.error('Error generating monthly transcript:', error);
    throw error;
  }
}

private async rebuildTranscriptItems(
  transcriptId: number, 
  propertyId: number,
  billingMonth: string,
  property: any, 
  customItems?: TranscriptItemInput[]
): Promise<void> {
  console.log(`[Transcript] Rebuilding items for transcript ${transcriptId}`);
  
  // DELETE ALL EXISTING ITEMS FIRST
  await database.db!.run('DELETE FROM transcript_items WHERE transcript_id = ?', [transcriptId]);
  
  // Get fresh invoice data
  const invoiceData = await this.getCurrentInvoiceData(propertyId, billingMonth);
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
    await this.addTranscriptItem({
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
    await this.addTranscriptItem({
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
    await this.addTranscriptItem({
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
    await this.addTranscriptItem({
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
      await this.addTranscriptItem({
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
      await this.addTranscriptItem({
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
      await this.addTranscriptItem({
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
      await this.addTranscriptItem({
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
      await this.addTranscriptItem({
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

  // Recalculate totals ONCE after all items are added
  await this.recalculateTranscriptTotals(transcriptId);
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
    items,
    tenantSummary
  };
}

// UPDATED: Fix the addTranscriptItem to NOT auto-recalculate (prevent recursive calls)
async addTranscriptItem(item: TranscriptItemInput): Promise<TranscriptItem> {
  const query = `
    INSERT INTO transcript_items (
      description, amount, type, category, 
      is_deductible, sort_order, billing_month
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const result = await database.db!.run(query, [
    item.description,
    item.amount,
    item.type,
    item.category || '',
    item.isDeductible ? 1 : 0,
    item.sortOrder || 0,
    item.billingMonth
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

  private async recalculateTranscriptTotals(transcriptId: number): Promise<void> {
    // Get all items for this transcript
    const itemsQuery = `SELECT * FROM transcript_items WHERE transcript_id = ?`;
    const result = await database.db!.query(itemsQuery, [transcriptId]);
    const items = result.values || [];

    let totalDeductibles = 0;
    let totalIncome = 0;
    let totalWaterCharges = 0;
    let totalPowerCharges = 0;
    let agentCommission = 0;

    for (const item of items) {
      if (item.is_deductible) {
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

    // Update transcript totals
    const updateQuery = `
      UPDATE monthly_transcripts 
      SET total_deductibles = ?, net_amount_to_landlord = ?, 
          total_water_charges = ?, total_power_charges = ?,
          agent_commission = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    await database.db!.run(updateQuery, [
      totalDeductibles, 
      netAmountToLandlord, 
      totalWaterCharges, 
      totalPowerCharges,
      agentCommission,
      transcriptId
    ]);
  }

  // async getTranscriptWithDetails(transcriptId: number): Promise<TranscriptWithDetails> {
  //   const transcript = await this.getTranscriptById(transcriptId);
  //   if (!transcript) {
  //     throw new Error('Transcript not found');
  //   }

  //   const property = await database.getPropertyById(transcript.propertyId);
  //   if (!property) {
  //     throw new Error('Property not found');
  //   }

  //   const items = await this.getTranscriptItems(transcriptId);
    
  //   // Get tenant summary for the billing month
  //   const invoices = await database.getInvoices({
  //     propertyId: transcript.propertyId,
  //     billingMonth: transcript.billingMonth
  //   });

  //   const tenantSummary = {
  //     totalTenants: invoices.length,
  //     activeTenants: invoices.filter(inv => inv.isPaid || inv.amountPaid > 0).length,
  //     paidInvoices: invoices.filter(inv => inv.isPaid).length,
  //     unpaidInvoices: invoices.filter(inv => !inv.isPaid).length
  //   };

  //   return {
  //     ...transcript,
  //     property,
  //     items,
  //     tenantSummary
  //   };
  // }

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




  // UPDATED METHODS - Dynamic Rent Record Generation
// These methods ensure rent records are always generated from live data

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

// REMOVED METHODS - No longer needed for dynamic generation
// - rebuildRentRecordSheet (replaced by generateDynamicRentRecord)
// - addRentRecordEntry (entries generated dynamically)
// - recalculateRecordSheetTotals (totals calculated dynamically)


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

// UTILITY METHOD - For checking if dynamic generation is available
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

  // async getRentRecordsByProperty(propertyId: number, limit: number = 12): Promise<RentRecordSheet[]> {
  //   const query = `
  //     SELECT * FROM rent_record_sheets 
  //     WHERE property_id = ? 
  //     ORDER BY billing_month DESC 
  //     LIMIT ?
  //   `;
  //   const result = await database.db!.query(query, [propertyId, limit]);
  //   return this.mapToRentRecords(result.values || []);
  // }

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