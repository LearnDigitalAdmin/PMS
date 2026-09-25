import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Check, Calculator, Calendar, Zap, Droplets, FileText, Save, AlertCircle, Info, CreditCard, Users, Settings } from 'lucide-react';
import { database, type Property, type Tenant, type Invoice, type InvoiceInput } from '../../services/database/Database';
import {
  type PaymentInstructions as GlobalPaymentInstructions,
  getGlobalPaymentInstructions,
  hasAnyPaymentInstructions
} from '../../services/settings/PaymentSettings';

// Sentinel tenantId used throughout this wizard to mean "every active tenant
// in the property" rather than one specific tenant. Real tenant IDs are
// always positive, so a negative sentinel can never collide with one.
const ALL_TENANTS_ID = -1;

// interface AddInvoiceProps {
//   propertyId?: number;
//   tenantId?: number;
//   invoiceId?: number;
//   onSave?: (invoice: Invoice) => void;
//   onCancel?: () => void;
// }

interface AddInvoiceProps {
  propertyId?: number;
  tenantId?: number;
  invoiceId?: number;
  onSave?: (invoice: Invoice) => void;
  onCancel?: () => void;
  isModal?: boolean; // Add this line
  userId: number; // Add this line
  onNavigate?: (page: string, params?: any) => void;
}

// Update the FormData interface to include payment instructions
interface FormData {
  propertyId: number;
  tenantId: number;
  billingMonth: string;
  rentAmount: number;
  standingFees: number;
  waterCurrentReading: number;
  waterPreviousReading: number;
  waterStandingFee: number;
  waterUnitPrice: number;
  includeWaterStanding: boolean;
  powerCurrentReading: number;
  powerPreviousReading: number;
  powerUnitPrice: number;
  includePower: boolean;
  otherCharges: number;
  otherChargesDescription: string;
  dueDate: string;
  paymentInstructions: GlobalPaymentInstructions; // Read-only fork of the global settings — see PaymentSettings.ts
}

interface FormErrors {
  propertyId?: string;
  tenantId?: string;
  billingMonth?: string;
  rentAmount?: string;
  waterCurrentReading?: string;
  waterUnitPrice?: string;
  powerCurrentReading?: string;
  powerUnitPrice?: string;
  otherCharges?: string;
  dueDate?: string;
}

