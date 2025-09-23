import React, { useState, useEffect } from 'react';
import { User, Phone, Mail, Building, Crown, CheckCircle, Star, ArrowRight, ExternalLink, Zap } from 'lucide-react';
import { useAuth } from '../components/auh/AuthWrapper';
import PricingModal from '../components/ui/PricingPage';

// Auto-rotating marketing messages
const marketingMessages = [
  "🏠 Professional Property Management Services Available",
  "📊 Upgrade to Premium - Remove Watermarks & Get More Properties",
  "🔒 Secure Online Data Backup - Never Lose Your Data Again",
  "✨ Custom Branding Available - Make It Yours",
  "📋 Professional Tenant Screening Services",
  "💼 Commercial Real Estate Agency Solutions",
  "🏘️ Rent Collection Services - Let Us Handle It",
  "📋 Lease Management Made Simple",
  "🎯 Trusted Property Management Company in Kenya"
];

const Profile: React.FC = () => {
  const { user, company, logout } = useAuth();
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [showPricingModal, setShowPricingModal] = useState(false);

  // Auto-rotate marketing messages
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMessageIndex((prev) => (prev + 1) % marketingMessages.length);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const handleWhatsAppContact = () => {
    window.open('https://wa.me/254791286165', '_blank');
  };

  const handleEmailContact = () => {
    window.open('mailto:sammyem999@gmail.com', '_blank');
  };

  const handlePhoneCall = () => {
    window.open('tel:0791286165', '_blank');
  };

  const handlePricingModalClose = (planSelected?: string) => {
    setShowPricingModal(false);
    // Plan selection logic can be added here later
    console.log('Plan selected from profile:', planSelected);
  };

  const getCurrentPlanDetails = () => {
    const tier = user?.tier || 'free';
    const plans = {
      free: { name: 'Free Forever', color: 'text-gray-600', bgColor: 'bg-gray-100' },
      starter: { name: 'Starter', color: 'text-blue-600', bgColor: 'bg-blue-100' },
      business: { name: 'Business', color: 'text-green-600', bgColor: 'bg-green-100' },
      professional: { name: 'Professional', color: 'text-black-600', bgColor: 'bg-black-100' },
      enterprise: { name: 'Enterprise', color: 'text-purple-600', bgColor: 'bg-purple-100' },
      solo: { name: 'Solo', color: 'text-yellow-600', bgColor: 'bg-yellow-100' }
    };
    return plans[tier as keyof typeof plans] || plans.free;
  };

  const planDetails = getCurrentPlanDetails();

  return (
    <>
      <div className="p-4 pb-24 max-w-md mx-auto">
        {/* Auto-rotating Marketing Banner */}
        <div className="mb-6 bg-gradient-to-r from-green-500 to-blue-600 rounded-xl p-4 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate animate-pulse">
                {marketingMessages[currentMessageIndex]}
              </p>
            </div>
            <Crown className="w-5 h-5 ml-2 flex-shrink-0" />
          </div>
        </div>

        {/* User Profile Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-6">
          <div className="text-center mb-6">
            <div className="relative inline-block">
              <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <User className="w-10 h-10 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                <CheckCircle className="w-4 h-4 text-white" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-1">Profile</h2>
            <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${planDetails.bgColor} ${planDetails.color}`}>
              {user?.tier !== 'free' && <Crown className="w-3 h-3 mr-1" />}
              {planDetails.name} Plan
            </div>
          </div>
          
          <div className="space-y-4 mb-6">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Name</label>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{user?.name}</p>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Email</label>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{user?.email}</p>
            </div>
            
            {user?.phone && (
              <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Phone</label>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">{user.phone}</p>
              </div>
            )}
            
            {company?.name && (
              <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Company</label>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">{company.name}</p>
              </div>
            )}
          </div>

          {/* Current Plan Status */}
          {user?.tier === 'free' && (
            <div className="bg-gradient-to-r from-orange-400 to-pink-500 rounded-xl p-4 mb-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm flex items-center">
                    <Zap className="w-4 h-4 mr-2" />
                    Unlock More Features
                  </h3>
                  <p className="text-xs opacity-90">2 properties • 24 tenants • Heavy branding</p>
                </div>
                <button
                  onClick={() => setShowPricingModal(true)}
                  className="bg-white/20 hover:bg-white/30 px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center space-x-1"
                >
                  <Crown className="w-3 h-3" />
                  <span>Upgrade</span>
                </button>
              </div>
            </div>
          )}

          {/* Upgrade/Manage Plan Button */}
          <button
            onClick={() => setShowPricingModal(true)}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white py-3 px-4 rounded-xl transition-all duration-200 font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center justify-center space-x-2 mb-4"
          >
            {user?.tier === 'free' ? (
              <>
                <Crown className="w-5 h-5" />
                <span>View Plans & Upgrade</span>
              </>
            ) : (
              <>
                <Star className="w-5 h-5" />
                <span>Manage Subscription</span>
              </>
            )}
            <ArrowRight className="w-4 h-4" />
          </button>
          
          <button
            onClick={logout}
            className="w-full bg-red-500 hover:bg-red-600 text-white py-3 px-4 rounded-xl transition-all duration-200 font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            Sign Out
          </button>
        </div>

        {/* Company Branding Section */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-green-600 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Building className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">SMB KENYA LTD</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Property Management Company</p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Naivasha • Nakuru • Nairobi</p>
          </div>

          {/* Services Grid */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
              <Star className="w-5 h-5 text-green-600 mx-auto mb-2" />
              <p className="text-xs font-medium text-green-700 dark:text-green-400">Rent Collection</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
              <Building className="w-5 h-5 text-blue-600 mx-auto mb-2" />
              <p className="text-xs font-medium text-blue-700 dark:text-blue-400">Property Mgmt</p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-center">
              <CheckCircle className="w-5 h-5 text-purple-600 mx-auto mb-2" />
              <p className="text-xs font-medium text-purple-700 dark:text-purple-400">Tenant Screening</p>
            </div>
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 text-center">
              <ExternalLink className="w-5 h-5 text-orange-600 mx-auto mb-2" />
              <p className="text-xs font-medium text-orange-700 dark:text-orange-400">Commercial Agency</p>
            </div>
          </div>

          {/* Contact Information */}
          <div className="space-y-3 mb-6">
            <button
              onClick={handlePhoneCall}
              className="w-full bg-green-500 hover:bg-green-600 text-white py-3 px-4 rounded-xl transition-all duration-200 font-medium flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              <Phone className="w-5 h-5" />
              <span>Call: 0791286165</span>
            </button>

            <button
              onClick={handleWhatsAppContact}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-xl transition-all duration-200 font-medium flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              <Phone className="w-5 h-5" />
              <span>WhatsApp: +254791286165</span>
            </button>

            <button
              onClick={handleEmailContact}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 px-4 rounded-xl transition-all duration-200 font-medium flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              <Mail className="w-5 h-5" />
              <span>info@cogvana.co.ke</span>
            </button>
          </div>

          {/* Premium Features Teaser */}
          <div className="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-xl p-4 text-white">
            <h4 className="font-bold text-sm mb-2 flex items-center">
              <Crown className="w-4 h-4 mr-2" />
              Premium Features Available
            </h4>
            <ul className="text-xs space-y-1 mb-3">
              <li>• Multiple Properties (Unlimited)</li>
              <li>• Higher Tenant Capacity</li>
              <li>• Remove Watermarks & Branding</li>
              <li>• Online Data Backup</li>
              <li>• Custom Agency Branding</li>
            </ul>
            <button
              onClick={() => setShowPricingModal(true)}
              className="flex items-center text-xs bg-white/20 hover:bg-white/30 px-3 py-2 rounded-lg transition-colors"
            >
              <span className="flex-1">View All Plans</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* App Info */}
        <div className="bg-gray-100 dark:bg-gray-700 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
            🏠 Free Property Management App
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500">
            All invoices are professionally branded with watermarks.
            <br />
            <span className="font-medium">Upgrade to remove watermarks.</span>
          </p>
        </div>
      </div>

      {/* Pricing Modal */}
      <PricingModal
        isOpen={showPricingModal}
        onClose={handlePricingModalClose}
        canDismiss={true} // Can dismiss from profile page
        currentPlan={user?.tier || 'free'}
        userId={user?.id}
        userPhone={user?.phone}
      />
    </>
  );
};

export default Profile;