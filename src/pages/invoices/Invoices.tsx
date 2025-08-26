import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Plus, 
  Download, 
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileText,
  RefreshCw,
  Share,
  Eye,
  CheckCircle,
  Clock,
  AlertCircle
} from 'lucide-react';
import { database, type InvoiceWithDetails, type Property, type InvoiceFilters, type Invoice } from '../../services/database/Database';
// Add these imports at the top of Invoices.tsx
import { generateInvoicePDF, sharePDF, generatePDFFilename } from '../../services/pdf/PDFService';
import { shareInvoiceSummary } from '../../services/sharing/ShareService';
import AddInvoice from './AddInvoice';

interface InvoicesProps {
  onNavigate?: (page: string, params?: any) => void;
}

const Invoices: React.FC<InvoicesProps> = ({ onNavigate }) => {
  const [invoices, setInvoices] = useState<InvoiceWithDetails[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<InvoiceFilters>({});
  const [selectedProperty, setSelectedProperty] = useState<number | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showFilters, setShowFilters] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  // Add these state variables after existing useState declarations
    const [showAddInvoiceModal, setShowAddInvoiceModal] = useState(false);
    const [editingInvoiceId, setEditingInvoiceId] = useState<number | undefined>();
    const [prefilledPropertyId, setPrefilledPropertyId] = useState<number | undefined>();
    const [prefilledTenantId, setPrefilledTenantId] = useState<number | undefined>();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [searchTerm, filters, selectedProperty]);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadInvoices(),
        loadProperties()
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadInvoices = async () => {
    const result = await database.getInvoices(filters);
    setInvoices(result);
  };

  // Replace the existing share button onClick with this function
const handleShareInvoice = async (invoice: InvoiceWithDetails) => {
  try {
    const property = properties.find(p => p.id === invoice.propertyId);
    if (!property) {
      throw new Error('Property not found');
    }

    // Show share options modal or directly share summary
    await shareInvoiceSummary(invoice, property);
    
  } catch (error) {
    console.error('Share failed:', error);
    // You might want to show a toast/alert here
  }
};

