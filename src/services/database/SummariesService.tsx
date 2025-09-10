// SummariesService.tsx - Monthly Business Summaries for Property Management
import { database, type Property } from './Database';
import { reportsDatabase, type MonthlyTranscript } from './ReportsDatabase';

// ==================== TYPE INTERFACES ====================

export interface BusinessExpense {
  id: number;
  userId: number;
  companyId?: number;
  propertyId?: number; // null for general business expenses
  month: string; // YYYY-MM format
  description: string;
  amount: number;
  category: 'office' | 'marketing' | 'maintenance' | 'utilities' | 'transport' | 'professional' | 'insurance' | 'other';
  isRecurring: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessExpenseInput {
  propertyId?: number;
  month: string;
  description: string;
  amount: number;
  category: 'office' | 'marketing' | 'maintenance' | 'utilities' | 'transport' | 'professional' | 'insurance' | 'other';
  isRecurring?: boolean;
  notes?: string;
}

export interface MonthlySummary {
  userId: number;
  companyId?: number;
  month: string;
  reportType: 'rent-based' | 'commission-based';
  propertyFilter?: number; // null = all properties
  
  // Income Data
  grossRentIncome: number;
  totalCommissionIncome: number;
  otherIncome: number; // From transcript additional items
  grossIncome: number;
  
  // Commission Analysis (for agencies)
  averageCommissionRate: number;
  totalPropertiesManaged: number;
  totalUnitsManaged: number;
  
  // Deductions from Transcripts (agency operational costs)
  totalDeductibles: number;
  
  // User-added Business Expenses
  totalBusinessExpenses: number;
  
  // Net Calculations
  netRentalIncome: number; // Gross Rent - Property-specific expenses
  netCommissionIncome: number; // Total Commission - Business expenses - Deductibles
  netIncome: number; // Final bottom line
  
  // Property Performance
  occupancyRate: number;
  collectionRate: number;
  
  // Breakdown Data
  propertyBreakdown: PropertySummary[];
  expenseBreakdown: ExpenseSummary[];
}

export interface PropertySummary {
  propertyId: number;
  propertyName: string;
  rentIncome: number;
  commissionIncome: number;
  deductibles: number;
  expenses: number; // Property-specific expenses only
  netIncome: number;
  occupancyRate: number;
  collectionRate: number;
  unitsManaged: number;
}

export interface ExpenseSummary {
  category: string;
  amount: number;
  itemCount: number;
  percentage: number; // Of total expenses
}

export interface PLReport {
  month: string;
  reportType: 'rent-based' | 'commission-based';
  
  // Revenue
  revenue: {
    rentIncome: number;
    commissionIncome: number;
    otherIncome: number;
    totalRevenue: number;
  };
  
  // Operating Expenses
  operatingExpenses: {
    propertyExpenses: number;
    businessExpenses: number;
    deductibles: number;
    totalOperatingExpenses: number;
  };
  
  // Profitability
  grossProfit: number;
  netProfit: number;
  profitMargin: number; // Percentage
  
  // Key Metrics
  metrics: {
    revenuePerProperty: number;
    expenseRatio: number; // Total expenses / Total revenue
    averageCommissionRate: number;
    propertiesCount: number;
  };
}

export interface SummaryFilters {
  month: string;
  propertyId?: number; // null = all properties
  reportType: 'rent-based' | 'commission-based';
  includeRecurringExpenses?: boolean;
}

// ==================== SUMMARIES SERVICE ====================

export class SummariesService {

  // ==================== EXPENSE MANAGEMENT ====================

