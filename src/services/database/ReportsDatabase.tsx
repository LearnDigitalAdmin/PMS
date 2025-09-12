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

  // Fixed methods for ReportsDatabase.tsx

// ==================== CORE FIXES ====================

// async generateMonthlyTranscript(input: MonthlyTranscriptInput, userId: number): Promise<TranscriptWithDetails> {
//   try {
//     // Get property and validate access
//     const property = await database.getPropertyById(input.propertyId);
//     if (!property) {
//       throw new Error('Property not found');
//     }

//     if (property.isRestricted) {
//       throw new Error('Cannot generate transcript for restricted property');
//     }

//     // Always get FRESH invoice data - this is crucial
//     const invoiceData = await this.getCurrentInvoiceData(input.propertyId, input.billingMonth);
//     const { 
//       grossRentCollected, 
//       // invoiceWaterCharges, 
//       // invoicePowerCharges, 
//       totalOtherCharges,
//       totalArrears 
//     } = invoiceData;

//     // Check if transcript already exists for this property/month
//     const existingTranscriptQuery = `
//       SELECT id FROM monthly_transcripts 
//       WHERE property_id = ? AND billing_month = ?
//     `;
//     const existingResult = await database.db!.query(existingTranscriptQuery, [input.propertyId, input.billingMonth]);

//     let transcriptId: number;

//     if (existingResult.values && existingResult.values.length > 0) {
//       // Update existing transcript with fresh data
//       transcriptId = existingResult.values[0].id;
//       console.log(`[Transcript] Updating existing transcript ${transcriptId} with fresh data`);
      
//       // Delete all existing items and recalculate
//       await database.db!.run('DELETE FROM transcript_items WHERE transcript_id = ?', [transcriptId]);
      
//       // Update base transcript with fresh totals
//       const updateQuery = `
//         UPDATE monthly_transcripts SET
//           gross_rent_collected = ?,
//           total_other_charges = ?,
//           landlord_name = ?,
//           landlord_contact = ?,
//           notes = ?,
//           updated_at = CURRENT_TIMESTAMP
//         WHERE id = ?
//       `;
      
//       await database.db!.run(updateQuery, [
//         grossRentCollected,
//         totalOtherCharges,
//         input.landlordName,
//         input.landlordContact || '',
//         input.notes || '',
//         transcriptId
//       ]);
//     } else {
//       // Create new transcript
//       console.log(`[Transcript] Creating new transcript for property ${input.propertyId}, month ${input.billingMonth}`);
      
//       const agentCommission = grossRentCollected * (property.agentCommissionRate / 100);
//       const totalDeductibles = agentCommission + totalArrears;
//       const netAmountToLandlord = grossRentCollected + totalOtherCharges - totalDeductibles;

//       const transcriptQuery = `
//         INSERT INTO monthly_transcripts (
//           property_id, billing_month, landlord_name, landlord_contact,
//           agent_commission_rate, gross_rent_collected, total_water_charges,
//           total_power_charges, total_other_charges, total_deductibles,
//           agent_commission, net_amount_to_landlord, notes, generated_by
//         )
//         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//       `;

//       const result = await database.db!.run(transcriptQuery, [
//         input.propertyId,
//         input.billingMonth,
//         input.landlordName,
//         input.landlordContact || '',
//         property.agentCommissionRate,
//         grossRentCollected,
//         0, // Will be recalculated
//         0, // Will be recalculated
//         totalOtherCharges,
//         totalDeductibles,
//         agentCommission,
//         netAmountToLandlord,
//         input.notes || '',
//         userId
//       ]);

//       transcriptId = result.changes!.lastId!;
//     }

//     // Rebuild all transcript items with fresh data
//     await this.rebuildTranscriptItems(transcriptId, invoiceData, property, input.customItems);

//     // Return full transcript with details
//     return await this.getTranscriptWithDetails(transcriptId);
//   } catch (error) {
//     console.error('Error generating monthly transcript:', error);
//     throw error;
//   }
// }

// private async rebuildTranscriptItems(
//   transcriptId: number, 
//   invoiceData: any, 
//   property: any, 
//   customItems?: TranscriptItemInput[]
// ): Promise<void> {
//   const { 
//     grossRentCollected, 
//     invoiceWaterCharges, 
//     invoicePowerCharges, 
//     totalOtherCharges,
//     totalArrears 
//   } = invoiceData;

//   let sortOrder = 1;
//   const agentCommission = grossRentCollected * (property.agentCommissionRate / 100);

//   // Add rent collected item (always income)
//   await this.addTranscriptItem({
//     transcriptId,
//     description: 'Collectable Rent',
//     amount: grossRentCollected,
//     type: 'rent',
//     isDeductible: false,
//     sortOrder: sortOrder++
//   });

//   // Add other charges if any
//   if (totalOtherCharges > 0) {
//     await this.addTranscriptItem({
//       transcriptId,
//       description: 'Other Charges',
//       amount: totalOtherCharges,
//       type: 'custom',
//       isDeductible: false,
//       sortOrder: sortOrder++
//     });
//   }

