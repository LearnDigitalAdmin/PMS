import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Edit, 
  Trash2, 
  Download, 
  Share, 
  Check, 
  X, 
  Phone,
  Mail,
  MapPin,
  CreditCard,
  AlertTriangle,
  CheckCircle,
  Clock
} from 'lucide-react';
import { database, type InvoiceWithDetails, type Payment } from '../../services/database/Database';


interface AnInvoiceProps {
  invoiceId: number;
  onNavigate?: (page: string, params?: any) => void;
  onBack?: () => void;
}

const AnInvoice: React.FC<AnInvoiceProps> = ({ invoiceId, onNavigate, onBack }) => {
  const [invoice, setInvoice] = useState<InvoiceWithDetails | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  
  // Payment modal state
  const [paymentAmount, setPaymentAmount] = useState('');
  const [arrears, setArrears] = useState('0');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);

  useEffect(() => {
    loadInvoiceData();
  }, [invoiceId]);

  const loadInvoiceData = async () => {
    try {
      setLoading(true);
      const [invoiceData, paymentsData] = await Promise.all([
        database.getInvoices({ propertyId: undefined }).then(invoices => 
          invoices.find(inv => inv.id === invoiceId)
        ),
        database.getPaymentsByInvoice(invoiceId)
      ]);
      
      setInvoice(invoiceData || null);
      setPayments(paymentsData);
      
      if (invoiceData && !invoiceData.isPaid) {
        setPaymentAmount(invoiceData.totalAmount.toString());
      }
    } catch (error) {
      console.error('Error loading invoice data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const calculateTotals = () => {
    if (!invoice) return { waterTotal: 0, powerTotal: 0, grandTotal: 0 };
    
    const waterTotal = (invoice.waterCurrentReading - invoice.waterPreviousReading) * 
                      invoice.waterUnitPrice + invoice.waterStandingFee;
    const powerTotal = (invoice.powerCurrentReading - invoice.powerPreviousReading) * 
                      invoice.powerUnitPrice;
    const grandTotal = invoice.rentAmount + waterTotal + powerTotal + invoice.otherCharges;
    
    return { waterTotal, powerTotal, grandTotal };
  };

  const handleMarkPaid = async () => {
    if (!invoice || processingPayment) return;
    
    try {
      setProcessingPayment(true);
      const amount = parseFloat(paymentAmount);
      const arrearsAmount = parseFloat(arrears);
      
      await database.markInvoicePaid(invoice.id, amount, arrearsAmount);
      
      // Create payment record
      await database.createPayment({
        invoiceId: invoice.id,
        amount: amount,
        paymentDate: paymentDate,
        paymentMethod: paymentMethod,
        notes: notes
      });
      
      await loadInvoiceData();
      setShowPaymentModal(false);
      resetPaymentForm();
    } catch (error) {
      console.error('Error marking invoice as paid:', error);
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleMarkUnpaid = async () => {
    if (!invoice) return;
    
    try {
      await database.markInvoiceUnpaid(invoice.id);
      await loadInvoiceData();
    } catch (error) {
      console.error('Error marking invoice as unpaid:', error);
    }
  };

  const handleDeleteInvoice = async () => {
    if (!invoice) return;
    
    try {
      await database.deleteInvoice(invoice.id);
      setShowDeleteModal(false);
      onBack?.();
    } catch (error) {
      console.error('Error deleting invoice:', error);
    }
  };

  const resetPaymentForm = () => {
    setPaymentAmount('');
    setArrears('0');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('');
    setNotes('');
  };

  const handleShare = (method: 'whatsapp' | 'email' | 'system') => {
    // TODO: Implement actual sharing
    console.log(`Sharing via ${method}`);
    setShowShareModal(false);
  };

  const getStatusColor = () => {
    if (!invoice) return 'text-gray-500 bg-gray-50';
    if (invoice.isPaid) return 'text-green-600 bg-green-50';
    
    const dueDate = new Date(invoice.dueDate || invoice.createdAt);
    const today = new Date();
    
    if (dueDate < today) return 'text-red-600 bg-red-50';
    return 'text-yellow-600 bg-yellow-50';
  };

  const getStatusIcon = () => {
    if (!invoice) return <Clock className="w-5 h-5" />;
    if (invoice.isPaid) return <CheckCircle className="w-5 h-5" />;
    
    const dueDate = new Date(invoice.dueDate || invoice.createdAt);
    const today = new Date();
    
    if (dueDate < today) return <AlertTriangle className="w-5 h-5" />;
    return <Clock className="w-5 h-5" />;
  };

  const totals = calculateTotals();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="animate-pulse">
          <div className="bg-white rounded-xl p-6 shadow-sm mb-4">
            <div className="h-8 bg-gray-200 rounded w-1/2 mb-4"></div>
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-4 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Invoice not found</h3>
          <p className="text-gray-500 mb-6">The requested invoice could not be loaded</p>
          <button
            onClick={onBack}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-30">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center space-x-3">
            <button
              onClick={onBack}
              className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                #{invoice.invoiceNumber}
              </h1>
              <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor()}`}>
                {getStatusIcon()}
                <span>{invoice.isPaid ? 'Paid' : 'Unpaid'}</span>
              </div>
            </div>
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={() => setShowShareModal(true)}
              className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <Share className="w-5 h-5" />
            </button>
            <button
              onClick={() => {/* TODO: Implement PDF download */}}
              className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <Download className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Invoice Content */}
      <div className="p-4 space-y-6">
        {/* Invoice Header */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="text-center border-b border-gray-100 pb-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">INVOICE</h2>
            <p className="text-gray-600">#{invoice.invoiceNumber}</p>
            <p className="text-sm text-gray-500 mt-2">
              Billing Period: {invoice.billingMonth}
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Property Details */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                <MapPin className="w-4 h-4 mr-2" />
                Property Details
              </h3>
              <div className="space-y-2 text-sm">
                <p><span className="font-medium">Property:</span> {invoice.propertyName}</p>
                <p><span className="font-medium">Invoice Date:</span> {formatDate(invoice.createdAt)}</p>
                {invoice.dueDate && (
                  <p><span className="font-medium">Due Date:</span> {formatDate(invoice.dueDate)}</p>
                )}
              </div>
            </div>
            
            {/* Tenant Details */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Tenant Details</h3>
              <div className="space-y-2 text-sm">
                <p><span className="font-medium">Name:</span> {invoice.tenantName}</p>
                {invoice.tenantPhone && (
                  <p className="flex items-center">
                    <Phone className="w-3 h-3 mr-2" />
                    {invoice.tenantPhone}
                  </p>
                )}
                {invoice.tenantEmail && (
                  <p className="flex items-center">
                    <Mail className="w-3 h-3 mr-2" />
                    {invoice.tenantEmail}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Billing Details */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Billing Details</h3>
          
          <div className="space-y-4">
            {/* Rent */}
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-600">Monthly Rent</span>
              <span className="font-medium">{formatCurrency(invoice.rentAmount)}</span>
            </div>
            
            {/* Water Charges */}
            {(invoice.waterCurrentReading > 0 || invoice.waterStandingFee > 0) && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Water Charges</span>
                  <span className="font-medium">{formatCurrency(totals.waterTotal)}</span>
                </div>
                <div className="pl-4 space-y-1 text-sm text-gray-500">
                  <div className="flex justify-between">
                    <span>Previous Reading: {invoice.waterPreviousReading} units</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Current Reading: {invoice.waterCurrentReading} units</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Usage: {invoice.waterCurrentReading - invoice.waterPreviousReading} units @ {formatCurrency(invoice.waterUnitPrice)}/unit</span>
                  </div>
                  {invoice.waterStandingFee > 0 && (
                    <div className="flex justify-between">
                      <span>Standing Fee: {formatCurrency(invoice.waterStandingFee)}</span>
                    </div>
                  )}
                </div>
                <div className="border-b border-gray-100"></div>
              </div>
            )}
            
            {/* Power Charges */}
            {invoice.powerCurrentReading > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Power Charges</span>
                  <span className="font-medium">{formatCurrency(totals.powerTotal)}</span>
                </div>
                <div className="pl-4 space-y-1 text-sm text-gray-500">
                  <div className="flex justify-between">
                    <span>Previous Reading: {invoice.powerPreviousReading} kWh</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Current Reading: {invoice.powerCurrentReading} kWh</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Usage: {invoice.powerCurrentReading - invoice.powerPreviousReading} kWh @ {formatCurrency(invoice.powerUnitPrice)}/kWh</span>
                  </div>
                </div>
                <div className="border-b border-gray-100"></div>
              </div>
            )}
            
            {/* Other Charges */}
            {invoice.otherCharges > 0 && (
              <div className="flex justify-between py-2 border-b border-gray-100">
                <div>
                  <span className="text-gray-600">Other Charges</span>
                  {invoice.otherChargesDescription && (
                    <p className="text-sm text-gray-500">{invoice.otherChargesDescription}</p>
                  )}
                </div>
                <span className="font-medium">{formatCurrency(invoice.otherCharges)}</span>
              </div>
            )}
            
            {/* Previous Arrears */}
            {invoice.arrears > 0 && (
              <div className="flex justify-between py-2 border-b border-gray-100 text-red-600">
                <span>Previous Arrears</span>
                <span className="font-medium">{formatCurrency(invoice.arrears)}</span>
              </div>
            )}
            
            {/* Total */}
            <div className="flex justify-between py-3 text-lg font-bold text-gray-900 bg-gray-50 px-4 rounded-lg">
              <span>Total Amount</span>
              <span>{formatCurrency(invoice.totalAmount)}</span>
            </div>
            
            {/* Payment Status */}
            {invoice.isPaid && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center space-x-2 text-green-700">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-medium">Payment Received</span>
                </div>
                <div className="mt-2 space-y-1 text-sm">
                  <p>Amount Paid: {formatCurrency(invoice.amountPaid)}</p>
                  {invoice.paidDate && (
                    <p>Payment Date: {formatDate(invoice.paidDate)}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Payment History */}
        {payments.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
              <CreditCard className="w-4 h-4 mr-2" />
              Payment History
            </h3>
            
            <div className="space-y-3">
              {payments.map((payment) => (
                <div key={payment.id} className="flex justify-between items-center py-3 border-b border-gray-100 last:border-b-0">
                  <div>
                    <p className="font-medium text-gray-900">{formatCurrency(payment.amount)}</p>
                    <p className="text-sm text-gray-500">{formatDate(payment.paymentDate)}</p>
                    {payment.paymentMethod && (
                      <p className="text-xs text-gray-400">{payment.paymentMethod}</p>
                    )}
                    {payment.notes && (
                      <p className="text-xs text-gray-500 mt-1">{payment.notes}</p>
                    )}
                  </div>
                  <CheckCircle className="w-5 h-5 text-green-500" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="grid grid-cols-1 gap-3">
            {!invoice.isPaid ? (
              <button
                onClick={() => setShowPaymentModal(true)}
                className="bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
              >
                <Check className="w-5 h-5" />
                <span>Mark as Paid</span>
              </button>
            ) : (
              <button
                onClick={handleMarkUnpaid}
                className="bg-yellow-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-yellow-700 transition-colors flex items-center justify-center space-x-2"
              >
                <X className="w-5 h-5" />
                <span>Mark as Unpaid</span>
              </button>
            )}
            
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => onNavigate?.('edit-invoice', { invoiceId: invoice.id })}
                className="bg-blue-50 text-blue-600 py-3 px-4 rounded-lg font-medium hover:bg-blue-100 transition-colors flex items-center justify-center space-x-2"
              >
                <Edit className="w-4 h-4" />
                <span>Edit</span>
              </button>
              
              <button
                onClick={() => setShowDeleteModal(true)}
                className="bg-red-50 text-red-600 py-3 px-4 rounded-lg font-medium hover:bg-red-100 transition-colors flex items-center justify-center space-x-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end z-50">
          <div className="bg-white rounded-t-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold text-center">Record Payment</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount Paid *
                </label>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="Enter amount paid"
                  className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Arrears (if any)
                </label>
                <input
                  type="number"
                  value={arrears}
                  onChange={(e) => setArrears(e.target.value)}
                  placeholder="Enter arrears amount"
                  className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Date *
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select method</option>
                  <option value="Cash">Cash</option>
                  <option value="M-Pesa">M-Pesa</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any payment notes"
                  rows={3}
                  className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div className="flex space-x-3 pt-4">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkPaid}
                disabled={!paymentAmount || processingPayment}
                className="flex-1 bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processingPayment ? 'Processing...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Invoice</h3>
              <p className="text-sm text-gray-600">
                Are you sure you want to delete this invoice? This action cannot be undone.
              </p>
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 bg-gray-100 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteInvoice}
                className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end z-50">
          <div className="bg-white rounded-t-2xl w-full p-6 space-y-4">
            <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold text-center">Share Invoice</h3>
            
            <div className="space-y-3">
              <button
                onClick={() => handleShare('whatsapp')}
                className="w-full bg-green-50 text-green-600 py-3 px-4 rounded-lg font-medium hover:bg-green-100 transition-colors text-left flex items-center space-x-3"
              >
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-bold">W</span>
                </div>
                <span>Share via WhatsApp</span>
              </button>
              
              <button
                onClick={() => handleShare('email')}
                className="w-full bg-blue-50 text-blue-600 py-3 px-4 rounded-lg font-medium hover:bg-blue-100 transition-colors text-left flex items-center space-x-3"
              >
                <Mail className="w-5 h-5" />
                <span>Share via Email</span>
              </button>
              
              <button
                onClick={() => handleShare('system')}
                className="w-full bg-gray-50 text-gray-600 py-3 px-4 rounded-lg font-medium hover:bg-gray-100 transition-colors text-left flex items-center space-x-3"
              >
                <Share className="w-5 h-5" />
                <span>More Options</span>
              </button>
            </div>
            
            <button
              onClick={() => setShowShareModal(false)}
              className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnInvoice;