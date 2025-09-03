import React, { useState, useEffect } from 'react';
import { Check, X, Building, Users, Cloud, FileText, Shield, Star, Zap, Crown, ExternalLink, Phone, Mail, CreditCard, Database, Loader, RefreshCw } from 'lucide-react';
import { Purchases, type PurchasesPackage } from '@revenuecat/purchases-capacitor';

interface PricingModalProps {
  isOpen: boolean;
  onClose: (planSelected?: string) => void;
  canDismiss?: boolean;
  currentPlan?: string;
  userId?: number;
  userPhone?: number;
}

interface PlanData {
  id: string;
  name: string;
  monthlyPackage?: PurchasesPackage;
  annualPackage?: PurchasesPackage;
  popular: boolean;
  color: string;
  headerColor: string;
  buttonColor: string;
  offeringId: string | null; // Changed from productIds to offeringId
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
      // Handle both string and number price formats
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
        {/* Header */}
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
          {/* Plan Details */}
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

            {/* What's Included */}
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

          {/* Trial Information */}
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

          {/* Action Buttons */}
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

          {/* Terms */}
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

  const marketingMessages = [
    "🏠 Professional Property Management Services Available",
    "📊 Upgrade to Premium - Remove Watermarks & Get More Properties", 
    "🔒 Secure Online Data Backup - Never Lose Your Data Again",
    "✨ Custom Branding Available - Make It Yours",
    "📋 Professional Tenant Screening Services"
  ];