  async addBusinessExpense(userId: number, expense: BusinessExpenseInput): Promise<BusinessExpense> {
    try {
      // Get company ID if user has one
      const company = await database.getCompanyByUserId(userId);
      
      // Validate property access if specified
      if (expense.propertyId) {
        const property = await database.getPropertyById(expense.propertyId);
        if (!property || property.userId !== userId || property.isRestricted) {
          throw new Error('Property not found or access denied');
        }
      }

      const query = `
        INSERT INTO business_expenses (
          user_id, company_id, property_id, month, description, 
          amount, category, is_recurring, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const result = await database.db!.run(query, [
        userId,
        company?.id || null,
        expense.propertyId || null,
        expense.month,
        expense.description,
        expense.amount,
        expense.category,
        expense.isRecurring ? 1 : 0,
        expense.notes || ''
      ]);

      return await this.getBusinessExpenseById(result.changes!.lastId!);
    } catch (error) {
      console.error('Error adding business expense:', error);
      throw error;
    }
  }

  async getBusinessExpenses(userId: number, filters: {
    month?: string;
    propertyId?: number;
    category?: string;
  } = {}): Promise<BusinessExpense[]> {
    try {
      let query = `
        SELECT * FROM business_expenses 
        WHERE user_id = ?
      `;
      //const params = [userId];
      const params: (string | number)[] = [userId];

      if (filters.month) {
        query += ` AND month = ?`;
        params.push(filters.month);
      }

      if (filters.propertyId !== undefined) {
        if (filters.propertyId === null) {
          query += ` AND property_id IS NULL`;
        } else {
          query += ` AND property_id = ?`;
          params.push(filters.propertyId);
        }
      }

      if (filters.category) {
        query += ` AND category = ?`;
        params.push(filters.category);
      }

      query += ` ORDER BY month DESC, created_at DESC`;

      const result = await database.db!.query(query, params);
      return this.mapToBusinessExpenses(result.values || []);
    } catch (error) {
      console.error('Error getting business expenses:', error);
      return [];
    }
  }

  async updateBusinessExpense(id: number, updates: Partial<BusinessExpenseInput>): Promise<void> {
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
    if (updates.category !== undefined) {
      fields.push('category = ?');
      values.push(updates.category);
    }
    if (updates.isRecurring !== undefined) {
      fields.push('is_recurring = ?');
      values.push(updates.isRecurring ? 1 : 0);
    }
    if (updates.notes !== undefined) {
      fields.push('notes = ?');
      values.push(updates.notes);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const query = `UPDATE business_expenses SET ${fields.join(', ')} WHERE id = ?`;
    await database.db!.run(query, values);
  }

  async deleteBusinessExpense(id: number): Promise<void> {
    await database.db!.run('DELETE FROM business_expenses WHERE id = ?', [id]);
  }

  // ==================== MONTHLY SUMMARY GENERATION ====================

  async generateMonthlySummary(userId: number, filters: SummaryFilters): Promise<MonthlySummary> {
    try {
      // Get user company to determine if this is an agency
      const company = await database.getCompanyByUserId(userId);
      const isAgency = !!company;

      // Get properties based on filter
      let properties: Property[];
      if (filters.propertyId) {
        const property = await database.getPropertyById(filters.propertyId);
        properties = property && property.userId === userId ? [property] : [];
      } else {
        properties = await database.getProperties(userId);
      }

      if (properties.length === 0) {
        return this.getEmptySummary(userId, company?.id, filters);
      }

      // Get transcripts for the month
      const transcripts = await this.getTranscriptsForSummary(properties, filters.month);
      
      // Get business expenses
      const businessExpenses = await this.getBusinessExpenses(userId, { 
        month: filters.month,
        propertyId: filters.propertyId
      });

      // Calculate income based on report type and agency status
      const incomeData = await this.calculateIncomeData(
        transcripts, 
        properties, 
        filters.month, 
        isAgency, 
        filters.reportType
      );

      // Calculate expenses
      const expenseData = this.calculateExpenseData(transcripts, businessExpenses);

      // Calculate property performance
      const performanceData = await this.calculatePerformanceData(properties, filters.month);

      // Generate property breakdowns
      const propertyBreakdown = await this.generatePropertyBreakdown(
        properties, 
        transcripts, 
        businessExpenses, 
        filters.reportType
      );

      // Generate expense breakdown
      const expenseBreakdown = this.generateExpenseBreakdown(businessExpenses, expenseData.totalDeductibles);

      // Calculate net income based on report type
      let netIncome: number;
      let netRentalIncome: number;
      let netCommissionIncome: number;

      if (filters.reportType === 'commission-based' && isAgency) {
        netCommissionIncome = incomeData.totalCommissionIncome - expenseData.totalBusinessExpenses - expenseData.totalDeductibles;
        netRentalIncome = 0; // Not relevant for commission-based
        netIncome = netCommissionIncome + incomeData.otherIncome;
      } else {
        // Rent-based or non-agency
        netRentalIncome = incomeData.grossRentIncome - expenseData.totalBusinessExpenses;
        netCommissionIncome = incomeData.totalCommissionIncome - expenseData.totalDeductibles;
        netIncome = netRentalIncome + netCommissionIncome + incomeData.otherIncome;
      }

      return {
        userId,
        companyId: company?.id,
        month: filters.month,
        reportType: filters.reportType,
        propertyFilter: filters.propertyId,
        
        // Income
        grossRentIncome: incomeData.grossRentIncome,
        totalCommissionIncome: incomeData.totalCommissionIncome,
        otherIncome: incomeData.otherIncome,
        grossIncome: incomeData.grossRentIncome + incomeData.totalCommissionIncome + incomeData.otherIncome,
        
        // Commission analysis
        averageCommissionRate: incomeData.averageCommissionRate,
        totalPropertiesManaged: properties.length,
        totalUnitsManaged: performanceData.totalUnits,
        
        // Expenses
        totalDeductibles: expenseData.totalDeductibles,
        totalBusinessExpenses: expenseData.totalBusinessExpenses,
        
        // Net calculations
        netRentalIncome,
        netCommissionIncome,
        netIncome,
        
        // Performance
        occupancyRate: performanceData.occupancyRate,
        collectionRate: performanceData.collectionRate,
        
        // Breakdowns
        propertyBreakdown,
        expenseBreakdown
      };
    } catch (error) {
      console.error('Error generating monthly summary:', error);
      throw error;
    }
  }

  // ==================== P&L REPORT GENERATION ====================

  async generatePLReport(userId: number, filters: SummaryFilters): Promise<PLReport> {
    try {
      const summary = await this.generateMonthlySummary(userId, filters);
      
      const revenue = {
        rentIncome: summary.grossRentIncome,
        commissionIncome: summary.totalCommissionIncome,
        otherIncome: summary.otherIncome,
        totalRevenue: summary.grossIncome
      };

      const operatingExpenses = {
        propertyExpenses: summary.propertyBreakdown.reduce((sum, p) => sum + p.expenses, 0),
        businessExpenses: summary.totalBusinessExpenses,
        deductibles: summary.totalDeductibles,
        totalOperatingExpenses: summary.totalBusinessExpenses + summary.totalDeductibles
      };

      const grossProfit = revenue.totalRevenue - operatingExpenses.totalOperatingExpenses;
      const profitMargin = revenue.totalRevenue > 0 ? (grossProfit / revenue.totalRevenue) * 100 : 0;

      return {
        month: filters.month,
        reportType: filters.reportType,
        revenue,
        operatingExpenses,
        grossProfit,
        netProfit: grossProfit, // Same as gross profit in this simplified model
        profitMargin,
        metrics: {
          revenuePerProperty: summary.totalPropertiesManaged > 0 ? 
            revenue.totalRevenue / summary.totalPropertiesManaged : 0,
          expenseRatio: revenue.totalRevenue > 0 ? 
            (operatingExpenses.totalOperatingExpenses / revenue.totalRevenue) * 100 : 0,
          averageCommissionRate: summary.averageCommissionRate,
          propertiesCount: summary.totalPropertiesManaged
        }
      };
    } catch (error) {
      console.error('Error generating P&L report:', error);
      throw error;
    }
  }

  // ==================== PRIVATE HELPER METHODS ====================

  private async getTranscriptsForSummary(properties: Property[], month: string): Promise<MonthlyTranscript[]> {
    const transcripts: MonthlyTranscript[] = [];
    
    for (const property of properties) {
      try {
        const propertyTranscripts = await reportsDatabase.getTranscriptsByProperty(property.id, 1);
        const monthTranscript = propertyTranscripts.find(t => t.billingMonth === month);
        if (monthTranscript) {
          transcripts.push(monthTranscript);
        }
      } catch (error) {
        console.error(`Error getting transcripts for property ${property.id}:`, error);
      }
    }
    
    return transcripts;
  }

  private async calculateIncomeData(
    transcripts: MonthlyTranscript[], 
    properties: Property[], 
    month: string, 
    _isAgency: boolean, 
    _reportType: string
  ) {
    let grossRentIncome = 0;
    let totalCommissionIncome = 0;
    let otherIncome = 0;
    let totalCommissionRate = 0;
    let propertiesWithCommission = 0;

    // Get income from transcripts
    for (const transcript of transcripts) {
      grossRentIncome += transcript.grossRentCollected;
      totalCommissionIncome += transcript.agentCommission;
      otherIncome += transcript.totalWaterCharges + transcript.totalPowerCharges + transcript.totalOtherCharges;
      
      if (transcript.agentCommissionRate > 0) {
        totalCommissionRate += transcript.agentCommissionRate;
        propertiesWithCommission++;
      }
    }

    // If no transcripts, fall back to direct invoice data
    if (transcripts.length === 0) {
      for (const property of properties) {
        try {
          const invoices = await database.getInvoices({
            propertyId: property.id,
            billingMonth: month,
            isPaid: true
          });

          const propertyRentIncome = invoices.reduce((sum, inv) => sum + inv.rentAmount, 0);
          const propertyCommission = propertyRentIncome * (property.agentCommissionRate / 100);
          const propertyOtherIncome = invoices.reduce((sum, inv) => {
            const waterAmount = (inv.waterCurrentReading - inv.waterPreviousReading) * inv.waterUnitPrice + inv.waterStandingFee;
            const powerAmount = (inv.powerCurrentReading - inv.powerPreviousReading) * inv.powerUnitPrice;
            return sum + waterAmount + powerAmount + inv.otherCharges;
          }, 0);

          grossRentIncome += propertyRentIncome;
          totalCommissionIncome += propertyCommission;
          otherIncome += propertyOtherIncome;
          
          if (property.agentCommissionRate > 0) {
            totalCommissionRate += property.agentCommissionRate;
            propertiesWithCommission++;
          }
        } catch (error) {
          console.error(`Error calculating income for property ${property.id}:`, error);
        }
      }
    }

    const averageCommissionRate = propertiesWithCommission > 0 ? 
      totalCommissionRate / propertiesWithCommission : 0;

    return {
      grossRentIncome,
      totalCommissionIncome,
      otherIncome,
      averageCommissionRate
    };
  }

  private calculateExpenseData(transcripts: MonthlyTranscript[], businessExpenses: BusinessExpense[]) {
    const totalDeductibles = transcripts.reduce((sum, t) => sum + t.totalDeductibles, 0);
    const totalBusinessExpenses = businessExpenses.reduce((sum, e) => sum + e.amount, 0);

    return {
      totalDeductibles,
      totalBusinessExpenses
    };
  }

  private async calculatePerformanceData(properties: Property[], month: string) {
    let totalUnits = 0;
    let occupiedUnits = 0;
    let totalExpected = 0;
    let totalCollected = 0;

    for (const property of properties) {
      try {
        const rentRecords = await reportsDatabase.getRentRecordsByProperty(property.id, 1);
        const monthRecord = rentRecords.find(r => r.billingMonth === month);
        
        if (monthRecord) {
          totalUnits += monthRecord.totalUnits;
          occupiedUnits += monthRecord.occupiedUnits;
          totalExpected += monthRecord.totalRentExpected;
          totalCollected += monthRecord.totalRentCollected;
        } else {
          // Fallback to property max units
          totalUnits += property.maxUnits;
          const tenants = await database.getTenantsByProperty(property.id);
          occupiedUnits += tenants.filter(t => t.isActive).length;
        }
      } catch (error) {
        console.error(`Error calculating performance for property ${property.id}:`, error);
      }
    }

    const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;
    const collectionRate = totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0;

    return {
      totalUnits,
      occupancyRate,
      collectionRate
    };
  }

  private async generatePropertyBreakdown(
    properties: Property[], 
    transcripts: MonthlyTranscript[], 
    businessExpenses: BusinessExpense[], 
    reportType: string
  ): Promise<PropertySummary[]> {
    const breakdown: PropertySummary[] = [];

    for (const property of properties) {
      const transcript = transcripts.find(t => t.propertyId === property.id);
      const propertyExpenses = businessExpenses
        .filter(e => e.propertyId === property.id)
        .reduce((sum, e) => sum + e.amount, 0);

      const rentIncome = transcript?.grossRentCollected || 0;
      const commissionIncome = transcript?.agentCommission || 0;
      const deductibles = transcript?.totalDeductibles || 0;

      let netIncome: number;
      if (reportType === 'commission-based') {
        netIncome = commissionIncome - propertyExpenses - deductibles;
      } else {
        netIncome = rentIncome + commissionIncome - propertyExpenses - deductibles;
      }

      // Get occupancy and collection rates
      let occupancyRate = 0;
      let collectionRate = 0;
      try {
        const rentRecords = await reportsDatabase.getRentRecordsByProperty(property.id, 1);
        const monthRecord = rentRecords.find(r => r.billingMonth === transcript?.billingMonth);
        if (monthRecord) {
          occupancyRate = monthRecord.totalUnits > 0 ? 
            (monthRecord.occupiedUnits / monthRecord.totalUnits) * 100 : 0;
          collectionRate = monthRecord.collectionRate;
        }
      } catch (error) {
        console.error(`Error getting rates for property ${property.id}:`, error);
      }

      breakdown.push({
        propertyId: property.id,
        propertyName: property.name,
        rentIncome,
        commissionIncome,
        deductibles,
        expenses: propertyExpenses,
        netIncome,
        occupancyRate,
        collectionRate,
        unitsManaged: property.maxUnits
      });
    }

    return breakdown;
  }

  private generateExpenseBreakdown(businessExpenses: BusinessExpense[], totalDeductibles: number): ExpenseSummary[] {
    const totalExpenses = businessExpenses.reduce((sum, e) => sum + e.amount, 0) + totalDeductibles;
    
    if (totalExpenses === 0) return [];

    // Group by category
    const categoryMap = new Map<string, { amount: number; count: number }>();
    
    businessExpenses.forEach(expense => {
      const existing = categoryMap.get(expense.category) || { amount: 0, count: 0 };
      categoryMap.set(expense.category, {
        amount: existing.amount + expense.amount,
        count: existing.count + 1
      });
    });

    // Add deductibles if any
    if (totalDeductibles > 0) {
      categoryMap.set('deductibles', { amount: totalDeductibles, count: 1 });
    }

    return Array.from(categoryMap.entries()).map(([category, data]) => ({
      category,
      amount: data.amount,
      itemCount: data.count,
      percentage: (data.amount / totalExpenses) * 100
    }));
  }

  private getEmptySummary(userId: number, companyId?: number, filters?: SummaryFilters): MonthlySummary {
    return {
      userId,
      companyId,
      month: filters?.month || '',
      reportType: filters?.reportType || 'rent-based',
      propertyFilter: filters?.propertyId,
      grossRentIncome: 0,
      totalCommissionIncome: 0,
      otherIncome: 0,
      grossIncome: 0,
      averageCommissionRate: 0,
      totalPropertiesManaged: 0,
      totalUnitsManaged: 0,
      totalDeductibles: 0,
      totalBusinessExpenses: 0,
      netRentalIncome: 0,
      netCommissionIncome: 0,
      netIncome: 0,
      occupancyRate: 0,
      collectionRate: 0,
      propertyBreakdown: [],
      expenseBreakdown: []
    };
  }

  // ==================== UTILITY METHODS ====================

  async getExpenseCategories(): Promise<string[]> {
    return ['office', 'marketing', 'maintenance', 'utilities', 'transport', 'professional', 'insurance', 'other'];
  }

  async getMonthlyTrends(userId: number, months: number = 12): Promise<Array<{
    month: string;
    rentIncome: number;
    commissionIncome: number;
    expenses: number;
    netIncome: number;
    profitMargin: number;
  }>> {
    const trends: Array<{
      month: string;
      rentIncome: number;
      commissionIncome: number;
      expenses: number;
      netIncome: number;
      profitMargin: number;
    }> = [];

    const currentDate = new Date();
    
    for (let i = 0; i < months; i++) {
      const targetDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const month = `${targetDate.getFullYear()}-${(targetDate.getMonth() + 1).toString().padStart(2, '0')}`;
      
      try {
        const summary = await this.generateMonthlySummary(userId, {
          month,
          reportType: 'rent-based'
        });
        
        const grossIncome = summary.grossIncome;
        const totalExpenses = summary.totalBusinessExpenses + summary.totalDeductibles;
        const profitMargin = grossIncome > 0 ? (summary.netIncome / grossIncome) * 100 : 0;
        
        trends.push({
          month,
          rentIncome: summary.grossRentIncome,
          commissionIncome: summary.totalCommissionIncome,
          expenses: totalExpenses,
          netIncome: summary.netIncome,
          profitMargin
        });
      } catch (error) {
        console.error(`Error getting trend data for ${month}:`, error);
        trends.push({
          month,
          rentIncome: 0,
          commissionIncome: 0,
          expenses: 0,
          netIncome: 0,
          profitMargin: 0
        });
      }
    }
    
    return trends.reverse(); // Oldest first
  }

  // ==================== PRIVATE MAPPING METHODS ====================

  private async getBusinessExpenseById(id: number): Promise<BusinessExpense> {
    const query = 'SELECT * FROM business_expenses WHERE id = ?';
    const result = await database.db!.query(query, [id]);
    
    if (result.values && result.values.length > 0) {
      return this.mapToBusinessExpense(result.values[0]);
    }
    throw new Error('Business expense not found');
  }

  private mapToBusinessExpense(row: any): BusinessExpense {
    return {
      id: row.id,
      userId: row.user_id,
      companyId: row.company_id,
      propertyId: row.property_id,
      month: row.month,
      description: row.description,
      amount: row.amount,
      category: row.category,
      isRecurring: Boolean(row.is_recurring),
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapToBusinessExpenses(rows: any[]): BusinessExpense[] {
    return rows.map(row => this.mapToBusinessExpense(row));
  }
}

// ==================== DATABASE SCHEMA ADDITIONS ====================
// Add these to your Database.tsx createTables() method:

/*
CREATE TABLE IF NOT EXISTS business_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  company_id INTEGER,
  property_id INTEGER,
  month TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('office', 'marketing', 'maintenance', 'utilities', 'transport', 'professional', 'insurance', 'other')),
  is_recurring INTEGER DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
);
*/

// Add these to your Database.tsx createIndexes() method:

/*
'CREATE INDEX IF NOT EXISTS idx_business_expenses_user_month ON business_expenses(user_id, month)',
'CREATE INDEX IF NOT EXISTS idx_business_expenses_property_month ON business_expenses(property_id, month)',
'CREATE INDEX IF NOT EXISTS idx_business_expenses_category ON business_expenses(category)',
'CREATE INDEX IF NOT EXISTS idx_business_expenses_recurring ON business_expenses(is_recurring)'
*/

// ==================== SINGLETON INSTANCE ====================
export const summariesService = new SummariesService();