// AgentView.tsx - Agent Dashboard (Updated with Multiple Payment Modes)
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  DollarSign,
  Receipt,
  TrendingUp,
  Search,
  Settings,
  //LogOut,
  Loader2,
  AlertCircle,
  CheckCircle,
  CreditCard,
  HelpCircle,
  X,
  Building2,
  Smartphone,
  Banknote,
  MessageCircle,
} from 'lucide-react';
import { AgentService, type Invoice, type Payment, type AgentAccount } from './Firebase';
import PaymentModal from './PaymentModal';

type PaymentMode = 'mobile_money' | 'bank' | 'paybill' | 'till';

const AgentView: React.FC = () => {
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [agentData, setAgentData] = useState<AgentAccount | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showPaymentSettings, setShowPaymentSettings] = useState(false);
  const [tenantIdSearch, setTenantIdSearch] = useState('');
  const [searchError, setSearchError] = useState('');
  const [error, setError] = useState('');

  // Payment Mode Selection
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<PaymentMode>('mobile_money');

  // Mobile Money State
  const [businessName, setBusinessName] = useState('');
  const [settlementBank, setSettlementBank] = useState<'mpesa' | 'airtel-ke'>('mpesa');
  const [accountNumber, setAccountNumber] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [savingPaymentInfo, setSavingPaymentInfo] = useState(false);

  // Bank Account State
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankBranch, setBankBranch] = useState('');

  // Paybill State
  const [paybillNumber, setPaybillNumber] = useState('');
  const [paybillAccountName, setPaybillAccountName] = useState('');

  // Till State
  const [tillNumber, setTillNumber] = useState('');
  const [tillBusinessName, setTillBusinessName] = useState('');

  useEffect(() => {
    const loadAgentData = async () => {
      try {
        setLoading(true);
        
        const agentUserStr = localStorage.getItem('currentUser');
        
        if (!agentUserStr) {
          navigate('/');
          return;
        }

        let agentUser;
        try {
          agentUser = JSON.parse(agentUserStr);

        } catch (parseError) {
          console.error('Error parsing agent user:', parseError);
          localStorage.removeItem('agentAuthUser');
          navigate('/');
          return;
        }

        if (!agentUser.id || !agentUser.email) {
          console.error('Invalid agent user data');
          localStorage.removeItem('agentAuthUser');
          navigate('/');
          return;
        }

        const agent = await AgentService.getAgent(agentUser.id);
        
        if (!agent) {
          setError('Agent account not found. Please contact support.');
          localStorage.removeItem('agentAuthUser');
          setTimeout(() => navigate('/'), 3000);
          return;
        }
        
        setAgentData(agent);

        const fetchedInvoices = await AgentService.getInvoicesByAgent(agentUser.id);
        setInvoices(fetchedInvoices);

        const fetchedPayments = await AgentService.getPaymentsByAgent(agentUser.id);
        setPayments(fetchedPayments);
        
        // Load payment info if available
        if (agent.paymentInfo) {
          setBusinessName(agent.paymentInfo.businessName || '');
          setSettlementBank(agent.paymentInfo.settlementBank as 'mpesa' | 'airtel-ke' || 'mpesa');
          setAccountNumber(agent.paymentInfo.accountNumber || '');
          setEmail(agent.paymentInfo.email || agent.email);
          setName(agent.paymentInfo.name || agent.name);
          setPhone(agent.paymentInfo.phone || agent.phone);
        } else {
          // Set defaults from agent data
          setEmail(agent.email);
          setName(agent.name);
          setPhone(agent.phone);
        }
        
      } catch (err: any) {
        console.error('Error loading agent data:', err);
        setError(err.message || 'Failed to load data');
        
        if (err.message?.includes('permission') || err.message?.includes('unauthorized')) {
          localStorage.removeItem('agentAuthUser');
          navigate('/');
        }
      } finally {
        setLoading(false);
      }
    };

    loadAgentData();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'agentAuthUser' && !e.newValue) {
        navigate('/');
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [navigate]);

//   const handleSignOut = async () => {
//     try {
//       AuthService.signOut();
//       localStorage.removeItem('agentAuthUser');
//       navigate('/');
//     } catch (err) {
//       navigate('/');
//       console.error('Error logging out:', err);
//     }
//   };

  const handleHelp = () => {
    navigate('/profile');
  };

  const handleTerminalSearch = async () => {
    setSearchError('');
    
    if (!tenantIdSearch) {
      setSearchError('Please enter a tenant ID');
      return;
    }

    try {
      const tenantInvoices = invoices.filter(
        inv => inv.tenantId.toString() === tenantIdSearch && !inv.isPaid
      );

      if (tenantInvoices.length === 0) {
        setSearchError('No unpaid invoices found for this tenant');
        return;
      }

      const latestInvoice = tenantInvoices.sort((a, b) => 
        new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()
      )[0];

      setSelectedInvoice(latestInvoice);
      setShowPaymentModal(true);
      setTenantIdSearch('');
      
    } catch (err: any) {
      setSearchError(err.message || 'Error finding tenant');
    }
  };

  const handlePaymentSuccess = async () => {
    if (agentData) {
      const agentUserStr = localStorage.getItem('agentAuthUser');
      if (!agentUserStr) return;
      
      const agentUser = JSON.parse(agentUserStr);
      const fetchedInvoices = await AgentService.getInvoicesByAgent(agentUser.id);
      setInvoices(fetchedInvoices);
      
      const fetchedPayments = await AgentService.getPaymentsByAgent(agentUser.id);
      setPayments(fetchedPayments);
    }
  };

  const generateWhatsAppMessage = () => {
    if (!agentData) return '';

    let message = `*🏢 Plot Yangu Payment Setup Request*\n\n`;
    message += `*Agent Details:*\n`;
    message += `• Name: ${agentData.name}\n`;
    message += `• Email: ${agentData.email}\n`;
    message += `• Phone: ${agentData.phone}\n`;
    message += `• Agent ID: ${agentData.id}\n\n`;

    switch (selectedPaymentMode) {
      case 'bank':
        message += `*Payment Method:* Bank Account\n\n`;
        message += `*Bank Details:*\n`;
        message += `• Bank Name: ${bankName}\n`;
        message += `• Account Number: ${bankAccountNumber}\n`;
        message += `• Account Name: ${bankAccountName}\n`;
        message += `• Branch: ${bankBranch || 'N/A'}\n`;
        break;

      case 'paybill':
        message += `*Payment Method:* Paybill\n\n`;
        message += `*Paybill Details:*\n`;
        message += `• Paybill Number: ${paybillNumber}\n`;
        message += `• Account Name: ${paybillAccountName}\n`;
        break;

      case 'till':
        message += `*Payment Method:* Buy Goods (Till)\n\n`;
        message += `*Till Details:*\n`;
        message += `• Till Number: ${tillNumber}\n`;
        message += `• Business Name: ${tillBusinessName}\n`;
        break;

      default:
        return '';
    }

    message += `\n_Please setup my payment account for automated settlements._`;

    return encodeURIComponent(message);
  };

  const handleRequestSetup = () => {
    if (!agentData) return;

    // Validate based on selected mode
    let isValid = false;

    switch (selectedPaymentMode) {
      case 'bank':
        isValid = !!(bankName && bankAccountNumber && bankAccountName);
        break;
      case 'paybill':
        isValid = !!(paybillNumber && paybillAccountName);
        break;
      case 'till':
        isValid = !!(tillNumber && tillBusinessName);
        break;
    }

    if (!isValid) {
      alert('Please fill in all required fields');
      return;
    }

    const message = generateWhatsAppMessage();
    const whatsappNumber = '254791286165'; // Your WhatsApp number
    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${message}`;
    
    window.open(whatsappUrl, '_blank');
  };

  const handleSavePaymentInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!agentData) return;

    try {
      setSavingPaymentInfo(true);
      
      await AgentService.setupPaymentAccount({
        businessName,
        settlementBank,
        accountNumber,
        email,
        name,
        phone,
        userId: agentData.id
      });

      // Refresh agent data
      const updated = await AgentService.getAgent(agentData.id);
      if (updated) {
        setAgentData(updated);
      }
      
      setShowPaymentSettings(false);
      alert('Payment account setup successfully!');
      
    } catch (err: any) {
      alert(err.message || 'Failed to setup payment account');
    } finally {
      setSavingPaymentInfo(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 2
    }).format(value);
  };

  const formatDate = (dateString: string | any) => {
    try {
      let date: Date;
      if (typeof dateString === 'string') {
        date = new Date(dateString);
      } else if (dateString?.toDate) {
        date = dateString.toDate();
      } else {
        return 'N/A';
      }
      
      return date.toLocaleDateString('en-KE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return 'N/A';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 text-center mb-2">Error</h2>
          <p className="text-gray-600 text-center mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const totalRevenue = payments
    .filter(p => p.status === 'success')
    .reduce((sum, p) => sum + p.amount, 0);
  
  const totalOutstanding = invoices
    .filter(inv => !inv.isPaid)
    .reduce((sum, inv) => sum + (inv.totalAmount - inv.amountPaid), 0);

  const paymentStatusData = [
    { name: 'Paid', value: invoices.filter(inv => inv.isPaid).length, color: '#10b981' },
    { name: 'Unpaid', value: invoices.filter(inv => !inv.isPaid).length, color: '#ef4444' }
  ];

  const monthlyData = payments
    .filter(p => p.status === 'success')
    .reduce((acc, payment) => {
      let month: string;
      try {
        if (payment.initiatedAt?.toDate) {
          month = payment.initiatedAt.toDate().toLocaleDateString('en-KE', { month: 'short' });
        } else {
          month = 'Unknown';
        }
      } catch {
        month = 'Unknown';
      }
      
      const existing = acc.find(item => item.month === month);
      if (existing) {
        existing.amount += payment.amount;
      } else {
        acc.push({ month, amount: payment.amount });
      }
      return acc;
    }, [] as Array<{ month: string; amount: number }>);

  const paymentModes = [
    {
      id: 'mobile_money' as PaymentMode,
      name: 'Mobile Money',
      description: 'M-Pesa & Airtel Money',
      icon: Smartphone,
      color: 'bg-green-500',
      available: true
    },
    {
      id: 'bank' as PaymentMode,
      name: 'Bank Account',
      description: 'Direct bank transfer',
      icon: Building2,
      color: 'bg-blue-500',
      available: true
    },
    {
      id: 'paybill' as PaymentMode,
      name: 'Paybill',
      description: 'M-Pesa Paybill',
      icon: Receipt,
      color: 'bg-purple-500',
      available: true
    },
    {
      id: 'till' as PaymentMode,
      name: 'Buy Goods (Till)',
      description: 'M-Pesa Till Number',
      icon: Banknote,
      color: 'bg-orange-500',
      available: true
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-100">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Agent Dashboard</h1>
              <p className="text-sm text-gray-600 mt-1">Welcome, {agentData?.name}</p>
              {agentData?.tier && (
                <span className="inline-block mt-1 px-2 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800">
                  {agentData.tier.toUpperCase()} Tier
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2 sm:space-x-3">
              <button
                onClick={() => setShowTerminal(!showTerminal)}
                className="flex items-center space-x-2 px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
              >
                <CreditCard className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">Terminal</span>
              </button>
              <button
                onClick={() => setShowPaymentSettings(!showPaymentSettings)}
                className="flex items-center space-x-2 px-3 sm:px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button
                onClick={handleHelp}
                className="hidden sm:flex items-center space-x-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <HelpCircle className="w-5 h-5" />
                <span>Help</span>
              </button>
              {/* <button
                onClick={handleSignOut}
                className="flex items-center space-x-2 px-3 sm:px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button> */}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {showTerminal && (
          <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Payment Terminal</h2>
              <button
                onClick={() => setShowTerminal(false)}
                className="sm:hidden text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-gray-600 mb-4 text-sm sm:text-base">
              Enter tenant ID to process payment at the office
            </p>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end space-y-3 sm:space-y-0 sm:space-x-4">
              <div className="flex-1">
                <label htmlFor="tenantId" className="block text-sm font-medium text-gray-700 mb-2">
                  Tenant ID
                </label>
                <input
                  id="tenantId"
                  type="text"
                  value={tenantIdSearch}
                  onChange={(e) => setTenantIdSearch(e.target.value)}
                  placeholder="Enter tenant ID"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  onKeyPress={(e) => e.key === 'Enter' && handleTerminalSearch()}
                />
              </div>
              <button
                onClick={handleTerminalSearch}
                className="w-full sm:w-auto px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center space-x-2"
              >
                <Search className="w-5 h-5" />
                <span>Search</span>
              </button>
            </div>
            
            {searchError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800 text-sm">{searchError}</p>
              </div>
            )}
          </div>
        )}

        {showPaymentSettings && (
          <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-6 sm:mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Payment Account Settings</h2>
              <button
                onClick={() => setShowPaymentSettings(false)}
                className="sm:hidden text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {agentData?.paymentInfo?.accountId ? (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-green-900 font-semibold">Payment Account Active</p>
                    <p className="text-green-700 text-sm mt-1">
                      Subaccount Code: {agentData.paymentInfo.accountId}
                    </p>
                    <p className="text-green-700 text-sm">
                      Commission Rate: {agentData.paymentInfo.split}%
                    </p>
                    <p className="text-green-700 text-sm">
                      Settlement Bank: {agentData.paymentInfo.settlementBank.toUpperCase()}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-yellow-800 text-sm">
                  No payment account configured. Setup your account details to receive payments via split settlement.
                </p>
              </div>
            )}

            {/* Payment Mode Selection */}
            <div className="mb-6">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Select Payment Method</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {paymentModes.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setSelectedPaymentMode(mode.id)}
                    disabled={!mode.available}
                    className={`relative p-4 rounded-xl border-2 transition-all ${
                      selectedPaymentMode === mode.id
                        ? 'border-indigo-600 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    } ${!mode.available ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-start space-x-3">
                      <div className={`${mode.color} p-2 rounded-lg`}>
                        <mode.icon className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-semibold text-gray-900 text-sm sm:text-base">{mode.name}</p>
                        <p className="text-xs sm:text-sm text-gray-600 mt-1">{mode.description}</p>
                      </div>
                      {selectedPaymentMode === mode.id && (
                        <CheckCircle className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Mobile Money Form */}
            {selectedPaymentMode === 'mobile_money' && (
              <form onSubmit={handleSavePaymentInfo} className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-blue-900 font-semibold text-sm">Automated Setup Available</p>
                      <p className="text-blue-700 text-xs mt-1">
                        Mobile money accounts can be setup automatically via Paystack integration.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Business Name
                  </label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder="Your Business Name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Settlement Bank
                  </label>
                  <select
                    value={settlementBank}
                    onChange={(e) => setSettlementBank(e.target.value as 'mpesa' | 'airtel-ke')}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="mpesa">M-Pesa</option>
                    <option value="airtel-ke">Airtel Money (Kenya)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Account Number / Phone Number
                  </label>
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder="254712345678"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter your M-Pesa/Airtel Money registered phone number
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder="email@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contact Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contact Phone
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder="254712345678"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingPaymentInfo}
                  className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingPaymentInfo ? (
                    <span className="flex items-center justify-center">
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Setting up account...
                    </span>
                  ) : (
                    agentData?.paymentInfo?.accountId ? 'Update Payment Account' : 'Setup Payment Account'
                  )}
                </button>
              </form>
            )}

            {/* Bank Account Form */}
            {selectedPaymentMode === 'bank' && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start space-x-3">
                    <MessageCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-blue-900 font-semibold text-sm">Free Setup via WhatsApp</p>
                      <p className="text-blue-700 text-xs mt-1">
                        Submit your bank details and our team will set up your account for free within 24 hours.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Bank Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g., Equity Bank, KCB, Co-operative Bank"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Account Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={bankAccountNumber}
                    onChange={(e) => setBankAccountNumber(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder="Your bank account number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Account Holder Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={bankAccountName}
                    onChange={(e) => setBankAccountName(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder="Name as it appears on the account"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Branch (Optional)
                  </label>
                  <input
                    type="text"
                    value={bankBranch}
                    onChange={(e) => setBankBranch(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g., Nairobi CBD Branch"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleRequestSetup}
                  className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>Request Setup via WhatsApp</span>
                </button>
              </div>
            )}

            {/* Paybill Form */}
            {selectedPaymentMode === 'paybill' && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start space-x-3">
                    <MessageCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-blue-900 font-semibold text-sm">Free Setup via WhatsApp</p>
                      <p className="text-blue-700 text-xs mt-1">
                        Submit your paybill details and our team will configure automated settlements for free.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Paybill Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={paybillNumber}
                    onChange={(e) => setPaybillNumber(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g., 123456"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Your M-Pesa Paybill business number
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Account Name / Business Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={paybillAccountName}
                    onChange={(e) => setPaybillAccountName(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder="Business name registered with the paybill"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleRequestSetup}
                  className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>Request Setup via WhatsApp</span>
                </button>
              </div>
            )}

            {/* Till Number Form */}
            {selectedPaymentMode === 'till' && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start space-x-3">
                    <MessageCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-blue-900 font-semibold text-sm">Free Setup via WhatsApp</p>
                      <p className="text-blue-700 text-xs mt-1">
                        Submit your till details and we'll integrate it with automated payment splits.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Till Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={tillNumber}
                    onChange={(e) => setTillNumber(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g., 123456"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Your M-Pesa Buy Goods till number
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Business Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={tillBusinessName}
                    onChange={(e) => setTillBusinessName(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder="Business name registered with the till"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleRequestSetup}
                  className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>Request Setup via WhatsApp</span>
                </button>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs sm:text-sm font-medium text-gray-600">Total Revenue</h3>
              <DollarSign className="w-6 h-6 sm:w-8 sm:h-8 text-green-600" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-gray-900">{formatCurrency(totalRevenue)}</p>
            <p className="text-xs text-gray-500 mt-2">From successful payments</p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs sm:text-sm font-medium text-gray-600">Outstanding</h3>
              <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-orange-600" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-gray-900">{formatCurrency(totalOutstanding)}</p>
            <p className="text-xs text-gray-500 mt-2">
              {invoices.filter(inv => !inv.isPaid).length} unpaid invoices
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs sm:text-sm font-medium text-gray-600">Total Invoices</h3>
              <Receipt className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-600" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-gray-900">{invoices.length}</p>
            <p className="text-xs text-gray-500 mt-2">All time invoices</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4">Monthly Revenue</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" style={{ fontSize: '12px' }} />
                <YAxis style={{ fontSize: '12px' }} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Bar dataKey="amount" fill="#4f46e5" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4">Invoice Status</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={paymentStatusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {paymentStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4">Recent Payments</h3>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <div className="inline-block min-w-full align-middle">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700">Date</th>
                    <th className="text-left py-3 px-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700">Reference</th>
                    <th className="text-left py-3 px-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 hidden sm:table-cell">Tenant</th>
                    <th className="text-left py-3 px-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700">Amount</th>
                    <th className="text-left py-3 px-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.slice(0, 10).map((payment) => (
                    <tr key={payment.reference} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-3 sm:px-4 text-xs sm:text-sm text-gray-900">
                        {formatDate(payment.completedAt || payment.initiatedAt)}
                      </td>
                      <td className="py-3 px-3 sm:px-4 text-xs sm:text-sm text-gray-600 font-mono">
                        {payment.reference.substring(0, 8)}...
                      </td>
                      <td className="py-3 px-3 sm:px-4 text-xs sm:text-sm text-gray-900 hidden sm:table-cell">
                        {payment.userName || 'N/A'}
                      </td>
                      <td className="py-3 px-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-900">
                        {formatCurrency(payment.amount)}
                      </td>
                      <td className="py-3 px-3 sm:px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            payment.status === 'success'
                              ? 'bg-green-100 text-green-800'
                              : payment.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {payment.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {payments.length === 0 && (
              <div className="text-center py-12">
                <Receipt className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No payments yet</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {showPaymentModal && selectedInvoice && (
        <PaymentModal
          invoice={selectedInvoice}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedInvoice(null);
          }}
          onSuccess={handlePaymentSuccess}
          initiatorRole="agent"
        />
      )}
    </div>
  );
};

export default AgentView;