//   // Add commission deduction (always deductible)
//   await this.addTranscriptItem({
//     transcriptId,
//     description: `Agent Commission (${property.agentCommissionRate}%)`,
//     amount: agentCommission,
//     type: 'deductible',
//     isDeductible: true,
//     sortOrder: sortOrder++
//   });

//   // Add arrears as deduction if any
//   if (totalArrears > 0) {
//     await this.addTranscriptItem({
//       transcriptId,
//       description: 'Outstanding Arrears',
//       amount: totalArrears,
//       type: 'deductible',
//       category: 'Deductions',
//       isDeductible: true,
//       sortOrder: sortOrder++
//     });
//   }

//   // Process custom items or use defaults
//   if (customItems) {
//     const waterItem = customItems.find(item => item.type === 'water');
//     const powerItem = customItems.find(item => item.type === 'power');

//     if (!waterItem && invoiceWaterCharges > 0) {
//       await this.addTranscriptItem({
//         transcriptId,
//         description: 'Water Charges',
//         amount: invoiceWaterCharges,
//         type: 'water',
//         category: 'Utilities',
//         isDeductible: false,
//         sortOrder: sortOrder++
//       });
//     }

//     if (!powerItem && invoicePowerCharges > 0) {
//       await this.addTranscriptItem({
//         transcriptId,
//         description: 'Power Charges',
//         amount: invoicePowerCharges,
//         type: 'power',
//         category: 'Utilities',
//         isDeductible: false,
//         sortOrder: sortOrder++
//       });
//     }

//     for (const item of customItems) {
//       await this.addTranscriptItem({
//         transcriptId,
//         description: item.description,
//         amount: item.amount,
//         type: item.type,
//         category: item.category,
//         isDeductible: item.isDeductible,
//         sortOrder: item.sortOrder || sortOrder++
//       });
//     }
//   } else {
//     if (invoiceWaterCharges > 0) {
//       await this.addTranscriptItem({
//         transcriptId,
//         description: 'Water Charges',
//         amount: invoiceWaterCharges,
//         type: 'water',
//         category: 'Utilities',
//         isDeductible: false,
//         sortOrder: sortOrder++
//       });
//     }

//     if (invoicePowerCharges > 0) {
//       await this.addTranscriptItem({
//         transcriptId,
//         description: 'Power Charges',
//         amount: invoicePowerCharges,
//         type: 'power',
//         category: 'Utilities',
//         isDeductible: false,
//         sortOrder: sortOrder++
//       });
//     }
//   }

//   // Recalculate totals
//   await this.recalculateTranscriptTotals(transcriptId);
// }

// async generateRentRecordSheet(propertyId: number, billingMonth: string): Promise<RentRecordWithDetails> {
//   try {
//     console.log(`[RentRecord] Starting generation for property ${propertyId}, month ${billingMonth}`);
    
//     // Get property and validate access
//     const property = await database.getPropertyById(propertyId);
//     if (!property) {
//       console.error(`[RentRecord] Property ${propertyId} not found`);
//       throw new Error('Property not found');
//     }

//     if (property.isRestricted) {
//       console.error(`[RentRecord] Property ${propertyId} is restricted`);
//       throw new Error('Cannot generate record sheet for restricted property');
//     }

//     console.log(`[RentRecord] Property found: ${property.name}, max units: ${property.maxUnits}`);

//     // Check if record sheet already exists
//     const existingSheetQuery = `
//       SELECT id FROM rent_record_sheets 
//       WHERE property_id = ? AND billing_month = ?
//     `;
//     const existingResult = await database.db!.query(existingSheetQuery, [propertyId, billingMonth]);

//     let recordSheetId: number;

//     if (existingResult.values && existingResult.values.length > 0) {
//       // Update existing sheet with fresh data
//       recordSheetId = existingResult.values[0].id;
//       console.log(`[RentRecord] Updating existing sheet ${recordSheetId} with fresh data`);
      
//       // Delete all existing entries and rebuild
//       await database.db!.run('DELETE FROM rent_record_entries WHERE record_sheet_id = ?', [recordSheetId]);
      
//       await this.rebuildRentRecordSheet(recordSheetId, propertyId, billingMonth);
//     } else {
//       // Create new record sheet
//       console.log(`[RentRecord] Creating new record sheet`);
      
//       // Get fresh data for initial creation
//       const tenants = await database.getTenantsByProperty(propertyId);
//       const occupiedUnits = tenants.filter(t => t.isActive).length;

//       const sheetQuery = `
//         INSERT INTO rent_record_sheets (
//           property_id, billing_month, total_units, occupied_units,
//           total_rent_expected, total_rent_collected, total_arrears,
//           collection_rate, status
//         )
//         VALUES (?, ?, ?, ?, 0, 0, 0, 0, 'current')
//       `;

//       const result = await database.db!.run(sheetQuery, [
//         propertyId,
//         billingMonth,
//         property.maxUnits,
//         occupiedUnits
//       ]);

//       recordSheetId = result.changes!.lastId!;
      
//       await this.rebuildRentRecordSheet(recordSheetId, propertyId, billingMonth);
//     }