// Replace the existing PDF download button onClick with this function
const handleDownloadPDF = async (invoice: InvoiceWithDetails) => {
  try {
    setLoading(true);
    
    // Get property details
    const property = properties.find(p => p.id === invoice.propertyId);
    if (!property) {
      throw new Error('Property not found');
    }

    // Generate PDF
    const pdfBytes = await generateInvoicePDF(invoice, property, [], companyInfo);
    const filename = generatePDFFilename(invoice);
    
    // Share PDF
    await sharePDF(pdfBytes, filename, `Invoice ${invoice.invoiceNumber}`);
    
  } catch (error) {
    console.error('PDF generation failed:', error);
    // You might want to show a toast/alert here
  } finally {
    setLoading(false);
  }
};

  const handleViewInvoice = (invoiceId: number) => {
    onNavigate?.('invoice', { invoiceId });
  };


  // Add this after the existing state declarations in Invoices component
    const [companyInfo] = useState({
        name: 'SMB KENYA LTD',
        address: 'Naivasha, Nairobi, Kenya',
        phone: '+254 791 286 165',
        email: 'info@smbkenya.com',
        website: 'www.cogvana.com'
    });

  const loadProperties = async () => {
    // Assuming userId = 1 for demo
    const result = await database.getProperties(1);
    setProperties(result);
  };

  const applyFilters = async () => {
    const newFilters: InvoiceFilters = {
      ...filters,
      propertyId: selectedProperty || undefined,
      billingMonth: getCurrentMonth()
    };

    const result = await database.getInvoices(newFilters);
    
    let filteredInvoices = result;
    
    if (searchTerm) {
      filteredInvoices = result.filter(invoice =>
        invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        invoice.tenantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        invoice.propertyName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    setInvoices(filteredInvoices);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const getCurrentMonth = () => {
    return `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`;
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  const handleCreateInvoice = (propertyId?: number, tenantId?: number) => {
  setEditingInvoiceId(undefined);
  setPrefilledPropertyId(propertyId);
  setPrefilledTenantId(tenantId);
  setShowAddInvoiceModal(true);
};

const handleEditInvoice = (invoiceId: number) => {
  setEditingInvoiceId(invoiceId);
  setPrefilledPropertyId(undefined);
  setPrefilledTenantId(undefined);
  setShowAddInvoiceModal(true);
};

const handleCloseModal = () => {
  setShowAddInvoiceModal(false);
  setEditingInvoiceId(undefined);
  setPrefilledPropertyId(undefined);
  setPrefilledTenantId(undefined);
};

const handleInvoiceSaved = (_savedInvoice: Invoice) => {
  // Refresh the invoices list
  loadData();
  handleCloseModal();
  // You might want to show a success message here
};

  const getStatusColor = (invoice: InvoiceWithDetails) => {
    if (invoice.isPaid) return 'text-green-600 bg-green-50 border-green-200';
    
    const dueDate = new Date(invoice.dueDate || invoice.createdAt);
    const today = new Date();
    
    if (dueDate < today) return 'text-red-600 bg-red-50 border-red-200';
    return 'text-yellow-600 bg-yellow-50 border-yellow-200';
  };

  const getStatusIcon = (invoice: InvoiceWithDetails) => {
    if (invoice.isPaid) return <CheckCircle className="w-4 h-4" />;
    
    const dueDate = new Date(invoice.dueDate || invoice.createdAt);
    const today = new Date();
    
    if (dueDate < today) return <AlertCircle className="w-4 h-4" />;
    return <Clock className="w-4 h-4" />;
  };

  const getStatusText = (invoice: InvoiceWithDetails) => {
    if (invoice.isPaid) return 'Paid';
    
    const dueDate = new Date(invoice.dueDate || invoice.createdAt);
    const today = new Date();
    
    if (dueDate < today) return 'Overdue';
    return 'Pending';
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

  const summary = useMemo(() => {
    const total = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const paid = invoices.filter(inv => inv.isPaid).reduce((sum, inv) => sum + inv.totalAmount, 0);
    const pending = total - paid;
    const overdue = invoices.filter(inv => {
      if (inv.isPaid) return false;
      const dueDate = new Date(inv.dueDate || inv.createdAt);
      return dueDate < new Date();
    }).reduce((sum, inv) => sum + inv.totalAmount, 0);

    return { total, paid, pending, overdue };
  }, [invoices]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                </div>
                <div className="h-8 bg-gray-200 rounded w-20"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-xs text-blue-600 font-medium">Total</p>
              <p className="text-lg font-bold text-blue-700">{formatCurrency(summary.total)}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <p className="text-xs text-green-600 font-medium">Paid</p>
              <p className="text-lg font-bold text-green-700">{formatCurrency(summary.paid)}</p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-3">
              <p className="text-xs text-yellow-600 font-medium">Pending</p>
              <p className="text-lg font-bold text-yellow-700">{formatCurrency(summary.pending)}</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <p className="text-xs text-red-600 font-medium">Overdue</p>
              <p className="text-lg font-bold text-red-700">{formatCurrency(summary.overdue)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="px-4 py-4 space-y-4">
        {/* Month Navigation */}
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigateMonth('prev')}
              className="p-2 text-gray-500 hover:text-blue-600 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <span className="font-medium text-gray-900">
                {currentDate.toLocaleDateString('en-GB', {
                  month: 'long',
                  year: 'numeric'
                })}
              </span>
            </div>
            
            <button
              onClick={() => navigateMonth('next')}
              className="p-2 text-gray-500 hover:text-blue-600 transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex space-x-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search invoices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="bg-white border border-gray-200 rounded-lg p-3 text-gray-600 hover:text-blue-600 hover:border-blue-300 transition-colors"
          >
            <Filter className="w-5 h-5" />
          </button>
          
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="bg-white border border-gray-200 rounded-lg p-3 text-gray-600 hover:text-blue-600 hover:border-blue-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          
          <button
            onClick={() => setExportModalVisible(true)}
            className="bg-white border border-gray-200 rounded-lg p-3 text-gray-600 hover:text-blue-600 hover:border-blue-300 transition-colors"
          >
            <Download className="w-5 h-5" />
          </button>
        </div>

        {/* Property Filter */}
        {showFilters && (
          <div className="bg-white rounded-lg p-4 shadow-sm space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter by Property
              </label>
              <select
                value={selectedProperty || ''}
                onChange={(e) => setSelectedProperty(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Properties</option>
                {properties.map(property => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Status
              </label>
              <select
                value={filters.isPaid === undefined ? '' : filters.isPaid.toString()}
                onChange={(e) => setFilters(prev => ({
                  ...prev,
                  isPaid: e.target.value === '' ? undefined : e.target.value === 'true'
                }))}
                className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Statuses</option>
                <option value="true">Paid</option>
                <option value="false">Unpaid</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Invoice List */}
      <div className="px-4 pb-20 space-y-3">
        {invoices.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No invoices found</h3>
            <p className="text-gray-500 mb-6">Create your first invoice to get started</p>
            {/* <button
              onClick={handleCreateInvoice}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Create Invoice
            </button> */}
          </div>
        ) : (
          invoices.map((invoice) => (
            <div key={invoice.id} className="bg-white rounded-lg shadow-sm border border-gray-100">
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-gray-900">#{invoice.invoiceNumber}</span>
                    <div className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(invoice)}`}>
                      {getStatusIcon(invoice)}
                      <span>{getStatusText(invoice)}</span>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-gray-900">
                    {formatCurrency(invoice.totalAmount)}
                  </span>
                </div>
                
                <div className="space-y-1 mb-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Tenant:</span>
                    <span className="text-sm font-medium">{invoice.tenantName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Property:</span>
                    <span className="text-sm font-medium">{invoice.propertyName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Due Date:</span>
                    <span className="text-sm">
                      {invoice.dueDate ? formatDate(invoice.dueDate) : 'Not set'}
                    </span>
                  </div>
                </div>
                
                {invoice.arrears > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-2 mb-3">
                    <p className="text-sm text-red-700">
                      Arrears: {formatCurrency(invoice.arrears)}
                    </p>
                  </div>
                )}
                
                <div className="flex space-x-2">
                    <button
                        onClick={() => handleViewInvoice(invoice.id)}
                        className="flex-1 bg-blue-50 text-blue-600 py-2 px-4 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors flex items-center justify-center space-x-1"
                    >
                        <Eye className="w-4 h-4" />
                        <span>View</span>
                    </button>
                    
                    <button
                        onClick={() => handleEditInvoice(invoice.id)}
                        className="bg-gray-50 text-gray-600 py-2 px-4 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
                        title="Edit Invoice"
                    >
                        <FileText className="w-4 h-4" />
                    </button>
                    
                    <button
                        onClick={() => handleDownloadPDF(invoice)}
                        disabled={loading}
                        className="bg-gray-50 text-gray-600 py-2 px-4 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors disabled:opacity-50"
                        title="Download PDF"
                    >
                        <Download className="w-4 h-4" />
                    </button>
                    
                    <button
                        onClick={() => handleShareInvoice(invoice)}
                        className="bg-gray-50 text-gray-600 py-2 px-4 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
                        title="Share Invoice"
                    >
                        <Share className="w-4 h-4" />
                    </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Export Modal */}
      {exportModalVisible && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end z-50">
          <div className="bg-white rounded-t-2xl w-full p-6 space-y-4">
            <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold text-center">Export Invoices</h3>
            
            {/* <div className="space-y-3">
              <button
                onClick={() => handleExport('pdf')}
                className="w-full bg-red-50 text-red-600 py-3 px-4 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors text-left"
              >
                Export as PDF Report
              </button>
              
              <button
                onClick={() => handleExport('csv')}
                className="w-full bg-green-50 text-green-600 py-3 px-4 rounded-lg text-sm font-medium hover:bg-green-100 transition-colors text-left"
              >
                Export as CSV
              </button>
            </div> */}
            
            <button
              onClick={() => setExportModalVisible(false)}
              className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* FAB */}
        <button
        onClick={() => handleCreateInvoice()}
        className="fixed bottom-45 right-6 bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 transition-colors z-40"
        >
        <Plus className="w-6 h-6" />
        </button>

      {/* Add Invoice Modal */}
        {showAddInvoiceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-4xl max-h-[95vh] overflow-hidden">
            <AddInvoice
                propertyId={prefilledPropertyId}
                tenantId={prefilledTenantId}
                invoiceId={editingInvoiceId}
                onSave={handleInvoiceSaved}
                onCancel={handleCloseModal}
                isModal={true}
            />
            </div>
        </div>
        )}
    </div>
  );
};

export default Invoices;