import React, { useState, useEffect } from 'react';
import { X, User, Phone, Mail, MapPin, Banknote, Calendar, Save, AlertCircle } from 'lucide-react';
import { database } from '../../services/database/Database';
import type { TenantInput, TenantWithInvoices, Unit } from '../../services/database/Database';
import { unitSizeLabel, unitConditionLabel } from '../../services/database/Units';
import { checkSafaricomPhone } from '../../utils/safaricom';

interface AddTenantProps {
  propertyId: number;
  tenant?: TenantWithInvoices; // Optional tenant for editing
  onClose: () => void;
  onTenantAdded: () => void;
}

interface FormData {
  name: string;
  id: string;
  phone: string;
  email: string;
  unitNumber: string;
  unitId: string;
  rentAmount: string;
  standingFees: string;
  depositAmount: string;
  leaseStart: string;
  leaseEnd: string;
}

interface FormErrors {
  name?: string;
  id?: string;
  unitNumber?: string;
  rentAmount?: string;
  phone?: string;
  email?: string;
  leaseStart?: string;
  leaseEnd?: string;
}

const AddTenant: React.FC<AddTenantProps> = ({ propertyId, tenant, onClose, onTenantAdded }) => {
  const isEditMode = !!tenant;
  
  const [formData, setFormData] = useState<FormData>({
    name: '',
    id: '',
    phone: '',
    email: '',
    unitNumber: '',
    unitId: '',
    rentAmount: '',
    standingFees: '',
    depositAmount: '',
    leaseStart: '',
    leaseEnd: ''
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [availableUnits, setAvailableUnits] = useState<Unit[]>([]);

  // Vacant units of this property (a tenant being edited keeps their own unit in the list)
  useEffect(() => {
    let cancelled = false;
    database.getAvailableUnits(propertyId, tenant?.unitId ?? null).then(units => {
      if (!cancelled) setAvailableUnits(units);
    });
    return () => { cancelled = true; };
  }, [propertyId, tenant?.unitId]);

  // Initialize form data when tenant prop changes (for edit mode)
  useEffect(() => {
    if (tenant) {
      setFormData({
        name: tenant.name || '',
        id: tenant.id?.toString() || '',
        phone: tenant.phone || '',
        email: tenant.email || '',
        unitNumber: tenant.unitNumber || '',
        unitId: tenant.unitId != null ? String(tenant.unitId) : '',
        rentAmount: tenant.rentAmount?.toString() || '',
        standingFees: tenant.standingFees?.toString() || '',
        depositAmount: tenant.depositAmount?.toString() || '',
        leaseStart: tenant.leaseStart ? tenant.leaseStart.split('T')[0] : '',
        leaseEnd: tenant.leaseEnd ? tenant.leaseEnd.split('T')[0] : ''
      });
    }
  }, [tenant]);

  const validateForm = (): FormErrors => {
    const newErrors: FormErrors = {};

    // Required fields
    if (!formData.name.trim()) {
      newErrors.name = 'Tenant name is required';
    } else if (formData.name.trim().length < 3) {
      newErrors.name = 'Name must be at least 3 characters';
    }

    if (!formData.id.trim()) {
      newErrors.id = 'Tenant id is required';
    } else if (formData.id.trim().length < 7 || formData.id.trim().length > 10) {
      newErrors.id = 'Name must be between 7 and 10 characters';
    }

    // Safaricom only (M-Pesa rent collection and SMS). An existing tenant's untouched number is left alone.
    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!(tenant && formData.phone.trim() === String(tenant.phone || '').trim())) {
      const phoneCheck = checkSafaricomPhone(formData.phone);
      if (!phoneCheck.ok) newErrors.phone = phoneCheck.message;
    }

    if (!formData.unitId) {
      newErrors.unitNumber = 'Select a unit';
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

  // Picking a unit passes its id as the unit number and its price (rent, default deposit) to the form
  const handleUnitSelect = (value: string) => {
    const unit = availableUnits.find(u => String(u.id) === value);
    setFormData(prev => ({
      ...prev,
      unitId: value,
      unitNumber: unit ? unit.unitNumber : '',
      rentAmount: unit ? String(unit.rentAmount) : '',
      depositAmount: unit && !(tenant && String(tenant.unitId) === value) ? String(unit.depositAmount || '') : prev.depositAmount
    }));
    setHasUnsavedChanges(true);
    setErrors(prev => ({ ...prev, unitNumber: undefined, rentAmount: undefined }));
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
        id: parseFloat(formData.id) || undefined,
        phone: (() => { const c = checkSafaricomPhone(formData.phone); return c.ok ? c.local : (formData.phone.trim() || undefined); })(),
        email: formData.email.trim() || undefined,
        unitNumber: formData.unitNumber.trim() || undefined,
        unitId: formData.unitId ? Number(formData.unitId) : undefined,
        rentAmount: parseFloat(formData.rentAmount),
        standingFees: formData.standingFees.trim() ? parseFloat(formData.standingFees) : undefined,
        depositAmount: formData.depositAmount.trim() ? parseFloat(formData.depositAmount) : undefined,
        leaseStart: formData.leaseStart || undefined,
        leaseEnd: formData.leaseEnd || undefined
      };

      if (isEditMode && tenant) {
        // Update existing tenant
        await database.updateTenant(tenant.id, tenantData);
      } else {
        // Create new tenant
        await database.createTenant(tenantData);
      }
      
      setHasUnsavedChanges(false);
      onTenantAdded();
    } catch (error) {
      console.error('Error saving tenant:', error);
      const reason = error instanceof Error && /unit/i.test(error.message) ? ` ${error.message}.` : '';
      alert(`Failed to ${isEditMode ? 'update' : 'create'} tenant.${reason || ' Please try again.'}`);
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
    <div className="fixed bottom-17 inset-0 md:bottom-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-line">
          <h2 className="text-xl font-semibold text-ink">
            {isEditMode ? 'Edit Tenant' : 'Add New Tenant'}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-surface-sunken rounded-full transition-colors"
          >
            <X className="h-5 w-5 text-ink-subtle" />
          </button>
        </div>

        {/* Form */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div>
              <h3 className="text-lg font-medium text-ink mb-4">Basic Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Name (Required) */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-ink-soft mb-2">
                    Tenant Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-faint" />
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      placeholder="Enter tenant's full name"
                      className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.name ? 'border-red-300 dark:border-red-500/40' : 'border-line-strong'
                      }`}
                    />
                  </div>
                  {errors.name && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.name}
                    </p>
                  )}
                </div>

                {/* ID Number */}
                <div>
                  <label className="block text-sm font-medium text-ink-soft mb-2">ID/Passport Number</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-faint" />
                    <input
                      type="number"
                      value={formData.id}
                      onChange={(e) => handleInputChange('id', e.target.value)}
                      placeholder="e.g., 12345678"
                      className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.id ? 'border-red-300 dark:border-red-500/40' : 'border-line-strong'
                      }`}
                    />
                  </div>
                  {errors.id && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.id}
                    </p>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-ink-soft mb-2">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-faint" />
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      placeholder="e.g., 0712 345 678"
                      className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.phone ? 'border-red-300 dark:border-red-500/40' : 'border-line-strong'
                      }`}
                    />
                  </div>
                  {errors.phone && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.phone}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-ink-faint">Safaricom numbers only (07xx or 01xx) — rent is collected by M-Pesa.</p>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-ink-soft mb-2">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-faint" />
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      placeholder="tenant@example.com"
                      className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.email ? 'border-red-300 dark:border-red-500/40' : 'border-line-strong'
                      }`}
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.email}
                    </p>
                  )}
                </div>

                {/* Unit (selected from the property's vacant units) */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-ink-soft mb-2">
                    Unit <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-faint" />
                    <select
                      value={formData.unitId}
                      onChange={(e) => handleUnitSelect(e.target.value)}
                      className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.unitNumber ? 'border-red-300 dark:border-red-500/40' : 'border-line-strong'
                      }`}
                    >
                      <option value="">{availableUnits.length ? 'Select a vacant unit' : 'No vacant units'}</option>
                      {availableUnits.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.unitNumber} · {unitSizeLabel(u.unitSize)} · {u.unitType} · {unitConditionLabel(u.condition)} · KES {u.rentAmount.toLocaleString()}
                        </option>
                      ))}
                    </select>
                  </div>
                  {errors.unitNumber && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.unitNumber}
                    </p>
                  )}
                  {!availableUnits.length && (
                    <p className="mt-1 text-xs text-ink-subtle">Add units from Edit Property to lease them.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Financial Information */}
            <div>
              <h3 className="text-lg font-medium text-ink mb-4">Financial Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Rent Amount (Required) */}
                <div>
                  <label className="block text-sm font-medium text-ink-soft mb-2">
                    Monthly Rent <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Banknote className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-faint" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.rentAmount}
                      onChange={(e) => handleInputChange('rentAmount', e.target.value)}
                      readOnly={!(isEditMode && tenant && String(tenant.unitId ?? '') === formData.unitId)}
                      placeholder="Set by the selected unit"
                      className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.rentAmount ? 'border-red-300 dark:border-red-500/40' : 'border-line-strong'
                      }`}
                    />
                  </div>
                  {formData.rentAmount && !errors.rentAmount && (
                    <p className="mt-1 text-xs text-ink-subtle">
                      {formatCurrency(formData.rentAmount)}
                    </p>
                  )}
                  {errors.rentAmount && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.rentAmount}
                    </p>
                  )}
                </div>

                {/* Standing Fees */}
                <div>
                  <label className="block text-sm font-medium text-ink-soft mb-2">Standing Fees</label>
                  <div className="relative">
                    <Banknote className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-faint" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.standingFees}
                      onChange={(e) => handleInputChange('standingFees', e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-10 pr-4 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  {formData.standingFees && (
                    <p className="mt-1 text-xs text-ink-subtle">
                      {formatCurrency(formData.standingFees)}
                    </p>
                  )}
                </div>

                {/* Deposit Amount */}
                <div>
                  <label className="block text-sm font-medium text-ink-soft mb-2">Security Deposit</label>
                  <div className="relative">
                    <Banknote className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-faint" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.depositAmount}
                      onChange={(e) => handleInputChange('depositAmount', e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-10 pr-4 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  {formData.depositAmount && (
                    <p className="mt-1 text-xs text-ink-subtle">
                      {formatCurrency(formData.depositAmount)}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Lease Information */}
            <div>
              <h3 className="text-lg font-medium text-ink mb-4">Lease Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Lease Start Date */}
                <div>
                  <label className="block text-sm font-medium text-ink-soft mb-2">Lease Start Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-faint" />
                    <input
                      type="date"
                      value={formData.leaseStart}
                      onChange={(e) => handleInputChange('leaseStart', e.target.value)}
                      className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.leaseStart ? 'border-red-300 dark:border-red-500/40' : 'border-line-strong'
                      }`}
                    />
                  </div>
                  {errors.leaseStart && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.leaseStart}
                    </p>
                  )}
                </div>

                {/* Lease End Date */}
                <div>
                  <label className="block text-sm font-medium text-ink-soft mb-2">Lease End Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-faint" />
                    <input
                      type="date"
                      value={formData.leaseEnd}
                      onChange={(e) => handleInputChange('leaseEnd', e.target.value)}
                      min={formData.leaseStart || undefined}
                      className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.leaseEnd ? 'border-red-300 dark:border-red-500/40' : 'border-line-strong'
                      }`}
                    />
                  </div>
                  {errors.leaseEnd && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.leaseEnd}
                    </p>
                  )}
                </div>
              </div>
              
              {/* Lease Duration Helper */}
              {formData.leaseStart && formData.leaseEnd && !errors.leaseEnd && (
                <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-500/10 rounded-lg">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
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
              <div className="bg-surface-muted p-4 rounded-lg">
                <h4 className="font-medium text-ink mb-2">Summary</h4>
                <div className="space-y-1 text-sm text-ink-muted">
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
        <div className="flex items-center justify-end gap-3 p-6 border-t border-line bg-surface-muted">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 text-ink-soft bg-surface border border-line-strong rounded-lg hover:bg-surface-muted transition-colors disabled:opacity-50"
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
                {isEditMode ? 'Updating...' : 'Saving...'}
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                {isEditMode ? 'Update Tenant' : 'Add Tenant'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddTenant;