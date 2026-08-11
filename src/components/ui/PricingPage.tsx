import React, { useState, useEffect } from 'react';
import { Check, X, Building, Users, Cloud, FileText, Shield, Star, Zap, Crown, ExternalLink, Phone, Mail, CreditCard, Database, Loader, RefreshCw, MessageSquare } from 'lucide-react';
import { Purchases, type PurchasesPackage } from '@revenuecat/purchases-capacitor';
import { Capacitor } from '@capacitor/core';
import { db } from '../../services/database/FirebaseSync';
import { collection, getDocs } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import SmsPurchaseModal from '../../pages/sms/SmsPurchaseModal';

interface PricingModalProps {
  isOpen: boolean;
  onClose: (planSelected?: string) => void;
  canDismiss?: boolean;
  currentPlan?: string;
  userId?: number;
  userPhone?: number;
}

interface FirestorePlan {
  name: string;
  price: number;
  type: 'monthly' | 'annual';
  properties: number;
  tenants: number;
  sync: boolean;
  features: string[];
}

interface PlanData {
  id: string;
  name: string;
  monthlyPackage?: PurchasesPackage;
  annualPackage?: PurchasesPackage;
  monthlyPrice?: number;
  annualPrice?: number;
  popular: boolean;
  color: string;
  headerColor: string;
  buttonColor: string;
  offeringId: string | null;
  limits: {
    properties: number | string;
    tenants: number | string;
    sync: boolean;
    branding: string;
    support: string;
  };
  features: Array<{
    name: string;
    included: boolean;
    note?: string;
  }>;
}

interface PurchaseConfirmationProps {
  isOpen: boolean;
  plan: PlanData | null;
  billingCycle: 'monthly' | 'annual';
  onClose: () => void;
  onPurchase: () => void;
  onContactSales: () => void;
  isLoading?: boolean;
}

interface WebPaymentModalProps {
  isOpen: boolean;
  plan: PlanData | null;
  billingCycle: 'monthly' | 'annual';
  onClose: () => void;
  onPurchase: (phone: string) => void;
  isLoading?: boolean;
  currentUser: any;
}

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
//export const auth = getAuth(app);
//export const db = getFirestore(app);
export const functions = getFunctions(app, 'africa-south1');

