import React, { useState } from 'react';
import { Check, X, Building, Users, Smartphone, Cloud, Palette, FileText, Mail, Shield, Star, Zap } from 'lucide-react';

const PricingPage = () => {
  const [selectedPlan, setSelectedPlan] = useState('professional');
  const [billingCycle, setBillingCycle] = useState('monthly');

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
        { name: '1 Property', included: true },
        { name: 'Up to 12 Tenants', included: true },
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
        properties: 3,
        tenants: 50,
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
        { name: 'Light Footer Branding', included: true, note: 'Company promotion on invoices' },
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

  const getDiscountBadge = (plan:any) => {
    if (billingCycle === 'annual' && plan.originalPrice) {
      const discount = Math.round((1 - plan.price.annual / plan.originalPrice.annual) * 100);
      return discount > 0 ? `Save ${discount}%` : null;
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <Building className="h-8 w-8 text-green-600 mr-2" />
            <h1 className="text-3xl font-bold text-gray-900">PlotYangu</h1>
          </div>
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Choose Your Perfect Plan
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            From solo landlords to property management companies - we have the right plan for your rental business
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="flex justify-center mb-8">
          <div className="bg-white rounded-lg p-1 shadow-md">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-6 py-2 rounded-md font-medium transition-colors ${
                billingCycle === 'monthly'
                  ? 'bg-green-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('annual')}
              className={`px-6 py-2 rounded-md font-medium transition-colors relative ${
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {plans.map((plan) => {
            const discount = getDiscountBadge(plan);
            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border-2 transition-all duration-300 hover:shadow-xl ${
                  plan.color
                } ${
                  selectedPlan === plan.id ? 'ring-2 ring-green-500 ring-offset-2' : ''
                }`}
                onClick={() => setSelectedPlan(plan.id)}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <div className="bg-green-600 text-white px-4 py-1 rounded-full text-sm font-medium flex items-center">
                      <Star className="h-4 w-4 mr-1" />
                      Most Popular
                    </div>
                  </div>
                )}
                
                {discount && (
                  <div className="absolute -top-3 right-4">
                    <div className="bg-orange-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                      {discount}
                    </div>
                  </div>
                )}

                <div className={`${plan.headerColor} px-6 py-4 rounded-t-2xl`}>
                  <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                  <div className="mt-2">
                    <span className="text-3xl font-bold text-gray-900">
                      {formatPrice(plan.price[billingCycle])}
                    </span>
                    {plan.price[billingCycle] > 0 && (
                      <span className="text-gray-600 ml-1">
                        /{billingCycle === 'monthly' ? 'month' : 'year'}
                      </span>
                    )}
                  </div>
                  {billingCycle === 'annual' && plan.originalPrice && (
                    <div className="text-sm text-gray-500 line-through">
                      Was {formatPrice(plan.originalPrice.annual)}/year
                    </div>
                  )}
                </div>

                <div className="px-6 py-6">
                  {/* Quick Stats */}
                  <div className="grid grid-cols-2 gap-2 mb-6 text-sm">
                    <div className="flex items-center">
                      <Building className="h-4 w-4 text-green-600 mr-1" />
                      <span>{plan.limits.properties} {typeof plan.limits.properties === 'number' && plan.limits.properties > 1 ? 'Properties' : 'Property'}</span>
                    </div>
                    <div className="flex items-center">
                      <Users className="h-4 w-4 text-blue-600 mr-1" />
                      <span>{plan.limits.tenants} Tenants</span>
                    </div>
                    <div className="flex items-center">
                      <Cloud className="h-4 w-4 text-purple-600 mr-1" />
                      <span className={plan.limits.sync ? 'text-green-600' : 'text-gray-400'}>
                        {plan.limits.sync ? 'Cloud Sync' : 'Local Only'}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <Palette className="h-4 w-4 text-orange-600 mr-1" />
                      <span className="text-xs">{plan.limits.branding}</span>
                    </div>
                  </div>

                  {/* Features List */}
                  <div className="space-y-3">
                    {plan.features.map((feature, index) => (
                      <div key={index} className="flex items-start">
                        {feature.included ? (
                          <Check className="h-4 w-4 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                        ) : (
                          <X className="h-4 w-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" />
                        )}
                        <div>
                          <span className={feature.included ? 'text-gray-900' : 'text-gray-400'}>
                            {feature.name}
                          </span>
                          {feature.note && (
                            <div className="text-xs text-gray-500 mt-1">{feature.note}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    className={`w-full mt-6 px-4 py-3 rounded-lg font-medium transition-colors ${
                      plan.buttonColor
                    } text-white`}
                  >
                    {plan.id === 'free' ? 'Get Started Free' : 'Start Free Trial'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Trial Information */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <div className="text-center">
            <Zap className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Start Your Journey Risk-Free</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              <div className="text-center">
                <div className="bg-green-100 rounded-full p-3 w-16 h-16 mx-auto mb-3 flex items-center justify-center">
                  <FileText className="h-8 w-8 text-green-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">1 Month Free Trial</h4>
                <p className="text-gray-600 text-sm">Try any paid plan free for 30 days</p>
              </div>
              <div className="text-center">
                <div className="bg-blue-100 rounded-full p-3 w-16 h-16 mx-auto mb-3 flex items-center justify-center">
                  <Shield className="h-8 w-8 text-blue-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">No Commitment</h4>
                <p className="text-gray-600 text-sm">Cancel anytime, no questions asked</p>
              </div>
              <div className="text-center">
                <div className="bg-purple-100 rounded-full p-3 w-16 h-16 mx-auto mb-3 flex items-center justify-center">
                  <Smartphone className="h-8 w-8 text-purple-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Instant Setup</h4>
                <p className="text-gray-600 text-sm">Start managing rent in minutes</p>
              </div>
            </div>
          </div>
        </div>

        {/* Target Audience */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-6xl mx-auto">
          <div className="text-center p-6 bg-white rounded-lg shadow-md">
            <div className="bg-gray-100 rounded-full p-3 w-16 h-16 mx-auto mb-3 flex items-center justify-center">
              <Building className="h-8 w-8 text-gray-600" />
            </div>
            <h4 className="font-semibold text-gray-900 mb-2">Small Landlords</h4>
            <p className="text-gray-600 text-sm">Perfect for 1-3 properties with local tenants</p>
            <div className="mt-3 text-green-600 font-medium">Free Forever</div>
          </div>
          
          <div className="text-center p-6 bg-white rounded-lg shadow-md">
            <div className="bg-blue-100 rounded-full p-3 w-16 h-16 mx-auto mb-3 flex items-center justify-center">
              <Users className="h-8 w-8 text-blue-600" />
            </div>
            <h4 className="font-semibold text-gray-900 mb-2">Property Agents</h4>
            <p className="text-gray-600 text-sm">Managing multiple plots for different owners</p>
            <div className="mt-3 text-blue-600 font-medium">Starter Plan</div>
          </div>
          
          <div className="text-center p-6 bg-white rounded-lg shadow-md ring-2 ring-green-500">
            <div className="bg-green-100 rounded-full p-3 w-16 h-16 mx-auto mb-3 flex items-center justify-center">
              <Smartphone className="h-8 w-8 text-green-600" />
            </div>
            <h4 className="font-semibold text-gray-900 mb-2">Serious Landlords</h4>
            <p className="text-gray-600 text-sm">Multiple properties, professional invoices</p>
            <div className="mt-3 text-green-600 font-medium">Professional Plan</div>
          </div>
          
          <div className="text-center p-6 bg-white rounded-lg shadow-md">
            <div className="bg-purple-100 rounded-full p-3 w-16 h-16 mx-auto mb-3 flex items-center justify-center">
              <Mail className="h-8 w-8 text-purple-600" />
            </div>
            <h4 className="font-semibold text-gray-900 mb-2">PMCs</h4>
            <p className="text-gray-600 text-sm">Property Management Companies with teams</p>
            <div className="mt-3 text-purple-600 font-medium">Enterprise Plan</div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-gray-600">
          <p>Trusted by landlords and agents across Kenya 🇰🇪</p>
          <p className="mt-2">Questions? WhatsApp us at +254 791 286 165</p>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;