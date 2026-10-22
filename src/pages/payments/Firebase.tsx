// Firebase.tsx - Firebase Configuration and Services (Updated)
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  RecaptchaVerifier, 
  signInWithPhoneNumber,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  collectionGroup,
  orderBy,
  serverTimestamp,
  onSnapshot,
  Timestamp,
  type Unsubscribe
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyD1hg7YLv08vyR2kSWi2ymxSu2pYCRwPq8",
  authDomain: "plot-9fd6e.firebaseapp.com",
  projectId: "plot-9fd6e",
  storageBucket: "plot-9fd6e.firebasestorage.app",
  messagingSenderId: "1037620305589",
  appId: "1:1037620305589:web:2672a7dcaeca4c46b068fc",
  measurementId: "G-B90H3GJFPM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'africa-south1'); // Match your region

// Types
export interface TenantAccount {
  id: string;
  phone: string;
  email: string;
  fullName: string;
  idNumber: string;
  createdAt: Timestamp;
  role: 'tenant';
}

export interface AgentAccount {
  id: string;
  phone: string;
  email: string;
  name: string;
  role: 'agent';
  tier?: string;
  paymentInfo?: {
    accountId: string; // subaccount_code from Paystack
    split: number; // commission rate
    businessName: string;
    settlementBank: string;
    accountNumber: string;
    email: string;
    name: string;
    phone: string;
    createdAt: any;
    paystackIntegrationCode?: string;
    active: boolean;
  };
}

export interface Invoice {
  id: string;
  localId: number;
  tenantId: number;
  propertyId: number;
  agentUserId: string;
  billingMonth: string;
  rentAmount: number;
  waterCurrentReading: number;
  waterPreviousReading: number;
  waterStandingFee: number;
  waterUnitPrice: number;
  powerCurrentReading: number;
  powerPreviousReading: number;
  powerUnitPrice: number;
  otherCharges: number;
  otherChargesDescription: string;
  totalAmount: number;
  amountPaid: number;
  arrears: number;
  dueDate: string;
  isPaid: boolean;
  paidDate?: string;
  tenantName?: string;
  propertyName?: string;
}

export interface Payment {
  userName: string;
  agentId: string;
  amount: number;
  arrears: number;
  invoiceId: string;
  billingMonth: string;
  currency: string;
  phone: string;
  provider: string;
  reference: string;
  accessCode: string;
  status: 'pending' | 'success' | 'failed';
  initiatedAt: any;
  completedAt?: any;
  paidAmount?: number;
  fees?: number;
  // rent fee split: `amount` is the rent collected; the tenant also paid `tenantFee`; the landlord is deducted `totalDeductions`
  tenantFee?: number;
  chargedAmount?: number;
  totalDeductions?: number;
  netPayout?: number;
  subaccountCode: string;
  commissionRate: number;
}

// Auth Service
export class AuthService {
  private static recaptchaVerifier: RecaptchaVerifier | null = null;

  static initRecaptcha(containerId: string): void {
    if (!this.recaptchaVerifier) {
      this.recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
        size: 'invisible',
        callback: () => {
          console.log('reCAPTCHA verified');
        }
      });
    }
  }

  static async sendVerificationCode(phoneNumber: string): Promise<any> {
    try {
      if (!this.recaptchaVerifier) {
        throw new Error('reCAPTCHA not initialized');
      }

      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
      const confirmationResult = await signInWithPhoneNumber(auth, formattedPhone, this.recaptchaVerifier);
      return confirmationResult;
    } catch (error: any) {
      console.error('Error sending verification code:', error);
      throw new Error(error.message || 'Failed to send verification code');
    }
  }

  static async verifyCode(confirmationResult: any, code: string): Promise<FirebaseUser> {
    try {
      const result = await confirmationResult.confirm(code);
      return result.user;
    } catch (error: any) {
      console.error('Error verifying code:', error);
      throw new Error('Invalid verification code');
    }
  }

  static async signInWithEmailPassword(email: string, password: string): Promise<FirebaseUser> {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      return userCredential.user;
    } catch (error: any) {
      console.error('Email/Password sign in error:', error);
      throw error;
    }
  }

  static async signOut(): Promise<void> {
    await signOut(auth);
  }

  static onAuthChange(callback: (user: FirebaseUser | null) => void): Unsubscribe {
    return onAuthStateChanged(auth, callback);
  }
}