//     const finalRecord = await this.getRentRecordWithDetails(recordSheetId);
//     console.log(`[RentRecord] Successfully generated/updated record sheet ${recordSheetId} with ${finalRecord.entries.length} entries`);
    
//     return finalRecord;
//   } catch (error) {
//     console.error('[RentRecord] Error generating rent record sheet:', error);
//     throw error;
//   }
// }

// private async rebuildRentRecordSheet(recordSheetId: number, propertyId: number, billingMonth: string): Promise<void> {
//   console.log(`[RentRecord] Rebuilding sheet ${recordSheetId} with fresh data`);
  
//   // Get ALL current tenants (fresh data)
//   const tenants = await database.getTenantsByProperty(propertyId);
//   console.log(`[RentRecord] Found ${tenants.length} tenants for property ${propertyId}`);
  
//   // Get fresh invoice data
//   const invoiceData = await this.getCurrentInvoiceData(propertyId, billingMonth);
//   const { invoices } = invoiceData;
  
//   console.log(`[RentRecord] Found ${invoices.length} invoices for ${billingMonth}`);

//   // Calculate fresh totals
//   let totalRentExpected = 0;
//   let totalRentCollected = 0;
//   let totalArrears = 0;
//   const occupiedUnits = tenants.filter(t => t.isActive).length;

//   // Create entries for ALL tenants with fresh data
//   for (const tenant of tenants) {
//     const invoice = invoices.find(inv => inv.tenantId === tenant.id);
    
//     let waterCharges = 0;
//     let powerCharges = 0;
//     let totalDue = tenant.rentAmount;
//     let amountPaid = 0;
//     let paymentStatus: 'paid' | 'partial' | 'unpaid' | 'overpaid' = 'unpaid';
//     let paymentDate: string | undefined;
//     let invoiceArrears = 0;

//     if (invoice) {
//       waterCharges = (invoice.waterCurrentReading - invoice.waterPreviousReading) * 
//         invoice.waterUnitPrice + invoice.waterStandingFee;
//       powerCharges = (invoice.powerCurrentReading - invoice.powerPreviousReading) * 
//         invoice.powerUnitPrice;
//       totalDue = invoice.totalAmount;
//       amountPaid = invoice.amountPaid;
//       invoiceArrears = invoice.arrears || 0; // Get arrears from invoice
//       paymentDate = invoice.paidDate || undefined;

//       if (invoice.isPaid) {
//         paymentStatus = 'paid';
//       } else if (amountPaid > 0) {
//         paymentStatus = amountPaid > totalDue ? 'overpaid' : 'partial';
//       }
//     }

//     // Calculate balance: what's still owed (DONT DOUBLE COUNT ARREARS)
//     const balance = totalDue - amountPaid; // Simple: due minus paid
    
//     // Update running totals
//     totalRentExpected += totalDue;
//     totalRentCollected += amountPaid;
//     totalArrears += invoiceArrears; // Use invoice arrears directly

//     console.log(`[RentRecord] Tenant ${tenant.id}: Expected ${totalDue}, Collected ${amountPaid}, Arrears ${invoiceArrears}, Balance ${balance}`);

//     // Create fresh entry
//     await this.addRentRecordEntry({
//       recordSheetId,
//       tenantId: tenant.id,
//       tenantName: tenant.name,
//       unitNumber: tenant.unitNumber || '',
//       rentAmount: tenant.rentAmount,
//       waterCharges,
//       powerCharges,
//       otherCharges: invoice?.otherCharges || 0,
//       totalDue,
//       amountPaid,
//       balance, // Use calculated balance, not balance + arrears
//       paymentStatus,
//       paymentDate
//     });
//   }

//   const collectionRate = totalRentExpected > 0 ? 
//     (totalRentCollected / totalRentExpected) * 100 : 0;

//   console.log(`[RentRecord] Final totals - Expected: ${totalRentExpected}, Collected: ${totalRentCollected}, Arrears: ${totalArrears}, Rate: ${collectionRate.toFixed(2)}%`);

//   // Update the record sheet with fresh totals
//   const updateQuery = `
//     UPDATE rent_record_sheets SET
//       occupied_units = ?,
//       total_rent_expected = ?,
//       total_rent_collected = ?,
//       total_arrears = ?,
//       collection_rate = ?,
//       updated_at = CURRENT_TIMESTAMP
//     WHERE id = ?
//   `;

//   await database.db!.run(updateQuery, [
//     occupiedUnits,
//     totalRentExpected,
//     totalRentCollected,
//     totalArrears,
//     collectionRate,
//     recordSheetId
//   ]);
// }

// ==================== UPDATED GET METHODS (ALWAYS FRESH DATA) ====================

