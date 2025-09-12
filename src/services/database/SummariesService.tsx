// SummariesService.tsx - Agent-Focused Business Summaries
import { database, type Property } from './Database';
import { reportsDatabase, type MonthlyTranscript } from './ReportsDatabase';

// ==================== TYPE INTERFACES ====================

export interface BusinessExpense {
  id: number;
  userId: number;
  companyId?: number;
  propertyId?: number;
  month: string;
  description: string;
  amount: number;
  category: 'office' | 'marketing' | 'maintenance' | 'utilities' | 'transport' | 'professional' | 'insurance' | 'software' | 'legal' | 'other';
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
  category: 'office' | 'marketing' | 'maintenance' | 'utilities' | 'transport' | 'professional' | 'insurance' | 'software' | 'legal' | 'other';
  isRecurring?: boolean;
  notes?: string;
}

// Commission Revenue Breakdown
export interface CommissionRevenue {
  propertyId: number;
  propertyName: string;
  grossRentCollected: number; // Base rent without deductions
  commissionRate: number;
  commissionAmount: number;
  occupancyRate: number;
  vacancyCount: number;
  totalUnits: number;
  occupiedUnits: number;
  averageRentPerUnit: number;
}

// Other Income from Deductions/Fees
export interface OtherIncomeRevenue {
  propertyId: number;
  propertyName: string;
  amount: number;
  source: string; // e.g., "Water charges", "Power charges", "Management fees"
  description?: string;
}

// Agent Business Summary
export interface AgentBusinessSummary {
  userId: number;
  companyId?: number;
  month: string;
  propertyFilter?: number;
  
  // Revenue Streams
  totalCommissionRevenue: number;
  totalOtherIncomeRevenue: number;
  totalGrossRevenue: number;
  
  // Commission Analysis
  averageCommissionRate: number;
  totalGrossRentManaged: number;
  
  // Portfolio Stats
  totalPropertiesManaged: number;
  totalUnitsManaged: number;
  totalOccupiedUnits: number;
  totalVacantUnits: number;
  portfolioOccupancyRate: number;
  
  // Expenses
  totalBusinessExpenses: number;
  
  // Net Income
  netIncome: number;
  profitMargin: number;
  
  // KPIs
  revenuePerProperty: number;
  revenuePerUnit: number;
  expenseRatio: number;
  
  // Detailed Breakdowns
  commissionBreakdown: CommissionRevenue[];
  otherIncomeBreakdown: OtherIncomeRevenue[];
  expenseBreakdown: ExpenseBreakdown[];
}

export interface ExpenseBreakdown {
  category: string;
  amount: number;
  itemCount: number;
  percentage: number;
}

// Profit & Loss Statement
export interface ProfitLossStatement {
  month: string;
  
  // Revenue
  revenue: {
    commissionIncome: number;
    otherIncome: number;
    totalRevenue: number;
  };
  
  // Operating Expenses
  operatingExpenses: {
    officeAdmin: number;
    marketing: number;
    professional: number;
    software: number;
    transport: number;
    utilities: number;
    legal: number;
    other: number;
    totalOperatingExpenses: number;
  };
  
  // Net Income
  grossProfit: number;
  netIncome: number;
  
  // Margins
  grossMargin: number;
  netMargin: number;
  
  // Key Ratios
  operatingExpenseRatio: number;
  revenueGrowthRate?: number; // If comparing to previous month
}

// Balance Sheet (Simplified for Agents)
export interface BalanceSheet {
  month: string;
  
  // Assets
  assets: {
    cashEquivalents: number; // Net income accumulated
    accountsReceivable: number; // Outstanding commissions
    totalCurrentAssets: number;
  };
  
  // Liabilities
  liabilities: {
    accountsPayable: number; // Unpaid expenses
    accruedExpenses: number;
    totalCurrentLiabilities: number;
  };
  
  // Equity
  equity: {
    retainedEarnings: number;
    currentPeriodEarnings: number;
    totalEquity: number;
  };
}

// Key Performance Indicators
export interface AgentKPIs {
  // Portfolio Management
  portfolioOccupancyRate: number;
  averageCommissionRate: number;
  propertiesUnderManagement: number;
  unitsUnderManagement: number;
  
  // Financial Performance
  monthlyRecurringRevenue: number; // MRR from commissions
  revenuePerProperty: number;
  revenuePerUnit: number;
  profitMargin: number;
  
