import React, { useState, useEffect } from 'react';
import { Check, X, Building, Users, Cloud, FileText, Shield, Star, Zap, Crown, ExternalLink, Phone, Mail } from 'lucide-react';

interface PricingModalProps {
  isOpen: boolean;
  onClose: (planSelected?: string) => void;
  canDismiss?: boolean; // false when shown after signup, true when shown from profile
  currentPlan?: string;
}

const PricingModal: React.FC<PricingModalProps> = ({ 
  isOpen, 
  onClose, 
  canDismiss = true,
  currentPlan = 'free'
}) => {
  const [selectedPlan, setSelectedPlan] = useState(currentPlan);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

  const marketingMessages = [
    "🏠 Professional Property Management Services Available",
    "📊 Upgrade to Premium - Remove Watermarks & Get More Properties", 
    "🔒 Secure Online Data Backup - Never Lose Your Data Again",
    "✨ Custom Branding Available - Make It Yours",
    "📋 Professional Tenant Screening Services"
  ];

  useEffect(() => {
    if (isOpen) {
      const interval = setInterval(() => {
        setCurrentMessageIndex((prev) => (prev + 1) % marketingMessages.length);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const plans = [
    {
      id: 'free',
      name: 'Free Forever',
      price: { monthly: 0, annual: 0 },
      originalPrice: null,
      popular: false,
      color: 'bg-gray-50 border-gray-200',
      headerColor: 'bg-gray-100',
      buttonColor: 'bg-gray-600 hover:bg-gray-700',
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
      id: 'starter',
      name: 'Starter',
      price: { monthly: 499, annual: 4490 },
      originalPrice: { monthly: 499, annual: 5988 },
      popular: false,
      color: 'bg-blue-50 border-blue-200',
      headerColor: 'bg-blue-100',
      buttonColor: 'bg-blue-600 hover:bg-blue-700',
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
      id: 'professional',
      name: 'Professional',
      price: { monthly: 999, annual: 8991 },
      originalPrice: { monthly: 999, annual: 11988 },
      popular: true,
      color: 'bg-green-50 border-green-300',
      headerColor: 'bg-green-100',
      buttonColor: 'bg-green-600 hover:bg-green-700',
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
      price: { monthly: 2499, annual: 22491 },
      originalPrice: { monthly: 2499, annual: 29988 },
      popular: false,
      color: 'bg-purple-50 border-purple-300',
      headerColor: 'bg-purple-100',
      buttonColor: 'bg-purple-600 hover:bg-purple-700',
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

  const formatPrice = (price: number) => {
    if (price === 0) return 'Free';
    return `KES ${price.toLocaleString()}`;
  };

  const getDiscountBadge = (plan: any) => {
    if (billingCycle === 'annual' && plan.originalPrice) {
      const discount = Math.round((1 - plan.price.annual / plan.originalPrice.annual) * 100);
      return discount > 0 ? `Save ${discount}%` : null;
    }
    return null;
  };

  const handlePlanSelect = (planId: string) => {
    if (planId === 'free') {
      onClose('free');
    } else {
      // For paid plans, show contact info
      const plan = plans.find(p => p.id === planId);
      const message = `Hi! I'm interested in upgrading to the ${plan?.name} plan (KES ${formatPrice(plan?.price[billingCycle] || 0)}/${billingCycle}). Can you help me set this up?`;
      
      // Open WhatsApp with pre-filled message
      window.open(`https://wa.me/254791286165?text=${encodeURIComponent(message)}`, '_blank');
      
      if (canDismiss) {
        onClose(planId);
      }
    }
  };

  if (!isOpen) return null;

  return (
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
                  Save 25%
                </span>
              </button>
            </div>
          </div>

          {/* Plans Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {plans.map((plan) => {
              const discount = getDiscountBadge(plan);
              const isCurrentPlan = currentPlan === plan.id;
              
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
                        {formatPrice(plan.price[billingCycle])}
                      </span>
                      {plan.price[billingCycle] > 0 && (
                        <span className="text-gray-600 ml-1 text-sm">
                          /{billingCycle === 'monthly' ? 'mo' : 'yr'}
                        </span>
                      )}
                    </div>
                    {billingCycle === 'annual' && plan.originalPrice && (
                      <div className="text-xs text-gray-500 line-through">
                        Was {formatPrice(plan.originalPrice.annual)}/year
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
                      disabled={isCurrentPlan}
                      className={`w-full px-3 py-2 rounded-lg font-medium transition-colors text-sm ${
                        isCurrentPlan 
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : `${plan.buttonColor} text-white hover:shadow-lg`
                      }`}
                    >
                      {isCurrentPlan ? 'Current Plan' : 
                       plan.id === 'free' ? 'Continue Free' : 'Start Free Trial'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

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
                  <h4 className="font-semibold text-gray-900 mb-1 text-sm">1 Month Free Trial</h4>
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
        </div>
      </div>
    </div>
  );
};

export default PricingModal;