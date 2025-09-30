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
  paymentStatus: 'early' | 'on_time' | 'late' | 'unpaid';
  daysLate: number;
  invoiceCount: number;
  hadMultipleInvoices: boolean;
}

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
}

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
  };
  lastUpdated: Date;
  lastMiningRun: Date;
  sourceUserId: number;
  dataVersion: number;
}

export class TenantScreeningService {
  private static instance: TenantScreeningService;
  private miningInProgress = false;
  private readonly SCREENING_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly SIX_MONTHS_AGO = new Date(Date.now() - (6 * 30 * 24 * 60 * 60 * 1000));
  
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

      // Get tenant's invoices from last 6 months
      const invoices = await this.getTenantInvoicesLast6Months(tenant.id);
      
      if (invoices.length === 0) {
        console.log(`⚠️ No recent invoices found for tenant ${tenant.id}, skipping`);
        return;
      }

      // Get property info
      //const property = await database.getPropertyById(tenant.propertyId);
      
      // Mine monthly payment patterns
      const monthlyRecords = this.generateMonthlyRecords(invoices);
      
      // Calculate screening metrics
      const calculatedMetrics = this.calculateScreeningMetrics(monthlyRecords, invoices);
      
      // Assess data quality
      const dataQuality = this.assessDataQuality(monthlyRecords, invoices);
      
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
          monthlyRecords
        },
        calculatedMetrics,
        dataQuality,
        lastUpdated: new Date(),
        lastMiningRun: new Date(),
        sourceUserId: userId,
        dataVersion: 1
      };

      // Upload to Firestore
      await this.uploadScreeningData(screeningData);
      console.log(`✅ Screening data uploaded for tenant ${tenant.id}`);

    } catch (error) {
      console.error(`❌ Failed to mine tenant ${tenant.id}:`, error);
      throw error;
    }
  }

  private async getTenantInvoicesLast6Months(tenantId: number): Promise<Invoice[]> {
    try {
      const allInvoices = await database.getInvoices({ tenantId });
      
      // Filter to last 6 months
      return allInvoices.filter(invoice => {
        const invoiceDate = new Date(invoice.createdAt);
        return invoiceDate >= this.SIX_MONTHS_AGO;
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
      invoiceCount: invoices.length,
      hadMultipleInvoices: invoices.length > 1
    };
  }

  private calculatePaymentTiming(
    dueDate: Date | null, 
    paidDate: Date | null, 
    amountPaid: number, 
    _totalBilled: number
  ): { paymentStatus: 'early' | 'on_time' | 'late' | 'unpaid'; daysLate: number } {
    
    if (amountPaid === 0) {
      return { paymentStatus: 'unpaid', daysLate: 0 };
    }

    if (!dueDate || !paidDate) {
      return { paymentStatus: 'unpaid', daysLate: 0 };
    }

    const daysDiff = Math.floor((paidDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff < 0) {
      return { paymentStatus: 'early', daysLate: 0 };
    } else if (daysDiff === 0) {
      return { paymentStatus: 'on_time', daysLate: 0 };
    } else {
      return { paymentStatus: 'late', daysLate: daysDiff };
    }
  }

  // ==================== METRICS CALCULATION ====================

  private calculateScreeningMetrics(monthlyRecords: MonthlyRecord[], invoices: Invoice[]): CalculatedMetrics {
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
      improvingTrend
    });
    
    const riskLevel = this.determineRiskLevel(screeningScore);

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
      riskLevel
    };
  }

  private calculateScreeningScore(factors: {
    onTimePaymentRate: number;
    averageDaysLate: number;
    paymentCompletionRate: number;
    averageMonthlyArrears: number;
    longestNonPaymentStreak: number;
    improvingTrend: boolean;
  }): number {
    let score = 0;
    
    // On-time payment rate (40% weight)
    score += factors.onTimePaymentRate * 40;
    
    // Payment completion rate (25% weight)
    score += factors.paymentCompletionRate * 25;
    
    // Late payment penalty (15% weight)
    const latePenalty = Math.min(factors.averageDaysLate / 30, 1); // Cap at 30 days
    score += (1 - latePenalty) * 15;
    
    // Arrears penalty (10% weight)
    const arrearsPenalty = Math.min(factors.averageMonthlyArrears / 10000, 1); // Cap at 10k KES
    score += (1 - arrearsPenalty) * 10;
    
    // Non-payment streak penalty (5% weight)
    const streakPenalty = Math.min(factors.longestNonPaymentStreak / 3, 1); // Cap at 3 months
    score += (1 - streakPenalty) * 5;
    
    // Improving trend bonus (5% weight)
    if (factors.improvingTrend) {
      score += 5;
    }
    
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
      
      await setDoc(screeningRef, firestoreData, { merge: true });
      
    } catch (error) {
      console.error(`Failed to upload screening data for tenant ${screeningData.tenantId}:`, error);
      throw error;
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
export const integrateWithFirebaseSync = async (userId: number) => {
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

  // For users who can't sync, start periodic mining
  const user = await database.getUserById(userId);// ? firebaseSyncService.getUserById(userId) : null;
  if (!firebaseSyncService.canUserSync(user)) {
    console.log('👤 User cannot sync - starting periodic screening mining');
    tenantScreeningService.schedulePeriodicMining(userId);
  }

  console.log('✅ Tenant screening service integrated with Firebase sync');
};