// Tenant Service
export class TenantService {
  static async createTenant(data: {
    phone: string;
    email: string;
    fullName: string;
    idNumber: string;
  }): Promise<string> {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not authenticated');

      const tenantDoc = doc(db, 'tenants', user.uid);
      await setDoc(tenantDoc, {
        ...data,
        id: user.uid,
        role: 'tenant',
        createdAt: serverTimestamp()
      });

      return user.uid;
    } catch (error: any) {
      console.error('Error creating tenant:', error);
      throw new Error(error.message || 'Failed to create tenant account');
    }
  }

  static async getTenant(uid: string): Promise<TenantAccount | null> {
    try {
      const tenantDoc = await getDoc(doc(db, 'tenants', uid));
      if (!tenantDoc.exists()) return null;
      return tenantDoc.data() as TenantAccount;
    } catch (error) {
      console.error('Error fetching tenant:', error);
      return null;
    }
  }

  static async findTenantInvoices(tenantId: string): Promise<Invoice[]> {
    try {
      const invoices: Invoice[] = [];
      
      const q = query(
        collectionGroup(db, 'tenants'),
        where('localId', '==', parseInt(tenantId))
      );
      
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        return [];
      }

      const tenantDoc = querySnapshot.docs[0];
      const tenantPath = tenantDoc.ref.path;
      const userId = tenantPath.split('/')[1];

      const invoicesQuery = query(
        collection(db, 'users', userId, 'invoices'),
        where('tenantId', '==', parseInt(tenantId)),
        orderBy('dueDate', 'desc')
      );

      const invoicesSnapshot = await getDocs(invoicesQuery);
      
      for (const doc of invoicesSnapshot.docs) {
        const data = doc.data();
        invoices.push({
          id: doc.id,
          localId: data.localId,
          tenantId: data.tenantId,
          propertyId: data.propertyId,
          agentUserId: userId,
          billingMonth: data.billingMonth,
          rentAmount: data.rentAmount,
          waterCurrentReading: data.waterCurrentReading || 0,
          waterPreviousReading: data.waterPreviousReading || 0,
          waterStandingFee: data.waterStandingFee || 0,
          waterUnitPrice: data.waterUnitPrice || 0,
          powerCurrentReading: data.powerCurrentReading || 0,
          powerPreviousReading: data.powerPreviousReading || 0,
          powerUnitPrice: data.powerUnitPrice || 0,
          otherCharges: data.otherCharges || 0,
          otherChargesDescription: data.otherChargesDescription || '',
          totalAmount: data.totalAmount,
          amountPaid: data.amountPaid || 0,
          arrears: data.arrears || 0,
          dueDate: data.dueDate,
          isPaid: data.isPaid || false,
          paidDate: data.paidDate,
          tenantName: tenantDoc.data()?.name,
          propertyName: data.propertyName
        });
      }

      return invoices;
    } catch (error) {
      console.error('Error finding tenant invoices:', error);
      throw new Error('Failed to fetch invoices');
    }
  }

  static async getPaymentHistory(tenantId: string, agentUserId?: string): Promise<Payment[]> {
    try {
      const payments: Payment[] = [];
      
      if (agentUserId) {
        // Fetch from payments subcollection using billingMonths structure
        const paymentsSnapshot = await getDocs(
          collection(db, 'payments', tenantId, 'billingMonths')
        );
        
        for (const monthDoc of paymentsSnapshot.docs) {
          const monthData = monthDoc.data();
          if (monthData.payments && Array.isArray(monthData.payments)) {
            payments.push(...monthData.payments);
          }
        }
      } else {
        // Fallback: search transactions collection
        const transactionsQuery = query(
          collection(db, 'transactions'),
          where('userId', '==', tenantId),
          orderBy('createdAt', 'desc')
        );
        
        const snapshot = await getDocs(transactionsQuery);
        for (const doc of snapshot.docs) {
          const data = doc.data();
          payments.push({
            userName: data.userName || '',
            agentId: data.agentId || '',
            amount: data.amount || 0,
            arrears: data.arrears || 0,
            invoiceId: data.invoiceId || '',
            billingMonth: data.billingMonth || '',
            currency: 'KES',
            phone: '',
            provider: '',
            reference: data.reference || doc.id,
            accessCode: '',
            status: data.status || 'pending',
            initiatedAt: data.createdAt,
            completedAt: data.completedAt,
            subaccountCode: '',
            commissionRate: 0,
            tenantFee: typeof data.tenantFeeMinor === 'number' ? data.tenantFeeMinor / 100 : undefined,
            chargedAmount: typeof data.chargeMinor === 'number' ? data.chargeMinor / 100 : undefined,
            totalDeductions: typeof data.deductionsMinor === 'number' ? data.deductionsMinor / 100 : undefined,
            netPayout: typeof data.netPayoutMinor === 'number' ? data.netPayoutMinor / 100 : undefined
          });
        }
      }
      
      // Sort by date
      return payments.sort((a, b) => {
        const dateA = a.completedAt || a.initiatedAt;
        const dateB = b.completedAt || b.initiatedAt;
        if (!dateA || !dateB) return 0;
        return dateB.toMillis() - dateA.toMillis();
      });
    } catch (error) {
      console.error('Error fetching payment history:', error);
      return [];
    }
  }
}