// FIXED METHODS - Replace the buggy methods in ReportsDatabase.tsx

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
      transcriptId,
      description: 'Collectable Rent',
      amount: grossRentCollected,
      type: 'rent',
      isDeductible: false,
      sortOrder: sortOrder++
    });
  }

  // Add other charges if any
  if (totalOtherCharges > 0) {
    await this.addTranscriptItem({
      transcriptId,
      description: 'Other Charges',
      amount: totalOtherCharges,
      type: 'custom',
      isDeductible: false,
      sortOrder: sortOrder++
    });
  }

  // Add commission deduction (always deductible)
  if (agentCommission > 0) {
    await this.addTranscriptItem({
      transcriptId,
      description: `Agent Commission (${property.agentCommissionRate}%)`,
      amount: agentCommission,
      type: 'deductible',
      isDeductible: true,
      sortOrder: sortOrder++
    });
  }

  // Add arrears as deduction if any
  if (totalArrears > 0) {
    await this.addTranscriptItem({
      transcriptId,
      description: 'Outstanding Arrears',
      amount: totalArrears,
      type: 'deductible',
      category: 'Deductions',
      isDeductible: true,
      sortOrder: sortOrder++
    });
  }

  // Process custom items or use defaults
  if (customItems && customItems.length > 0) {
    const waterItem = customItems.find(item => item.type === 'water');
    const powerItem = customItems.find(item => item.type === 'power');

    // Add default water if not overridden by custom
    if (!waterItem && invoiceWaterCharges > 0) {
      await this.addTranscriptItem({
        transcriptId,
        description: 'Water Charges',
        amount: invoiceWaterCharges,
        type: 'water',
        category: 'Utilities',
        isDeductible: false,
        sortOrder: sortOrder++
      });
    }

    // Add default power if not overridden by custom
    if (!powerItem && invoicePowerCharges > 0) {
      await this.addTranscriptItem({
        transcriptId,
        description: 'Power Charges',
        amount: invoicePowerCharges,
        type: 'power',
        category: 'Utilities',
        isDeductible: false,
        sortOrder: sortOrder++
      });
    }

    // Add all custom items
    for (const item of customItems) {
      await this.addTranscriptItem({
        transcriptId,
        description: item.description,
        amount: item.amount,
        type: item.type,
        category: item.category,
        isDeductible: item.isDeductible,
        sortOrder: item.sortOrder || sortOrder++
      });
    }
  } else {
    // No custom items, use invoice defaults
    if (invoiceWaterCharges > 0) {
      await this.addTranscriptItem({
        transcriptId,
        description: 'Water Charges',
        amount: invoiceWaterCharges,
        type: 'water',
        category: 'Utilities',
        isDeductible: false,
        sortOrder: sortOrder++
      });
    }

    if (invoicePowerCharges > 0) {
      await this.addTranscriptItem({
        transcriptId,
        description: 'Power Charges',
        amount: invoicePowerCharges,
        type: 'power',
        category: 'Utilities',
        isDeductible: false,
        sortOrder: sortOrder++
      });
    }
  }

  // Recalculate totals ONCE after all items are added
  await this.recalculateTranscriptTotals(transcriptId);
}

async generateRentRecordSheet(propertyId: number, billingMonth: string): Promise<RentRecordWithDetails> {
  try {
    console.log(`[RentRecord] Starting generation for property ${propertyId}, month ${billingMonth}`);
    
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

    // Check if record sheet already exists
    const existingSheetQuery = `
      SELECT id FROM rent_record_sheets 
      WHERE property_id = ? AND billing_month = ?
    `;
    const existingResult = await database.db!.query(existingSheetQuery, [propertyId, billingMonth]);

    let recordSheetId: number;

    if (existingResult.values && existingResult.values.length > 0) {
      // Use existing sheet
      recordSheetId = existingResult.values[0].id;
      console.log(`[RentRecord] Using existing sheet ${recordSheetId}`);
    } else {
      // Create new record sheet
      console.log(`[RentRecord] Creating new record sheet`);
      
      const sheetQuery = `
        INSERT INTO rent_record_sheets (
          property_id, billing_month, total_units, occupied_units,
          total_rent_expected, total_rent_collected, total_arrears,
          collection_rate, status
        )
        VALUES (?, ?, ?, 0, 0, 0, 0, 0, 'current')
      `;

      const result = await database.db!.run(sheetQuery, [
        propertyId,
        billingMonth,
        property.maxUnits
      ]);

      recordSheetId = result.changes!.lastId!;
    }

    // Always rebuild with fresh data
    await this.rebuildRentRecordSheet(recordSheetId, propertyId, billingMonth);

    const finalRecord = await this.getRentRecordWithDetails(recordSheetId);
    console.log(`[RentRecord] Successfully generated/updated record sheet ${recordSheetId} with ${finalRecord.entries.length} entries`);
    
    return finalRecord;
  } catch (error) {
    console.error('[RentRecord] Error generating rent record sheet:', error);
    throw error;
  }
}