const AddInvoice: React.FC<AddInvoiceProps> = ({
  propertyId: initialPropertyId,
  tenantId: initialTenantId,
  invoiceId,
  onSave,
  onCancel,
  onNavigate,
  isModal = false,
  userId
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  const [formData, setFormData] = useState<FormData>({
  propertyId: initialPropertyId || 0,
  tenantId: initialTenantId || 0,
  billingMonth: new Date().toISOString().slice(0, 7),
  rentAmount: 0,
  standingFees: 0,
  waterCurrentReading: 0,
  waterPreviousReading: 0,
  waterStandingFee: 0,
  waterUnitPrice: 0,
  includeWaterStanding: false,
  powerCurrentReading: 0,
  powerPreviousReading: 0,
  powerUnitPrice: 0,
  includePower: false,
  otherCharges: 0,
  otherChargesDescription: '',
  dueDate: '',
  paymentInstructions: getGlobalPaymentInstructions() // Forked once from global settings — see PaymentSettings.ts
});

  // Bulk mode ("All Tenants") skips per-tenant rent entry and utility metering
  // entirely, since those can't be filled in for many tenants at once.
  const isBulkMode = formData.tenantId === ALL_TENANTS_ID;
  const selectedPropertyForTenant = properties.find(p => p.id === formData.propertyId);
  const isRentOnlyProperty = selectedPropertyForTenant?.billingMode === 'rent_only';

  const stepDefs = isBulkMode
    ? [
        { key: 'property' as const, title: 'Property & Tenant', icon: FileText },
        { key: 'other' as const, title: 'Other Charges', icon: Calculator },
        { key: 'payment' as const, title: 'Payment Details', icon: CreditCard },
        { key: 'summary' as const, title: 'Summary', icon: Check }
      ]
    : [
        { key: 'property' as const, title: 'Property & Tenant', icon: FileText },
        { key: 'rent' as const, title: 'Rent Details', icon: FileText },
        { key: 'water' as const, title: 'Water Billing', icon: Droplets },
        { key: 'power' as const, title: 'Power Billing', icon: Zap },
        { key: 'other' as const, title: 'Other Charges', icon: Calculator },
        { key: 'payment' as const, title: 'Payment Details', icon: CreditCard },
        { key: 'summary' as const, title: 'Summary', icon: Check }
      ];

  const steps = stepDefs; // kept as `steps` for the progress bar/nav below
  const currentStepKey = stepDefs[currentStep]?.key ?? stepDefs[0].key;

  // If bulk/individual mode changes (tenant selection on step 0) after the
  // user has moved further into the wizard, keep currentStep in range.
  useEffect(() => {
    if (currentStep > stepDefs.length - 1) {
      setCurrentStep(stepDefs.length - 1);
    }
  }, [stepDefs.length, currentStep]);

  // If the selected property has no utility billing at all, tenant selection
  // is always "All Tenants" — there's nothing else to pick.
  useEffect(() => {
    if (isRentOnlyProperty && formData.tenantId !== ALL_TENANTS_ID) {
      setFormData(prev => ({ ...prev, tenantId: ALL_TENANTS_ID }));
    }
  }, [isRentOnlyProperty]);

  // Update the updateFormData function
  const updateFormData = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Clear error for this field
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (formData.propertyId) {
      loadTenants();
    }
  }, [formData.propertyId]);

  useEffect(() => {
    if (formData.tenantId) {
      loadTenantDetails();
      loadPreviousReadings();
    }
  }, [formData.tenantId, formData.billingMonth]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      // Load properties (assuming userId = 1 for demo)
      const propertiesData = await database.getProperties(userId);
      setProperties(propertiesData);

      // If editing existing invoice, load invoice data
      if (invoiceId) {
        const invoice = await database.getInvoiceById(invoiceId);
        if (invoice) {
          await loadInvoiceForEditing(invoice);
        }
      } else {
        // Set default due date (30 days from now)
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);
        setFormData(prev => ({
          ...prev,
          dueDate: dueDate.toISOString().slice(0, 10)
        }));
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadInvoiceForEditing = async (invoice: Invoice) => {
    const property = await database.getPropertyById(invoice.propertyId);
    //const tenant = await database.getTenantById(invoice.tenantId);
    
    setFormData({
      propertyId: invoice.propertyId,
      tenantId: invoice.tenantId,
      billingMonth: invoice.billingMonth,
      rentAmount: invoice.rentAmount,
      standingFees: 0,
      waterCurrentReading: invoice.waterCurrentReading,
      waterPreviousReading: invoice.waterPreviousReading,
      waterStandingFee: invoice.waterStandingFee,
      waterUnitPrice: invoice.waterUnitPrice,
      includeWaterStanding: invoice.waterStandingFee > 0,
      powerCurrentReading: invoice.powerCurrentReading,
      powerPreviousReading: invoice.powerPreviousReading,
      powerUnitPrice: invoice.powerUnitPrice,
      includePower: invoice.powerUnitPrice > 0,
      otherCharges: invoice.otherCharges,
      otherChargesDescription: invoice.otherChargesDescription || '',
      dueDate: invoice.dueDate || ''
      ,paymentInstructions: getGlobalPaymentInstructions() // Forked from global settings
    });

    // Load tenants for the property
    if (property) {
      const tenantsData = await database.getTenantsByProperty(invoice.propertyId);
      setTenants(tenantsData);
    }
  };

  const loadTenants = async () => {
    if (!formData.propertyId) return;
    
    try {
      const tenantsData = await database.getTenantsByProperty(formData.propertyId);
      setTenants(tenantsData);
      
      // If no tenant selected but we have tenants, and there's an initial tenantId
      if (!formData.tenantId && initialTenantId && tenantsData.some(t => t.id === initialTenantId)) {
        setFormData(prev => ({ ...prev, tenantId: initialTenantId }));
      }
    } catch (error) {
      console.error('Error loading tenants:', error);
    }
  };

  // Replace the existing handleSave function with this updated version:
const handleSave = async () => {
  if (!validateCurrentStep()) return;

  setLoading(true);
  try {
    // Bulk path: "All Tenants" was selected — generate one invoice per active
    // tenant, forking each tenant's own rentAmount (never a shared amount),
    // with no water/power metering. otherCharges (if any) applies flatly to
    // every generated invoice, not divided among tenants.
    if (isBulkMode && !invoiceId) {
      const result = await database.createBulkRentInvoices({
        propertyId: formData.propertyId,
        billingMonth: formData.billingMonth,
        dueDate: formData.dueDate,
        otherCharges: formData.otherCharges,
        otherChargesDescription: formData.otherChargesDescription
      });

      if (result.created.length === 0 && result.skipped.length > 0) {
        alert(
          `No invoices were created. ${result.skipped.length} tenant(s) were skipped ` +
          `(most likely already invoiced for this billing month).`
        );
      } else if (result.skipped.length > 0) {
        console.log(`Skipped ${result.skipped.length} tenant(s):`, result.skipped);
      }

      if (onSave && result.created.length > 0) {
        onSave(result.created[result.created.length - 1]);
      } else {
        onNavigate?.('invoices');
      }
      return;
    }

    const invoiceData: InvoiceInput = {
      id: formData.tenantId,
      tenantId: formData.tenantId,
      propertyId: formData.propertyId,
      billingMonth: formData.billingMonth,
      rentAmount: formData.rentAmount,
      waterCurrentReading: formData.waterCurrentReading,
      waterPreviousReading: formData.waterPreviousReading,
      waterStandingFee: formData.includeWaterStanding ? formData.waterStandingFee : 0,
      waterUnitPrice: formData.waterUnitPrice,
      powerCurrentReading: formData.includePower ? formData.powerCurrentReading : 0,
      powerPreviousReading: formData.includePower ? formData.powerPreviousReading : 0,
      powerUnitPrice: formData.includePower ? formData.powerUnitPrice : 0,
      otherCharges: formData.otherCharges,
      otherChargesDescription: formData.otherChargesDescription,
      dueDate: formData.dueDate
    };

    let savedInvoice: Invoice;
    console.log('INVOICE ID:', invoiceId);
    if (invoiceId) {
      await database.updateInvoice(invoiceId, invoiceData);
      savedInvoice = await database.getInvoiceById(invoiceId) as Invoice;
    } else {
      savedInvoice = await database.createInvoice(invoiceData);
    }

    // Call onSave if provided, otherwise navigate back to invoices
    if (onSave) {
      onSave(savedInvoice);
    } else {
      onNavigate?.('invoices');
    }
  } catch (error) {
    console.error('Error saving invoice:', error);
    // You might want to show an error message here
  } finally {
    setLoading(false);
  }
};

  const loadTenantDetails = async () => {
    if (!formData.tenantId || formData.tenantId === ALL_TENANTS_ID) return;

    try {
      const tenant = await database.getTenantById(formData.tenantId);
      if (tenant) {
        setFormData(prev => ({
          ...prev,
          rentAmount: tenant.rentAmount,
          standingFees: tenant.standingFees
        }));
      }
    } catch (error) {
      console.error('Error loading tenant details:', error);
    }
  };

  const loadPreviousReadings = async () => {
    if (!formData.tenantId || formData.tenantId === ALL_TENANTS_ID || !formData.billingMonth) return;

    try {
      // Get previous month's invoice for meter readings
      const previousMonth = getPreviousMonth(formData.billingMonth);
      const previousInvoices = await database.getInvoices({
        tenantId: formData.tenantId,
        billingMonth: previousMonth
      });
      
      if (previousInvoices.length > 0) {
        const lastInvoice = previousInvoices[0];
        setFormData(prev => ({
          ...prev,
          waterPreviousReading: lastInvoice.waterCurrentReading,
          powerPreviousReading: lastInvoice.powerCurrentReading,
          waterUnitPrice: lastInvoice.waterUnitPrice || prev.waterUnitPrice,
          powerUnitPrice: lastInvoice.powerUnitPrice || prev.powerUnitPrice,
          waterStandingFee: lastInvoice.waterStandingFee || prev.waterStandingFee
        }));
      }
    } catch (error) {
      console.error('Error loading previous readings:', error);
    }
  };

  const getPreviousMonth = (monthString: string) => {
    const date = new Date(monthString + '-01');
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().slice(0, 7);
  };

  const calculateTotals = () => {
    const waterConsumption = Math.max(0, formData.waterCurrentReading - formData.waterPreviousReading);
    const waterAmount = (waterConsumption * formData.waterUnitPrice) + 
                       (formData.includeWaterStanding ? formData.waterStandingFee : 0);
    
    const powerConsumption = Math.max(0, formData.powerCurrentReading - formData.powerPreviousReading);
    const powerAmount = formData.includePower ? (powerConsumption * formData.powerUnitPrice) : 0;
    
    const totalAmount = formData.rentAmount + waterAmount + powerAmount + formData.otherCharges;
    
    return {
      waterConsumption,
      waterAmount,
      powerConsumption,
      powerAmount,
      totalAmount
    };
  };

  const validateCurrentStep = (): boolean => {
    const newErrors: FormErrors = {};

    switch (currentStepKey) {
      case 'property': // Property & Tenant
        if (!formData.propertyId) newErrors.propertyId = 'Please select a property';
        if (!formData.tenantId) newErrors.tenantId = 'Please select a tenant';
        if (!formData.billingMonth) newErrors.billingMonth = 'Please select billing month';
        break;

      case 'rent': // Rent Details (individual-tenant mode only)
        if (formData.rentAmount <= 0) newErrors.rentAmount = 'Rent amount must be greater than 0';
        break;

      case 'water': // Water Billing (individual-tenant mode only)
        if (formData.waterCurrentReading < formData.waterPreviousReading) {
          newErrors.waterCurrentReading = 'Current reading cannot be less than previous reading';
        }
        if (formData.waterUnitPrice < 0) newErrors.waterUnitPrice = 'Unit price cannot be negative';
        break;

      case 'power': // Power Billing (individual-tenant mode only)
        if (formData.includePower) {
          if (formData.powerCurrentReading < formData.powerPreviousReading) {
            newErrors.powerCurrentReading = 'Current reading cannot be less than previous reading';
          }
          if (formData.powerUnitPrice <= 0) newErrors.powerUnitPrice = 'Unit price must be greater than 0';
        }
        break;

      case 'other': // Other Charges
        if (formData.otherCharges < 0) newErrors.otherCharges = 'Other charges cannot be negative';
        break;

      case 'payment': // Payment Details
        if (!formData.dueDate) newErrors.dueDate = 'Please select a due date';
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateCurrentStep() && currentStep < stepDefs.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // const updateFormData = (field: keyof FormData, value: any) => {
  //   setFormData(prev => ({ ...prev, [field]: value }));
  //   // Clear error for this field
  //   if (errors[field as keyof FormErrors]) {
  //     setErrors(prev => ({ ...prev, [field]: undefined }));
  //   }
  // };

  const selectedProperty = selectedPropertyForTenant;
  const selectedTenant = tenants.find(t => t.id === formData.tenantId);
  const totals = calculateTotals();

  const renderStep = () => {
    switch (currentStepKey) {
      case 'property': // Property & Tenant Selection
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Property *
              </label>
              <select
                value={formData.propertyId || ''}
                onChange={(e) => updateFormData('propertyId', parseInt(e.target.value))}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.propertyId ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={!!initialPropertyId}
              >
                <option value="">Select a property</option>
                {properties.map(property => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
              {errors.propertyId && (
                <p className="text-red-500 text-sm mt-1">{errors.propertyId}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tenant *
              </label>
              <select
                value={formData.tenantId || ''}
                onChange={(e) => updateFormData('tenantId', parseInt(e.target.value))}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.tenantId ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={!formData.propertyId || !!initialTenantId || isRentOnlyProperty}
              >
                <option value="">Select a tenant</option>
                <option value={ALL_TENANTS_ID}>All Tenants</option>
                {!isRentOnlyProperty && tenants.map(tenant => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name} {tenant.unitNumber && `(Unit ${tenant.unitNumber})`}
                  </option>
                ))}
              </select>
              {errors.tenantId && (
                <p className="text-red-500 text-sm mt-1">{errors.tenantId}</p>
              )}
              {isRentOnlyProperty && (
                <p className="text-gray-500 text-xs mt-1">
                  This property is billed as rent only, so invoices are always generated for all tenants at once.
                </p>
              )}
            </div>

            {isBulkMode && (
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="flex items-start gap-2">
                  <Users className="w-5 h-5 text-purple-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-purple-900 mb-1">Creating invoices for all tenants</h4>
                    <p className="text-purple-700 text-sm">
                      One invoice will be generated per active tenant. Each invoice uses that tenant's own rent
                      amount — water and power metering are skipped. Tenants who already have an invoice for
                      this billing month will be skipped automatically.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Billing Month *
              </label>
              <input
                type="month"
                value={formData.billingMonth}
                onChange={(e) => updateFormData('billingMonth', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.billingMonth ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.billingMonth && (
                <p className="text-red-500 text-sm mt-1">{errors.billingMonth}</p>
              )}
            </div>

            {selectedProperty && selectedTenant && (
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Selected Details</h4>
                <p className="text-blue-700 text-sm">Property: {selectedProperty.name}</p>
                <p className="text-blue-700 text-sm">Tenant: {selectedTenant.name}</p>
                <p className="text-blue-700 text-sm">Month: {new Date(formData.billingMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
              </div>
            )}
          </div>
        );

      case 'rent': // Rent Details
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Monthly Rent *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">KES</span>
                <input
                  type="number"
                  value={formData.rentAmount}
                  onChange={(e) => updateFormData('rentAmount', parseFloat(e.target.value) || 0)}
                  className={`w-full pl-12 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.rentAmount ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="0.00"
                />
              </div>
              {errors.rentAmount && (
                <p className="text-red-500 text-sm mt-1">{errors.rentAmount}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Standing Fees
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">KES</span>
                <input
                  type="number"
                  value={formData.standingFees}
                  onChange={(e) => updateFormData('standingFees', parseFloat(e.target.value) || 0)}
                  className="w-full pl-12 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.00"
                />
              </div>
              <p className="text-gray-500 text-sm mt-1">Additional monthly charges</p>
            </div>

            {selectedTenant && (
              <div className="bg-green-50 p-4 rounded-lg">
                <h4 className="font-medium text-green-900 mb-2">Tenant Information</h4>
                <p className="text-green-700 text-sm">Default Rent: KES {selectedTenant.rentAmount.toLocaleString()}</p>
                <p className="text-green-700 text-sm">Standing Fees: KES {selectedTenant.standingFees.toLocaleString()}</p>
                {selectedTenant.leaseStart && (
                  <p className="text-green-700 text-sm">Lease Start: {new Date(selectedTenant.leaseStart).toLocaleDateString()}</p>
                )}
              </div>
            )}
          </div>
        );

      case 'water': // Water Billing
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <Droplets className="w-5 h-5 text-blue-500" />
              <h3 className="text-lg font-medium">Water Billing</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Previous Reading
                </label>
                <input
                  type="number"
                  value={formData.waterPreviousReading}
                  onChange={(e) => updateFormData('waterPreviousReading', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Current Reading *
                </label>
                <input
                  type="number"
                  value={formData.waterCurrentReading}
                  onChange={(e) => updateFormData('waterCurrentReading', parseFloat(e.target.value) || 0)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.waterCurrentReading ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="0"
                />
                {errors.waterCurrentReading && (
                  <p className="text-red-500 text-sm mt-1">{errors.waterCurrentReading}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Unit Price (KES per unit)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.waterUnitPrice}
                onChange={(e) => updateFormData('waterUnitPrice', parseFloat(e.target.value) || 0)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.waterUnitPrice ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="0.00"
              />
              {errors.waterUnitPrice && (
                <p className="text-red-500 text-sm mt-1">{errors.waterUnitPrice}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="includeWaterStanding"
                checked={formData.includeWaterStanding}
                onChange={(e) => updateFormData('includeWaterStanding', e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <label htmlFor="includeWaterStanding" className="text-sm font-medium text-gray-700">
                Include standing fee
              </label>
            </div>

            {formData.includeWaterStanding && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Standing Fee (KES)
                </label>
                <input
                  type="number"
                  value={formData.waterStandingFee}
                  onChange={(e) => updateFormData('waterStandingFee', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.00"
                />
              </div>
            )}

            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">Water Bill Calculation</h4>
              <p className="text-blue-700 text-sm">Consumption: {totals.waterConsumption} units</p>
              <p className="text-blue-700 text-sm">Amount: KES {totals.waterAmount.toLocaleString()}</p>
            </div>
          </div>
        );

      case 'power': // Power Billing
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-yellow-500" />
              <h3 className="text-lg font-medium">Power Billing</h3>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="includePower"
                checked={formData.includePower}
                onChange={(e) => updateFormData('includePower', e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <label htmlFor="includePower" className="text-sm font-medium text-gray-700">
                Include power billing
              </label>
            </div>

            {formData.includePower && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Previous Reading
                    </label>
                    <input
                      type="number"
                      value={formData.powerPreviousReading}
                      onChange={(e) => updateFormData('powerPreviousReading', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Current Reading *
                    </label>
                    <input
                      type="number"
                      value={formData.powerCurrentReading}
                      onChange={(e) => updateFormData('powerCurrentReading', parseFloat(e.target.value) || 0)}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.powerCurrentReading ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="0"
                    />
                    {errors.powerCurrentReading && (
                      <p className="text-red-500 text-sm mt-1">{errors.powerCurrentReading}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Unit Price (KES per kWh) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.powerUnitPrice}
                    onChange={(e) => updateFormData('powerUnitPrice', parseFloat(e.target.value) || 0)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.powerUnitPrice ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="0.00"
                  />
                  {errors.powerUnitPrice && (
                    <p className="text-red-500 text-sm mt-1">{errors.powerUnitPrice}</p>
                  )}
                </div>

                <div className="bg-yellow-50 p-4 rounded-lg">
                  <h4 className="font-medium text-yellow-900 mb-2">Power Bill Calculation</h4>
                  <p className="text-yellow-700 text-sm">Consumption: {totals.powerConsumption} kWh</p>
                  <p className="text-yellow-700 text-sm">Amount: KES {totals.powerAmount.toLocaleString()}</p>
                </div>
              </>
            )}

            {!formData.includePower && (
              <div className="text-center py-8 text-gray-500">
                <Zap className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>Power billing is optional for this invoice</p>
              </div>
            )}
          </div>
        );

      case 'other': // Other Charges
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <Calculator className="w-5 h-5 text-green-500" />
              <h3 className="text-lg font-medium">Other Charges</h3>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Amount (KES)
              </label>
              <input
                type="number"
                value={formData.otherCharges}
                onChange={(e) => updateFormData('otherCharges', parseFloat(e.target.value) || 0)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.otherCharges ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="0.00"
              />
              {errors.otherCharges && (
                <p className="text-red-500 text-sm mt-1">{errors.otherCharges}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={formData.otherChargesDescription}
                onChange={(e) => updateFormData('otherChargesDescription', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                rows={3}
                placeholder="e.g., Late payment fee, Maintenance charge, etc."
              />
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-700 mb-2">Common Charges</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    updateFormData('otherCharges', 500);
                    updateFormData('otherChargesDescription', 'Late payment fee');
                  }}
                  className="text-left p-2 hover:bg-gray-100 rounded"
                >
                  Late payment fee (KES 500)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateFormData('otherCharges', 1000);
                    updateFormData('otherChargesDescription', 'Maintenance charge');
                  }}
                  className="text-left p-2 hover:bg-gray-100 rounded"
                >
                  Maintenance (KES 1,000)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateFormData('otherCharges', 200);
                    updateFormData('otherChargesDescription', 'Security fee');
                  }}
                  className="text-left p-2 hover:bg-gray-100 rounded"
                >
                  Security fee (KES 200)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateFormData('otherCharges', 300);
                    updateFormData('otherChargesDescription', 'Garbage collection');
                  }}
                  className="text-left p-2 hover:bg-gray-100 rounded"
                >
                  Garbage (KES 300)
                </button>
              </div>
            </div>

            {formData.otherCharges > 0 && (
              <div className="bg-green-50 p-4 rounded-lg">
                <h4 className="font-medium text-green-900 mb-2">Additional Charges</h4>
                <p className="text-green-700 text-sm">Amount: KES {formData.otherCharges.toLocaleString()}</p>
                {formData.otherChargesDescription && (
                  <p className="text-green-700 text-sm">Description: {formData.otherChargesDescription}</p>
                )}
                {isBulkMode && (
                  <p className="text-green-700 text-xs mt-2">
                    This amount will be added to every tenant's invoice — it is not split between tenants.
                  </p>
                )}
              </div>
            )}
          </div>
        );

      case 'payment': // Payment Details (read-only fork of global settings)
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="w-5 h-5 text-purple-500" />
              <h3 className="text-lg font-medium">Payment Instructions</h3>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-blue-900 mb-1">Managed in Settings</h4>
                  <p className="text-blue-700 text-sm">
                    Payment instructions are set once in your Profile and automatically included on every
                    invoice you create. To change them, update your Profile settings — not this invoice.
                  </p>
                </div>
              </div>
            </div>

            {hasAnyPaymentInstructions(formData.paymentInstructions) ? (
              <div className="bg-purple-50 p-4 rounded-lg">
                <h4 className="font-medium text-purple-900 mb-2">This invoice will include:</h4>
                <div className="text-purple-700 text-sm space-y-1">
                  {formData.paymentInstructions.mpesaTillNumber && (
                    <p>• M-Pesa Till Number: {formData.paymentInstructions.mpesaTillNumber}</p>
                  )}
                  {formData.paymentInstructions.bankName && formData.paymentInstructions.accountNumber && (
                    <p>• Bank Transfer: {formData.paymentInstructions.bankName} - Account: {formData.paymentInstructions.accountNumber}</p>
                  )}
                  {formData.paymentInstructions.customInstructions && (
                    <p>• {formData.paymentInstructions.customInstructions}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 p-4 rounded-lg flex items-start gap-2">
                <Settings className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-gray-700 mb-1">No payment instructions set yet</h4>
                  <p className="text-gray-500 text-sm">
                    This invoice will be created without payment details. Add them in Profile settings and
                    they'll automatically apply to future invoices.
                  </p>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Due Date *
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => updateFormData('dueDate', e.target.value)}
                  className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.dueDate ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
              </div>
              {errors.dueDate && (
                <p className="text-red-500 text-sm mt-1">{errors.dueDate}</p>
              )}
            </div>
          </div>
        );

        case 'summary': // Summary
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <Check className="w-5 h-5 text-green-500" />
              <h3 className="text-lg font-medium">Invoice Summary</h3>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b">
                <h4 className="font-medium text-gray-900">Invoice Details</h4>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Property:</span>
                  <span className="font-medium">{selectedProperty?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Tenant:</span>
                  <span className="font-medium">
                    {isBulkMode ? `All active tenants (${tenants.filter(t => t.isActive).length})` : selectedTenant?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Billing Month:</span>
                  <span className="font-medium">
                    {new Date(formData.billingMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b">
                <h4 className="font-medium text-gray-900">Charges Breakdown</h4>
              </div>
              <div className="p-4 space-y-3">
                {isBulkMode ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Monthly Rent:</span>
                      <span className="font-medium">Each tenant's own rent amount</span>
                    </div>
                    {formData.otherCharges > 0 && (
                      <div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Other Charges (per tenant):</span>
                          <span className="font-medium">KES {formData.otherCharges.toLocaleString()}</span>
                        </div>
                        {formData.otherChargesDescription && (
                          <div className="text-xs text-gray-500 ml-4">
                            {formData.otherChargesDescription}
                          </div>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-gray-500">
                      Each tenant's invoice total is their own rent{formData.otherCharges > 0 ? ' plus the other charges above' : ''}. Water and power are not included.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Monthly Rent:</span>
                      <span className="font-medium">KES {formData.rentAmount.toLocaleString()}</span>
                    </div>

                    {totals.waterAmount > 0 && (
                      <div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Water Bill:</span>
                          <span className="font-medium">KES {totals.waterAmount.toLocaleString()}</span>
                        </div>
                        <div className="text-xs text-gray-500 ml-4">
                          {totals.waterConsumption} units @ KES {formData.waterUnitPrice}
                          {formData.includeWaterStanding && ` + KES ${formData.waterStandingFee} standing fee`}
                        </div>
                      </div>
                    )}

                    {formData.includePower && totals.powerAmount > 0 && (
                      <div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Power Bill:</span>
                          <span className="font-medium">KES {totals.powerAmount.toLocaleString()}</span>
                        </div>
                        <div className="text-xs text-gray-500 ml-4">
                          {totals.powerConsumption} kWh @ KES {formData.powerUnitPrice}
                        </div>
                      </div>
                    )}

                    {formData.otherCharges > 0 && (
                      <div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Other Charges:</span>
                          <span className="font-medium">KES {formData.otherCharges.toLocaleString()}</span>
                        </div>
                        {formData.otherChargesDescription && (
                          <div className="text-xs text-gray-500 ml-4">
                            {formData.otherChargesDescription}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="border-t pt-3">
                      <div className="flex justify-between text-lg font-semibold">
                        <span>Total Amount:</span>
                        <span className="text-blue-600">KES {totals.totalAmount.toLocaleString()}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {hasAnyPaymentInstructions(formData.paymentInstructions) && (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b">
                  <h4 className="font-medium text-gray-900">Payment Instructions</h4>
                </div>
                <div className="p-4 space-y-2 text-sm">
                  {formData.paymentInstructions.mpesaTillNumber && (
                    <p><span className="font-medium">M-Pesa Till:</span> {formData.paymentInstructions.mpesaTillNumber}</p>
                  )}
                  {formData.paymentInstructions.bankName && formData.paymentInstructions.accountNumber && (
                    <p><span className="font-medium">Bank Transfer:</span> {formData.paymentInstructions.bankName} - {formData.paymentInstructions.accountNumber}</p>
                  )}
                  {formData.paymentInstructions.customInstructions && (
                    <p><span className="font-medium">Additional:</span> {formData.paymentInstructions.customInstructions}</p>
                  )}
                </div>
              </div>
            )}

            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-blue-900 mb-1">Ready to Create {isBulkMode ? 'Invoices' : 'Invoice'}</h4>
                  <p className="text-blue-700 text-sm">
                    {isBulkMode
                      ? 'Review the details above. One invoice will be created for each active tenant using their own rent amount.'
                      : 'Review all details above. Once saved, you can edit the invoice later if needed. The tenant will be able to view and pay this invoice.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Replace the main return statement with this conditional layout:
return (
  <div className={isModal 
      ? "fixed bottom-17 inset-0 bg-white z-50 flex flex-col pb-5" 
      : "min-h-screen bg-gray-50"}>
    {/* Header */}
    <div className={`bg-white shadow-sm ${isModal ? 'flex-shrink-0' : ''}`}>
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowDiscardDialog(true)}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-semibold text-gray-900">
              {invoiceId ? 'Edit Invoice' : 'Create New Invoice'}
            </h1>
          </div>
          <div className="text-sm text-gray-500">
            Step {currentStep + 1} of {steps.length}
          </div>
        </div>
      </div>
    </div>

    {/* Progress Bar */}
    <div className={`bg-white border-b ${isModal ? 'flex-shrink-0' : ''}`}>
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-2">
          {steps.map((step, index) => (
            <div key={index} className="flex items-center">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full ${
                  index <= currentStep
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {index < currentStep ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <step.icon className="w-4 h-4" />
                )}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`w-full h-1 mx-2 ${
                    index < currentStep ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          {steps.map((step, index) => (
            <span key={index} className={index <= currentStep ? 'text-blue-600' : ''}>
              {step.title}
            </span>
          ))}
        </div>
      </div>
    </div>

    {/* Content */}
    <div className={`${isModal ? 'flex-1 overflow-y-auto' : 'flex-grow'}`}>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-sm p-6">
          {renderStep()}
        </div>
      </div>
    </div>

    {/* Navigation */}
    <div className={`bg-white border-t shadow-lg ${isModal ? 'flex-shrink-0' : 'fixed bottom-0 left-0 right-0'}`}>
      <div className="max-w-2xl mx-auto px-4 py-4">
        <div className="flex justify-between">
          <button
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              currentStep === 0
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>

          {currentStep === steps.length - 1 ? (
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Saving...' : (invoiceId ? 'Update Invoice' : (isBulkMode ? 'Create Invoices' : 'Create Invoice'))}
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>

    {/* Discard Dialog */}
    {showDiscardDialog && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-md w-full">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold">Discard Changes?</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to discard this invoice? All entered data will be lost.
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
                Discard
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
  </div>
);
};

export default AddInvoice;

