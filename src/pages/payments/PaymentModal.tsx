// PaymentModal.tsx - Updated Payment Initiation Modal
import React, { useState, useEffect } from 'react';
import { X, Phone, DollarSign, AlertCircle, CheckCircle, Loader2, Info } from 'lucide-react';
import { PaymentService, type Invoice } from './Firebase';

interface PaymentModalProps {
  invoice: Invoice;
  onClose: () => void;
  onSuccess: () => void;
  initiatorRole: 'agent' | 'tenant';
}

const PaymentModal: React.FC<PaymentModalProps> = ({ 
  invoice, 
  onClose, 
  onSuccess
}) => {
  const [phone, setPhone] = useState('');
  const [tenantName, setTenantName] = useState(invoice.tenantName || 'Tenant');
  const [amount, setAmount] = useState(invoice.totalAmount - invoice.amountPaid);
  const [paymentMethod, setPaymentMethod] = useState<'mpesa' | 'airtel_money'>('mpesa');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');
  const [paymentReference, setPaymentReference] = useState('');
  const [phoneError, setPhoneError] = useState('');

  const invoiceBalance = invoice.totalAmount - invoice.amountPaid;
  const fees = PaymentService.calculateFees(amount, invoiceBalance);

  useEffect(() => {
    if (phoneError && phone) {
      setPhoneError('');
    }
  }, [phone, phoneError]);

  const validatePhoneNumber = (input: string): boolean => {
    const formatted = PaymentService.formatPhoneNumber(input);
    if (!formatted) {
      setPhoneError('Invalid phone number. Use format: 0712345678 or 254712345678');
      return false;
    }
    setPhoneError('');
    return true;
  };

  const handlePhoneBlur = () => {
    if (phone) {
      validatePhoneNumber(phone);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 2
    }).format(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!validatePhoneNumber(phone)) {
      return;
    }

    if (amount <= 0) {
      setError('Amount must be greater than zero');
      return;
    }

    if (amount > invoiceBalance) {
      setError('Amount cannot exceed outstanding balance');
      return;
    }

    setLoading(true);
    setStatus('processing');

    try {
      const result = await PaymentService.initiatePayment({
        invoiceId: invoice.localId,
        invoice: invoice,
        tenantName: tenantName,
        amount,
        phone,
        paymentMethod
      });

      setPaymentReference(result.reference);

      // Listen for payment status updates
      const unsubscribe = PaymentService.listenToPaymentStatus(
        result.reference,
        (transaction) => {
          console.log('Transaction status update:', transaction);
          
          if (transaction.status === 'success') {
            setStatus('success');
            setTimeout(() => {
              onSuccess();
              onClose();
            }, 2000);
            unsubscribe();
          } else if (transaction.status === 'failed') {
            setStatus('failed');
            setError(transaction.failureReason || 'Payment failed. Please try again or contact support.');
            unsubscribe();
          }
        }
      );

      // Cleanup listener after 5 minutes
      setTimeout(() => {
        if (status === 'processing') {
          unsubscribe();
          setStatus('failed');
          setError('Payment timeout. Please check your payment history or try again.');
        }
      }, 5 * 60 * 1000);

    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || 'Failed to initiate payment');
      setStatus('failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAmountChange = (value: string) => {
    const numValue = parseFloat(value) || 0;
    if (numValue <= invoiceBalance) {
      setAmount(numValue);
      setError('');
    } else {
      setAmount(numValue);
      setError(`Amount cannot exceed outstanding balance of ${formatCurrency(invoiceBalance)}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Process Payment</h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Invoice Details */}
          <div className="bg-blue-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Tenant:</span>
              <span className="font-semibold text-gray-900">{invoice.tenantName || `ID: ${invoice.tenantId}`}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Property:</span>
              <span className="font-semibold text-gray-900">{invoice.propertyName || 'N/A'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Billing Month:</span>
              <span className="font-semibold text-gray-900">{invoice.billingMonth}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total Amount:</span>
              <span className="font-bold text-gray-900">{formatCurrency(invoice.totalAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Amount Paid:</span>
              <span className="font-semibold text-green-600">{formatCurrency(invoice.amountPaid)}</span>
            </div>
            <div className="flex justify-between text-sm border-t border-blue-200 pt-2">
              <span className="text-gray-900 font-semibold">Outstanding:</span>
              <span className="font-bold text-red-600">
                {formatCurrency(invoiceBalance)}
              </span>
            </div>
          </div>

          {/* Status Messages */}
          {status === 'processing' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start space-x-3">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-blue-900 font-semibold">Processing Payment</p>
                <p className="text-blue-700 text-sm mt-1">
                  {paymentMethod === 'mpesa' 
                    ? 'Please check your phone and enter your M-Pesa PIN to complete the payment.'
                    : 'Please check your phone and enter your Airtel Money PIN to complete the payment.'}
                </p>
                {paymentReference && (
                  <p className="text-blue-600 text-xs mt-2 font-mono">
                    Reference: {paymentReference}
                  </p>
                )}
              </div>
            </div>
          )}

          {status === 'success' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start space-x-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-green-900 font-semibold">Payment Successful!</p>
                <p className="text-green-700 text-sm mt-1">
                  Your payment of {formatCurrency(amount)} has been processed successfully.
                </p>
              </div>
            </div>
          )}

          {error && status !== 'processing' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-900 font-semibold">
                  {status === 'failed' ? 'Payment Failed' : 'Error'}
                </p>
                <p className="text-red-700 text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Payment Form */}
          {status === 'idle' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Tenant Name (for agent terminal) */}
              {!invoice.tenantName && (
                <div>
                  <label htmlFor="tenantName" className="block text-sm font-medium text-gray-700 mb-2">
                    Tenant Name
                  </label>
                  <input
                    id="tenantName"
                    type="text"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    placeholder="Enter tenant name"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
              )}

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Method
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('mpesa')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      paymentMethod === 'mpesa'
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-center">
                      <div className="font-bold text-green-600">M-Pesa</div>
                      <div className="text-xs text-gray-600 mt-1">Safaricom</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('airtel_money')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      paymentMethod === 'airtel_money'
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-center">
                      <div className="font-bold text-red-600">Airtel Money</div>
                      <div className="text-xs text-gray-600 mt-1">Airtel</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Phone Number */}
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onBlur={handlePhoneBlur}
                    placeholder="0712345678 or 254712345678"
                    className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      phoneError ? 'border-red-300' : 'border-gray-300'
                    }`}
                    required
                  />
                </div>
                {phoneError && (
                  <p className="text-red-600 text-xs mt-1">{phoneError}</p>
                )}
                <p className="text-gray-500 text-xs mt-1">
                  Format: 0712345678 or 254712345678
                </p>
              </div>

              {/* Amount */}
              <div>
                <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-2">
                  Amount to Pay
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    id="amount"
                    type="number"
                    value={amount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    min="1"
                    max={invoiceBalance}
                    step="0.01"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                <p className="text-gray-500 text-xs mt-1">
                  Maximum: {formatCurrency(invoiceBalance)}
                </p>
                {fees.arrears > 0 && (
                  <p className="text-orange-600 text-xs mt-1 font-semibold">
                    ⚠ Partial payment: {formatCurrency(fees.arrears)} will remain as arrears
                  </p>
                )}
              </div>

              {/* Fee Breakdown */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex items-start space-x-2">
                  <Info className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-semibold text-gray-700 mb-2">Payment Summary:</div>
                    <div className="space-y-1 text-gray-600">
                      <div className="flex justify-between">
                        <span>Payment Amount:</span>
                        <span className="font-semibold">{formatCurrency(amount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Platform Fee (1.5%):</span>
                        <span className="font-semibold">{formatCurrency(fees.platformFee)}</span>
                      </div>
                      <div className="flex justify-between border-t border-gray-300 pt-2 text-gray-900 font-bold">
                        <span>Total to Pay:</span>
                        <span>{formatCurrency(fees.total)}</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-300 text-xs text-gray-500">
                      <p>💡 Landlord receives full payment amount. Transaction fees handled by platform.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || !phone || amount <= 0 || phoneError !== '' || amount > invoiceBalance}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  `Pay ${formatCurrency(fees.total)}`
                )}
              </button>
            </form>
          )}

          {/* Close Button for Success/Failed States */}
          {(status === 'success' || status === 'failed') && (
            <button
              onClick={onClose}
              className="w-full bg-gray-600 text-white py-3 rounded-lg font-semibold hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;