private async rebuildRentRecordSheet(recordSheetId: number, propertyId: number, billingMonth: string): Promise<void> {
  console.log(`[RentRecord] Rebuilding sheet ${recordSheetId} with fresh data`);
  
  // DELETE ALL EXISTING ENTRIES FIRST
  await database.db!.run('DELETE FROM rent_record_entries WHERE record_sheet_id = ?', [recordSheetId]);
  
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

  // Create entries for ALL tenants with fresh data
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

    // Create fresh entry (no duplication since we deleted all first)
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

  const collectionRate = totalRentExpected > 0 ? 
    (totalRentCollected / totalRentExpected) * 100 : 0;

  console.log(`[RentRecord] Final totals - Expected: ${totalRentExpected}, Collected: ${totalRentCollected}, Arrears: ${totalArrears}, Rate: ${collectionRate.toFixed(2)}%`);

  // Update the record sheet with fresh totals
  const updateQuery = `
    UPDATE rent_record_sheets SET
      occupied_units = ?,
      total_rent_expected = ?,
      total_rent_collected = ?,
      total_arrears = ?,
      collection_rate = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  await database.db!.run(updateQuery, [
    occupiedUnits,
    totalRentExpected,
    totalRentCollected,
    totalArrears,
    collectionRate,
    recordSheetId
  ]);
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

  // DON'T rebuild items here - just get current state
  // Items are only rebuilt when explicitly generating/updating transcript
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

async getRentRecordWithDetails(recordSheetId: number): Promise<RentRecordWithDetails> {
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

  // DON'T rebuild here - just get current state
  // Entries are only rebuilt when explicitly generating/updating record sheet
  const entries = await this.getRentRecordEntries(recordSheetId);
  console.log(`[RentRecord] Retrieved ${entries.length} entries for record sheet ${recordSheetId}`);

  // Calculate summary statistics
  const onTimePayments = entries.filter(e => e.paymentStatus === 'paid' && 
    e.paymentDate && new Date(e.paymentDate) <= new Date(`${recordSheet.billingMonth}-05`)).length;
  const latePayments = entries.filter(e => e.paymentStatus === 'paid' && 
    e.paymentDate && new Date(e.paymentDate) > new Date(`${recordSheet.billingMonth}-05`)).length;
  const defaulters = entries.filter(e => e.paymentStatus === 'unpaid').length;

  // Calculate average collection days
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

// UPDATED: Fix the addTranscriptItem to NOT auto-recalculate (prevent recursive calls)
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

  // DON'T auto-recalculate here to prevent recursive calls during rebuild
  // Recalculation happens explicitly after all items are added

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

// private async addOrUpdateArrearsItem(transcriptId: number, arrearsAmount: number, sortOrder: number): Promise<void> {
//   if (arrearsAmount <= 0) return; // Don't add arrears item if no arrears

//   // Check if arrears item already exists
//   const existingArrearsQuery = `
//     SELECT id FROM transcript_items 
//     WHERE transcript_id = ? AND description LIKE '%Arrears%' AND type = 'deductible'
//   `;
//   const existingResult = await database.db!.query(existingArrearsQuery, [transcriptId]);

//   if (existingResult.values && existingResult.values.length > 0) {
//     // Update existing arrears item
//     const arrearsItemId = existingResult.values[0].id;
//     await database.db!.run(
//       'UPDATE transcript_items SET amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
//       [arrearsAmount, arrearsItemId]
//     );
//   } else {
//     // Add new arrears item as deduction
//     await this.addTranscriptItem({
//       transcriptId,
//       description: 'Outstanding Arrears',
//       amount: arrearsAmount,
//       type: 'deductible',
//       category: 'Deductions',
//       isDeductible: true,
//       sortOrder
//     });
//   }
// }

// ==================== UPDATED METHODS ====================

// async generateMonthlyTranscript(input: MonthlyTranscriptInput, userId: number): Promise<TranscriptWithDetails> {
//   try {
//     // Get property and validate access
//     const property = await database.getPropertyById(input.propertyId);
//     if (!property) {
//       throw new Error('Property not found');
//     }

//     if (property.isRestricted) {
//       throw new Error('Cannot generate transcript for restricted property');
//     }

//     // Get fresh invoice data
//     const invoiceData = await this.getCurrentInvoiceData(input.propertyId, input.billingMonth);
//     const { 
//       grossRentCollected, 
//       invoiceWaterCharges, 
//       invoicePowerCharges, 
//       totalOtherCharges,
//       totalArrears 
//     } = invoiceData;

//     // Calculate commission on rent only (standard practice)
//     const agentCommission = grossRentCollected * (property.agentCommissionRate / 100);

//     // Initialize with defaults - will be recalculated after adding items
//     let totalWaterCharges = 0;
//     let totalPowerCharges = 0;
//     let totalDeductibles = agentCommission + totalArrears; // Commission + Arrears are deductions
//     let netAmountToLandlord = grossRentCollected + totalOtherCharges - totalDeductibles;

//     // Create transcript record with initial values
//     const transcriptQuery = `
//       INSERT INTO monthly_transcripts (
//         property_id, billing_month, landlord_name, landlord_contact,
//         agent_commission_rate, gross_rent_collected, total_water_charges,
//         total_power_charges, total_other_charges, total_deductibles,
//         agent_commission, net_amount_to_landlord, notes, generated_by
//       )
//       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//     `;

//     const result = await database.db!.run(transcriptQuery, [
//       input.propertyId,
//       input.billingMonth,
//       input.landlordName,
//       input.landlordContact || '',
//       property.agentCommissionRate,
//       grossRentCollected,
//       totalWaterCharges,
//       totalPowerCharges,
//       totalOtherCharges,
//       totalDeductibles,
//       agentCommission,
//       netAmountToLandlord,
//       input.notes || '',
//       userId
//     ]);

//     const transcriptId = result.changes!.lastId!;

//     // Add rent collected item (always income)
//     await this.addTranscriptItem({
//       transcriptId,
//       description: 'Collectable Rent',
//       amount: grossRentCollected,
//       type: 'rent',
//       isDeductible: false,
//       sortOrder: 1
//     });

//     // Add other charges if any
//     if (totalOtherCharges > 0) {
//       await this.addTranscriptItem({
//         transcriptId,
//         description: 'Other Charges',
//         amount: totalOtherCharges,
//         type: 'custom',
//         isDeductible: false,
//         sortOrder: 2
//       });
//     }

//     // Add commission deduction (always deductible)
//     await this.addTranscriptItem({
//       transcriptId,
//       description: `Agent Commission (${property.agentCommissionRate}%)`,
//       amount: agentCommission,
//       type: 'deductible',
//       isDeductible: true,
//       sortOrder: 3
//     });

//     let sortOrder = 4;

//     // Add arrears as deduction if any
//     await this.addOrUpdateArrearsItem(transcriptId, totalArrears, sortOrder++);

//     // Process custom items (including utilities)
//     if (input.customItems) {
//       // Look for water and power items in custom items
//       const waterItem = input.customItems.find(item => item.type === 'water');
//       const powerItem = input.customItems.find(item => item.type === 'power');

//       // If no custom water item provided, use invoice default (remitted to landlord)
//       if (!waterItem && invoiceWaterCharges > 0) {
//         await this.addTranscriptItem({
//           transcriptId,
//           description: 'Water Charges',
//           amount: invoiceWaterCharges,
//           type: 'water',
//           category: 'Utilities',
//           isDeductible: false, // Default: remit to landlord
//           sortOrder: sortOrder++
//         });
//       }

//       // If no custom power item provided, use invoice default (remitted to landlord)
//       if (!powerItem && invoicePowerCharges > 0) {
//         await this.addTranscriptItem({
//           transcriptId,
//           description: 'Power Charges',
//           amount: invoicePowerCharges,
//           type: 'power',
//           category: 'Utilities',
//           isDeductible: false, // Default: remit to landlord
//           sortOrder: sortOrder++
//         });
//       }

//       // Add all custom items
//       for (const item of input.customItems) {
//         await this.addTranscriptItem({
//           transcriptId,
//           description: item.description,
//           amount: item.amount,
//           type: item.type,
//           category: item.category,
//           isDeductible: item.isDeductible,
//           sortOrder: item.sortOrder || sortOrder++
//         });
//       }
//     } else {
//       // No custom items provided, use invoice defaults
//       if (invoiceWaterCharges > 0) {
//         await this.addTranscriptItem({
//           transcriptId,
//           description: 'Water Charges',
//           amount: invoiceWaterCharges,
//           type: 'water',
//           category: 'Utilities',
//           isDeductible: false,
//           sortOrder: sortOrder++
//         });
//       }

//       if (invoicePowerCharges > 0) {
//         await this.addTranscriptItem({
//           transcriptId,
//           description: 'Power Charges',
//           amount: invoicePowerCharges,
//           type: 'power',
//           category: 'Utilities',
//           isDeductible: false,
//           sortOrder: sortOrder++
//         });
//       }
//     }

//     // Recalculate totals based on all items
//     await this.recalculateTranscriptTotals(transcriptId);

//     // Return full transcript with details
//     return await this.getTranscriptWithDetails(transcriptId);
//   } catch (error) {
//     console.error('Error generating monthly transcript:', error);
//     throw error;
//   }
// }

// async getTranscriptWithDetails(transcriptId: number): Promise<TranscriptWithDetails> {
//   const transcript = await this.getTranscriptById(transcriptId);
//   if (!transcript) {
//     throw new Error('Transcript not found');
//   }

//   const property = await database.getPropertyById(transcript.propertyId);
//   if (!property) {
//     throw new Error('Property not found');
//   }

//   // Get fresh invoice data to ensure current state
//   const invoiceData = await this.getCurrentInvoiceData(transcript.propertyId, transcript.billingMonth);
  
//   // Update arrears in transcript if it has changed
//   await this.addOrUpdateArrearsItem(transcriptId, invoiceData.totalArrears, 999); // High sort order to put at end
  
//   // Recalculate totals to ensure they're current
//   await this.recalculateTranscriptTotals(transcriptId);
  
//   // Get updated transcript after recalculation
//   const updatedTranscript = await this.getTranscriptById(transcriptId);
//   if (!updatedTranscript) {
//     throw new Error('Failed to get updated transcript');
//   }

//   const items = await this.getTranscriptItems(transcriptId);
  
//   // Get tenant summary using fresh invoice data
//   const tenantSummary = {
//     totalTenants: invoiceData.invoices.length,
//     activeTenants: invoiceData.invoices.filter(inv => inv.isPaid || inv.amountPaid > 0).length,
//     paidInvoices: invoiceData.invoices.filter(inv => inv.isPaid).length,
//     unpaidInvoices: invoiceData.invoices.filter(inv => !inv.isPaid).length
//   };

//   return {
//     ...updatedTranscript,
//     property,
//     items,
//     tenantSummary
//   };
// }

// async generateRentRecordSheet(propertyId: number, billingMonth: string): Promise<RentRecordWithDetails> {
//   try {
//     console.log(`[RentRecord] Starting generation for property ${propertyId}, month ${billingMonth}`);
    
//     // Get property and validate access
//     const property = await database.getPropertyById(propertyId);
//     if (!property) {
//       console.error(`[RentRecord] Property ${propertyId} not found`);
//       throw new Error('Property not found');
//     }

//     if (property.isRestricted) {
//       console.error(`[RentRecord] Property ${propertyId} is restricted`);
//       throw new Error('Cannot generate record sheet for restricted property');
//     }

//     console.log(`[RentRecord] Property found: ${property.name}, max units: ${property.maxUnits}`);

//     // Get all tenants for this property
//     const tenants = await database.getTenantsByProperty(propertyId);
//     console.log(`[RentRecord] Found ${tenants.length} tenants for property ${propertyId}`);
    
//     // Get fresh invoice data
//     const invoiceData = await this.getCurrentInvoiceData(propertyId, billingMonth);
//     const { invoices } = invoiceData;
    
//     console.log(`[RentRecord] Found ${invoices.length} invoices for ${billingMonth}`);

//     // Calculate sheet totals including arrears
//     let totalRentExpected = 0;
//     let totalRentCollected = 0;
//     let totalArrears = 0;
//     const occupiedUnits = tenants.filter(t => t.isActive).length;
//     console.log(`[RentRecord] Active tenants: ${occupiedUnits} of ${tenants.length} total`);

//     for (const tenant of tenants) {
//       const invoice = invoices.find(inv => inv.tenantId === tenant.id);
//       if (invoice) {
//         totalRentExpected += invoice.totalAmount;
//         totalRentCollected += invoice.amountPaid;
//         totalArrears += invoice.arrears; // Include arrears from invoice
//         console.log(`[RentRecord] Tenant ${tenant.id}: Expected ${invoice.totalAmount}, Collected ${invoice.amountPaid}, Arrears ${invoice.arrears}`);
//       } else {
//         console.warn(`[RentRecord] No invoice found for tenant ${tenant.id} (${tenant.name}) in month ${billingMonth}`);
//       }
//     }

//     const collectionRate = totalRentExpected > 0 ? 
//       (totalRentCollected / totalRentExpected) * 100 : 0;

//     console.log(`[RentRecord] Totals - Expected: ${totalRentExpected}, Collected: ${totalRentCollected}, Arrears: ${totalArrears}, Rate: ${collectionRate.toFixed(2)}%`);

//     // Create record sheet
//     const sheetQuery = `
//       INSERT INTO rent_record_sheets (
//         property_id, billing_month, total_units, occupied_units,
//         total_rent_expected, total_rent_collected, total_arrears,
//         collection_rate
//       )
//       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
//     `;

//     const result = await database.db!.run(sheetQuery, [
//       propertyId,
//       billingMonth,
//       property.maxUnits,
//       occupiedUnits,
//       totalRentExpected,
//       totalRentCollected,
//       totalArrears,
//       collectionRate,
//     ]);

//     if (!result.changes || result.changes.changes === 0) {
//       console.error(`[RentRecord] Failed to insert record sheet - no changes made`);
//       throw new Error('Failed to create rent record sheet');
//     }

//     const recordSheetId = result.changes!.lastId!;
//     console.log(`[RentRecord] Created record sheet with ID: ${recordSheetId}`);

//     // Create entries for each tenant using fresh invoice data
//     let entriesCreated = 0;
//     for (const tenant of tenants) {
//       const invoice = invoices.find(inv => inv.tenantId === tenant.id);
      
//       let waterCharges = 0;
//       let powerCharges = 0;
//       let totalDue = tenant.rentAmount;
//       let amountPaid = 0;
//       let paymentStatus: 'paid' | 'partial' | 'unpaid' | 'overpaid' = 'unpaid';
//       let paymentDate: string | undefined;

//       if (invoice) {
//         waterCharges = (invoice.waterCurrentReading - invoice.waterPreviousReading) * 
//           invoice.waterUnitPrice + invoice.waterStandingFee;
//         powerCharges = (invoice.powerCurrentReading - invoice.powerPreviousReading) * 
//           invoice.powerUnitPrice;
//         totalDue = invoice.totalAmount;
//         amountPaid = invoice.amountPaid;
//         paymentDate = invoice.paidDate || undefined;

//         if (invoice.isPaid) {
//           paymentStatus = 'paid';
//         } else if (amountPaid > 0) {
//           paymentStatus = amountPaid > totalDue ? 'overpaid' : 'partial';
//         }
//       }

//       // Calculate balance including arrears
//       const balance = totalDue - amountPaid + (invoice?.arrears || 0);

//       try {
//         await this.addRentRecordEntry({
//           recordSheetId,
//           tenantId: tenant.id,
//           tenantName: tenant.name,
//           unitNumber: tenant.unitNumber || '',
//           rentAmount: tenant.rentAmount,
//           waterCharges,
//           powerCharges,
//           otherCharges: invoice?.otherCharges || 0,
//           totalDue,
//           amountPaid,
//           balance,
//           paymentStatus,
//           paymentDate
//         });
//         entriesCreated++;
//       } catch (entryError) {
//         console.error(`[RentRecord] Failed to create entry for tenant ${tenant.id}:`, entryError);
//         throw entryError;
//       }
//     }

//     console.log(`[RentRecord] Created ${entriesCreated} entries for record sheet ${recordSheetId}`);

//     const finalRecord = await this.getRentRecordWithDetails(recordSheetId);
//     console.log(`[RentRecord] Successfully generated record sheet ${recordSheetId} with ${finalRecord.entries.length} entries`);
    
//     return finalRecord;
//   } catch (error) {
//     console.error('[RentRecord] Error generating rent record sheet:', error);
//     console.error('[RentRecord] Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
//     throw error;
//   }
// }

// async getRentRecordWithDetails(recordSheetId: number): Promise<RentRecordWithDetails> {
//   const recordSheet = await this.getRentRecordById(recordSheetId);
//   if (!recordSheet) {
//     console.error(`[RentRecord] Record sheet ${recordSheetId} not found when fetching details`);
//     throw new Error('Rent record sheet not found');
//   }

//   const property = await database.getPropertyById(recordSheet.propertyId);
//   if (!property) {
//     console.error(`[RentRecord] Property ${recordSheet.propertyId} not found when fetching details`);
//     throw new Error('Property not found');
//   }

//   // Get fresh invoice data to ensure current state
//   const invoiceData = await this.getCurrentInvoiceData(recordSheet.propertyId, recordSheet.billingMonth);
  
//   // Recalculate record sheet totals with fresh data
//   let totalRentExpected = 0;
//   let totalRentCollected = 0;
//   let totalArrears = 0;

//   for (const invoice of invoiceData.invoices) {
//     totalRentExpected += invoice.totalAmount;
//     totalRentCollected += invoice.amountPaid;
//     totalArrears += invoice.arrears;
//   }

//   const collectionRate = totalRentExpected > 0 ? 
//     (totalRentCollected / totalRentExpected) * 100 : 0;

//   // Update record sheet with fresh totals
//   const updateQuery = `
//     UPDATE rent_record_sheets 
//     SET total_rent_expected = ?, total_rent_collected = ?, 
//         total_arrears = ?, collection_rate = ?, updated_at = CURRENT_TIMESTAMP
//     WHERE id = ?
//   `;

//   await database.db!.run(updateQuery, [
//     totalRentExpected,
//     totalRentCollected,
//     totalArrears,
//     collectionRate,
//     recordSheetId
//   ]);

//   // Get updated record sheet
//   const updatedRecordSheet = await this.getRentRecordById(recordSheetId);
//   if (!updatedRecordSheet) {
//     throw new Error('Failed to get updated record sheet');
//   }

//   const entries = await this.getRentRecordEntries(recordSheetId);
//   console.log(`[RentRecord] Retrieved ${entries.length} entries for record sheet ${recordSheetId}`);

//   // Calculate summary statistics
//   const onTimePayments = entries.filter(e => e.paymentStatus === 'paid' && 
//     e.paymentDate && new Date(e.paymentDate) <= new Date(`${updatedRecordSheet.billingMonth}-05`)).length;
//   const latePayments = entries.filter(e => e.paymentStatus === 'paid' && 
//     e.paymentDate && new Date(e.paymentDate) > new Date(`${updatedRecordSheet.billingMonth}-05`)).length;
//   const defaulters = entries.filter(e => e.paymentStatus === 'unpaid').length;

//   // Calculate average collection days (simplified)
//   let totalDays = 0;
//   let paidCount = 0;
//   for (const entry of entries) {
//     if (entry.paymentStatus === 'paid' && entry.paymentDate) {
//       const paymentDate = new Date(entry.paymentDate);
//       const monthStart = new Date(`${updatedRecordSheet.billingMonth}-01`);
//       const days = Math.ceil((paymentDate.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24));
//       totalDays += days;
//       paidCount++;
//     }
//   }

//   const averageCollectionDays = paidCount > 0 ? Math.round(totalDays / paidCount) : 0;

//   return {
//     ...updatedRecordSheet,
//     property,
//     entries,
//     summary: {
//       onTimePayments,
//       latePayments,
//       defaulters,
//       averageCollectionDays
//     }
//   };
// }







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

    const result = await database.db!.run(query, [
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

    if (!result.changes || result.changes.changes === 0) {
      console.error(`[RentRecord] Failed to insert entry for tenant ${entry.tenantId} - no changes made`);
      throw new Error(`Failed to create rent record entry for tenant ${entry.tenantId}`);
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