// Agent Service
export class AgentService {
  static async getAgent(userId: string): Promise<AgentAccount | null> {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (!userDoc.exists()) return null;
      
      const data = userDoc.data();
      return {
        id: userId,
        phone: data.phone || '',
        email: data.email || '',
        name: data.name || '',
        role: 'agent',
        tier: data.tier,
        paymentInfo: data.paymentInfo
      };
    } catch (error) {
      console.error('Error fetching agent:', error);
      return null;
    }
  }

  static async getInvoicesByAgent(userId: string): Promise<Invoice[]> {
    try {
      const invoices: Invoice[] = [];
      const invoicesQuery = query(
        collection(db, 'users', userId, 'invoices'),
        orderBy('dueDate', 'desc')
      );

      const snapshot = await getDocs(invoicesQuery);
      
      for (const docSnapshot of snapshot.docs) {
        const data = docSnapshot.data();
        
        let tenantName = 'Unknown';
        try {
          const tenantDocRef = doc(
            collection(db, 'users', userId, 'tenants'),
            data.tenantId.toString()
          );
          const tenantDoc = await getDoc(tenantDocRef);
          if (tenantDoc.exists()) {
            const tenantData = tenantDoc.data() as { name?: string };
            tenantName = tenantData.name || 'Unknown';
          }
        } catch {}

        invoices.push({
          id: docSnapshot.id,
          localId: data.localId,
          tenantId: data.tenantId,
          propertyId: data.propertyId,
          agentUserId: userId,
          billingMonth: data.billingMonth,
          rentAmount: data.rentAmount,
          waterCurrentReading: data.waterCurrentReading || 0,
          waterPreviousReading: data.waterPreviousReading || 0,
          waterStandingFee: data.waterStandingFee || 0,
          waterUnitPrice: data.waterUnitPrice || 0,
          powerCurrentReading: data.powerCurrentReading || 0,
          powerPreviousReading: data.powerPreviousReading || 0,
          powerUnitPrice: data.powerUnitPrice || 0,
          otherCharges: data.otherCharges || 0,
          otherChargesDescription: data.otherChargesDescription || '',
          totalAmount: data.totalAmount,
          amountPaid: data.amountPaid || 0,
          arrears: data.arrears || 0,
          dueDate: data.dueDate,
          isPaid: data.isPaid || false,
          paidDate: data.paidDate,
          tenantName
        });
      }

      return invoices;
    } catch (error) {
      console.error('Error fetching agent invoices:', error);
      return [];
    }
  }

  static async getPaymentsByAgent(userId: string): Promise<Payment[]> {
    try {
      const payments: Payment[] = [];
      
      // Fetch from transactions collection
      const transactionsQuery = query(
        collection(db, 'transactions'),
        where('agentId', '==', userId),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(transactionsQuery);
      for (const doc of snapshot.docs) {
        const data = doc.data();
        payments.push({
          userName: data.userName || '',
          agentId: data.agentId || userId,
          amount: data.amount || 0,
          arrears: data.arrears || 0,
          invoiceId: data.invoiceId || '',
          billingMonth: data.billingMonth || '',
          currency: 'KES',
          phone: '',
          provider: '',
          reference: data.reference || doc.id,
          accessCode: '',
          status: data.status || 'pending',
          initiatedAt: data.createdAt,
          completedAt: data.completedAt,
          subaccountCode: '',
          commissionRate: 0,
          tenantFee: typeof data.tenantFeeMinor === 'number' ? data.tenantFeeMinor / 100 : undefined,
          chargedAmount: typeof data.chargeMinor === 'number' ? data.chargeMinor / 100 : undefined,
          totalDeductions: typeof data.deductionsMinor === 'number' ? data.deductionsMinor / 100 : undefined,
          netPayout: typeof data.netPayoutMinor === 'number' ? data.netPayoutMinor / 100 : undefined
        });
      }

      return payments;
    } catch (error) {
      console.error('Error fetching agent payments:', error);
      return [];
    }
  }

  static async setupPaymentAccount(data: {
    businessName: string;
    settlementBank: 'mpesa' | 'airtel-ke';
    accountNumber: string;
    email: string;
    name: string;
    phone: string;
    userId: string;
  }): Promise<void> {
    try {
      const setupAccount = httpsCallable(functions, 'setupAccount');
      const result = await setupAccount(data);
      
      console.log('Payment account setup result:', result.data);
    } catch (error: any) {
      console.error('Error setting up payment account:', error);
      throw new Error(error.message || 'Failed to setup payment account');
    }
  }
}

