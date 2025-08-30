import React, { useState, useEffect } from 'react';
import {
  Building2,
  Edit3,
  MapPin,
  Users,
  DollarSign,
  TrendingUp,
  Percent,
  Receipt,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  ArrowLeft,
  AlertCircle,
  Plus,
  Menu,
  X
} from 'lucide-react';
import { database, type PropertyWithTenants, type DashboardData, type MonthlyStats } from '../../services/database/Database';
import TenantsList from '../tenants/TenantsList';
import AddTenant from '../tenants/AddTenant';

interface PropertyProps {
  propertyId: number;
  userId: number;
  onCancel?: () => void;
  isModal: boolean;
}

interface PropertyFormData {
  name: string;
  address: string;
  description: string;
  agentCommissionRate: number;
}

const Property: React.FC<PropertyProps> = ({ 
  propertyId: propertyId,
  userId,
  onCancel,
  isModal = false  
}) => {
  const [property, setProperty] = useState<PropertyWithTenants | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [, setMonthlyStats] = useState<MonthlyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddTenant, setShowAddTenant] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  });
  const [selectedYear] = useState<number>(() => new Date().getFullYear());
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [formData, setFormData] = useState<PropertyFormData>({
    name: '',
    address: '',
    description: '',
    agentCommissionRate: 0
  });
  const [formErrors, setFormErrors] = useState<Partial<PropertyFormData>>({});

  useEffect(() => {
    loadPropertyData();
  }, [propertyId, selectedMonth, selectedYear]);

  const loadPropertyData = async () => {
    try {
      setLoading(true);

      const propertyData = await database.getPropertyById(propertyId);
      if (!propertyData) {
        console.error('Property not found');
        return;
      }

      const tenants = await database.getTenantsByProperty(propertyId);
      const monthlyRevenue = tenants.reduce((sum: number, tenant: { rentAmount: number }) => sum + tenant.rentAmount, 0);
      const agentIncome = (tenants.reduce((sum: number, tenant: { rentAmount: number }) => sum + tenant.rentAmount, 0)) * ((propertyData.agentCommissionRate / 100) || 1 );
      
      // Fix occupancy calculation: (occupied units / max units) * 100
      const occupiedUnits = tenants.filter((t: { isActive: boolean }) => t.isActive).length;
      const occupancyRate = propertyData.maxUnits > 0 ? (occupiedUnits / propertyData.maxUnits) * 100 : 0;

      const propertyWithTenants: PropertyWithTenants = {
        ...propertyData,
        tenants,
        monthlyRevenue,
        agentIncome,
        occupancyRate
      };

      setProperty(propertyWithTenants);

      const dashboard = await database.getDashboardData(userId, propertyId, selectedMonth);
      setDashboardData(dashboard);

      const stats = await database.getMonthlyStats(propertyId, selectedYear);
      setMonthlyStats(stats);

    } catch (error) {
      console.error('Error loading property data:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    if (property) {
      setFormData({
        name: property.name,
        address: property.address || '',
        description: property.description || '',
        agentCommissionRate: property.agentCommissionRate
      });
    }
    setFormErrors({});
  };

  const validateForm = (): boolean => {
    const errors: Partial<PropertyFormData> = {};
    
    if (!formData.name.trim()) {
      errors.name = 'Property name is required';
    }
    
    if (formData.agentCommissionRate < 0 || formData.agentCommissionRate > 100) {
      //errors.agentCommissionRate = 'Commission rate must be between 0 and 100';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleEditProperty = async () => {
    if (!validateForm() || !property) return;

    try {
      await database.updateProperty(property.id, {
        name: formData.name.trim(),
        address: formData.address.trim() || undefined,
        description: formData.description.trim() || undefined,
        agentCommissionRate: formData.agentCommissionRate
      });

      await loadPropertyData();
      setShowEditModal(false);
    } catch (error) {
      console.error('Error updating property:', error);
    }
  };

  const openEditModal = () => {
    resetForm();
    setShowEditModal(true);
    setShowMobileMenu(false);
  };

  const getMonthName = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const currentDate = new Date(year, month - 1);
    
    if (direction === 'prev') {
      currentDate.setMonth(currentDate.getMonth() - 1);
    } else {
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
    
    const newMonth = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`;
    setSelectedMonth(newMonth);
  };

  if (loading || !property) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="animate-pulse">
          {/* Mobile Loading Header */}
          <div className="bg-white shadow-sm border-b border-gray-100 sticky top-0 z-10">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center h-14 sm:h-16 gap-4">
                <div className="w-6 h-6 bg-gray-200 rounded"></div>
                <div className="w-24 sm:w-32 h-6 bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
            <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-8 mb-6 sm:mb-8">
              <div className="w-full h-32 sm:h-48 bg-gray-200 rounded-xl sm:rounded-2xl mb-4 sm:mb-6"></div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-16 sm:h-20 bg-gray-200 rounded-lg sm:rounded-xl"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const commissionAmount = dashboardData ? 
    (dashboardData.monthlyRevenue * property.agentCommissionRate / 100) : 0;
  const netRevenue = dashboardData ? 
    (dashboardData.monthlyRevenue - commissionAmount) : 0;

  



return (
    <div className={isModal ? "fixed bottom-17 inset-0 bg-white z-50 flex flex-col pb-5" : "min-h-screen bg-gray-50"}>
      {/* Sticky Header */}
      <div className="sticky top-0 bg-white shadow-sm border-b border-gray-100 z-20 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <div className="flex items-center flex-1 min-w-0">
              <button
                onClick={() => setShowDiscardDialog(true)}
                className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all mr-2 sm:mr-3 flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 mr-2 sm:mr-3 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">{property.name}</h1>
                {property.address && (
                  <p className="text-xs sm:text-sm text-gray-500 flex items-center mt-0.5 truncate">
                    <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                    <span className="truncate">{property.address}</span>
                  </p>
                )}
              </div>
            </div>
            
            {/* Desktop Actions */}
            <div className="hidden sm:flex items-center gap-3">
              <button
                onClick={openEditModal}
                className="inline-flex items-center px-4 py-2 text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all"
              >
                <Edit3 className="w-4 h-4 mr-2" />
                Edit
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="sm:hidden p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all ml-2"
            >
              {showMobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

          {/* Mobile Dropdown Menu */}
          {showMobileMenu && (
            <div className="sm:hidden border-t border-gray-100 py-2">
              <button
                onClick={openEditModal}
                className="w-full flex items-center px-3 py-2 text-gray-700 hover:bg-gray-50 transition-all"
              >
                <Edit3 className="w-4 h-4 mr-3" />
                Edit Property
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Scrollable Main Content */}
      <div className="flex-1 overflow-y-auto pb-safe">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
          {/* Property Overview */}
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6 sm:mb-8">
            {/* Property Hero */}
            <div className="h-32 sm:h-48 md:h-64 bg-gradient-to-br from-blue-500 via-blue-600 to-purple-600 relative">
              <div className="absolute inset-0 bg-black bg-opacity-20"></div>
              <div className="absolute bottom-3 sm:bottom-6 left-3 sm:left-6 text-white">
                <Building2 className="w-6 h-6 sm:w-8 md:w-10 sm:h-8 md:h-10 mb-2 sm:mb-3 opacity-90" />
                <h2 className="text-xl sm:text-2xl md:text-3xl font-bold mb-1 sm:mb-2">{property.name}</h2>
                {property.description && (
                  <p className="text-sm sm:text-base md:text-lg opacity-90 max-w-xs sm:max-w-md md:max-w-2xl line-clamp-2">{property.description}</p>
                )}
              </div>
            </div>

            {/* Stats Grid */}
            <div className="p-4 sm:p-6 md:p-8">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6">
                {/* Total Tenants */}
                <div 
                  className="text-center p-3 sm:p-4 md:p-6 bg-blue-50 rounded-lg sm:rounded-xl md:rounded-2xl cursor-pointer hover:bg-blue-100 transition-colors" 
                  onClick={() => setShowAddTenant(true)}
                >
                  <div className="w-8 h-8 sm:w-10 md:w-12 sm:h-10 md:h-12 bg-blue-600 rounded-lg sm:rounded-xl flex items-center justify-center mx-auto mb-2 sm:mb-4">
                    <Users className="w-4 h-4 sm:w-5 md:w-6 sm:h-5 md:h-6 text-white" />
                  </div>
                  <div className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-1">
                    {property.tenants.length}
                  </div>
                  <div className="text-xs sm:text-sm font-medium text-gray-600">
                    Total Tenants
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {property.tenants.filter((t: { isActive: boolean }) => t.isActive).length} Active
                  </div>
                </div>

                {/* Monthly Revenue */}
                <div className="text-center p-3 sm:p-4 md:p-6 bg-green-50 rounded-lg sm:rounded-xl md:rounded-2xl">
                  <div className="w-8 h-8 sm:w-10 md:w-12 sm:h-10 md:h-12 bg-green-600 rounded-lg sm:rounded-xl flex items-center justify-center mx-auto mb-2 sm:mb-4">
                    <DollarSign className="w-4 h-4 sm:w-5 md:w-6 sm:h-5 md:h-6 text-white" />
                  </div>
                  <div className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-1">
                    ${property.monthlyRevenue.toLocaleString()}
                  </div>
                  <div className="text-xs sm:text-sm font-medium text-gray-600">
                    Monthly Potential
                  </div>
                  {dashboardData && (
                    <div className="text-xs text-gray-500 mt-1">
                      ${dashboardData.monthlyRevenue.toLocaleString()} Collected
                    </div>
                  )}
                </div>

                {/* Occupancy Rate */}
                <div className="text-center p-3 sm:p-4 md:p-6 bg-purple-50 rounded-lg sm:rounded-xl md:rounded-2xl">
                  <div className="w-8 h-8 sm:w-10 md:w-12 sm:h-10 md:h-12 bg-purple-600 rounded-lg sm:rounded-xl flex items-center justify-center mx-auto mb-2 sm:mb-4">
                    <TrendingUp className="w-4 h-4 sm:w-5 md:w-6 sm:h-5 md:h-6 text-white" />
                  </div>
                  <div className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-1">
                    {property.occupancyRate.toFixed(0)}%
                  </div>
                  <div className="text-xs sm:text-sm font-medium text-gray-600">
                    Occupancy Rate
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {property.tenants.filter((t: { isActive: boolean }) => t.isActive).length} / {property.maxUnits} Units
                  </div>
                </div>

                {/* Commission */}
                <div className="text-center p-3 sm:p-4 md:p-6 bg-orange-50 rounded-lg sm:rounded-xl md:rounded-2xl">
                  <div className="w-8 h-8 sm:w-10 md:w-12 sm:h-10 md:h-12 bg-orange-600 rounded-lg sm:rounded-xl flex items-center justify-center mx-auto mb-2 sm:mb-4">
                    <Percent className="w-4 h-4 sm:w-5 md:w-6 sm:h-5 md:h-6 text-white" />
                  </div>
                  <div className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-1">
                    {property.agentCommissionRate}%
                  </div>
                  <div className="text-xs sm:text-sm font-medium text-gray-600">
                    Commission Rate
                  </div>
                  <div className="text-xs text-green-700 mt-1">
                    KES {property.agentIncome} this month
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Monthly Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8 mb-6 sm:mb-8">
            {/* Current Month Stats */}
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h3 className="text-base sm:text-lg font-bold text-gray-900">Monthly Overview</h3>
                <div className="flex items-center gap-1 sm:gap-2">
                  <button
                    onClick={() => navigateMonth('prev')}
                    className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                  >
                    <ChevronLeft className="w-3 h-3 sm:w-4 sm:h-4" />
                  </button>
                  <span className="text-xs sm:text-sm font-medium text-gray-700 min-w-[100px] sm:min-w-[120px] text-center">
                    {getMonthName(selectedMonth)}
                  </span>
                  <button
                    onClick={() => navigateMonth('next')}
                    className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                  >
                    <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4" />
                  </button>
                </div>
              </div>

              {dashboardData && (
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex items-center justify-between p-3 sm:p-4 bg-gray-50 rounded-lg sm:rounded-xl">
                    <div className="flex items-center">
                      <Receipt className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 mr-2 sm:mr-3" />
                      <span className="font-medium text-gray-700 text-sm sm:text-base">Revenue Collected</span>
                    </div>
                    <span className="text-lg sm:text-xl font-bold text-green-600">
                      ${dashboardData.monthlyRevenue.toLocaleString()}
                    </span>
                  </div>

                  {property.agentCommissionRate > 0 && (
                    <>
                      <div className="flex items-center justify-between p-3 sm:p-4 bg-orange-50 rounded-lg sm:rounded-xl">
                        <div className="flex items-center">
                          <Percent className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600 mr-2 sm:mr-3" />
                          <span className="font-medium text-gray-700 text-sm sm:text-base">Commission ({property.agentCommissionRate}%)</span>
                        </div>
                        <span className="text-lg sm:text-xl font-bold text-orange-600">
                          -${commissionAmount.toLocaleString()}
                        </span>
                      </div>

                      <div className="flex items-center justify-between p-3 sm:p-4 bg-blue-50 rounded-lg sm:rounded-xl">
                        <div className="flex items-center">
                          <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 mr-2 sm:mr-3" />
                          <span className="font-medium text-gray-700 text-sm sm:text-base">Net Revenue</span>
                        </div>
                        <span className="text-lg sm:text-xl font-bold text-blue-600">
                          ${netRevenue.toLocaleString()}
                        </span>
                      </div>
                    </>
                  )}

                  <div className="flex items-center justify-between p-3 sm:p-4 bg-red-50 rounded-lg sm:rounded-xl">
                    <div className="flex items-center">
                      <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 mr-2 sm:mr-3" />
                      <span className="font-medium text-gray-700 text-sm sm:text-base">Total Arrears</span>
                    </div>
                    <span className="text-lg sm:text-xl font-bold text-red-600">
                      ${dashboardData.totalArrears.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Bills Summary */}
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4 sm:mb-6">Bills Summary</h3>
              
              {dashboardData && (
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex items-center justify-between p-3 sm:p-4 bg-green-50 rounded-lg sm:rounded-xl">
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-green-500 rounded-full mr-2 sm:mr-3"></div>
                      <span className="font-medium text-gray-700 text-sm sm:text-base">Paid Invoices</span>
                    </div>
                    <div className="text-right">
                      <div className="text-lg sm:text-xl font-bold text-green-600">
                        {dashboardData.paidInvoices}
                      </div>
                      <div className="text-xs text-gray-500">invoices</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 sm:p-4 bg-red-50 rounded-lg sm:rounded-xl">
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-red-500 rounded-full mr-2 sm:mr-3"></div>
                      <span className="font-medium text-gray-700 text-sm sm:text-base">Unpaid Invoices</span>
                    </div>
                    <div className="text-right">
                      <div className="text-lg sm:text-xl font-bold text-red-600">
                        {dashboardData.unpaidInvoices}
                      </div>
                      <div className="text-xs text-gray-500">invoices</div>
                    </div>
                  </div>

                  <div className="pt-3 sm:pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-700 text-sm sm:text-base">Payment Rate</span>
                      <span className="text-base sm:text-lg font-bold text-gray-900">
                        {dashboardData.paidInvoices + dashboardData.unpaidInvoices > 0 
                          ? Math.round((dashboardData.paidInvoices / (dashboardData.paidInvoices + dashboardData.unpaidInvoices)) * 100)
                          : 0}%
                      </span>
                    </div>
                    
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div 
                        className="bg-green-500 h-2 rounded-full transition-all duration-300"
                        style={{ 
                          width: `${dashboardData.paidInvoices + dashboardData.unpaidInvoices > 0 
                            ? (dashboardData.paidInvoices / (dashboardData.paidInvoices + dashboardData.unpaidInvoices)) * 100
                            : 0}%` 
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tenants List Section */}
          <div className="mb-6">
            <TenantsList
              propertyId={propertyId}
              onTenantAdded={loadPropertyData}
            />
          </div>
        </div>
      </div>

      {/* Floating Add Tenant Button - Positioned above tab bar */}
      {isModal && (
        <button
          onClick={() => setShowAddTenant(true)}
          className="fixed bottom-20 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xl hover:shadow-2xl transition-all transform hover:scale-110 flex items-center justify-center z-40"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Edit Property Modal */}
      {showEditModal && (
        <div className="fixed bottom-17 inset-0 bg-white z-50 flex flex-col pb-5">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md transform transition-all max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900">Edit Property</h2>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Property Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                    formErrors.name ? 'border-red-500' : 'border-gray-200'
                  }`}
                  placeholder="Enter property name"
                />
                {formErrors.name && (
                  <p className="text-red-500 text-sm mt-1">{formErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Address
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Enter property address"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                  placeholder="Enter property description"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Agent Commission Rate (%)
                </label>
                <input
                  type="number"
                  value={formData.agentCommissionRate}
                  onChange={(e) => setFormData({ ...formData, agentCommissionRate: Number(e.target.value) })}
                  min="0"
                  max="100"
                  step="0.1"
                  className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                    formErrors.agentCommissionRate ? 'border-red-500' : 'border-gray-200'
                  }`}
                  placeholder="0"
                />
                {formErrors.agentCommissionRate && (
                  <p className="text-red-500 text-sm mt-1">{formErrors.agentCommissionRate}</p>
                )}
              </div>
            </div>

            <div className="p-6 bg-gray-50 rounded-b-2xl flex gap-3">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 px-4 py-3 text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleEditProperty}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-medium"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discard Dialog */}
      {showDiscardDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold">Close View?</h3>
              </div>
              <p className="text-gray-600 mb-6">
                Are you sure you want to close?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDiscardDialog(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Continue Editing
                </button>
                <button
                  onClick={() => {
                    setShowDiscardDialog(false);
                    onCancel?.();
                  }}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Tenant Modal */}
      {showAddTenant && (
        <AddTenant
          propertyId={propertyId}
          onClose={() => setShowAddTenant(false)}
          onTenantAdded={() => {
            setShowAddTenant(false);
            loadPropertyData();
          }}
        />
      )}
    </div>
  );
};

export default Property;