  // Plan structure mapped to RevenueCat offerings
  const planStructure = [
    {
      id: 'free',
      name: 'Free Forever',
      popular: false,
      color: 'bg-gray-50 border-gray-200',
      headerColor: 'bg-gray-100',
      buttonColor: 'bg-gray-600 hover:bg-gray-700',
      offeringId: null, // Free plan has no offering
      limits: {
        properties: 2,
        tenants: 24,
        sync: false,
        branding: 'Heavy PlotYangu branding',
        support: 'Community'
      },
      features: [
        { name: '2 Properties', included: true },
        { name: 'Up to 24 Tenants', included: true },
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
      id: 'low',
      name: 'Starter',
      popular: false,
      color: 'bg-blue-50 border-blue-200',
      headerColor: 'bg-blue-100',
      buttonColor: 'bg-blue-600 hover:bg-blue-700',
      offeringId: 'starter', // Maps to RevenueCat offering ID
      limits: {
        properties: 7,
        tenants: 105,
        sync: false,
        branding: 'Light footer branding',
        support: 'Email'
      },
      features: [
        { name: 'Up to 7 Properties', included: true },
        { name: 'Up to 105 Tenants', included: true },
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
      name: 'Professional',
      popular: true,
      color: 'bg-green-50 border-green-300',
      headerColor: 'bg-green-100',
      buttonColor: 'bg-green-600 hover:bg-green-700',
      offeringId: 'business', // Maps to RevenueCat offering ID
      limits: {
        properties: 10,
        tenants: 200,
        sync: true,
        branding: 'Your logo, no PlotYangu branding',
        support: 'Priority email'
      },
      features: [
        { name: 'Up to 10 Properties', included: true },
        { name: 'Up to 200 Tenants', included: true },
        { name: 'Invoice Generation', included: true },
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
      offeringId: 'enterprise', // Maps to RevenueCat offering ID
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

  // Initialize RevenueCat and load products
  useEffect(() => {
    if (isOpen) {
      initializeRevenueCat();
    }
  }, [isOpen]);

  const initializeRevenueCat = async () => {
    setLoadingProducts(true);
    try {
      // Configure RevenueCat
      const configOptions: { apiKey: string; appUserID?: string } = {
        apiKey: "goog_baDcmIvAlKndSdGNulbTbVYCcgL"
      };

      if (userId || userPhone) {
        configOptions.appUserID = (userId || userPhone)?.toString() || "";
      }

      await Purchases.configure(configOptions);

      // Set user attributes for webhook identification
      if (userId || userPhone) {
        const attributes: Record<string, string> = {};
        if (userId) attributes["$userId"] = userId.toString();
        if (userPhone) attributes["$phone"] = userPhone.toString();
        
        await Purchases.setAttributes( attributes );
      }

      // Load ALL offerings from RevenueCat
      const offeringsResult = await Purchases.getOfferings();
      
      console.log('RevenueCat offerings result:', offeringsResult);
      
      if (offeringsResult.all && Object.keys(offeringsResult.all).length > 0) {
        setAllOfferings(offeringsResult.all);
        
        console.log('All offerings loaded:', Object.keys(offeringsResult.all));
        console.log('Offering details:', offeringsResult.all);
        
        // Find storage package across all offerings
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

  // Build plans with real RevenueCat pricing data using offerings
  const plansWithPricing: PlanData[] = planStructure.map(planStruct => {
    // Free plan doesn't need RevenueCat data
    if (planStruct.id === 'free') {
      return { ...planStruct, monthlyPackage: undefined, annualPackage: undefined };
    }

    // Find the offering for this plan
    const offering = allOfferings?.[planStruct.offeringId!];
    
    if (!offering?.availablePackages) {
      console.warn(`Offering not found for ${planStruct.id}: ${planStruct.offeringId}`);
      return { ...planStruct, monthlyPackage: undefined, annualPackage: undefined };
    }

    // Look for monthly and annual packages in this offering
    // Assuming monthly packages have 'month' in duration and annual have 'year'
    const monthlyPackage = offering.availablePackages.find((pkg: PurchasesPackage) => 
      pkg.product.subscriptionPeriod?.includes('P1M') || // ISO 8601 for 1 month
      pkg.identifier.toLowerCase().includes('monthly') ||
      pkg.packageType === 'MONTHLY' // If RevenueCat sets this
    );
    
    const annualPackage = offering.availablePackages.find((pkg: PurchasesPackage) => 
      pkg.product.subscriptionPeriod?.includes('P1Y') || // ISO 8601 for 1 year
      pkg.identifier.toLowerCase().includes('annual') ||
      pkg.packageType === 'ANNUAL' // If RevenueCat sets this
    );

    // Debug logging
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
    if (billingCycle === 'annual' && plan.annualPackage && plan.monthlyPackage) {
      // Handle both string and number price formats
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
    return null;
  };

  // RevenueCat purchase function
  const purchaseProduct = async (packageToPurchase: PurchasesPackage) => {
    setIsLoading(true);
    try {
      console.log('Initiating purchase for:', packageToPurchase.identifier);
      
      // Make the actual purchase using the correct API
      const purchaseResult = await Purchases.purchasePackage({ 
        aPackage: packageToPurchase 
      });
      
      console.log('Purchase successful:', purchaseResult.customerInfo);
      
      // Close modals and notify parent
      setShowPurchaseModal(false);
      onClose(selectedPlanForPurchase?.id);
      
      // The webhook will handle backend updates automatically
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

  const handlePlanSelect = (planId: string) => {
    const plan = plansWithPricing.find(p => p.id === planId);
    
    if (planId === 'free') {
      onClose('free');
    } else if (plan) {
      setSelectedPlanForPurchase(plan);
      setShowPurchaseModal(true);
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
    const currentPackage = billingCycle === 'monthly' ? plan?.monthlyPackage : plan?.annualPackage;
    const message = `Hi! I'm interested in the ${plan?.name} plan (${currentPackage?.product.priceString}/${billingCycle}). Can you help me set this up?`;
    
    window.open(`https://wa.me/254791286165?text=${encodeURIComponent(message)}`, '_blank');
    setShowPurchaseModal(false);
  };

  // Check if user can see storage offer
  const canSeeStorageOffer = (currentPlan === 'free' || currentPlan === 'low') && storagePackage;

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-6xl max-h-[95vh] overflow-hidden w-full">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-4 md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl md:text-2xl font-bold mb-2">Choose Your Perfect Plan</h2>
                <p className="text-purple-100 text-sm">
                  {canDismiss ? 'Upgrade your account to unlock more features' : 'Select a plan to get started with PlotYangu'}
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

            {/* Auto-rotating Marketing Banner */}
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
            {/* Loading State */}
            {loadingProducts && (
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center space-x-3">
                  <RefreshCw className="w-5 h-5 animate-spin text-purple-600" />
                  <span className="text-gray-600">Loading current pricing from RevenueCat...</span>
                </div>
              </div>
            )}

            {!loadingProducts && (
              <>
                {/* Debug Information (remove in production) */}
                {process.env.NODE_ENV === 'development' && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-xs">
                    <p><strong>Debug Info:</strong></p>
                    <p>Total offerings loaded: {allOfferings ? Object.keys(allOfferings).length : 0}</p>
                    <p>Offering IDs: {allOfferings ? Object.keys(allOfferings).join(', ') : 'none'}</p>
                    <p>Plans with pricing data: {plansWithPricing.filter(p => p.monthlyPackage || p.annualPackage).length}/{plansWithPricing.length}</p>
                  </div>
                )}

                {/* Storage Offer for Free/Low Users */}
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

                {/* Billing Toggle */}
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

                {/* Plans Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  {plansWithPricing.map((plan) => {
                    const discount = getDiscountBadge(plan);
                    const isCurrentPlan = currentPlan === plan.id;
                    const currentPackage = billingCycle === 'monthly' ? plan.monthlyPackage : plan.annualPackage;
                    const monthlyEquivalent = plan.monthlyPackage 
                      ? (typeof plan.monthlyPackage.product.price === 'string' 
                        ? parseFloat(plan.monthlyPackage.product.price) 
                        : plan.monthlyPackage.product.price) * 12 
                      : 0;
                    
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
                              {plan.id === 'free' ? 'Free' : currentPackage?.product.priceString || 'Loading...'}
                            </span>
                            {currentPackage && (
                              <span className="text-gray-600 ml-1 text-sm">
                                /{billingCycle === 'monthly' ? 'mo' : 'yr'}
                              </span>
                            )}
                          </div>
                          {billingCycle === 'annual' && plan.monthlyPackage && currentPackage && (
                            <div className="text-xs text-gray-500 line-through">
                              Was {plan.monthlyPackage.product.currencyCode} {monthlyEquivalent.toLocaleString()}/year
                            </div>
                          )}
                        </div>

                        <div className="px-4 py-4">
                          {/* Quick Stats */}
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

                          {/* Top Features */}
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
                            disabled={isCurrentPlan || (plan.id !== 'free' && !currentPackage)}
                            className={`w-full px-3 py-2 rounded-lg font-medium transition-colors text-sm ${
                              isCurrentPlan 
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : plan.id !== 'free' && !currentPackage
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : `${plan.buttonColor} text-white hover:shadow-lg`
                            }`}
                          >
                            {isCurrentPlan ? 'Current Plan' : 
                             plan.id === 'free' ? 'Continue Free' : 
                             !currentPackage ? 'Not Available' :
                             'Start Free Trial'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* No Offerings Available Warning */}
                {(!allOfferings || Object.keys(allOfferings).length === 0) && !loadingProducts && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                    <div className="flex items-center text-red-800">
                      <X className="w-5 h-5 mr-2" />
                      <span className="font-medium text-sm">
                        No subscription offerings available. Please check your RevenueCat configuration.
                      </span>
                    </div>
                  </div>
                )}

                {/* Trial Information */}
                <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl p-4 md:p-6 mb-6">
                  <div className="text-center">
                    <Zap className="h-8 w-8 text-yellow-500 mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-gray-900 mb-3">Start Your Journey Risk-Free</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center">
                        <div className="bg-green-100 rounded-full p-2 w-10 h-10 mx-auto mb-2 flex items-center justify-center">
                          <FileText className="h-5 w-5 text-green-600" />
                        </div>
                        <h4 className="font-semibold text-gray-900 mb-1 text-sm">30-Day Free Trial</h4>
                        <p className="text-gray-600 text-xs">Try any paid plan free for 30 days</p>
                      </div>
                      <div className="text-center">
                        <div className="bg-blue-100 rounded-full p-2 w-10 h-10 mx-auto mb-2 flex items-center justify-center">
                          <Shield className="h-5 w-5 text-blue-600" />
                        </div>
                        <h4 className="font-semibold text-gray-900 mb-1 text-sm">No Commitment</h4>
                        <p className="text-gray-600 text-xs">Cancel anytime, no questions asked</p>
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

                {/* Contact Information */}
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
                        onClick={() => window.open('mailto:info@smbkenya.com', '_blank')}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center space-x-2 transition-all hover:shadow-lg"
                      >
                        <Mail className="w-4 h-4" />
                        <span>info@smbkenya.com</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions for Signup Flow */}
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

      {/* Purchase Confirmation Modal */}
      <PurchaseConfirmationModal
        isOpen={showPurchaseModal}
        plan={selectedPlanForPurchase}
        billingCycle={billingCycle}
        onClose={() => setShowPurchaseModal(false)}
        onPurchase={handlePurchase}
        onContactSales={handleContactSales}
        isLoading={isLoading}
      />
    </>
  );
};

export default PricingModal;