  // Operational Efficiency
  expenseRatio: number;
  collectionRate: number;
  turnoverRate: number;
  
  // Growth Metrics
  revenueGrowthRate?: number;
  propertyGrowthRate?: number;
  unitGrowthRate?: number;
}

export interface SummaryFilters {
  month: string;
  propertyId?: number;
}

// ==================== AGENT SUMMARIES SERVICE ====================

export class SummariesService {

  // ==================== EXPENSE MANAGEMENT ====================

  async addBusinessExpense(userId: number, expense: BusinessExpenseInput): Promise<BusinessExpense> {
    try {
      const company = await database.getCompanyByUserId(userId);
      
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
      let query = `SELECT * FROM business_expenses WHERE user_id = ?`;
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

  // ==================== AGENT BUSINESS SUMMARY ====================

  async generateAgentSummary(userId: number, filters: SummaryFilters): Promise<AgentBusinessSummary> {
    try {
      const company = await database.getCompanyByUserId(userId);
      
      // Get properties based on filter
      let properties: Property[];
      if (filters.propertyId) {
        const property = await database.getPropertyById(filters.propertyId);
        properties = property && property.userId === userId ? [property] : [];
      } else {
        properties = await database.getProperties(userId);
      }

      if (properties.length === 0) {
        return this.getEmptyAgentSummary(userId, company?.id, filters);
      }

      // Get transcripts and expenses
      const transcripts = await this.getTranscriptsForSummary(properties, filters.month);
      const businessExpenses = await this.getBusinessExpenses(userId, { 
        month: filters.month,
        propertyId: filters.propertyId
      });

      // Generate commission breakdown
      const commissionBreakdown = await this.generateCommissionBreakdown(properties, transcripts);
      
      // Generate other income breakdown
      const otherIncomeBreakdown = await this.generateOtherIncomeBreakdown(properties, transcripts);
      
      // Generate expense breakdown
      const expenseBreakdown = this.generateExpenseBreakdown(businessExpenses);

      // Calculate totals
      const totalCommissionRevenue = commissionBreakdown.reduce((sum, item) => sum + item.commissionAmount, 0);
      const totalOtherIncomeRevenue = otherIncomeBreakdown.reduce((sum, item) => sum + item.amount, 0);
      const totalGrossRevenue = totalCommissionRevenue + totalOtherIncomeRevenue;
      const totalBusinessExpenses = businessExpenses.reduce((sum, exp) => sum + exp.amount, 0);
      const netIncome = totalGrossRevenue - totalBusinessExpenses;
      
      // Calculate portfolio stats
      const totalUnitsManaged = commissionBreakdown.reduce((sum, item) => sum + item.totalUnits, 0);
      const totalOccupiedUnits = commissionBreakdown.reduce((sum, item) => sum + item.occupiedUnits, 0);
      const totalVacantUnits = totalUnitsManaged - totalOccupiedUnits;
      const portfolioOccupancyRate = totalUnitsManaged > 0 ? (totalOccupiedUnits / totalUnitsManaged) * 100 : 0;
      
      // Calculate KPIs
      const averageCommissionRate = commissionBreakdown.length > 0 
        ? commissionBreakdown.reduce((sum, item) => sum + item.commissionRate, 0) / commissionBreakdown.length 
        : 0;
      
      const totalGrossRentManaged = commissionBreakdown.reduce((sum, item) => sum + item.grossRentCollected, 0);
      const profitMargin = totalGrossRevenue > 0 ? (netIncome / totalGrossRevenue) * 100 : 0;
      const revenuePerProperty = properties.length > 0 ? totalGrossRevenue / properties.length : 0;
      const revenuePerUnit = totalUnitsManaged > 0 ? totalGrossRevenue / totalUnitsManaged : 0;
      const expenseRatio = totalGrossRevenue > 0 ? (totalBusinessExpenses / totalGrossRevenue) * 100 : 0;

      return {
        userId,
        companyId: company?.id,
        month: filters.month,
        propertyFilter: filters.propertyId,
        
        // Revenue
        totalCommissionRevenue,
        totalOtherIncomeRevenue,
        totalGrossRevenue,
        
        // Commission Analysis
        averageCommissionRate,
        totalGrossRentManaged,
        
        // Portfolio Stats
        totalPropertiesManaged: properties.length,
        totalUnitsManaged,
        totalOccupiedUnits,
        totalVacantUnits,
        portfolioOccupancyRate,
        
        // Expenses
        totalBusinessExpenses,
        
        // Net Income
        netIncome,
        profitMargin,
        
        // KPIs
        revenuePerProperty,
        revenuePerUnit,
        expenseRatio,
        
        // Breakdowns
        commissionBreakdown,
        otherIncomeBreakdown,
        expenseBreakdown
      };
    } catch (error) {
      console.error('Error generating agent summary:', error);
      throw error;
    }
  }

  // ==================== FINANCIAL STATEMENTS ====================

  async generateProfitLossStatement(userId: number, filters: SummaryFilters): Promise<ProfitLossStatement> {
    try {
      const summary = await this.generateAgentSummary(userId, filters);
      const expenses = await this.getBusinessExpenses(userId, { month: filters.month });
      
      // Categorize expenses
      const expensesByCategory = expenses.reduce((acc, exp) => {
        acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
        return acc;
      }, {} as Record<string, number>);

      const revenue = {
        commissionIncome: summary.totalCommissionRevenue,
        otherIncome: summary.totalOtherIncomeRevenue,
        totalRevenue: summary.totalGrossRevenue
      };

      const operatingExpenses = {
        officeAdmin: expensesByCategory.office || 0,
        marketing: expensesByCategory.marketing || 0,
        professional: expensesByCategory.professional || 0,
        software: expensesByCategory.software || 0,
        transport: expensesByCategory.transport || 0,
        utilities: expensesByCategory.utilities || 0,
        legal: expensesByCategory.legal || 0,
        other: (expensesByCategory.maintenance || 0) + (expensesByCategory.insurance || 0) + (expensesByCategory.other || 0),
        totalOperatingExpenses: summary.totalBusinessExpenses
      };

      const grossProfit = revenue.totalRevenue - operatingExpenses.totalOperatingExpenses;
      const grossMargin = revenue.totalRevenue > 0 ? (grossProfit / revenue.totalRevenue) * 100 : 0;
      const netMargin = revenue.totalRevenue > 0 ? (summary.netIncome / revenue.totalRevenue) * 100 : 0;
      const operatingExpenseRatio = revenue.totalRevenue > 0 ? (operatingExpenses.totalOperatingExpenses / revenue.totalRevenue) * 100 : 0;

      return {
        month: filters.month,
        revenue,
        operatingExpenses,
        grossProfit,
        netIncome: summary.netIncome,
        grossMargin,
        netMargin,
        operatingExpenseRatio
      };
    } catch (error) {
      console.error('Error generating P&L statement:', error);
      throw error;
    }
  }

  async generateBalanceSheet(userId: number, filters: SummaryFilters): Promise<BalanceSheet> {
    try {
      const summary = await this.generateAgentSummary(userId, filters);
      
      // Get unpaid invoices (accounts receivable - outstanding commissions)
      let accountsReceivable = 0;
      const properties = filters.propertyId 
        ? [await database.getPropertyById(filters.propertyId)].filter(Boolean)
        : await database.getProperties(userId);
        
      for (const property of properties) {
        try {
          const unpaidInvoices = await database.getInvoices({
            propertyId: property!.id,
            isPaid: false
          });
          const unpaidCommissions = unpaidInvoices.reduce((sum, inv) => {
            return sum + (inv.rentAmount * (property!.agentCommissionRate / 100));
          }, 0);
          accountsReceivable += unpaidCommissions;
        } catch (error) {
          console.error(`Error calculating receivables for property ${property!.id}:`, error);
        }
      }

      // Get unpaid expenses (accounts payable)
      const unpaidExpenses = await this.getBusinessExpenses(userId, { 
        month: filters.month 
      });
      const accountsPayable = unpaidExpenses.reduce((sum, exp) => sum + exp.amount, 0);

      // Calculate accumulated earnings (simplified)
      const currentPeriodEarnings = summary.netIncome;
      const retainedEarnings = currentPeriodEarnings; // Simplified - would normally include previous periods

      const assets = {
        cashEquivalents: Math.max(0, summary.netIncome), // Positive net income as cash
        accountsReceivable,
        totalCurrentAssets: Math.max(0, summary.netIncome) + accountsReceivable
      };

      const liabilities = {
        accountsPayable,
        accruedExpenses: 0, // Could be calculated based on recurring expenses
        totalCurrentLiabilities: accountsPayable
      };

      const equity = {
        retainedEarnings,
        currentPeriodEarnings,
        totalEquity: retainedEarnings + currentPeriodEarnings
      };

      return {
        month: filters.month,
        assets,
        liabilities,
        equity
      };
    } catch (error) {
      console.error('Error generating balance sheet:', error);
      throw error;
    }
  }

  async generateKPIs(userId: number, filters: SummaryFilters): Promise<AgentKPIs> {
    try {
      const summary = await this.generateAgentSummary(userId, filters);
      
      // Calculate collection rate
      let collectionRate = 0;
      const properties = filters.propertyId 
        ? [await database.getPropertyById(filters.propertyId)].filter(Boolean)
        : await database.getProperties(userId);
        
      for (const property of properties) {
        try {
          const rentRecords = await reportsDatabase.getRentRecordsByProperty(property!.id, 1);
          const monthRecord = rentRecords.find(r => r.billingMonth === filters.month);
          if (monthRecord) {
            collectionRate += monthRecord.collectionRate;
          }
        } catch (error) {
          console.error(`Error getting collection rate for property ${property!.id}:`, error);
        }
      }
      collectionRate = properties.length > 0 ? collectionRate / properties.length : 0;

      // Calculate turnover rate (simplified)
      const turnoverRate = 0; // Would need tenant move-in/move-out data

      return {
        // Portfolio Management
        portfolioOccupancyRate: summary.portfolioOccupancyRate,
        averageCommissionRate: summary.averageCommissionRate,
        propertiesUnderManagement: summary.totalPropertiesManaged,
        unitsUnderManagement: summary.totalUnitsManaged,
        
        // Financial Performance
        monthlyRecurringRevenue: summary.totalCommissionRevenue,
        revenuePerProperty: summary.revenuePerProperty,
        revenuePerUnit: summary.revenuePerUnit,
        profitMargin: summary.profitMargin,
        
        // Operational Efficiency
        expenseRatio: summary.expenseRatio,
        collectionRate,
        turnoverRate
      };
    } catch (error) {
      console.error('Error generating KPIs:', error);
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

  private async generateCommissionBreakdown(properties: Property[], transcripts: MonthlyTranscript[]): Promise<CommissionRevenue[]> {
    const breakdown: CommissionRevenue[] = [];

    for (const property of properties) {
      const transcript = transcripts.find(t => t.propertyId === property.id);
      
      let grossRentCollected = 0;
      let commissionAmount = 0;
      let occupancyRate = 0;
      let occupiedUnits = 0;
      let totalUnits = property.maxUnits;

      if (transcript) {
        grossRentCollected = transcript.grossRentCollected;
        commissionAmount = transcript.agentCommission;
        
        // Get occupancy from rent records
        try {
          const rentRecords = await reportsDatabase.getRentRecordsByProperty(property.id, 1);
          const monthRecord = rentRecords.find(r => r.billingMonth === transcript.billingMonth);
          if (monthRecord) {
            occupancyRate = monthRecord.totalUnits > 0 ? (monthRecord.occupiedUnits / monthRecord.totalUnits) * 100 : 0;
            occupiedUnits = monthRecord.occupiedUnits;
            totalUnits = monthRecord.totalUnits;
          }
        } catch (error) {
          console.error(`Error getting occupancy for property ${property.id}:`, error);
        }
      }

      const vacancyCount = totalUnits - occupiedUnits;
      const averageRentPerUnit = occupiedUnits > 0 ? grossRentCollected / occupiedUnits : 0;

      breakdown.push({
        propertyId: property.id,
        propertyName: property.name,
        grossRentCollected,
        commissionRate: property.agentCommissionRate,
        commissionAmount,
        occupancyRate,
        vacancyCount,
        totalUnits,
        occupiedUnits,
        averageRentPerUnit
      });
    }

    return breakdown;
  }



  private async generateOtherIncomeBreakdown(properties: Property[], transcripts: MonthlyTranscript[]): Promise<OtherIncomeRevenue[]> {
    const breakdown: OtherIncomeRevenue[] = [];

    for (const property of properties) {
      const transcript = transcripts.find(t => t.propertyId === property.id);
      
      if (transcript) {
        // Water charges
        // if (transcript.totalWaterCharges > 0) {
        //   breakdown.push({
        //     propertyId: property.id,
        //     propertyName: property.name,
        //     amount: transcript.totalWaterCharges,
        //     source: "Water charges",
        //     description: "Water utility management fees"
        //   });
        // }

        // // Power charges
        // if (transcript.totalPowerCharges > 0) {
        //   breakdown.push({
        //     propertyId: property.id,
        //     propertyName: property.name,
        //     amount: transcript.totalPowerCharges,
        //     source: "Power charges",
        //     description: "Power utility management fees"
        //   });
        // }

        // Other charges
        if (transcript.totalOtherCharges > 0) {
          breakdown.push({
            propertyId: property.id,
            propertyName: property.name,
            amount: transcript.totalOtherCharges,
            source: "Other charges",
            description: "Additional management fees"
          });
        }
      }
    }

    return breakdown;
  }

  private generateExpenseBreakdown(businessExpenses: BusinessExpense[]): ExpenseBreakdown[] {
    const totalExpenses = businessExpenses.reduce((sum, e) => sum + e.amount, 0);
    
    if (totalExpenses === 0) return [];

    const categoryMap = new Map<string, { amount: number; count: number }>();
    
    businessExpenses.forEach(expense => {
      const existing = categoryMap.get(expense.category) || { amount: 0, count: 0 };
      categoryMap.set(expense.category, {
        amount: existing.amount + expense.amount,
        count: existing.count + 1
      });
    });

    return Array.from(categoryMap.entries()).map(([category, data]) => ({
      category,
      amount: data.amount,
      itemCount: data.count,
      percentage: (data.amount / totalExpenses) * 100
    }));
  }

  private getEmptyAgentSummary(userId: number, companyId?: number, filters?: SummaryFilters): AgentBusinessSummary {
    return {
      userId,
      companyId,
      month: filters?.month || '',
      propertyFilter: filters?.propertyId,
      totalCommissionRevenue: 0,
      totalOtherIncomeRevenue: 0,
      totalGrossRevenue: 0,
      averageCommissionRate: 0,
      totalGrossRentManaged: 0,
      totalPropertiesManaged: 0,
      totalUnitsManaged: 0,
      totalOccupiedUnits: 0,
      totalVacantUnits: 0,
      portfolioOccupancyRate: 0,
      totalBusinessExpenses: 0,
      netIncome: 0,
      profitMargin: 0,
      revenuePerProperty: 0,
      revenuePerUnit: 0,
      expenseRatio: 0,
      commissionBreakdown: [],
      otherIncomeBreakdown: [],
      expenseBreakdown: []
    };
  }

  // ==================== UTILITY METHODS ====================

  async getExpenseCategories(): Promise<string[]> {
    return ['office', 'marketing', 'maintenance', 'utilities', 'transport', 'professional', 'insurance', 'software', 'legal', 'other'];
  }

  async getMonthlyTrends(userId: number, months: number = 12): Promise<Array<{
    month: string;
    commissionRevenue: number;
    otherIncome: number;
    totalRevenue: number;
    expenses: number;
    netIncome: number;
    profitMargin: number;
    occupancyRate: number;
  }>> {
    const trends = [];
    const currentDate = new Date();
    
    for (let i = 0; i < months; i++) {
      const targetDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const month = `${targetDate.getFullYear()}-${(targetDate.getMonth() + 1).toString().padStart(2, '0')}`;
      
      try {
        const summary = await this.generateAgentSummary(userId, { month });
        
        trends.push({
          month,
          commissionRevenue: summary.totalCommissionRevenue,
          otherIncome: summary.totalOtherIncomeRevenue,
          totalRevenue: summary.totalGrossRevenue,
          expenses: summary.totalBusinessExpenses,
          netIncome: summary.netIncome,
          profitMargin: summary.profitMargin,
          occupancyRate: summary.portfolioOccupancyRate
        });
      } catch (error) {
        console.error(`Error getting trend data for ${month}:`, error);
        trends.push({
          month,
          commissionRevenue: 0,
          otherIncome: 0,
          totalRevenue: 0,
          expenses: 0,
          netIncome: 0,
          profitMargin: 0,
          occupancyRate: 0
        });
      }
    }
    
    return trends.reverse();
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

export const summariesService = new SummariesService();