// Payment Service
export class PaymentService {
  // Rent fee split (mirrors functions/src/desk/rentFees.ts — the server is authoritative). Integer minor units.
  //   tenant pays rent + min(KES 150, 0.5%); landlord covers the rest of Paystack's ~1.5% plus a 0.2% convenience fee.
    // Platform cut by the landlord's plan (mirrors functions/src/desk/rentFees.ts): enterprise 0.2, pro 0.4, business 0.65, else 0.95
  static conveniencePctForTier(tier?: string): number {
    const t = String(tier ?? '').trim().toLowerCase();
    return t === 'enterprise' ? 0.2 : (t === 'pro' || t === 'professional') ? 0.4 : t === 'business' ? 0.65 : 0.95;
  }

  static calculateFees(amount: number, invoiceBalance: number, tier?: string): {
    tenantFee: number;
    total: number;
    netAmount: number;
    landlordPaystackFee: number;
    convenienceFee: number;
    deductions: number;
    netPayout: number;
    arrears: number;
  } {
    const pct = (minor: number, p: number) => Math.floor((minor * Math.round(p * 100) + 5000) / 10000);
    const rent = Math.round(amount * 100);
    const tenantFee = Math.min(pct(rent, 0.5), 15000);
    const paystackEstimate = Math.min(pct(rent, 1.5), 300000);
    const landlordPaystackFee = Math.max(0, paystackEstimate - tenantFee);
    const convenienceFee = pct(rent, PaymentService.conveniencePctForTier(tier));
    const deductions = landlordPaystackFee + convenienceFee;
    const arrears = amount < invoiceBalance ? invoiceBalance - amount : 0;

    return {
      tenantFee: tenantFee / 100,
      total: (rent + tenantFee) / 100,
      netAmount: rent / 100,
      landlordPaystackFee: landlordPaystackFee / 100,
      convenienceFee: convenienceFee / 100,
      deductions: deductions / 100,
      netPayout: (rent - deductions) / 100,
      arrears: Math.round(arrears * 100) / 100
    };
  }

  static formatPhoneNumber(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    
    if (digits.startsWith('254')) {
      return digits.length === 12 ? digits : '';
    } else if (digits.startsWith('0')) {
      return digits.length === 10 ? `254${digits.substring(1)}` : '';
    } else if (digits.startsWith('7') || digits.startsWith('1')) {
      return digits.length === 9 ? `254${digits}` : '';
    }
    
    return '';
  }

  static async initiatePayment(data: {
    invoiceId: number;
    invoice: Invoice;
    tenantName: string;
    amount: number;
    phone: string;
    paymentMethod: 'mpesa' | 'airtel_money';
  }): Promise<{ reference: string; accessCode: string; authorizationUrl: string; message: string }> {
    try {
      const formattedPhone = this.formatPhoneNumber(data.phone);
      if (!formattedPhone) {
        throw new Error('Invalid phone number format');
      }

      const fees = this.calculateFees(data.amount, data.invoice.totalAmount - data.invoice.amountPaid);
      
      // Map payment method to provider
      const provider = data.paymentMethod === 'mpesa' ? 'mpesa' : 'atl';

      const processPayment = httpsCallable(functions, 'processPayment');
      const result: any = await processPayment({
        email: `tenant${data.invoice.tenantId}@plot.app`, // Generate email
        amount: data.amount,
        currency: 'KES',
        phone: formattedPhone,
        provider: provider,
        metadata: {
          userId: data.invoice.tenantId.toString(),
          userName: data.tenantName,
          invoiceId: data.invoice.id,
          billingMonth: data.invoice.billingMonth,
          arrears: fees.arrears,
          agentId: data.invoice.agentUserId
        }
      });

      if (!result.data.success) {
        throw new Error(result.data.message || 'Payment initiation failed');
      }

      return {
        reference: result.data.data.reference,
        accessCode: result.data.data.accessCode,
        authorizationUrl: result.data.data.authorizationUrl,
        message: result.data.message
      };
    } catch (error: any) {
      console.error('Error initiating payment:', error);
      throw new Error(error.message || 'Failed to initiate payment');
    }
  }

  static listenToPaymentStatus(
    reference: string,
    callback: (payment: any) => void
  ): Unsubscribe {
    const transactionRef = doc(db, 'transactions', reference);
    return onSnapshot(transactionRef, (doc) => {
      if (doc.exists()) {
        callback({ id: doc.id, ...doc.data() });
      }
    });
  }
}

export default {
  auth,
  db,
  functions,
  AuthService,
  TenantService,
  AgentService,
  PaymentService
};