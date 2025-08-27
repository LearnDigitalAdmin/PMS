import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  Phone, 
  Mail, 
  MessageCircle, 
  Edit3, 
  Trash2, 
  Receipt, 
  ChevronDown, 
  ChevronUp, 
  User, 
  AlertCircle,
  Calendar,
  DollarSign,
  ArrowLeft} from 'lucide-react';
import { database } from '../../services/database/Database';
import type { TenantWithInvoices } from '../../services/database/Database';
import AddTenant from './AddTenant';


interface TenantsListProps {
  propertyId: number;
  onClose?: () => void; 
  isModal: boolean;
}

const TenantsList: React.FC<TenantsListProps> = ({ propertyId, onClose, isModal = false }) => {
  const [tenants, setTenants] = useState<TenantWithInvoices[]>([]);
  const [filteredTenants, setFilteredTenants] = useState<TenantWithInvoices[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTenant, setExpandedTenant] = useState<number | null>(null);
  const [showAddTenant, setShowAddTenant] = useState(false);
  const [deletingTenant, setDeletingTenant] = useState<number | null>(null);

  //Get current billing month
  const getCurrentBillingMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  };

  const loadTenants = async () => {
    try {
      setLoading(true);
      setError(null);
      const currentMonth = getCurrentBillingMonth();
      const tenantsData = await database.getTenantsWithInvoices(propertyId, currentMonth);//
      setTenants(tenantsData);
      setFilteredTenants(tenantsData);
    } catch (err) {
      console.error('Error loading tenants:', err);
      setError('Failed to load tenants. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTenants();
  }, [propertyId]);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredTenants(tenants);
    } else {
      const filtered = tenants.filter(tenant =>
        tenant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tenant.unitNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tenant.phone?.includes(searchTerm) ||
        tenant.email?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredTenants(filtered);
    }
  }, [searchTerm, tenants]);

  const handleDeleteTenant = async (tenantId: number, tenantName: string) => {
    if (!confirm(`Are you sure you want to delete ${tenantName}? This action cannot be undone and will also delete all associated invoices.`)) {
      return;
    }

    try {
      setDeletingTenant(tenantId);
      await database.deleteTenant(tenantId);
      await loadTenants();
    } catch (err) {
      console.error('Error deleting tenant:', err);
      alert('Failed to delete tenant. Please try again.');
    } finally {
      setDeletingTenant(null);
    }
  };

  const handleContactAction = (type: 'call' | 'whatsapp', phone: string) => {
    if (!phone) return;
    
    if (type === 'call') {
      window.location.href = `tel:${phone}`;
    } else {
      // WhatsApp
      const cleanPhone = phone.replace(/\D/g, '');
      window.open(`https://wa.me/${cleanPhone}`, '_blank');
    }
  };

  const getPaymentStatusBadge = (tenant: TenantWithInvoices) => {
    if (!tenant.currentInvoice) {
      return <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">No Invoice</span>;
    }

    if (tenant.currentInvoice.isPaid) {
      return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Paid</span>;
    }

    const dueDate = tenant.currentInvoice.dueDate ? new Date(tenant.currentInvoice.dueDate) : null;
    const isOverdue = dueDate && dueDate < new Date();

    if (isOverdue) {
      return <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">Overdue</span>;
    }

    return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">Pending</span>;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-KE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading tenants...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <p className="text-gray-600 text-center mb-4">{error}</p>
        <button
          onClick={loadTenants}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className={isModal ? "h-full flex flex-col" : "min-h-screen bg-gray-50"}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center">
          <button
            onClick={() => onClose?.()}
            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all mr-3"
            >
            <ArrowLeft className="w-5 h-5" />
          </button>
          </div>
        <h2 className="text-xl font-semibold text-gray-900">
          Tenants ({filteredTenants.length})
        </h2>
        <button
          onClick={() => setShowAddTenant(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Tenant
        </button>
      </div>

      {/* Search */}
      {tenants.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search tenants by name, unit, phone, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      )}

      {/* Tenants List */}
      {filteredTenants.length === 0 ? (
        <div className="text-center py-12">
          <User className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {searchTerm ? 'No tenants found' : 'No tenants yet'}
          </h3>
          <p className="text-gray-500 mb-6">
            {searchTerm 
              ? 'Try adjusting your search terms' 
              : 'Add your first tenant to get started with billing and management'
            }
          </p>
          {!searchTerm && (
            <button
              onClick={() => setShowAddTenant(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add First Tenant
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTenants.map((tenant) => (
            <div key={tenant.id} className="border border-gray-200 rounded-lg bg-white shadow-sm">
              {/* Tenant Card Header */}
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-gray-900">{tenant.name}</h3>
                      {tenant.unitNumber && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                          Unit {tenant.unitNumber}
                        </span>
                      )}
                      {getPaymentStatusBadge(tenant)}
                      {!tenant.isActive && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                          Inactive
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {formatCurrency(tenant.rentAmount)}/month
                      </span>
                      {tenant.totalArrears > 0 && (
                        <span className="flex items-center gap-1 text-red-600">
                          <AlertCircle className="h-3 w-3" />
                          {formatCurrency(tenant.totalArrears)} arrears
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => setExpandedTenant(expandedTenant === tenant.id ? null : tenant.id)}
                    className="p-1 hover:bg-gray-100 rounded transition-colors"
                  >
                    {expandedTenant === tenant.id ? (
                      <ChevronUp className="h-4 w-4 text-gray-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-500" />
                    )}
                  </button>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedTenant === tenant.id && (
                <div className="border-t border-gray-100 p-4 bg-gray-50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Contact Information */}
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Contact Information</h4>
                      <div className="space-y-2">
                        {tenant.phone && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Phone:</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{tenant.phone}</span>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleContactAction('call', tenant.phone!)}
                                  className="p-1 text-green-600 hover:bg-green-100 rounded transition-colors"
                                  title="Call"
                                >
                                  <Phone className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => handleContactAction('whatsapp', tenant.phone!)}
                                  className="p-1 text-green-600 hover:bg-green-100 rounded transition-colors"
                                  title="WhatsApp"
                                >
                                  <MessageCircle className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                        {tenant.email && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Email:</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{tenant.email}</span>
                              <button
                                onClick={() => window.location.href = `mailto:${tenant.email}`}
                                className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                                title="Send Email"
                              >
                                <Mail className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Financial Information */}
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Financial Details</h4>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">Rent Amount:</span>
                          <span className="text-sm font-medium">{formatCurrency(tenant.rentAmount)}</span>
                        </div>
                        {tenant.standingFees > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Standing Fees:</span>
                            <span className="text-sm font-medium">{formatCurrency(tenant.standingFees)}</span>
                          </div>
                        )}
                        {tenant.depositAmount > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Deposit:</span>
                            <span className="text-sm font-medium">{formatCurrency(tenant.depositAmount)}</span>
                          </div>
                        )}
                        {tenant.lastPaymentDate && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Last Payment:</span>
                            <span className="text-sm font-medium">{formatDate(tenant.lastPaymentDate)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Lease Information */}
                    {(tenant.leaseStart || tenant.leaseEnd) && (
                      <div className="md:col-span-2">
                        <h4 className="font-medium text-gray-900 mb-3">Lease Information</h4>
                        <div className="flex flex-wrap gap-4">
                          {tenant.leaseStart && (
                            <div className="flex items-center gap-1 text-sm">
                              <Calendar className="h-3 w-3 text-gray-400" />
                              <span className="text-gray-600">Start:</span>
                              <span className="font-medium">{formatDate(tenant.leaseStart)}</span>
                            </div>
                          )}
                          {tenant.leaseEnd && (
                            <div className="flex items-center gap-1 text-sm">
                              <Calendar className="h-3 w-3 text-gray-400" />
                              <span className="text-gray-600">End:</span>
                              <span className="font-medium">{formatDate(tenant.leaseEnd)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-gray-200">
                    <button
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                      title="Edit Tenant"
                    >
                      <Edit3 className="h-3 w-3" />
                      Edit
                    </button>
                    
                    {tenant.currentInvoice && !tenant.currentInvoice.isPaid && (
                      <button
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                        title="Resend Invoice"
                      >
                        <Receipt className="h-3 w-3" />
                        Resend Invoice
                      </button>
                    )}
                    
                    <button
                      onClick={() => handleDeleteTenant(tenant.id, tenant.name)}
                      disabled={deletingTenant === tenant.id}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50"
                      title="Delete Tenant"
                    >
                      <Trash2 className="h-3 w-3" />
                      {deletingTenant === tenant.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Tenant Modal */}
      {showAddTenant && (
        <AddTenant
          propertyId={propertyId}
          onClose={() => setShowAddTenant(false)}
          onTenantAdded={() => {
            setShowAddTenant(false);
            loadTenants();
          }}
        />
      )}
    </div>
  );
};

export default TenantsList;