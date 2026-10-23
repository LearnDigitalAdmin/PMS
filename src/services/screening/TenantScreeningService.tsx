// services/screening/TenantScreeningService.ts
import { 
  getFirestore, 
  doc, 
  setDoc, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';
import { database } from '../database/Database';
import type { Invoice, Tenant } from '../database/Database';
import { initializeApp } from 'firebase/app';
import { firebaseSyncService } from '../database/FirebaseSync';

const firebaseConfig = {
  apiKey: "AIzaSyD1hg7YLv08vyR2kSWi2ymxSu2pYCRwPq8",
  authDomain: "plot-9fd6e.firebaseapp.com",
  projectId: "plot-9fd6e",
  storageBucket: "plot-9fd6e.firebasestorage.app",
  messagingSenderId: "1037620305589",
  appId: "1:1037620305589:web:2672a7dcaeca4c46b068fc",
  measurementId: "G-B90H3GJFPM"
};

const app = initializeApp(firebaseConfig);

// Initialize Firestore (reuse from FirebaseSync)
const db = getFirestore(app);

interface MonthlyRecord {
  billingMonth: string;
  rentAmount: number;
  totalBilled: number;
  amountPaid: number;
  arrears: number;
  dueDate: Date | null;
  paidDate: Date | null;
  // partial = due date passed with only part of the bill paid; pending = not yet due (kept for display, never scored)
  paymentStatus: 'early' | 'on_time' | 'late' | 'partial' | 'unpaid' | 'pending';
  daysLate: number;
  paidRatio: number;     // amountPaid / totalBilled, 0..1
  outstanding: number;   // balance still owed for the month
  invoiceCount: number;
  hadMultipleInvoices: boolean;
}

interface ScreeningResult {
  screening_score: number;
  on_time_payment_rate: number;
  total_arrears: number;
}

// interface CalculatedMetrics {
//   onTimePaymentRate: number;
//   earlyPaymentRate: number;
//   latePaymentRate: number;
//   averageDaysLate: number;
//   maxDaysLate: number;
//   averageMonthlyArrears: number;
//   maxMonthlyArrears: number;
//   totalArrearsAccumulated: number;
//   paymentCompletionRate: number;
//   rentStability: boolean;
//   hadRentIncreases: boolean;
//   averageMonthlyBilled: number;
//   paymentVariability: number;
//   hasUnpaidInvoices: boolean;
//   unpaidInvoiceCount: number;
//   longestNonPaymentStreak: number;
//   improvingTrend: boolean;
//   screeningScore: number;
//   riskLevel: 'low' | 'medium' | 'high';
// }

// interface ScreeningData {
//   tenantId: number;
//   tenantName: string;
//   tenantPhone: string;
//   tenantEmail: string;
//   currentPropertyId: number;
//   currentUnitNumber: string;
//   currentRentAmount: number;
//   paymentHistory: {
//     totalMonthsTracked: number;
//     monthlyRecords: MonthlyRecord[];
//   };
//   calculatedMetrics: CalculatedMetrics;
//   dataQuality: {
//     monthsWithCompleteData: number;
//     hasRecentData: boolean;
//     dataConfidenceScore: number;
//     lastInvoiceDate: Date | null;
//     oldestInvoiceDate: Date | null;
//   };
//   lastUpdated: Date;
//   lastMiningRun: Date;
//   sourceUserId: number;
//   dataVersion: number;
// }

// ADD these new fields to existing CalculatedMetrics interface
interface CalculatedMetrics {
  onTimePaymentRate: number;
  earlyPaymentRate: number;
  latePaymentRate: number;
  averageDaysLate: number;
  maxDaysLate: number;
  averageMonthlyArrears: number;
  maxMonthlyArrears: number;
  totalArrearsAccumulated: number;
  paymentCompletionRate: number;
  rentStability: boolean;
  hadRentIncreases: boolean;
  averageMonthlyBilled: number;
  paymentVariability: number;
  hasUnpaidInvoices: boolean;
  unpaidInvoiceCount: number;
  longestNonPaymentStreak: number;
  improvingTrend: boolean;
  screeningScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  
  // NEW v1.1 - Payment Pattern Analysis
  paymentConsistencyScore?: number;
  preferredPaymentDay?: number;
  averagePaymentDelay?: number;
  paymentReliabilityTrend?: 'improving' | 'stable' | 'declining';
  
  // NEW v1.1 - Financial Stability
  cashFlowStressIndicators?: string[];
  hasSeasonalPaymentPatterns?: boolean;
  worstPerformingMonths?: string[];

  // NEW v3 - partial payments and current standing
  partialPaymentRate?: number;      // share of due months paid only in part
  averagePaidRatio?: number;        // average share of each due bill that was paid (0..1)
  overdueBalance?: number;          // owed on bills already past due
  outstandingBalance?: number;      // owed on all bills, including those not yet due
  currentDaysOverdue?: number;      // days since the oldest unsettled bill fell due
}

// ADD these new fields to existing ScreeningData interface
interface ScreeningData {
  tenantId: number;
  tenantName: string;
  tenantPhone: string;
  tenantEmail: string;
  currentPropertyId: number;
  currentUnitNumber: string;
  currentRentAmount: number;
  paymentHistory: {
    totalMonthsTracked: number;
    monthlyRecords: MonthlyRecord[];
  };
  calculatedMetrics: CalculatedMetrics;
  dataQuality: {
    monthsWithCompleteData: number;
    hasRecentData: boolean;
    dataConfidenceScore: number;
    lastInvoiceDate: Date | null;
    oldestInvoiceDate: Date | null;
    
    // NEW v1.2 - Enhanced Data Quality
    dataCompletenessScore?: number;
    missingDataPoints?: string[];
    reliabilityFlags?: {
      hasGaps: boolean;
      hasInconsistencies: boolean;
      requiresManualReview: boolean;
    };
    recommendedAction?: 'use_confidently' | 'use_with_caution' | 'request_manual_screening';
  };
  
  // NEW v1.2 - Portfolio Benchmarking
  portfolioBenchmarks?: {
    percentileRank?: number;
    comparedToPortfolioAverage: {
      screeningScore: 'above' | 'average' | 'below';
      onTimeRate: 'above' | 'average' | 'below';
      arrearsLevel: 'above' | 'average' | 'below';
    };
    portfolioContext: string;
  };
  
  // NEW v1.1 - Early Warning System
  earlyWarningFlags?: {
    recentDeteriorationDetected: boolean;
    flagsRaised: string[];
    riskTrend: 'improving' | 'stable' | 'worsening';
    recommendedMonitoring: 'none' | 'monthly' | 'weekly';
  };
  
  lastUpdated: Date;
  lastMiningRun: Date;
  sourceUserId: number;
  dataVersion: number;
}

/** Recursively drops `undefined` values; keeps Dates, Timestamps and FieldValues intact. */
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefined) as unknown as T;
  if (value && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value; // Date, Timestamp, sentinels…
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

export class TenantScreeningService {
  private static instance: TenantScreeningService;
  private miningInProgress = false;
  private readonly SCREENING_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly TWELVE_MONTHS_AGO = new Date(Date.now() - (12 * 30 * 24 * 60 * 60 * 1000));
  private portfolioBenchmarkCache: Map<number, { scores: number[], lastUpdated: Date }> = new Map(); // NEW v1.1

  
  static getInstance(): TenantScreeningService {
    if (!this.instance) {
      this.instance = new TenantScreeningService();
    }
    return this.instance;
  }

  // ==================== MAIN PUBLIC METHODS ====================

  async performScreeningMining(userId: number): Promise<void> {
    if (this.miningInProgress) {
      console.log('⏳ Screening mining already in progress, skipping...');
      return;
    }

    try {
      this.miningInProgress = true;
      console.log('🔍 Starting tenant screening data mining for user:', userId);

      if (!navigator.onLine) {
        console.log('📴 Offline - scheduling screening mining for later');
        this.scheduleNextMining(userId);
        return;
      }

      const tenants = await this.getAllUserTenants(userId);
      console.log(`📊 Found ${tenants.length} tenants to analyze`);

      for (const tenant of tenants) {
        try {
          await this.mineTenantData(tenant, userId);
          // Small delay to prevent overwhelming Firestore
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`❌ Failed to mine data for tenant ${tenant.id}:`, error);
          continue; // Continue with other tenants
        }
      }

      this.updateLastMiningTime();
      console.log('✅ Screening mining completed successfully');

    } catch (error) {
      console.error('❌ Screening mining failed:', error);
      throw error;
    } finally {
      this.miningInProgress = false;
    }
  }

  async schedulePeriodicMining(userId: number): Promise<void> {
    const shouldMine = this.shouldPerformPeriodicMining();
    
    if (shouldMine) {
      console.log('⏰ Performing scheduled screening mining');
      await this.performScreeningMining(userId);
    }

    // Schedule next mining
    this.scheduleNextMining(userId);
  }

  // ==================== DATA MINING CORE ====================
  private async mineTenantData(tenant: Tenant, userId: number): Promise<void> {
    try {
      console.log(`🔍 Mining data for tenant: ${tenant.name} (ID: ${tenant.id})`);

      // Get tenant's invoices from last 12 months (UPDATED v1.1)
      const invoices = await this.getTenantInvoicesLast12Months(tenant.id);
      
      if (invoices.length === 0) {
        console.log(`⚠️ No recent invoices found for tenant ${tenant.id}, skipping`);
        return;
      }
      
      // Mine monthly payment patterns
      const allRecords = this.generateMonthlyRecords(invoices);
      // Bills not yet due ('pending') are shown but never scored: only months that have fallen due are assessed
      const monthlyRecords = allRecords.filter(r => r.paymentStatus !== 'pending');
      
      // Calculate screening metrics
      const calculatedMetrics = this.calculateScreeningMetrics(monthlyRecords, invoices, allRecords);

      // NEW v1.2: Enhanced data quality assessment
      const dataQuality = this.enhancedDataQualityAssessment(monthlyRecords, invoices, tenant);
      
      // NEW v1.1: Early warning detection
      const earlyWarningFlags = this.detectEarlyWarnings(monthlyRecords);
      
      // NEW v1.2: Portfolio benchmarking (hybrid approach - calculate in background, cache result)
      const portfolioBenchmarks = await this.calculatePortfolioBenchmarks(
        calculatedMetrics.screeningScore,
        calculatedMetrics.onTimePaymentRate,
        calculatedMetrics.totalArrearsAccumulated,
        userId
      );
      
      // Build screening document
      const screeningData: ScreeningData = {
        tenantId: tenant.id,
        tenantName: tenant.name || 'Unknown Tenant',
        tenantPhone: tenant.phone || '',
        tenantEmail: tenant.email || '',
        currentPropertyId: tenant.propertyId,
        currentUnitNumber: tenant.unitNumber || '',
        currentRentAmount: tenant.rentAmount || 0,
        paymentHistory: {
          totalMonthsTracked: monthlyRecords.length,
          monthlyRecords: allRecords
        },
        calculatedMetrics,
        dataQuality,
        earlyWarningFlags, // NEW v1.1
        portfolioBenchmarks, // NEW v1.2
        lastUpdated: new Date(),
        lastMiningRun: new Date(),
        sourceUserId: userId,
        dataVersion: 3 // v3: partial payments, pending bills, current standing
      };

      // Upload to Firestore
      await this.uploadScreeningData(screeningData);
      
      // NEW v1.1: Update quick view table
      await this.updateQuickViewCache(screeningData);
      
      console.log(`✅ Screening data uploaded for tenant ${tenant.id}`);

    } catch (error) {
      console.error(`❌ Failed to mine tenant ${tenant.id}:`, error);
      throw error;
    }
  }

  // private async mineTenantData(tenant: Tenant, userId: number): Promise<void> {
  //   try {
  //     console.log(`🔍 Mining data for tenant: ${tenant.name} (ID: ${tenant.id})`);

  //     // Get tenant's invoices from last 6 months
  //     const invoices = await this.getTenantInvoicesLast6Months(tenant.id);
      
  //     if (invoices.length === 0) {
  //       console.log(`⚠️ No recent invoices found for tenant ${tenant.id}, skipping`);
  //       return;
  //     }

  //     // Get property info
  //     //const property = await database.getPropertyById(tenant.propertyId);
      
  //     // Mine monthly payment patterns
  //     const monthlyRecords = this.generateMonthlyRecords(invoices);
      
  //     // Calculate screening metrics
  //     const calculatedMetrics = this.calculateScreeningMetrics(monthlyRecords, invoices);
      
  //     // Assess data quality
  //     const dataQuality = this.assessDataQuality(monthlyRecords, invoices);
      
  //     // Build screening document
  //     const screeningData: ScreeningData = {
  //       tenantId: tenant.id,
  //       tenantName: tenant.name || 'Unknown Tenant',
  //       tenantPhone: tenant.phone || '',
  //       tenantEmail: tenant.email || '',
  //       currentPropertyId: tenant.propertyId,
  //       currentUnitNumber: tenant.unitNumber || '',
  //       currentRentAmount: tenant.rentAmount || 0,
  //       paymentHistory: {
  //         totalMonthsTracked: monthlyRecords.length,
  //         monthlyRecords
  //       },
  //       calculatedMetrics,
  //       dataQuality,
  //       lastUpdated: new Date(),
  //       lastMiningRun: new Date(),
  //       sourceUserId: userId,
  //       dataVersion: 1
  //     };

  //     // Upload to Firestore
  //     await this.uploadScreeningData(screeningData);
  //     console.log(`✅ Screening data uploaded for tenant ${tenant.id}`);

  //   } catch (error) {
  //     console.error(`❌ Failed to mine tenant ${tenant.id}:`, error);
  //     throw error;
  //   }
  // }

  private async getTenantInvoicesLast12Months(tenantId: number): Promise<Invoice[]> {
    try {
      const allInvoices = await database.getInvoices({ tenantId });
      
      // Filter to last 12 months (UPDATED v1.1)
      return allInvoices.filter(invoice => {
        const invoiceDate = new Date(invoice.createdAt);
        return invoiceDate >= this.TWELVE_MONTHS_AGO;
      }).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      
    } catch (error) {
      console.error(`Failed to get invoices for tenant ${tenantId}:`, error);
      return [];
    }
  }

  private generateMonthlyRecords(invoices: Invoice[]): MonthlyRecord[] {
    const monthlyMap = new Map<string, Invoice[]>();
    
    // Group invoices by billing month
    invoices.forEach(invoice => {
      const month = invoice.billingMonth || this.extractMonthFromDate(invoice.createdAt);
      if (!monthlyMap.has(month)) {
        monthlyMap.set(month, []);
      }
      monthlyMap.get(month)!.push(invoice);
    });

    // Convert to monthly records
    const records: MonthlyRecord[] = [];
    
    monthlyMap.forEach((monthInvoices, month) => {
      const record = this.createMonthlyRecord(month, monthInvoices);
      records.push(record);
    });

    return records.sort((a, b) => a.billingMonth.localeCompare(b.billingMonth));
  }

  private createMonthlyRecord(month: string, invoices: Invoice[]): MonthlyRecord {
    const totalBilled = invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
    const amountPaid = invoices.reduce((sum, inv) => sum + (inv.amountPaid || 0), 0);
    const arrears = invoices.reduce((sum, inv) => sum + (inv.arrears || 0), 0);
    const rentAmount = invoices[0]?.rentAmount || 0;

    // Find earliest due date and latest paid date for the month
    const dueDate = this.findEarliestDueDate(invoices);
    const paidDate = this.findLatestPaidDate(invoices);

    // Calculate payment timing
    const { paymentStatus, daysLate } = this.calculatePaymentTiming(dueDate, paidDate, amountPaid, totalBilled);
    const paidRatio = totalBilled > 0 ? Math.min(1, amountPaid / totalBilled) : 0;
    const outstanding = Math.max(0, Math.round((totalBilled - amountPaid) * 100) / 100);

    return {
      billingMonth: month,
      rentAmount,
      totalBilled,
      amountPaid,
      arrears,
      dueDate,
      paidDate,
      paymentStatus,
      daysLate,
      paidRatio,
      outstanding,
      invoiceCount: invoices.length,
      hadMultipleInvoices: invoices.length > 1
    };
  }

  /**
   * How a month's bill was handled. A bill counts as on-time/early/late ONLY once it is fully paid (timed by the date it was
   * settled). Part-paid after the due date is 'partial' — never credited as on time; nothing paid after the due date is
   * 'unpaid'; a bill not yet due is 'pending' and is left out of every rate.
   */
  private calculatePaymentTiming(
    dueDate: Date | null,
    paidDate: Date | null,
    amountPaid: number,
    totalBilled: number,
    now: Date = new Date()
  ): { paymentStatus: MonthlyRecord['paymentStatus']; daysLate: number } {
    const DAY = 1000 * 60 * 60 * 24;
    const settled = totalBilled > 0 ? amountPaid >= totalBilled - 0.005 : amountPaid > 0;

    if (!settled) {
      if (dueDate && dueDate.getTime() > now.getTime()) return { paymentStatus: 'pending', daysLate: 0 };
      const daysPastDue = dueDate ? Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / DAY)) : 0;
      return amountPaid > 0
        ? { paymentStatus: 'partial', daysLate: daysPastDue }
        : { paymentStatus: 'unpaid', daysLate: 0 };
    }

    // Fully paid. Without both dates the timing is unknown: neutral, not a penalty.
    if (!dueDate || !paidDate) return { paymentStatus: 'on_time', daysLate: 0 };

    const daysDiff = Math.floor((paidDate.getTime() - dueDate.getTime()) / DAY);
    if (daysDiff < 0) return { paymentStatus: 'early', daysLate: 0 };
    if (daysDiff === 0) return { paymentStatus: 'on_time', daysLate: 0 };
    return { paymentStatus: 'late', daysLate: daysDiff };
  }

  // ==================== METRICS CALCULATION ====================

  private calculateScreeningMetrics(monthlyRecords: MonthlyRecord[], invoices: Invoice[], allRecords?: MonthlyRecord[]): CalculatedMetrics {
    if (monthlyRecords.length === 0) {
      return this.getDefaultMetrics();
    }

    const totalMonths = monthlyRecords.length;
    //const paidRecords = monthlyRecords.filter(r => r.amountPaid > 0);
    
    // Payment timing analysis
    const onTimeCount = monthlyRecords.filter(r => r.paymentStatus === 'on_time').length;
    const earlyCount = monthlyRecords.filter(r => r.paymentStatus === 'early').length;
    const lateCount = monthlyRecords.filter(r => r.paymentStatus === 'late').length;
    
    const onTimePaymentRate = totalMonths > 0 ? (onTimeCount + earlyCount) / totalMonths : 0;
    const earlyPaymentRate = totalMonths > 0 ? earlyCount / totalMonths : 0;
    const latePaymentRate = totalMonths > 0 ? lateCount / totalMonths : 0;
    
    // Late payment analysis
    const lateDays = monthlyRecords.map(r => r.daysLate);
    const averageDaysLate = lateDays.length > 0 ? lateDays.reduce((sum, days) => sum + days, 0) / lateDays.length : 0;
    const maxDaysLate = lateDays.length > 0 ? Math.max(...lateDays) : 0;
    
    // Arrears analysis
    const arrearsAmounts = monthlyRecords.map(r => r.arrears);
    const averageMonthlyArrears = arrearsAmounts.reduce((sum, arr) => sum + arr, 0) / arrearsAmounts.length;
    const maxMonthlyArrears = Math.max(...arrearsAmounts, 0);
    const totalArrearsAccumulated = arrearsAmounts.reduce((sum, arr) => sum + arr, 0);
    
    // Financial performance
    const totalBilled = monthlyRecords.reduce((sum, r) => sum + r.totalBilled, 0);
    const totalPaid = monthlyRecords.reduce((sum, r) => sum + r.amountPaid, 0);
    const paymentCompletionRate = totalBilled > 0 ? totalPaid / totalBilled : 0;
    
    // Rent stability
    const rentAmounts = monthlyRecords.map(r => r.rentAmount).filter(amount => amount > 0);
    const rentStability = rentAmounts.length <= 1 || rentAmounts.every(amount => amount === rentAmounts[0]);
    const hadRentIncreases = rentAmounts.length > 1 && Math.max(...rentAmounts) > Math.min(...rentAmounts);
    
    const averageMonthlyBilled = totalMonths > 0 ? totalBilled / totalMonths : 0;
    
    // Payment variability (standard deviation of payment amounts)
    const paymentAmounts = monthlyRecords.map(r => r.amountPaid);
    const paymentVariability = this.calculateStandardDeviation(paymentAmounts);
    
    // Risk indicators
    // Partial payments and current standing (v3)
    const partialMonths = monthlyRecords.filter(r => r.paymentStatus === 'partial').length;
    const partialPaymentRate = totalMonths > 0 ? partialMonths / totalMonths : 0;
    const billedMonths = monthlyRecords.filter(r => r.totalBilled > 0);
    const averagePaidRatio = billedMonths.length > 0 ? billedMonths.reduce((sum, r) => sum + r.paidRatio, 0) / billedMonths.length : 0;
    const standingRecords = allRecords ?? monthlyRecords;
    const overdueRecords = standingRecords.filter(r => r.paymentStatus === 'partial' || r.paymentStatus === 'unpaid');
    const overdueBalance = overdueRecords.reduce((sum, r) => sum + r.outstanding, 0);
    const outstandingBalance = standingRecords.reduce((sum, r) => sum + r.outstanding, 0);
    const currentDaysOverdue = overdueRecords.reduce((max, r) => {
      const days = r.dueDate ? Math.floor((Date.now() - r.dueDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
      return Math.max(max, days);
    }, 0);

    const hasUnpaidInvoices = invoices.some(inv => (inv.amountPaid || 0) < (inv.totalAmount || 0));
    const unpaidInvoiceCount = invoices.filter(inv => (inv.amountPaid || 0) === 0).length;
    const longestNonPaymentStreak = this.calculateLongestNonPaymentStreak(monthlyRecords);
    const improvingTrend = this.calculateImprovingTrend(monthlyRecords);
    
    // Calculate screening score (0-100)
    const screeningScore = this.calculateScreeningScore({
      onTimePaymentRate,
      averageDaysLate,
      paymentCompletionRate,
      averageMonthlyArrears,
      longestNonPaymentStreak,
      improvingTrend,
      partialPaymentRate,
      overdueBalance,
      averageMonthlyBilled
    });
    
    const riskLevel = this.determineRiskLevel(screeningScore);

    // Inside calculateScreeningMetrics method, BEFORE the return statement, ADD:

    // NEW v1.1: Payment pattern analysis
    const patternAnalysis = this.analyzePaymentPatterns(monthlyRecords);
    const cashFlowStress = this.detectCashFlowStressIndicators(monthlyRecords);
    const seasonalAnalysis = this.detectSeasonalPatterns(monthlyRecords);

    // Then UPDATE the return statement to include new fields:
    return {
      onTimePaymentRate,
      earlyPaymentRate,
      latePaymentRate,
      averageDaysLate,
      maxDaysLate,
      averageMonthlyArrears,
      maxMonthlyArrears,
      totalArrearsAccumulated,
      paymentCompletionRate,
      rentStability,
      hadRentIncreases,
      averageMonthlyBilled,
      paymentVariability,
      hasUnpaidInvoices,
      unpaidInvoiceCount,
      longestNonPaymentStreak,
      improvingTrend,
      screeningScore,
      riskLevel,
      
      // NEW v1.1 fields
      paymentConsistencyScore: patternAnalysis.consistencyScore,
      preferredPaymentDay: patternAnalysis.preferredPaymentDay,
      averagePaymentDelay: patternAnalysis.averagePaymentDelay,
      paymentReliabilityTrend: patternAnalysis.reliabilityTrend,
      cashFlowStressIndicators: cashFlowStress,
      hasSeasonalPaymentPatterns: seasonalAnalysis.hasSeasonalPatterns,
      worstPerformingMonths: seasonalAnalysis.worstPerformingMonths,

      // NEW v3 fields
      partialPaymentRate,
      averagePaidRatio,
      overdueBalance,
      outstandingBalance,
      currentDaysOverdue
    };

    // return {
    //   onTimePaymentRate,
    //   earlyPaymentRate,
    //   latePaymentRate,
    //   averageDaysLate,
    //   maxDaysLate,
    //   averageMonthlyArrears,
    //   maxMonthlyArrears,
    //   totalArrearsAccumulated,
    //   paymentCompletionRate,
    //   rentStability,
    //   hadRentIncreases,
    //   averageMonthlyBilled,
    //   paymentVariability,
    //   hasUnpaidInvoices,
    //   unpaidInvoiceCount,
    //   longestNonPaymentStreak,
    //   improvingTrend,
    //   screeningScore,
    //   riskLevel
    // };
  }

  // ==================== NEW v1.1: PAYMENT PATTERN ANALYSIS ====================

private analyzePaymentPatterns(monthlyRecords: MonthlyRecord[]): {
  consistencyScore: number;
  preferredPaymentDay: number;
  averagePaymentDelay: number;
  reliabilityTrend: 'improving' | 'stable' | 'declining';
} {
  if (monthlyRecords.length < 3) {
    return { 
      consistencyScore: 50, 
      preferredPaymentDay: 0, 
      averagePaymentDelay: 0,
      reliabilityTrend: 'stable' 
    };
  }

  // Calculate payment day consistency
  const paymentDays = monthlyRecords
    .filter(r => r.paidDate)
    .map(r => r.paidDate!.getDate());
  
  const preferredPaymentDay = this.findMostFrequentDay(paymentDays);
  const consistencyScore = this.calculatePaymentConsistency(paymentDays, preferredPaymentDay);
  
  // Calculate average payment delay
  const delays = monthlyRecords
    .filter(r => r.daysLate >= 0)
    .map(r => r.daysLate);
  const averagePaymentDelay = delays.length > 0 
    ? delays.reduce((sum, d) => sum + d, 0) / delays.length 
    : 0;
  
  // Analyze trend across time periods
  const reliabilityTrend = this.calculateReliabilityTrend(monthlyRecords);
  
  return { consistencyScore, preferredPaymentDay, averagePaymentDelay, reliabilityTrend };
}

private findMostFrequentDay(days: number[]): number {
  if (days.length === 0) return 0;
  
  const frequency = new Map<number, number>();
  days.forEach(day => {
    frequency.set(day, (frequency.get(day) || 0) + 1);
  });
  
  let maxFreq = 0;
  let mostFrequentDay = 0;
  frequency.forEach((freq, day) => {
    if (freq > maxFreq) {
      maxFreq = freq;
      mostFrequentDay = day;
    }
  });
  
  return mostFrequentDay;
}

private calculatePaymentConsistency(days: number[], preferredDay: number): number {
  if (days.length === 0) return 0;
  
  // Count payments within 3 days of preferred day
  const withinRange = days.filter(day => Math.abs(day - preferredDay) <= 3).length;
  return Math.round((withinRange / days.length) * 100);
}

private calculateReliabilityTrend(monthlyRecords: MonthlyRecord[]): 'improving' | 'stable' | 'declining' {
  if (monthlyRecords.length < 6) return 'stable';
  
  const midpoint = Math.floor(monthlyRecords.length / 2);
  const olderHalf = monthlyRecords.slice(0, midpoint);
  const recentHalf = monthlyRecords.slice(midpoint);
  
  const olderOnTimeRate = olderHalf.filter(r => 
    r.paymentStatus === 'on_time' || r.paymentStatus === 'early'
  ).length / olderHalf.length;
  
  const recentOnTimeRate = recentHalf.filter(r => 
    r.paymentStatus === 'on_time' || r.paymentStatus === 'early'
  ).length / recentHalf.length;
  
  const difference = recentOnTimeRate - olderOnTimeRate;
  
  if (difference > 0.15) return 'improving';
  if (difference < -0.15) return 'declining';
  return 'stable';
}

private detectCashFlowStressIndicators(monthlyRecords: MonthlyRecord[]): string[] {
  const indicators: string[] = [];
  
  if (monthlyRecords.length < 3) return indicators;
  
  const recent3 = monthlyRecords.slice(-3);
  
  // Check for frequent partial payments
  const partialPayments = recent3.filter(r => 
    r.amountPaid > 0 && r.amountPaid < r.totalBilled * 0.9
  ).length;
  
  if (partialPayments >= 2) {
    indicators.push('frequent_partial_payments');
  }
  
  // Check for erratic payment timing
  const paymentDays = recent3
    .filter(r => r.paidDate)
    .map(r => r.paidDate!.getDate());
  
  if (paymentDays.length >= 2) {
    const dayDifferences = [];
    for (let i = 1; i < paymentDays.length; i++) {
      dayDifferences.push(Math.abs(paymentDays[i] - paymentDays[i - 1]));
    }
    const avgDifference = dayDifferences.reduce((sum, d) => sum + d, 0) / dayDifferences.length;
    
    if (avgDifference > 10) {
      indicators.push('erratic_payment_timing');
    }
  }
  
  // Check for increasing arrears
  const arrearsIncreasing = recent3.every((record, index) => {
    if (index === 0) return true;
    return record.arrears >= recent3[index - 1].arrears;
  });
  
  if (arrearsIncreasing && recent3[recent3.length - 1].arrears > 0) {
    indicators.push('steadily_increasing_arrears');
  }
  
  return indicators;
}

private detectSeasonalPatterns(monthlyRecords: MonthlyRecord[]): {
  hasSeasonalPatterns: boolean;
  worstPerformingMonths: string[];
} {
  if (monthlyRecords.length < 6) {
    return { hasSeasonalPatterns: false, worstPerformingMonths: [] };
  }
  
  // Group by month name
  const monthPerformance = new Map<string, { late: number; total: number }>();
  
  monthlyRecords.forEach(record => {
    const monthName = new Date(record.billingMonth + '-01').toLocaleDateString('en-US', { month: 'long' });
    
    if (!monthPerformance.has(monthName)) {
      monthPerformance.set(monthName, { late: 0, total: 0 });
    }
    
    const stats = monthPerformance.get(monthName)!;
    stats.total++;
    if (record.paymentStatus === 'late' || record.paymentStatus === 'partial' || record.paymentStatus === 'unpaid') {
      stats.late++;
    }
  });
  
  // Find months with >50% late rate
  const worstPerformingMonths: string[] = [];
  monthPerformance.forEach((stats, month) => {
    const lateRate = stats.late / stats.total;
    if (lateRate > 0.5 && stats.total >= 2) {
      worstPerformingMonths.push(month);
    }
  });
  
  const hasSeasonalPatterns = worstPerformingMonths.length > 0;
  
  return { hasSeasonalPatterns, worstPerformingMonths };
}

// ==================== NEW v1.2: ENHANCED DATA QUALITY ====================

private enhancedDataQualityAssessment(
  monthlyRecords: MonthlyRecord[], 
  invoices: Invoice[],
  tenant: Tenant
): ScreeningData['dataQuality'] {
  const basic = this.assessDataQuality(monthlyRecords, invoices);
  
  // Completeness scoring
  const completenessFactors = {
    hasPhone: !!tenant.phone,
    hasEmail: !!tenant.email,
    hasCompletePaymentDates: monthlyRecords.every(r => r.paidDate || r.paymentStatus === 'unpaid' || r.paymentStatus === 'partial'),
    hasConsistentInvoicing: this.checkInvoicingConsistency(monthlyRecords),
    hasRecentData: basic.hasRecentData,
    hasMinimumHistory: monthlyRecords.length >= 3
  };
  
  const trueCount = Object.values(completenessFactors).filter(Boolean).length;
  const dataCompletenessScore = Math.round((trueCount / Object.keys(completenessFactors).length) * 100);
  
  // Detect missing data points
  const missingDataPoints: string[] = [];
  if (!tenant.phone) missingDataPoints.push('phone_number');
  if (!tenant.email) missingDataPoints.push('email_address');
  if (monthlyRecords.length < 3) missingDataPoints.push('sufficient_payment_history');
  if (!completenessFactors.hasCompletePaymentDates) missingDataPoints.push('payment_dates');
  
  // Detect data quality issues
  const hasGaps = this.detectPaymentGaps(monthlyRecords);
  const hasInconsistencies = this.detectDataInconsistencies(monthlyRecords, invoices);
  
  // Determine recommended action
  let recommendedAction: 'use_confidently' | 'use_with_caution' | 'request_manual_screening';
  if (dataCompletenessScore >= 80 && !hasGaps && !hasInconsistencies) {
    recommendedAction = 'use_confidently';
  } else if (dataCompletenessScore >= 60 && monthlyRecords.length >= 3) {
    recommendedAction = 'use_with_caution';
  } else {
    recommendedAction = 'request_manual_screening';
  }
  
  return {
    ...basic,
    dataCompletenessScore,
    missingDataPoints,
    reliabilityFlags: {
      hasGaps,
      hasInconsistencies,
      requiresManualReview: recommendedAction === 'request_manual_screening'
    },
    recommendedAction
  };
}

private checkInvoicingConsistency(monthlyRecords: MonthlyRecord[]): boolean {
  if (monthlyRecords.length < 2) return true;
  
  // Check if invoices are generated consistently each month
  const monthGaps = this.findMonthGaps(monthlyRecords);
  return monthGaps.length === 0;
}

private findMonthGaps(monthlyRecords: MonthlyRecord[]): string[] {
  if (monthlyRecords.length < 2) return [];
  
  const gaps: string[] = [];
  const sortedRecords = [...monthlyRecords].sort((a, b) => 
    a.billingMonth.localeCompare(b.billingMonth)
  );
  
  for (let i = 1; i < sortedRecords.length; i++) {
    const prevDate = new Date(sortedRecords[i - 1].billingMonth + '-01');
    const currDate = new Date(sortedRecords[i].billingMonth + '-01');
    
    const monthDiff = (currDate.getFullYear() - prevDate.getFullYear()) * 12 + 
                      (currDate.getMonth() - prevDate.getMonth());
    
    if (monthDiff > 1) {
      gaps.push(`${sortedRecords[i - 1].billingMonth} to ${sortedRecords[i].billingMonth}`);
    }
  }
  
  return gaps;
}

private detectPaymentGaps(monthlyRecords: MonthlyRecord[]): boolean {
  return this.findMonthGaps(monthlyRecords).length > 0;
}

private detectDataInconsistencies(monthlyRecords: MonthlyRecord[], _invoices: Invoice[]): boolean {
  // Check for impossible payment dates (paid before due)
  const impossiblePayments = monthlyRecords.filter(r => {
    if (!r.dueDate || !r.paidDate) return false;
    const daysDiff = (r.paidDate.getTime() - r.dueDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff < -30; // Paid more than 30 days before due date (likely error)
  });
  
  // Check for records with payment but marked unpaid
  const statusInconsistencies = monthlyRecords.filter(r => 
    r.amountPaid > 0 && r.paymentStatus === 'unpaid'
  );
  
  return impossiblePayments.length > 0 || statusInconsistencies.length > 0;
}

// ==================== NEW v1.1: EARLY WARNING SYSTEM ====================

private detectEarlyWarnings(monthlyRecords: MonthlyRecord[]): ScreeningData['earlyWarningFlags'] {
  if (monthlyRecords.length < 3) {
    return {
      recentDeteriorationDetected: false,
      flagsRaised: [],
      riskTrend: 'stable',
      recommendedMonitoring: 'monthly'
    };
  }
  
  const recent3 = monthlyRecords.slice(-3);
  const previous3 = monthlyRecords.length >= 6 ? monthlyRecords.slice(-6, -3) : [];
  
  const flags: string[] = [];
  
  // Check last payment
  if (recent3[recent3.length - 1].paymentStatus === 'unpaid') {
    flags.push('missed_last_payment');
  } else if (recent3[recent3.length - 1].paymentStatus === 'partial') {
    flags.push('last_payment_incomplete');
  }

  // Money owed on bills already past due
  const overdueNow = monthlyRecords.filter(r => r.paymentStatus === 'partial' || r.paymentStatus === 'unpaid');
  if (overdueNow.length >= 2) {
    flags.push('multiple_overdue_months');
  }
  
  // Check arrears trend
  const recentAvgArrears = recent3.reduce((sum, r) => sum + r.arrears, 0) / 3;
  const previousAvgArrears = previous3.length > 0 
    ? previous3.reduce((sum, r) => sum + r.arrears, 0) / previous3.length 
    : 0;
  
  if (recentAvgArrears > previousAvgArrears * 1.5 && recentAvgArrears > 1000) {
    flags.push('arrears_increasing_rapidly');
  }
  
  // Check payment delays
  const recentAvgDelay = recent3.reduce((sum, r) => sum + r.daysLate, 0) / 3;
  const previousAvgDelay = previous3.length > 0
    ? previous3.reduce((sum, r) => sum + r.daysLate, 0) / previous3.length
    : 0;
  
  if (recentAvgDelay > previousAvgDelay + 5 && recentAvgDelay > 10) {
    flags.push('payment_delays_worsening');
  }
  
  // Check for partial payments
  const partialPayments = recent3.filter(r => 
    r.amountPaid > 0 && r.amountPaid < r.totalBilled * 0.9
  ).length;
  
  if (partialPayments >= 2) {
    flags.push('frequent_partial_payments');
  }
  
  // Check for consecutive late payments
  const consecutiveLate = recent3.filter(r => 
    r.paymentStatus === 'late' || r.paymentStatus === 'partial' || r.paymentStatus === 'unpaid'
  ).length;
  
  if (consecutiveLate === 3) {
    flags.push('three_consecutive_late_payments');
  }
  
  const recentDeteriorationDetected = flags.length > 0;
  
  let riskTrend: 'improving' | 'stable' | 'worsening';
  if (flags.length >= 2) riskTrend = 'worsening';
  else if (flags.length === 1) riskTrend = 'stable';
  else riskTrend = 'improving';
  
  let recommendedMonitoring: 'none' | 'monthly' | 'weekly';
  if (flags.length >= 3 || flags.includes('three_consecutive_late_payments')) {
    recommendedMonitoring = 'weekly';
  } else if (flags.length >= 1) {
    recommendedMonitoring = 'monthly';
  } else {
    recommendedMonitoring = 'none';
  }
  
  return {
    recentDeteriorationDetected,
    flagsRaised: flags,
    riskTrend,
    recommendedMonitoring
  };
}

// ==================== NEW v1.2: PORTFOLIO BENCHMARKING ====================

private async calculatePortfolioBenchmarks(
  tenantScore: number,
  onTimeRate: number,
  totalArrears: number,
  userId: number
): Promise<ScreeningData['portfolioBenchmarks'] | undefined> {
  try {
    // Check cache first
    const cached = this.portfolioBenchmarkCache.get(userId);
    const cacheAge = cached ? Date.now() - cached.lastUpdated.getTime() : Infinity;
    const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours
    
    let allScores: number[];
    let allOnTimeRates: number[] = [];
    let allArrears: number[] = [];
    
    if (cached && cacheAge < CACHE_DURATION) {
      // Use cached data
      allScores = cached.scores;
    } else {
      // Fetch fresh data from database
      const allTenants = await this.getAllUserTenants(userId);
      
      if (allTenants.length < 5) {
        return undefined; // Not enough tenants for meaningful comparison
      }
      
      // Get all screening data from quick view table
      const screeningPromises = allTenants.map(async (tenant) => {
        try {
          const result = await database.db!.query(
            'SELECT screening_score, on_time_payment_rate, total_arrears FROM tenant_screening_quick_view WHERE tenant_id = ?',
            [tenant.id]
          ) as ScreeningResult;
          return result || null;
        } catch {
          return null;
        }
      });
      // const screeningPromises = allTenants.map(async (tenant) => {
      //   try {
      //     const result = await database.db!.query(
      //       'SELECT screening_score, on_time_payment_rate, total_arrears FROM tenant_screening_quick_view WHERE tenant_id = ?',
      //       [tenant.id]
      //     );
      //     return result || null;
      //   } catch {
      //     return null;
      //   }
      // });
      
      const screeningResults = await Promise.all(screeningPromises);
      const validResults = screeningResults.filter(r => r !== null);
      
      if (validResults.length < 5) {
        return undefined;
      }
      
      allScores = validResults.map(r => r.screening_score);
      allOnTimeRates = validResults.map(r => r.on_time_payment_rate);
      allArrears = validResults.map(r => r.total_arrears);
      
      // Update cache
      this.portfolioBenchmarkCache.set(userId, {
        scores: allScores,
        lastUpdated: new Date()
      });
    }
    
    // Calculate percentile
    const betterThan = allScores.filter(s => tenantScore > s).length;
    const percentileRank = Math.round((betterThan / allScores.length) * 100);
    
    // Calculate averages
    const avgScore = allScores.reduce((sum, s) => sum + s, 0) / allScores.length;
    const avgOnTimeRate = allOnTimeRates.length > 0 
      ? allOnTimeRates.reduce((sum, r) => sum + r, 0) / allOnTimeRates.length 
      : 0;
    const avgArrears = allArrears.length > 0
      ? allArrears.reduce((sum, a) => sum + a, 0) / allArrears.length
      : 0;
    
    // Determine portfolio context
    let context: string;
    if (percentileRank >= 75) {
      context = `Top 25% performer in your portfolio (${percentileRank}th percentile)`;
    } else if (percentileRank >= 50) {
      context = `Above average in your portfolio (${percentileRank}th percentile)`;
    } else if (percentileRank >= 25) {
      context = `Below average in your portfolio (${percentileRank}th percentile)`;
    } else {
      context = `Bottom 25% performer in your portfolio (${percentileRank}th percentile)`;
    }
    
    return {
      percentileRank,
      comparedToPortfolioAverage: {
        screeningScore: tenantScore > avgScore + 10 ? 'above' : 
                        tenantScore < avgScore - 10 ? 'below' : 'average',
        onTimeRate: onTimeRate > avgOnTimeRate + 0.1 ? 'above' :
                    onTimeRate < avgOnTimeRate - 0.1 ? 'below' : 'average',
        arrearsLevel: totalArrears < avgArrears * 0.5 ? 'above' : // Lower is better
                      totalArrears > avgArrears * 1.5 ? 'below' : 'average'
      },
      portfolioContext: context
    };
    
  } catch (error) {
    console.error('Failed to calculate portfolio benchmarks:', error);
    return undefined;
  }
}

  /**
   * 0-100. Weights: on-time 35 | completion 25 | lateness 12 | arrears 10 | non-payment streak 5 | improving trend 5 |
   * part-payment behaviour 4 | current overdue standing 4. Only months already due are scored.
   */
  private calculateScreeningScore(factors: {
    onTimePaymentRate: number;
    averageDaysLate: number;
    paymentCompletionRate: number;
    averageMonthlyArrears: number;
    longestNonPaymentStreak: number;
    improvingTrend: boolean;
    partialPaymentRate: number;
    overdueBalance: number;
    averageMonthlyBilled: number;
  }): number {
    let score = 0;

    score += factors.onTimePaymentRate * 35;
    score += Math.min(1, factors.paymentCompletionRate) * 25;

    const latePenalty = Math.min(factors.averageDaysLate / 30, 1); // Cap at 30 days
    score += (1 - latePenalty) * 12;

    const arrearsPenalty = Math.min(factors.averageMonthlyArrears / 10000, 1); // Cap at 10k KES
    score += (1 - arrearsPenalty) * 10;

    const streakPenalty = Math.min(factors.longestNonPaymentStreak / 3, 1); // Cap at 3 months
    score += (1 - streakPenalty) * 5;

    if (factors.improvingTrend) score += 5;

    score += (1 - Math.min(1, factors.partialPaymentRate)) * 4;

    // Owing a full month's bill (or more) right now forfeits all of this component
    const standingPenalty = factors.averageMonthlyBilled > 0 ? Math.min(1, factors.overdueBalance / factors.averageMonthlyBilled) : 0;
    score += (1 - standingPenalty) * 4;

    return Math.max(0, Math.min(100, Math.round(score * 100) / 100));
  }

  private determineRiskLevel(score: number): 'low' | 'medium' | 'high' {
    if (score >= 75) return 'low';
    if (score >= 50) return 'medium';
    return 'high';
  }

  // ==================== UTILITY METHODS ====================

  private calculateStandardDeviation(numbers: number[]): number {
    if (numbers.length <= 1) return 0;
    
    const mean = numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
    const squaredDiffs = numbers.map(num => Math.pow(num - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / squaredDiffs.length;
    
    return Math.sqrt(avgSquaredDiff);
  }

  private calculateLongestNonPaymentStreak(records: MonthlyRecord[]): number {
    let maxStreak = 0;
    let currentStreak = 0;
    
    records.forEach(record => {
      if (record.amountPaid === 0) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    });
    
    return maxStreak;
  }

  private calculateImprovingTrend(records: MonthlyRecord[]): boolean {
    if (records.length < 3) return false;
    
    const recentRecords = records.slice(-3);
    const olderRecords = records.slice(0, -3);
    
    if (olderRecords.length === 0) return false;
    
    const recentOnTimeRate = recentRecords.filter(r => r.paymentStatus === 'on_time' || r.paymentStatus === 'early').length / recentRecords.length;
    const olderOnTimeRate = olderRecords.filter(r => r.paymentStatus === 'on_time' || r.paymentStatus === 'early').length / olderRecords.length;
    
    return recentOnTimeRate > olderOnTimeRate;
  }

  private assessDataQuality(monthlyRecords: MonthlyRecord[], invoices: Invoice[]): ScreeningData['dataQuality'] {
    const monthsWithCompleteData = monthlyRecords.filter(record => 
      record.totalBilled > 0 && 
      record.dueDate !== null && 
      (record.amountPaid > 0 || record.paymentStatus === 'unpaid')
    ).length;
    
    const lastInvoiceDate = invoices.length > 0 ? new Date(Math.max(...invoices.map(inv => new Date(inv.createdAt).getTime()))) : null;
    const oldestInvoiceDate = invoices.length > 0 ? new Date(Math.min(...invoices.map(inv => new Date(inv.createdAt).getTime()))) : null;
    
    const hasRecentData = lastInvoiceDate ? (Date.now() - lastInvoiceDate.getTime()) < (30 * 24 * 60 * 60 * 1000) : false;
    
    const dataConfidenceScore = monthlyRecords.length > 0 ? monthsWithCompleteData / monthlyRecords.length : 0;
    
    return {
      monthsWithCompleteData,
      hasRecentData,
      dataConfidenceScore,
      lastInvoiceDate,
      oldestInvoiceDate
    };
  }

  private getDefaultMetrics(): CalculatedMetrics {
    return {
      onTimePaymentRate: 0,
      earlyPaymentRate: 0,
      latePaymentRate: 0,
      averageDaysLate: 0,
      maxDaysLate: 0,
      averageMonthlyArrears: 0,
      maxMonthlyArrears: 0,
      totalArrearsAccumulated: 0,
      paymentCompletionRate: 0,
      rentStability: true,
      hadRentIncreases: false,
      averageMonthlyBilled: 0,
      paymentVariability: 0,
      hasUnpaidInvoices: false,
      unpaidInvoiceCount: 0,
      longestNonPaymentStreak: 0,
      improvingTrend: false,
      screeningScore: 0,
      riskLevel: 'high'
    };
  }

  // ==================== HELPER METHODS ====================

  private async getAllUserTenants(userId: number): Promise<Tenant[]> {
    try {
      const properties = await database.getProperties(userId);
      const allTenants: Tenant[] = [];
      
      for (const property of properties) {
        if (!property.isRestricted) {
          const tenants = await database.getTenantsByProperty(property.id);
          allTenants.push(...tenants.filter(t => !t.isRestricted));
        }
      }
      
      return allTenants;
    } catch (error) {
      console.error('Failed to get user tenants:', error);
      return [];
    }
  }

  private extractMonthFromDate(dateString: string): string {
    const date = new Date(dateString);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private findEarliestDueDate(invoices: Invoice[]): Date | null {
    const dueDates = invoices
      .map(inv => inv.dueDate ? new Date(inv.dueDate) : null)
      .filter(date => date !== null) as Date[];
    
    return dueDates.length > 0 ? new Date(Math.min(...dueDates.map(d => d.getTime()))) : null;
  }

  private findLatestPaidDate(invoices: Invoice[]): Date | null {
    const paidDates = invoices
      .map(inv => inv.paidDate ? new Date(inv.paidDate) : null)
      .filter(date => date !== null) as Date[];
    
    return paidDates.length > 0 ? new Date(Math.max(...paidDates.map(d => d.getTime()))) : null;
  }

  // ==================== FIRESTORE UPLOAD ====================

  private async uploadScreeningData(screeningData: ScreeningData): Promise<void> {
    try {
      const screeningRef = doc(db, 'screening', screeningData.tenantId.toString());
      
      // Convert dates to Firestore Timestamps
      const firestoreData = {
        ...screeningData,
        paymentHistory: {
          ...screeningData.paymentHistory,
          monthlyRecords: screeningData.paymentHistory.monthlyRecords.map(record => ({
            ...record,
            dueDate: record.dueDate ? Timestamp.fromDate(record.dueDate) : null,
            paidDate: record.paidDate ? Timestamp.fromDate(record.paidDate) : null
          }))
        },
        dataQuality: {
          ...screeningData.dataQuality,
          lastInvoiceDate: screeningData.dataQuality.lastInvoiceDate ? 
            Timestamp.fromDate(screeningData.dataQuality.lastInvoiceDate) : null,
          oldestInvoiceDate: screeningData.dataQuality.oldestInvoiceDate ? 
            Timestamp.fromDate(screeningData.dataQuality.oldestInvoiceDate) : null
        },
        lastUpdated: serverTimestamp(),
        lastMiningRun: serverTimestamp()
      };
      
      // Firestore rejects `undefined` (e.g. portfolioBenchmarks when the user has
      // fewer than 5 tenants), so strip undefined values before writing.
      await setDoc(screeningRef, stripUndefined(firestoreData), { merge: true });
      
    } catch (error) {
      console.error(`Failed to upload screening data for tenant ${screeningData.tenantId}:`, error);
      throw error;
    }
  }

  // ==================== NEW v1.1: QUICK VIEW CACHE ====================

private async updateQuickViewCache(screeningData: ScreeningData): Promise<void> {
  try {
    console.log('[QuickViewCache] Starting cache update for tenant:', screeningData.tenantId);
    
    if (!database.db) {
      console.warn('[QuickViewCache] Database not initialized, skipping quick view cache update');
      return;
    }
    
    const dueRecords = screeningData.paymentHistory.monthlyRecords.filter(r => r.paymentStatus !== 'pending');
    const lastDue = dueRecords.length > 0 ? dueRecords[dueRecords.length - 1] : null;
    const lastPaymentStatus = lastDue ? lastDue.paymentStatus : 'unpaid';
    
    const lastPaymentDate = lastDue ? lastDue.paidDate : null;
    
    const daysSinceLastPayment = lastPaymentDate
      ? Math.floor((Date.now() - lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    
    const earlyWarningFlagsJson = screeningData.earlyWarningFlags
      ? JSON.stringify(screeningData.earlyWarningFlags.flagsRaised)
      : '[]';
    
    // Determine recommended action based on score and data quality
    let recommendedAction: 'approve' | 'conditional' | 'review' | 'reject';
    if (screeningData.calculatedMetrics.screeningScore >= 80 && 
        screeningData.calculatedMetrics.riskLevel === 'low') {
      recommendedAction = 'approve';
    } else if (screeningData.calculatedMetrics.screeningScore >= 65) {
      recommendedAction = 'conditional';
    } else if (screeningData.calculatedMetrics.screeningScore >= 50) {
      recommendedAction = 'review';
    } else {
      recommendedAction = 'reject';
    }
    
    console.log('[QuickViewCache] Prepared data:', {
      tenantId: screeningData.tenantId,
      tenantName: screeningData.tenantName,
      screeningScore: screeningData.calculatedMetrics.screeningScore,
      riskLevel: screeningData.calculatedMetrics.riskLevel,
      recommendedAction,
      lastPaymentStatus,
      daysSinceLastPayment,
      totalArrears: screeningData.calculatedMetrics.totalArrearsAccumulated,
      monthsTracked: screeningData.paymentHistory.totalMonthsTracked
    });
    
    // Use REPLACE to insert or update
    const result = await database.db.run(`
      REPLACE INTO tenant_screening_quick_view (
        tenant_id, tenant_name, tenant_phone, property_id, unit_number,
        current_rent, screening_score, risk_level, on_time_payment_rate,
        total_arrears, months_tracked, last_payment_status,
        days_since_last_payment, early_warning_flags, data_quality_score,
        recommended_action, portfolio_percentile, last_updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      screeningData.tenantId,
      screeningData.tenantName,
      screeningData.tenantPhone,
      screeningData.currentPropertyId,
      screeningData.currentUnitNumber,
      screeningData.currentRentAmount,
      screeningData.calculatedMetrics.screeningScore,
      screeningData.calculatedMetrics.riskLevel,
      screeningData.calculatedMetrics.onTimePaymentRate,
      screeningData.calculatedMetrics.totalArrearsAccumulated,
      screeningData.paymentHistory.totalMonthsTracked,
      lastPaymentStatus,
      daysSinceLastPayment,
      earlyWarningFlagsJson,
      screeningData.dataQuality.dataConfidenceScore,
      recommendedAction,
      screeningData.portfolioBenchmarks?.percentileRank || null
    ]);
    
    console.log('[QuickViewCache] ✅ Successfully updated cache:', {
      tenantId: screeningData.tenantId,
      rowsAffected: result.changes,
      //...(result.lastID !== undefined ? { lastID: result.lastID } : {})
    });
    
  } catch (error) {
    console.error('[QuickViewCache] ❌ Failed to update quick view cache:', {
      tenantId: screeningData.tenantId,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined
    });
    // Don't throw - this is just caching, shouldn't fail the main operation
  }
}

// ==================== NEW v1.1: QUICK VIEW QUERY METHODS ====================

async getQuickScreeningView(userId: number): Promise<any[]> {
  try {
    if (!database.db) {
      throw new Error('Database not initialized');
    }
    
    // Get all properties for this user
    const properties = await database.getProperties(userId);
    const propertyIds = properties.map(p => p.id);
    
    if (propertyIds.length === 0) {
      return [];
    }
    
    const placeholders = propertyIds.map(() => '?').join(',');
    
    // const results = await database.db.query(`
    //   SELECT 
    //     qv.*,
    //     p.name as property_name,
    //     t.lease_end
    //   FROM tenant_screening_quick_view qv
    //   LEFT JOIN properties p ON qv.property_id = p.id
    //   LEFT JOIN tenants t ON qv.tenant_id = t.id
    //   WHERE qv.property_id IN (${placeholders})
    //   ORDER BY qv.screening_score DESC, qv.last_updated DESC
    // `, propertyIds);
    
    // return results.map((row: any) => ({
    //   ...row,
    //   early_warning_flags: row.early_warning_flags ? JSON.parse(row.early_warning_flags) : []
    // }));
    const results = await database.db.query(`
      SELECT 
        qv.*,
        p.name as property_name,
        t.lease_end
      FROM tenant_screening_quick_view qv
      LEFT JOIN properties p ON qv.property_id = p.id
      LEFT JOIN tenants t ON qv.tenant_id = t.id
      WHERE qv.property_id IN (${placeholders})
      ORDER BY qv.screening_score DESC, qv.last_updated DESC
    `, propertyIds);

    const rows = Array.isArray(results) ? results : Object.values(results);
    return rows.map((row: any) => ({
      ...row,
      early_warning_flags: row.early_warning_flags ? JSON.parse(row.early_warning_flags) : []
    }));
  } catch (error) {
    console.error('Failed to get quick screening view:', error);
    return [];
  }
}

async getQuickScreeningByProperty(propertyId: number): Promise<any[]> {
  try {
    if (!database.db) {
      throw new Error('Database not initialized');
    }
    
    const results = await database.db.query(`
      SELECT 
        qv.*,
        t.lease_end,
        t.is_active
      FROM tenant_screening_quick_view qv
      LEFT JOIN tenants t ON qv.tenant_id = t.id
      WHERE qv.property_id = ?
      ORDER BY qv.screening_score DESC
    `, [propertyId]);

    const rows = Array.isArray(results) ? results : Object.values(results);
    
    return rows.map((row: any) => ({
      ...row,
      early_warning_flags: row.early_warning_flags ? JSON.parse(row.early_warning_flags) : []
    }));
    
  } catch (error) {
    console.error('Failed to get quick screening by property:', error);
    return [];
  }
}

async getHighRiskTenants(userId: number): Promise<any[]> {
  try {
    if (!database.db) {
      throw new Error('Database not initialized');
    }
    
    const properties = await database.getProperties(userId);
    const propertyIds = properties.map(p => p.id);
    
    if (propertyIds.length === 0) {
      return [];
    }
    
    const placeholders = propertyIds.map(() => '?').join(',');
    
    const results = await database.db.query(`
      SELECT 
        qv.*,
        p.name as property_name,
        t.lease_end
      FROM tenant_screening_quick_view qv
      LEFT JOIN properties p ON qv.property_id = p.id
      LEFT JOIN tenants t ON qv.tenant_id = t.id
      WHERE qv.property_id IN (${placeholders})
        AND (qv.risk_level = 'high' 
             OR qv.recommended_action = 'reject'
             OR qv.early_warning_flags != '[]')
      ORDER BY qv.screening_score ASC
    `, propertyIds);
    const rows = Array.isArray(results) ? results : Object.values(results);
    return rows.map((row: any) => ({
      ...row,
      early_warning_flags: row.early_warning_flags ? JSON.parse(row.early_warning_flags) : []
    }));
    
  } catch (error) {
    console.error('Failed to get high risk tenants:', error);
    return [];
  }
}

  // ==================== SCHEDULING ====================

  private shouldPerformPeriodicMining(): boolean {
    const lastMiningTime = localStorage.getItem('lastScreeningMining');
    if (!lastMiningTime) return true;
    
    const timeSinceLastMining = Date.now() - new Date(lastMiningTime).getTime();
    return timeSinceLastMining >= this.SCREENING_INTERVAL_MS;
  }

  private updateLastMiningTime(): void {
    localStorage.setItem('lastScreeningMining', new Date().toISOString());
  }

  private scheduleNextMining(userId: number): void {
    setTimeout(() => {
      if (navigator.onLine) {
        this.schedulePeriodicMining(userId);
      } else {
        // Retry in 1 hour if offline
        this.scheduleNextMining(userId);
      }
    }, this.SCREENING_INTERVAL_MS);
  }
}

// Export singleton instance
export const tenantScreeningService = TenantScreeningService.getInstance();

// Integration hooks for FirebaseSync service
let firebaseSyncIntegrated = false;

export const integrateWithFirebaseSync = async (userId: number) => {
  // Patch the sync service only once; re-wrapping nests the hooks and re-runs mining.
  if (!firebaseSyncIntegrated) {
  firebaseSyncIntegrated = true;
  // Hook into successful upload completion
  const originalPerformSafeUploadSync = firebaseSyncService.performSafeUploadSync;
  firebaseSyncService.performSafeUploadSync = async function(userIdParam: number, source: 'scheduled' | 'manual' = 'manual') {
    const result = await originalPerformSafeUploadSync.call(this, userIdParam, source);
    
    // Trigger screening mining after successful upload
    try {
      console.log('🔍 Triggering screening mining after upload completion...');
      await tenantScreeningService.performScreeningMining(userIdParam);
    } catch (error) {
      console.error('❌ Post-upload screening mining failed:', error);
      // Don't fail the upload if screening fails
    }
    
    return result;
  };

  // Hook into successful download completion  
  const originalPerformDownloadSync = firebaseSyncService.performDownloadSync;
  firebaseSyncService.performDownloadSync = async function(userIdParam: number, source: 'signin' | 'manual' = 'manual') {
    const result = await originalPerformDownloadSync.call(this, userIdParam, source);
    
    // Trigger screening mining after successful download
    try {
      console.log('🔍 Triggering screening mining after download completion...');
      await tenantScreeningService.performScreeningMining(userIdParam);
    } catch (error) {
      console.error('❌ Post-download screening mining failed:', error);
      // Don't fail the download if screening fails
    }
    
    return result;
  };
  }

  // For users who can't sync, start periodic mining
  const user = await database.getUserById(userId);// ? firebaseSyncService.getUserById(userId) : null;
  if (!firebaseSyncService.canUserSync(user)) {
    console.log('👤 User cannot sync - starting periodic screening mining');
    tenantScreeningService.schedulePeriodicMining(userId);
  }

  console.log('✅ Tenant screening service integrated with Firebase sync');
};