const WebPaymentModal: React.FC<WebPaymentModalProps> = ({
  isOpen,
  plan,
  billingCycle,
  onClose,
  onPurchase,
  isLoading,
  currentUser
}) => {
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');

  // useEffect(() => {
  //   if (currentUser?.phone) {
  //     setPhone(currentUser.phone);
  //   }
  // }, [currentUser]);

  if (!isOpen || !plan) return null;

  const price = billingCycle === 'monthly' ? plan.monthlyPrice : plan.annualPrice;

  const validatePhone = () => {
    const cleanPhone = phone.replace(/[\s-]/g, '');
    if (!cleanPhone || !/^(254|0)[17]\d{8}$/.test(cleanPhone)) {
      setPhoneError('Valid Kenyan phone number required (e.g., 0712345678 or 254712345678)');
      return false;
    }
    setPhoneError('');
    return true;
  };

  const handlePurchase = () => {
    if (validatePhone()) {
      onPurchase(phone);
    }
  };

  return (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-auto max-h-[90vh] overflow-y-auto">
      {/* Header */}
      <div className={`${plan.headerColor} px-6 py-5 sticky top-0 z-10`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-gray-900 flex items-center">
              <Crown className="w-6 h-6 mr-2 text-yellow-600" />
              Confirm Subscription
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Pay with M-Pesa
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/50 transition-colors"
          >
            ×
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6 space-y-6">
        {/* Plan and Pricing Summary */}
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-2xl font-bold text-gray-900">{plan.name}</h4>
              <p className="text-sm text-gray-600 mt-1">
                {billingCycle === 'monthly' ? 'Monthly' : 'Annual'} Subscription
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-gray-900">
                KES {price?.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                /{billingCycle === 'monthly' ? 'month' : 'year'}
              </div>
            </div>
          </div>
        </div>

        {/* Two Column Layout for Desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Account Info & Phone Input */}
          <div className="space-y-6">
            {/* Account Information */}
            <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
              <h5 className="font-semibold text-gray-900 mb-4 flex items-center">
                <Users className="w-4 h-4 mr-2" />
                Account Information
              </h5>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="text-gray-600">Name:</span>
                  <span className="font-medium text-gray-900">{currentUser?.name || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="text-gray-600">Email:</span>
                  <span className="font-medium text-gray-900 truncate ml-2">{currentUser?.email || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600">User ID:</span>
                  <span className="font-medium text-gray-900">{currentUser?.id || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Phone Number Input */}
            <div className="bg-white rounded-xl p-5 border-2 border-gray-200">
              <label className="block text-sm font-semibold text-gray-900 mb-3">
                M-Pesa Phone Number *
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={`w-full pl-10 pr-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all ${
                    phoneError ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="0712345678 or 254712345678"
                />
              </div>
              {phoneError && (
                <p className="text-red-500 text-xs mt-2 flex items-center">
                  <X className="w-3 h-3 mr-1" />
                  {phoneError}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-2 flex items-center">
                <Phone className="w-3 h-3 mr-1" />
                This number will receive the M-Pesa payment prompt
              </p>
            </div>
          </div>

          {/* Right Column - Features */}
          <div className="space-y-6">
            <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
              <h5 className="font-semibold text-gray-900 mb-4 flex items-center">
                <Check className="w-4 h-4 mr-2 text-green-600" />
                What's Included
              </h5>
              <div className="space-y-3">
                {plan.features.slice(0, 8).map((feature, index) => (
                  feature.included && (
                    <div key={index} className="flex items-start">
                      <Check className="h-4 w-4 text-green-600 mr-3 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-gray-700">{feature.name}</span>
                    </div>
                  )
                ))}
              </div>
            </div>

            {/* Payment Info Box */}
            <div className="bg-green-50 rounded-xl p-5 border border-green-200">
              <div className="flex items-center mb-3">
                <Phone className="h-5 w-5 text-green-600 mr-2" />
                <span className="font-semibold text-green-900">M-Pesa Payment</span>
              </div>
              <p className="text-sm text-green-700 leading-relaxed">
                You'll receive an M-Pesa prompt on your phone. Enter your M-Pesa PIN to complete the payment.
                Subscription starts immediately after payment confirmation.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3 pt-4 border-t border-gray-200">
          <button
            onClick={handlePurchase}
            disabled={isLoading || !phone}
            className={`w-full bg-green-600 hover:bg-green-700 text-white py-4 px-6 rounded-xl font-semibold text-lg transition-all duration-200 flex items-center justify-center space-x-3 ${
              isLoading || !phone ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-lg hover:scale-[1.02]'
            }`}
          >
            {isLoading ? (
              <Loader className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <CreditCard className="w-6 h-6" />
                <span>Pay KES {price?.toLocaleString()} with M-Pesa</span>
              </>
            )}
          </button>

          <p className="text-xs text-gray-500 text-center leading-relaxed px-4">
            By continuing, you agree to our Terms of Service and Privacy Policy.
            <br />
            No automatic renewals - you control when to pay next.
          </p>
        </div>
      </div>
    </div>
  </div>
);
};

const PurchaseConfirmationModal: React.FC<PurchaseConfirmationProps> = ({
  isOpen,
  plan,
  billingCycle,
  onClose,
  onPurchase,
  onContactSales,
  isLoading = false
}) => {
  if (!isOpen || !plan) return null;

  const currentPackage = billingCycle === 'monthly' ? plan.monthlyPackage : plan.annualPackage;
  const monthlyPackage = plan.monthlyPackage;

  const getAnnualDiscount = () => {
    if (billingCycle === 'annual' && plan.annualPackage && monthlyPackage) {
      const annualPrice = typeof plan.annualPackage.product.price === 'string' 
        ? parseFloat(plan.annualPackage.product.price) 
        : plan.annualPackage.product.price;
      const monthlyPrice = typeof monthlyPackage.product.price === 'string' 
        ? parseFloat(monthlyPackage.product.price) 
        : monthlyPackage.product.price;
      const monthlyEquivalent = monthlyPrice * 12;
      
      const discount = Math.round((1 - annualPrice / monthlyEquivalent) * 100);
      return discount > 0 ? discount : 0;
    }
    return 0;
  };

  const discount = getAnnualDiscount();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        <div className={`${plan.headerColor} px-6 py-4`}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center">
                <Crown className="w-5 h-5 mr-2 text-yellow-600" />
                Confirm Purchase
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                You're about to subscribe to {plan.name}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl font-bold w-6 h-6 flex items-center justify-center"
            >
              ×
            </button>
          </div>
        </div>

        <div className="px-6 py-6">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-xl font-bold text-gray-900">{plan.name}</h4>
                <p className="text-sm text-gray-600">
                  {billingCycle === 'monthly' ? 'Monthly' : 'Annual'} Subscription
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">
                  {currentPackage?.product.priceString || 'Loading...'}
                </div>
                <div className="text-sm text-gray-600">
                  /{billingCycle === 'monthly' ? 'month' : 'year'}
                </div>
                {billingCycle === 'annual' && monthlyPackage && (
                  <div className="text-xs text-gray-500 line-through">
                    Was {monthlyPackage.product.currencyCode} {
                      ((typeof monthlyPackage.product.price === 'string' 
                        ? parseFloat(monthlyPackage.product.price) 
                        : monthlyPackage.product.price) * 12).toLocaleString()
                    }/year
                  </div>
                )}
                {discount > 0 && (
                  <div className="text-xs text-green-600 font-medium">
                    Save {discount}% annually!
                  </div>
                )}
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h5 className="font-semibold text-gray-900 mb-3 text-sm">What's included:</h5>
              <div className="space-y-2">
                {plan.features.slice(0, 6).map((feature, index) => (
                  feature.included && (
                    <div key={index} className="flex items-start">
                      <Check className="h-4 w-4 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-gray-700">{feature.name}</span>
                    </div>
                  )
                ))}
              </div>
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <div className="flex items-center mb-2">
              <Zap className="h-5 w-5 text-blue-600 mr-2" />
              <span className="font-semibold text-blue-900 text-sm">30-Day Free Trial</span>
            </div>
            <p className="text-xs text-blue-700">
              Start your free trial now. You won't be charged until the trial period ends. 
              Cancel anytime during the trial at no cost.
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={onPurchase}
              disabled={isLoading}
              className={`w-full bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-lg font-medium transition-all duration-200 flex items-center justify-center space-x-2 ${
                isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-lg'
              }`}
            >
              {isLoading ? (
                <Loader className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <CreditCard className="w-5 h-5" />
                  <span>Start Free Trial</span>
                </>
              )}
            </button>
            
            <button
              onClick={onContactSales}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 px-4 rounded-lg font-medium transition-all duration-200 flex items-center justify-center space-x-2"
            >
              <Phone className="w-5 h-5" />
              <span>Contact Sales Team</span>
            </button>
          </div>

          <p className="text-xs text-gray-500 mt-4 text-center">
            By continuing, you agree to our Terms of Service and Privacy Policy.
            You can cancel your subscription anytime.
          </p>
        </div>
      </div>
    </div>
  );
};

const PricingModal: React.FC<PricingModalProps> = ({ 
  isOpen, 
  onClose, 
  canDismiss = true,
  currentPlan = 'free',
  userId,
  userPhone
}) => {
  const [selectedPlan, setSelectedPlan] = useState(currentPlan);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedPlanForPurchase, setSelectedPlanForPurchase] = useState<PlanData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [allOfferings, setAllOfferings] = useState<Record<string, any> | null>(null);
  const [storagePackage, setStoragePackage] = useState<PurchasesPackage | null>(null);
  const [firestorePlans, setFirestorePlans] = useState<PlanData[]>([]);
  const [showWebPaymentModal, setShowWebPaymentModal] = useState(false);
  const [showSmsPurchase, setShowSmsPurchase] = useState(false);


  // const isNativePlatform = Capacitor.isNativePlatform();
  // const isWeb = !isNativePlatform;
  const platform = Capacitor.getPlatform();
  const isNativePlatform = platform === 'ios' || platform === 'android';
  const isWeb = platform === 'web';
  console.log('PLATFORM:', platform, isNativePlatform, isWeb);

  const marketingMessages = [
    "🏠 Professional Property Management Services Available",
    "📊 Upgrade to Premium - Remove Watermarks & Get More Properties", 
    "🔒 Secure Online Data Backup - Never Lose Your Data Again",
    "✨ Custom Branding Available - Make It Yours",
    "📋 Professional Tenant Screening Services"
  ];

  const planStructure = [
    {
      id: 'solo',
      name: 'Solo Property Enterprise',
      popular: true,
      color: 'bg-yellow-50 border-yellow-300',
      headerColor: 'bg-yellow-100',
      buttonColor: 'bg-yellow-600 hover:bg-yellow-700',
      offeringId: 'solo',
      limits: {
        properties: 1,
        tenants: 20,
        sync: true,
        branding: 'PlotYangu branding',
        support: 'WhatsApp'
      },
      features: [
        { name: '1 Property', included: true },
        { name: 'Up to 20 Tenants', included: true },
        { name: 'Invoice Generation', included: true },
        { name: 'Automated WhatsApp Notifications', included: true },
        { name: 'Multi-device Cloud Sync', included: true },
        { name: 'Custom Logo/Branding', included: false },
        { name: 'Advanced Reports', included: false },
        { name: 'Excel/PDF Export', included: false },
        { name: 'Priority Support', included: false },
        { name: 'Arrears Tracking', included: false }
      ]
    },
    {
      id: 'free',
      name: 'Free Forever',
      popular: false,
      color: 'bg-gray-50 border-gray-200',
      headerColor: 'bg-gray-100',
      buttonColor: 'bg-gray-600 hover:bg-gray-700',
      offeringId: null,
      limits: {
        properties: 1,
        tenants: 5,
        sync: false,
        branding: 'Heavy PlotYangu branding',
        support: 'Community'
      },
      features: [
        { name: '1 Properties', included: true },
        { name: 'Up to 5 Tenants', included: true },
        { name: 'Invoice Generation', included: true },
        { name: 'Local Storage Only', included: true },
        { name: 'WhatsApp/Email Sharing', included: true },
        { name: 'Heavy PlotYangu Branding', included: true, note: 'Company promotion on invoices' },
        { name: 'Multi-device Sync', included: false },
        { name: 'Custom Branding', included: false },
        { name: 'Priority Support', included: false }
      ]
    },
    {
      id: 'starter',
      name: 'Starter',
      popular: false,
      color: 'bg-blue-50 border-blue-200',
      headerColor: 'bg-blue-100',
      buttonColor: 'bg-blue-600 hover:bg-blue-700',
      offeringId: 'starter',
      limits: {
        properties: 3,
        tenants: 30,
        sync: false,
        branding: 'Light footer branding',
        support: 'Email'
      },
      features: [
        { name: 'Up to 3 Properties', included: true },
        { name: 'Up to 30 Tenants', included: true },
        { name: 'Invoice Generation', included: true },
        { name: 'Local Storage', included: true },
        { name: 'WhatsApp/Email Sharing', included: true },
        { name: 'Light Footer Branding', included: true, note: 'Minimal company promotion' },
        { name: 'Basic Reports', included: true },
        { name: 'Multi-device Sync', included: false },
        { name: 'Custom Logo', included: false }
      ]
    },
    {
      id: 'business',
      name: 'Business',
      popular: false,
      color: 'bg-green-50 border-green-300',
      headerColor: 'bg-green-100',
      buttonColor: 'bg-green-600 hover:bg-green-700',
      offeringId: 'business',
      limits: {
        properties: 9,
        tenants: 126,
        sync: true,
        branding: 'Your logo, no PlotYangu branding',
        support: 'Priority email'
      },
      features: [
        { name: 'Up to 9 Properties', included: true },
        { name: 'Up to 126 Tenants', included: true },
        { name: 'Invoice Generation', included: true },
        { name: 'Multi-device Cloud Sync', included: true },
        { name: 'Custom Logo/Branding', included: true },
        { name: 'Advanced Reports', included: false },
        { name: 'Excel/PDF Export', included: true },
        { name: 'Priority Support', included: true },
        { name: 'Arrears Tracking', included: true }
      ]
    },
    {
      id: 'pro',
      name: 'Professional',
      popular: true,
      color: 'bg-orange-50 border-orange-300',
      headerColor: 'bg-orange-100',
      buttonColor: 'bg-orange-600 hover:bg-orange-700',
      offeringId: 'pro',
      limits: {
        properties: 16,
        tenants: 300,
        sync: true,
        branding: 'Your logo, no PlotYangu branding',
        support: 'Priority email, Priority WhatsApp'
      },
      features: [
        { name: 'Up to 16 Properties', included: true },
        { name: 'Up to 300 Tenants', included: true },
        { name: 'Invoice Generation', included: true },
        { name: 'Automated WhatsApp Notifications', included: true },
        { name: 'Multi-device Cloud Sync', included: true },
        { name: 'Custom Logo/Branding', included: true },
        { name: 'Advanced Reports', included: true },
        { name: 'Excel/PDF Export', included: true },
        { name: 'Priority Support', included: true },
        { name: 'Arrears Tracking', included: true }
      ]
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      popular: false,
      color: 'bg-purple-50 border-purple-300',
      headerColor: 'bg-purple-100',
      buttonColor: 'bg-purple-600 hover:bg-purple-700',
      offeringId: 'enterprise',
      limits: {
        properties: '∞',
        tenants: '∞',
        sync: true,
        branding: 'Full white-label',
        support: 'Phone + WhatsApp'
      },
      features: [
        { name: 'Unlimited Properties', included: true },
        { name: 'Unlimited Tenants', included: true },
        { name: 'Full White-label Invoices', included: true },
        { name: 'Automated WhatsApp Notifications', included: true },
        { name: 'Automated SMS Notifications (Coming on Jan 2026)', included: true },
        { name: 'Multi-device + Team Access', included: true },
        { name: 'Bulk Invoice Sending', included: true },
        { name: 'Advanced Analytics', included: true },
        { name: 'M-Pesa Integration Ready', included: true },
        { name: 'Dedicated Support', included: true },
        { name: 'Custom Integrations', included: true }
      ]
    }
  ];

  useEffect(() => {
    if (isOpen) {
      const interval = setInterval(() => {
        setCurrentMessageIndex((prev) => (prev + 1) % marketingMessages.length);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      if (isNativePlatform) {
        initializeRevenueCat();
      } else {
        loadFirestorePlans();
      }
    }
  }, [isOpen, isNativePlatform]);

  // const loadFirestorePlans = async () => {
  //   setLoadingProducts(true);
  //   try {
  //     const plansCol = collection(db, 'plans');
  //     const planDocs = await getDocs(plansCol);
      
  //     const loadedPlans: PlanData[] = [];
  //     console.log('Firestore plan documents:', planDocs.docs.map(doc => ({ id: doc.id, data: doc.data() })));
      
  //     planDocs.forEach((doc) => {
  //       const data = doc.data() as FirestorePlan;
  //       const planId = doc.id;
  //       const baseStructure = planStructure.find(p => p.id === planId);
  //       console.log(`Processing plan ${planId}:`, data, baseStructure);
        
  //       if (baseStructure) {
  //         const planWithPricing: PlanData = {
  //           ...baseStructure,
  //           monthlyPrice: data.type === 'monthly' ? data.price : undefined,
  //           annualPrice: data.type === 'annual' ? data.price : undefined
  //         };
          
  //         const existingPlan = loadedPlans.find(p => p.id === planId);
  //         if (existingPlan) {
  //           if (data.type === 'monthly') existingPlan.monthlyPrice = data.price;
  //           if (data.type === 'annual') existingPlan.annualPrice = data.price;
  //         } else {
  //           loadedPlans.push(planWithPricing);
  //         }
  //         console.log(`Loaded plan ${planId}:`, planWithPricing);
  //       }
  //     });
      
  //     const consolidatedPlans = planStructure.map(base => {
  //       const monthlyPlan = loadedPlans.find(p => p.id === base.id && p.monthlyPrice);
  //       const annualPlan = loadedPlans.find(p => p.id === base.id && p.annualPrice);
  //       console.log(`Consolidating plan ${base.id}:`, { monthlyPlan, annualPlan });
        
  //       return {
  //         ...base,
  //         monthlyPrice: monthlyPlan?.monthlyPrice,
  //         annualPrice: annualPlan?.annualPrice
  //       };
  //     });
      
  //     setFirestorePlans(consolidatedPlans);
  //     console.log('Final consolidated Firestore plans:', consolidatedPlans);
  //   } catch (error) {
  //     console.error('Failed to load Firestore plans:', error);
  //   } finally {
  //     setLoadingProducts(false);
  //   }
  // };
  const loadFirestorePlans = async () => {
  setLoadingProducts(true);
  try {
    const plansCol = collection(db, 'plans');
    const planDocs = await getDocs(plansCol);
    
    // Build a map of plan prices: planId -> { monthly?, annual? }
    const priceMap: Record<string, { monthlyPrice?: number; annualPrice?: number }> = {};
    
    planDocs.forEach((doc) => {
      const data = doc.data() as FirestorePlan;
      const docId = doc.id; // e.g., "solo_monthly" or "solo_annual"
      
      // Extract the base plan ID by removing the suffix
      let planId = docId.replace(/_monthly$|_annual$/, '');
      
      if (!priceMap[planId]) {
        priceMap[planId] = {};
      }
      
      // Determine type from document ID suffix
      if (docId.endsWith('_monthly')) {
        priceMap[planId].monthlyPrice = data.price;
      } else if (docId.endsWith('_annual')) {
        priceMap[planId].annualPrice = data.price;
      }
    });
    
    // Merge prices with base structure
    const consolidatedPlans = planStructure.map(base => ({
      ...base,
      monthlyPrice: priceMap[base.id]?.monthlyPrice,
      annualPrice: priceMap[base.id]?.annualPrice
    }));
    
    setFirestorePlans(consolidatedPlans);
  } catch (error) {
    console.error('Failed to load Firestore plans:', error);
  } finally {
    setLoadingProducts(false);
  }
}; 

  const initializeRevenueCat = async () => {
    setLoadingProducts(true);
    try {
      const configOptions: { apiKey: string; appUserID?: string } = {
        apiKey: "goog_baDcmIvAlKndSdGNulbTbVYCcgL"
      };

      if (userId || userPhone) {
        configOptions.appUserID = (userId || userPhone)?.toString() || "";
      }

      await Purchases.configure(configOptions);

      if (userId || userPhone) {
        const attributes: Record<string, string> = {};
        if (userId) attributes["$userId"] = userId.toString();
        if (userPhone) attributes["$phone"] = userPhone.toString();
        
        await Purchases.setAttributes( attributes );
      }

      const offeringsResult = await Purchases.getOfferings();
      
      console.log('RevenueCat offerings result:', offeringsResult);
      
      if (offeringsResult.all && Object.keys(offeringsResult.all).length > 0) {
        setAllOfferings(offeringsResult.all);
        
        console.log('All offerings loaded:', Object.keys(offeringsResult.all));
        console.log('Offering details:', offeringsResult.all);
        
        let storageProduct: PurchasesPackage | null = null;
        Object.values(offeringsResult.all).forEach((offering: any) => {
          if (offering.availablePackages && !storageProduct) {
            storageProduct = offering.availablePackages.find(
              (pkg: PurchasesPackage) => pkg.identifier === 'storage_onetime'
            );
          }
        });
        setStoragePackage(storageProduct);
        
      } else {
        console.warn('No offerings available from RevenueCat');
      }

      console.log('RevenueCat initialized successfully');
    } catch (error) {
      console.error('Failed to initialize RevenueCat:', error);
    } finally {
      setLoadingProducts(false);
    }
  };

  const plansWithPricing: PlanData[] = isWeb 
    ? firestorePlans 
    : planStructure.map(planStruct => {
        if (planStruct.id === 'free') {
          return { ...planStruct, monthlyPackage: undefined, annualPackage: undefined };
        }

        const offering = allOfferings?.[planStruct.offeringId!];
        
        if (!offering?.availablePackages) {
          console.warn(`Offering not found for ${planStruct.id}: ${planStruct.offeringId}`);
          return { ...planStruct, monthlyPackage: undefined, annualPackage: undefined };
        }

        const monthlyPackage = offering.availablePackages.find((pkg: PurchasesPackage) => 
          pkg.product.subscriptionPeriod?.includes('P1M') || 
          pkg.identifier.toLowerCase().includes('monthly') ||
          pkg.packageType === 'MONTHLY'
        );
        
        const annualPackage = offering.availablePackages.find((pkg: PurchasesPackage) => 
          pkg.product.subscriptionPeriod?.includes('P1Y') || 
          pkg.identifier.toLowerCase().includes('annual') ||
          pkg.packageType === 'ANNUAL'
        );

        console.log(`Plan ${planStruct.id} (offering: ${planStruct.offeringId}):`);
        console.log('Available packages:', offering.availablePackages.map((p: any) => ({
          id: p.identifier,
          period: p.product.subscriptionPeriod,
          type: p.packageType
        })));
        console.log('Monthly found:', monthlyPackage?.identifier);
        console.log('Annual found:', annualPackage?.identifier);

        return {
          ...planStruct,
          monthlyPackage,
          annualPackage
        };
      });

  const getDiscountBadge = (plan: PlanData) => {
    if (isWeb) {
      if (billingCycle === 'annual' && plan.annualPrice && plan.monthlyPrice) {
        const monthlyEquivalent = plan.monthlyPrice * 12;
        const discount = Math.round((1 - plan.annualPrice / monthlyEquivalent) * 100);
        return discount > 0 ? `Save ${discount}%` : null;
      }
    } else {
      if (billingCycle === 'annual' && plan.annualPackage && plan.monthlyPackage) {
        const annualPrice = typeof plan.annualPackage.product.price === 'string' 
          ? parseFloat(plan.annualPackage.product.price) 
          : plan.annualPackage.product.price;
        const monthlyPrice = typeof plan.monthlyPackage.product.price === 'string' 
          ? parseFloat(plan.monthlyPackage.product.price) 
          : plan.monthlyPackage.product.price;
        const monthlyEquivalent = monthlyPrice * 12;
        const discount = Math.round((1 - annualPrice / monthlyEquivalent) * 100);
        return discount > 0 ? `Save ${discount}%` : null;
      }
    }
    return null;
  };

  const purchaseProduct = async (packageToPurchase: PurchasesPackage) => {
    setIsLoading(true);
    try {
      console.log('Initiating purchase for:', packageToPurchase.identifier);
      
      const purchaseResult = await Purchases.purchasePackage({ 
        aPackage: packageToPurchase 
      });
      
      console.log('Purchase successful:', purchaseResult.customerInfo);
      
      setShowPurchaseModal(false);
      onClose(selectedPlanForPurchase?.id);
      
      alert('Purchase successful! Your plan will be activated shortly.');
      
    } catch (error: any) {
      console.error('Purchase failed:', error);
      
      if (error.userCancelled) {
        console.log('User cancelled the purchase');
      } else {
        alert('Purchase failed. Please try again or contact support.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const purchaseStorage = async () => {
    if (!storagePackage) return;
    
    setIsLoading(true);
    try {
      console.log('Purchasing storage:', storagePackage.identifier);
      
      const purchaseResult = await Purchases.purchasePackage({ 
        aPackage: storagePackage 
      });
      console.log('Storage purchase successful:', purchaseResult.customerInfo);
      
      alert('Storage purchased successfully! Multi-device sync is now enabled.');
      
    } catch (error: any) {
      console.error('Storage purchase failed:', error);
      
      if (!error.userCancelled) {
        alert('Storage purchase failed. Please try again or contact support.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const formatPhoneNumber = async (phone: string) => {
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

  const handleWebPayment = async (phone: string) => {
    if (!selectedPlanForPurchase) return;

    setIsLoading(true);
    try {
      const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
      
      const formattedPhone = await formatPhoneNumber(phone);
      

      const price = billingCycle === 'monthly' 
        ? selectedPlanForPurchase.monthlyPrice 
        : selectedPlanForPurchase.annualPrice;

      const daysToAdd = billingCycle === 'monthly' ? 30 : 365;

      //const { getFunctions, httpsCallable } = await import('firebase/functions');
      //const functions = getFunctions();
      const processWebSubscription = httpsCallable(functions, 'processWebSubscription');

      const result = await processWebSubscription({
        userId: currentUser.id,
        userName: currentUser.name,
        email: currentUser.email,
        phone: formattedPhone,
        planId: selectedPlanForPurchase.id,
        planName: selectedPlanForPurchase.name,
        billingCycle: billingCycle,
        amount: price,
        daysToAdd: daysToAdd
      });

      const data = result.data as any;

      if (data.success) {
        alert('Payment request sent to your phone! Please check your M-Pesa and complete the payment. Your subscription will be activated once payment is confirmed.');
        setShowWebPaymentModal(false);
        onClose(selectedPlanForPurchase.id);
      } else {
        alert('Failed to initialize payment: ' + (data.message || 'Unknown error'));
      }
    } catch (error: any) {
      console.error('Web payment error:', error);
      alert('An error occurred. Please try again or contact support.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlanSelect = (planId: string) => {
    const plan = plansWithPricing.find(p => p.id === planId);
    
    if (planId === 'free') {
      onClose('free');
    } else if (plan) {
      setSelectedPlanForPurchase(plan);
      if (isWeb) {
        setShowWebPaymentModal(true);
      } else {
        setShowPurchaseModal(true);
      }
    }
  };

  const handlePurchase = () => {
    const currentPackage = billingCycle === 'monthly' 
      ? selectedPlanForPurchase?.monthlyPackage 
      : selectedPlanForPurchase?.annualPackage;
      
    if (currentPackage) {
      purchaseProduct(currentPackage);
    } else {
      console.error('No package found for selected plan and billing cycle');
      alert('Package not available. Please try a different billing cycle or contact support.');
    }
  };

  const handleContactSales = () => {
    const plan = selectedPlanForPurchase;
    const message = isWeb
      ? `Hi! I'm interested in the ${plan?.name} plan. Can you help me set this up?`
      : `Hi! I'm interested in the ${plan?.name} plan. Can you help me set this up?`;
    
    window.open(`https://wa.me/254791286165?text=${encodeURIComponent(message)}`, '_blank');
    if (isWeb) {
      setShowWebPaymentModal(false);
    } else {
      setShowPurchaseModal(false);
    }
  };

  const canSeeStorageOffer = !isWeb && (currentPlan === 'free' || currentPlan === 'low') && storagePackage;

  if (!isOpen) return null;

  const currentUser = isWeb ? JSON.parse(localStorage.getItem('currentUser') || '{}') : null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-6xl max-h-[95vh] overflow-hidden w-full">
          <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-4 md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl md:text-2xl font-bold mb-2">Choose Your Perfect Plan</h2>
                <p className="text-purple-100 text-sm">
                  {isWeb 
                    ? 'Pay with M-Pesa - No cards needed!' 
                    : canDismiss ? 'Upgrade your account to unlock more features' : 'Select a plan to get started with PlotYangu'
                  }
                </p>
              </div>
              {canDismiss && (
                <button
                  onClick={() => onClose()}
                  className="text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
                >
                  ×
                </button>
              )}
            </div>

            <button onClick={() => setShowSmsPurchase(true)} className="...">
              <MessageSquare className="w-4 h-4 mr-2" /> Buy SMS Credits
            </button>

            <div className="mt-4 bg-white/20 backdrop-blur-lg rounded-lg p-3">
              <div className="flex items-center justify-center">
                <Star className="w-4 h-4 mr-2 flex-shrink-0" />
                <p className="text-sm font-medium text-center animate-pulse">
                  {marketingMessages[currentMessageIndex]}
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 md:p-6 overflow-y-auto max-h-[calc(95vh-180px)]">
            {loadingProducts && (
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center space-x-3">
                  <RefreshCw className="w-5 h-5 animate-spin text-purple-600" />
                  <span className="text-gray-600">
                    {isWeb ? 'Loading pricing from Firestore...' : 'Loading current pricing from RevenueCat...'}
                  </span>
                </div>
              </div>
            )}

            {!loadingProducts && (
              <>
                {canSeeStorageOffer && (
                  <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-4 mb-6 text-white">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-bold text-sm flex items-center mb-1">
                          <Database className="w-4 h-4 mr-2" />
                          Multi-Device Storage
                        </h3>
                        <p className="text-xs text-blue-100 mb-2">
                          One-time purchase • Access data from multiple devices • Cloud backup
                        </p>
                        <div className="text-lg font-bold">{storagePackage?.product.priceString}</div>
                      </div>
                      <button
                        onClick={purchaseStorage}
                        disabled={isLoading}
                        className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-xs font-medium transition-colors flex items-center space-x-2"
                      >
                        {isLoading ? (
                          <Loader className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <CreditCard className="w-4 h-4" />
                            <span>Buy Now</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex justify-center mb-6">
                  <div className="bg-gray-100 rounded-lg p-1 shadow-md">
                    <button
                      onClick={() => setBillingCycle('monthly')}
                      className={`px-4 py-2 rounded-md font-medium transition-colors text-sm ${
                        billingCycle === 'monthly'
                          ? 'bg-green-600 text-white'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Monthly
                    </button>
                    <button
                      onClick={() => setBillingCycle('annual')}
                      className={`px-4 py-2 rounded-md font-medium transition-colors text-sm relative ${
                        billingCycle === 'annual'
                          ? 'bg-green-600 text-white'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Annual
                      <span className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs px-2 py-1 rounded-full">
                        Save Up To 25%
                      </span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  {plansWithPricing.map((plan) => {
                    const discount = getDiscountBadge(plan);
                    const isCurrentPlan = currentPlan === plan.id;
                    
                    let currentPackage, price, monthlyEquivalent;
                    
                    if (isWeb) {
                      price = billingCycle === 'monthly' ? plan.monthlyPrice : plan.annualPrice;
                      monthlyEquivalent = plan.monthlyPrice ? plan.monthlyPrice * 12 : 0;
                    } else {
                      currentPackage = billingCycle === 'monthly' ? plan.monthlyPackage : plan.annualPackage;
                      monthlyEquivalent = plan.monthlyPackage 
                        ? (typeof plan.monthlyPackage.product.price === 'string' 
                          ? parseFloat(plan.monthlyPackage.product.price) 
                          : plan.monthlyPackage.product.price) * 12 
                        : 0;
                    }
                    
                    return (
                      <div
                        key={plan.id}
                        className={`relative rounded-xl border-2 transition-all duration-300 hover:shadow-lg cursor-pointer ${
                          plan.color
                        } ${
                          selectedPlan === plan.id ? 'ring-2 ring-green-500 ring-offset-2' : ''
                        } ${
                          isCurrentPlan ? 'ring-2 ring-blue-500 ring-offset-2' : ''
                        }`}
                        onClick={() => setSelectedPlan(plan.id)}
                      >
                        {plan.popular && (
                          <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                            <div className="bg-green-600 text-white px-3 py-1 rounded-full text-xs font-medium flex items-center">
                              <Star className="h-3 w-3 mr-1" />
                              Most Popular
                            </div>
                          </div>
                        )}
                        
                        {discount && (
                          <div className="absolute -top-3 right-4">
                            <div className="bg-orange-500 text-white px-2 py-1 rounded-full text-xs font-medium">
                              {discount}
                            </div>
                          </div>
                        )}

                        {isCurrentPlan && (
                          <div className="absolute -top-3 left-4">
                            <div className="bg-blue-500 text-white px-2 py-1 rounded-full text-xs font-medium">
                              Current Plan
                            </div>
                          </div>
                        )}

                        <div className={`${plan.headerColor} px-4 py-4 rounded-t-xl`}>
                          <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                          <div className="mt-2">
                            <span className="text-2xl font-bold text-gray-900">
                              {plan.id === 'free' 
                                ? 'Free' 
                                : isWeb 
                                  ? `KES ${price?.toLocaleString() || 'N/A'}`
                                  : currentPackage?.product.priceString || 'Loading...'
                              }
                            </span>
                            {((isWeb && price) || currentPackage) && (
                              <span className="text-gray-600 ml-1 text-sm">
                                /{billingCycle === 'monthly' ? 'mo' : 'yr'}
                              </span>
                            )}
                          </div>
                          {billingCycle === 'annual' && monthlyEquivalent > 0 && (
                            <div className="text-xs text-gray-500 line-through">
                              {isWeb 
                                ? `Was KES ${monthlyEquivalent.toLocaleString()}/year`
                                : plan.monthlyPackage && `Was ${plan.monthlyPackage.product.currencyCode} ${monthlyEquivalent.toLocaleString()}/year`
                              }
                            </div>
                          )}
                        </div>

                        <div className="px-4 py-4">
                          <div className="grid grid-cols-1 gap-2 mb-4 text-xs">
                            <div className="flex items-center">
                              <Building className="h-3 w-3 text-green-600 mr-1" />
                              <span>{plan.limits.properties} {typeof plan.limits.properties === 'number' && plan.limits.properties > 1 ? 'Properties' : 'Property'}</span>
                            </div>
                            <div className="flex items-center">
                              <Users className="h-3 w-3 text-blue-600 mr-1" />
                              <span>{plan.limits.tenants} Tenants</span>
                            </div>
                            <div className="flex items-center">
                              <Cloud className="h-3 w-3 text-purple-600 mr-1" />
                              <span className={plan.limits.sync ? 'text-green-600' : 'text-gray-400'}>
                                {plan.limits.sync ? 'Cloud Sync' : 'Local Only'}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-2 mb-4">
                            {plan.features.slice(0, 4).map((feature, index) => (
                              <div key={index} className="flex items-start">
                                {feature.included ? (
                                  <Check className="h-3 w-3 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                                ) : (
                                  <X className="h-3 w-3 text-gray-400 mr-2 mt-0.5 flex-shrink-0" />
                                )}
                                <span className={`text-xs ${feature.included ? 'text-gray-900' : 'text-gray-400'}`}>
                                  {feature.name}
                                </span>
                              </div>
                            ))}
                            {plan.features.length > 4 && (
                              <div className="text-xs text-gray-500 text-center mt-2">
                                +{plan.features.length - 4} more features
                              </div>
                            )}
                          </div>

                          <button
                            onClick={() => handlePlanSelect(plan.id)}
                            disabled={isCurrentPlan || (plan.id !== 'free' && isWeb && !price) || (plan.id !== 'free' && !isWeb && !currentPackage)}
                            className={`w-full px-3 py-2 rounded-lg font-medium transition-colors text-sm ${
                              isCurrentPlan 
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : (plan.id !== 'free' && ((isWeb && !price) || (!isWeb && !currentPackage)))
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : `${plan.buttonColor} text-white hover:shadow-lg`
                            }`}
                          >
                            {isCurrentPlan ? 'Current Plan' : 
                             plan.id === 'free' ? 'Continue Free' : 
                             (isWeb && !price) || (!isWeb && !currentPackage) ? 'Not Available' :
                             isWeb ? 'Subscribe Now' : 'Start Free Trial'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl p-4 md:p-6 mb-6">
                  <div className="text-center">
                    <Zap className="h-8 w-8 text-yellow-500 mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-gray-900 mb-3">
                      {isWeb ? 'Full Control Over Your Subscription' : 'Start Your Journey Risk-Free'}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center">
                        <div className="bg-green-100 rounded-full p-2 w-10 h-10 mx-auto mb-2 flex items-center justify-center">
                          <FileText className="h-5 w-5 text-green-600" />
                        </div>
                        <h4 className="font-semibold text-gray-900 mb-1 text-sm">
                          {isWeb ? 'Pay As You Go' : '30-Day Free Trial'}
                        </h4>
                        <p className="text-gray-600 text-xs">
                          {isWeb ? 'No automatic renewals or hidden fees' : 'Try any paid plan free for 30 days'}
                        </p>
                      </div>
                      <div className="text-center">
                        <div className="bg-blue-100 rounded-full p-2 w-10 h-10 mx-auto mb-2 flex items-center justify-center">
                          <Shield className="h-5 w-5 text-blue-600" />
                        </div>
                        <h4 className="font-semibold text-gray-900 mb-1 text-sm">
                          {isWeb ? 'M-Pesa Payments' : 'No Commitment'}
                        </h4>
                        <p className="text-gray-600 text-xs">
                          {isWeb ? 'Secure mobile money payments' : 'Cancel anytime, no questions asked'}
                        </p>
                      </div>
                      <div className="text-center">
                        <div className="bg-purple-100 rounded-full p-2 w-10 h-10 mx-auto mb-2 flex items-center justify-center">
                          <ExternalLink className="h-5 w-5 text-purple-600" />
                        </div>
                        <h4 className="font-semibold text-gray-900 mb-1 text-sm">Expert Support</h4>
                        <p className="text-gray-600 text-xs">Get help when you need it</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 mb-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-3 font-medium">
                      Questions about pricing or need a custom solution?
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <button
                        onClick={() => window.open('https://wa.me/254791286165', '_blank')}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center space-x-2 transition-all hover:shadow-lg"
                      >
                        <Phone className="w-4 h-4" />
                        <span>WhatsApp: +254791286165</span>
                      </button>
                      <button
                        onClick={() => window.open('mailto:info@cogvana.co.ke', '_blank')}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center space-x-2 transition-all hover:shadow-lg"
                      >
                        <Mail className="w-4 h-4" />
                        <span>info@cogvana.co.ke</span>
                      </button>
                    </div>
                  </div>
                </div>

                {!canDismiss && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                    <div className="flex items-center justify-center text-yellow-800">
                      <Crown className="w-5 h-5 mr-2" />
                      <span className="font-medium text-sm">
                        Select a plan to continue to your dashboard
                      </span>
                    </div>
                    <div className="mt-3 text-center">
                      <p className="text-xs text-yellow-700">
                        You can always upgrade later from your profile page
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {!isWeb && (
        <PurchaseConfirmationModal
          isOpen={showPurchaseModal}
          plan={selectedPlanForPurchase}
          billingCycle={billingCycle}
          onClose={() => setShowPurchaseModal(false)}
          onPurchase={handlePurchase}
          onContactSales={handleContactSales}
          isLoading={isLoading}
        />
      )}

      {isWeb && (
        <WebPaymentModal
          isOpen={showWebPaymentModal}
          plan={selectedPlanForPurchase}
          billingCycle={billingCycle}
          onClose={() => setShowWebPaymentModal(false)}
          onPurchase={handleWebPayment}
          isLoading={isLoading}
          currentUser={currentUser}
        />
      )}

      <SmsPurchaseModal
        isOpen={showSmsPurchase}
        onClose={() => setShowSmsPurchase(false)}
        userId={currentUser.id}
        userTier={currentPlan || 'free'}
      />
    </>
  );
};

export default PricingModal;