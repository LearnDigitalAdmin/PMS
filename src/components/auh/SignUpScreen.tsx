import React, { useState } from 'react';
import { Building, Eye, EyeOff, User, Mail, Phone, Lock, Briefcase, MapPin, CheckCircle, Wifi, WifiOff } from 'lucide-react';
import { database } from '../../services/database/Database';
import { useAuth, createUserWithFirebaseAuth } from './AuthWrapper';
import PricingModal from '../ui/PricingPage';

interface SignUpScreenProps {
  onSwitchToSignIn: () => void;
}

const SignUpScreen: React.FC<SignUpScreenProps> = ({ onSwitchToSignIn }) => {
  const [step, setStep] = useState(1);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [formData, setFormData] = useState({
    // User details
    name: '',
    email: '',
    phone: 0, // Keep as number for database compatibility
    password: '',
    confirmPassword: '',
    // Company details
    companyName: '',
    companyAddress: '',
    companyPhone: '',
    companyEmail: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { login } = useAuth();

  // Monitor online/offline status
  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const validateStep1 = () => {
    if (!formData.name || !formData.email || !formData.phone || !formData.password || !formData.confirmPassword) {
      setError('Please fill in all required fields');
      return false;
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('Please enter a valid email address');
      return false;
    }
    
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return false;
    }
    
    // Validate phone number format
    if (!formData.phone || formData.phone === 0) {
      setError('Please enter a valid phone number');
      return false;
    }
    
    // Check if phone number is reasonable length
    const phoneStr = formData.phone.toString();
    if (phoneStr.length < 9 || phoneStr.length > 15) {
      setError('Phone number must be between 9 and 15 digits');
      return false;
    }
    
    return true;
  };

  const handleNext = () => {
    setError('');
    
    // Check internet connection before proceeding
    if (!navigator.onLine) {
      alert('⚠️ Internet connection required to create a new account. Please check your connection and try again.');
      setError('No internet connection. Please connect to the internet to continue.');
      return;
    }
    
    if (validateStep1()) {
      setStep(2);
    }
  };

  const handleSubmit = async () => {
    // Double check internet connection
    if (!navigator.onLine) {
      alert('⚠️ Internet connection required to create a new account. Please check your connection and try again.');
      setError('No internet connection. Please connect to the internet to create your account.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      console.log('🚀 Starting account creation process...');
      
      // Step 1: Create local user account first
      console.log('📝 Creating local user account...');
      const localUserResult = await database.createUserWithCompany({
        user: {
          id: formData.phone, // Number as expected by database
          name: formData.name,
          email: formData.email,
          phone: formData.phone, // Number as expected by database
          password: formData.password
        },
        company: formData.companyName ? {
          name: formData.companyName,
          address: formData.companyAddress,
          phone: formData.companyPhone,
          email: formData.companyEmail
        } : undefined
      });

      console.log('✅ Local user account created successfully');

      // Step 2: Create Firebase Auth user and Firestore document
      console.log('🔐 Creating Firebase Auth user...');
      const firebaseResult = await createUserWithFirebaseAuth(
        formData.email,
        formData.password,
        {
          localId: formData.phone,
          name: formData.name,
          phone: formData.phone.toString(),
          tier: localUserResult.user.tier || 'free',
          type: localUserResult.user.type || 'free',
          storage: localUserResult.user.storage || false,
          isPremium: localUserResult.user.isPremium || false,
          company: formData.companyName ? {
            name: formData.companyName,
            address: formData.companyAddress,
            phone: formData.companyPhone,
            email: formData.companyEmail
          } : null
        }
      );

      if (!firebaseResult.success) {
        // If Firebase creation fails, we should clean up the local user
        console.error('❌ Firebase user creation failed:', firebaseResult.error);
        
        // Optionally delete the local user
        // Note: You may want to keep the local user and just show an error
        // await database.deleteUser(formData.phone);
        
        throw new Error(firebaseResult.error || 'Failed to create Firebase account');
      }

      console.log('✅ Firebase Auth user created with UID:', firebaseResult.uid);

      // Step 3: Auto login after successful signup
      console.log('🔑 Logging in user...');
      const loginResult = await login(formData.email, formData.password);
      
      if (!loginResult.success) {
        throw new Error(loginResult.error || 'Login failed after signup');
      }

      console.log('✅ User logged in successfully');
      
      // Step 4: Show pricing modal after successful signup
      setShowPricingModal(true);
      
    } catch (err: any) {
      console.error('❌ Account creation error:', err);
      setError(err.message || 'An error occurred. Please try again.');
      
      // Show user-friendly error message
      if (err.message.includes('email-already-in-use')) {
        alert('⚠️ This email is already registered. Please sign in instead.');
      } else if (err.message.includes('No internet connection')) {
        alert('⚠️ Internet connection required. Please check your connection and try again.');
      } else {
        alert('⚠️ Failed to create account. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePricingModalClose = (planSelected?: string) => {
    setShowPricingModal(false);
    // Plan selection logic can be added here later
    console.log('Plan selected:', planSelected);
  };

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-purple-600 via-pink-600 to-indigo-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo/Brand */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 backdrop-blur-lg rounded-2xl mb-4">
              <Building className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Plot Yangu</h1>
            <p className="text-purple-100">Start managing your properties today</p>
            
            {/* Online/Offline Indicator */}
            <div className="mt-4 inline-flex items-center space-x-2 px-4 py-2 bg-white/10 backdrop-blur-lg rounded-full">
              {isOnline ? (
                <>
                  <Wifi className="w-4 h-4 text-green-300" />
                  <span className="text-sm text-green-100">Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-red-300" />
                  <span className="text-sm text-red-100">Offline - Connection Required</span>
                </>
              )}
            </div>
          </div>

          {/* Sign Up Form */}
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-8">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Create Account</h2>
              <p className="text-gray-600">
                Step {step} of 2 - {step === 1 ? 'Personal Information' : 'Company Details'}
              </p>
              {!isOnline && (
                <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-800">
                    ⚠️ Internet connection required to create account
                  </p>
                </div>
              )}
            </div>

            {/* Progress Indicator */}
            <div className="mb-8">
              <div className="flex items-center space-x-2">
                <div className={`w-1/2 h-2 rounded-full ${step >= 1 ? 'bg-purple-500' : 'bg-gray-200'} transition-colors`} />
                <div className={`w-1/2 h-2 rounded-full ${step >= 2 ? 'bg-purple-500' : 'bg-gray-200'} transition-colors`} />
              </div>
              <div className="flex justify-between mt-2 text-xs text-gray-500">
                <span>Personal Info</span>
                <span>Company Details</span>
              </div>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            {step === 1 ? (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Full Name *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                      placeholder="Enter your full name"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value.toLowerCase() })}
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                      placeholder="Enter your email"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number *
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="tel"
                      value={formData.phone || ''} // Display empty string if phone is 0
                      onChange={(e) => {
                        // Only allow numeric input and convert to number
                        const value = e.target.value.replace(/\D/g, '');
                        setFormData({ ...formData, phone: value ? parseInt(value, 10) : 0 });
                      }}
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                      placeholder="Enter your phone number"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">Used as your unique account ID</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full pl-11 pr-11 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                      placeholder="Create a password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">At least 6 characters</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Confirm Password *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                      className="w-full pl-11 pr-11 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                      placeholder="Confirm your password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleNext}
                  disabled={!isOnline}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 px-4 rounded-xl hover:from-purple-700 hover:to-pink-700 focus:ring-4 focus:ring-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium"
                >
                  {!isOnline ? 'Connection Required' : 'Next Step'}
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <p className="text-sm text-blue-800">
                    ℹ️ Company details are optional. You can skip this step or add them later.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Company/Business Name
                  </label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={formData.companyName}
                      onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                      placeholder="Enter company name (optional)"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Company Address
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                    <textarea
                      value={formData.companyAddress}
                      onChange={(e) => setFormData({ ...formData, companyAddress: e.target.value })}
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors resize-none"
                      placeholder="Enter company address (optional)"
                      rows={3}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Company Phone
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="tel"
                      value={formData.companyPhone}
                      onChange={(e) => setFormData({ ...formData, companyPhone: e.target.value })}
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                      placeholder="Enter company phone (optional)"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Company Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={formData.companyEmail}
                      onChange={(e) => setFormData({ ...formData, companyEmail: e.target.value.toLowerCase() })}
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                      placeholder="Enter company email (optional)"
                    />
                  </div>
                </div>

                <div className="flex space-x-4">
                  <button
                    onClick={() => setStep(1)}
                    disabled={isLoading}
                    className="flex-1 bg-gray-200 text-gray-700 py-3 px-4 rounded-xl hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={isLoading || !isOnline}
                    className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 px-4 rounded-xl hover:from-purple-700 hover:to-pink-700 focus:ring-4 focus:ring-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium flex items-center justify-center space-x-2"
                  >
                    {isLoading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : !isOnline ? (
                      <span>Connection Required</span>
                    ) : (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        <span>Create Account</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-8 text-center">
              <p className="text-gray-600">
                Already have an account?{' '}
                <button
                  onClick={onSwitchToSignIn}
                  className="text-purple-600 hover:text-purple-700 font-medium transition-colors"
                >
                  Sign in instead
                </button>
              </p>
              <p className="mt-4 text-xs text-gray-500">
                By creating an account, you agree to our Terms of Service and Privacy Policy
              </p>
              <span className="block mt-2 text-xs text-red-600 font-medium">
                Powered by: SMB KENYA LTD and Cogvana Technologies
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Modal - Shows after successful signup */}
      {showPricingModal && (
        <PricingModal
          isOpen={showPricingModal}
          onClose={handlePricingModalClose}
          canDismiss={false} // Cannot dismiss after signup - must select a plan
          currentPlan="free"
          userId={formData.phone}
          userPhone={formData.phone}
        />
      )}
    </>
  );
};

export default SignUpScreen;