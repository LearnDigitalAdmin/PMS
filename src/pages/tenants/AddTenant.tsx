import React, { useState } from 'react';
import { X, User, Phone, Mail, MapPin, DollarSign, Calendar, Save, AlertCircle } from 'lucide-react';
import { database } from '../../services/database/Database';
import type { TenantInput } from '../../services/database/Database';

interface AddTenantProps {
  propertyId: number;
  onClose: () => void;
  onTenantAdded: () => void;
}

interface FormData {
  name: string;
  phone: string;
  email: string;
  unitNumber: string;
  rentAmount: string;
  standingFees: string;
  depositAmount: string;
  leaseStart: string;
  leaseEnd: string;
}

interface FormErrors {
  name?: string;
  rentAmount?: string;
  phone?: string;
  email?: string;
  leaseStart?: string;
  leaseEnd?: string;
}

const AddTenant: React.FC<AddTenantProps> = ({ propertyId, onClose, onTenantAdded }) => {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    phone: '',
    email: '',
    unitNumber: '',
    rentAmount: '',
    standingFees: '',
    depositAmount: '',
    leaseStart: '',
    leaseEnd: ''
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const validateForm = (): FormErrors => {
    const newErrors: FormErrors = {};

    // Required fields
    if (!formData.name.trim()) {
      newErrors.name = 'Tenant name is required';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

    if (!formData.rentAmount.trim()) {
      newErrors.rentAmount = 'Rent amount is required';
    } else {
      const amount = parseFloat(formData.rentAmount);
      if (isNaN(amount) || amount <= 0) {
        newErrors.rentAmount = 'Please enter a valid rent amount';
      }
    }

    // Optional field validations
    if (formData.phone.trim() && !/^[\+]?[\d\s\-\(\)]{7,15}$/.test(formData.phone.trim())) {
      newErrors.phone = 'Please enter a valid phone number';
    }

    if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      newErrors.email = 'Please enter a valid email address';
    }

    // Date validations
    if (formData.leaseStart && formData.leaseEnd) {
      const startDate = new Date(formData.leaseStart);
      const endDate = new Date(formData.leaseEnd);
      
      if (startDate >= endDate) {
        newErrors.leaseEnd = 'End date must be after start date';
      }
    }

    return newErrors;
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
    
    // Clear field error when user starts typing
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      setSaving(true);
      
      const tenantData: TenantInput = {
        propertyId,
        name: formData.name.trim(),
        phone: formData.phone.trim() || undefined,
        email: formData.email.trim() || undefined,
        unitNumber: formData.unitNumber.trim() || undefined,
        rentAmount: parseFloat(formData.rentAmount),
        standingFees: formData.standingFees.trim() ? parseFloat(formData.standingFees) : undefined,
        depositAmount: formData.depositAmount.trim() ? parseFloat(formData.depositAmount) : undefined,
        leaseStart: formData.leaseStart || undefined,
        leaseEnd: formData.leaseEnd || undefined
      };

      await database.createTenant(tenantData);
      setHasUnsavedChanges(false);
      onTenantAdded();
    } catch (error) {
      console.error('Error creating tenant:', error);
      alert('Failed to create tenant. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to close?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const formatCurrency = (value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 0
    }).format(num);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Add New Tenant</h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Name (Required) */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tenant Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      placeholder="Enter tenant's full name"
                      className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.name ? 'border-red-300' : 'border-gray-300'
                      }`}
                    />
                  </div>
                  {errors.name && (
                    <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.name}
                    </p>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      placeholder="e.g., +254 700 123 456"
                      className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.phone ? 'border-red-300' : 'border-gray-300'
                      }`}
                    />
                  </div>
                  {errors.phone && (
                    <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.phone}
                    </p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      placeholder="tenant@example.com"
                      className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.email ? 'border-red-300' : 'border-gray-300'
                      }`}
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.email}
                    </p>
                  )}
                </div>

                {/* Unit Number */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Unit/Apartment Number</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={formData.unitNumber}
                      onChange={(e) => handleInputChange('unitNumber', e.target.value)}
                      placeholder="e.g., A1, 2B, Ground Floor"
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Financial Information */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Financial Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Rent Amount (Required) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Monthly Rent <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.rentAmount}
                      onChange={(e) => handleInputChange('rentAmount', e.target.value)}
                      placeholder="0.00"
                      className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.rentAmount ? 'border-red-300' : 'border-gray-300'
                      }`}
                    />
                  </div>
                  {formData.rentAmount && !errors.rentAmount && (
                    <p className="mt-1 text-xs text-gray-500">
                      {formatCurrency(formData.rentAmount)}
                    </p>
                  )}
                  {errors.rentAmount && (
                    <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.rentAmount}
                    </p>
                  )}
                </div>

                {/* Standing Fees */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Standing Fees</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.standingFees}
                      onChange={(e) => handleInputChange('standingFees', e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  {formData.standingFees && (
                    <p className="mt-1 text-xs text-gray-500">
                      {formatCurrency(formData.standingFees)}
                    </p>
                  )}
                </div>

                {/* Deposit Amount */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Security Deposit</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.depositAmount}
                      onChange={(e) => handleInputChange('depositAmount', e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  {formData.depositAmount && (
                    <p className="mt-1 text-xs text-gray-500">
                      {formatCurrency(formData.depositAmount)}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Lease Information */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Lease Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Lease Start Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Lease Start Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="date"
                      value={formData.leaseStart}
                      onChange={(e) => handleInputChange('leaseStart', e.target.value)}
                      className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.leaseStart ? 'border-red-300' : 'border-gray-300'
                      }`}
                    />
                  </div>
                  {errors.leaseStart && (
                    <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.leaseStart}
                    </p>
                  )}
                </div>

                {/* Lease End Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Lease End Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="date"
                      value={formData.leaseEnd}
                      onChange={(e) => handleInputChange('leaseEnd', e.target.value)}
                      min={formData.leaseStart || undefined}
                      className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.leaseEnd ? 'border-red-300' : 'border-gray-300'
                      }`}
                    />
                  </div>
                  {errors.leaseEnd && (
                    <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.leaseEnd}
                    </p>
                  )}
                </div>
              </div>
              
              {/* Lease Duration Helper */}
              {formData.leaseStart && formData.leaseEnd && !errors.leaseEnd && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-700">
                    <Calendar className="inline h-4 w-4 mr-1" />
                    Lease Duration: {
                      Math.ceil(
                        (new Date(formData.leaseEnd).getTime() - new Date(formData.leaseStart).getTime()) 
                        / (1000 * 60 * 60 * 24 * 30)
                      )
                    } months
                  </p>
                </div>
              )}
            </div>

            {/* Summary */}
            {(formData.name || formData.rentAmount) && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Summary</h4>
                <div className="space-y-1 text-sm text-gray-600">
                  {formData.name && (
                    <p><span className="font-medium">Tenant:</span> {formData.name}</p>
                  )}
                  {formData.unitNumber && (
                    <p><span className="font-medium">Unit:</span> {formData.unitNumber}</p>
                  )}
                  {formData.rentAmount && (
                    <p><span className="font-medium">Monthly Rent:</span> {formatCurrency(formData.rentAmount)}</p>
                  )}
                  {formData.standingFees && (
                    <p><span className="font-medium">Standing Fees:</span> {formatCurrency(formData.standingFees)}</p>
                  )}
                  {formData.depositAmount && (
                    <p><span className="font-medium">Security Deposit:</span> {formatCurrency(formData.depositAmount)}</p>
                  )}
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !formData.name.trim() || !formData.rentAmount.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Add Tenant
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddTenant;