import React, { useState, useEffect } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Save,
  Plus,
  Trash2,
  User,
  Phone,
  Building2,
  Calendar,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Edit3,
  GripVertical,
  Droplets,
  Zap
} from 'lucide-react';
import { database } from '../../services/database/Database';
import { 
  reportsDatabase, 
  type TranscriptWithDetails,
  type TranscriptItemInput,
  type MonthlyTranscriptInput 
} from '../../services/database/ReportsDatabase';

interface TranscriptEditorProps {
  propertyId: number;
  selectedMonth: string;
  userId: number;
  onClose: () => void;
  onSaved: () => void;
}

interface FormData {
  landlordName: string;
  landlordContact: string;
  notes: string;
}

interface UtilityItem {
  id: string;
  description: string;
  amount: number;
  type: 'water' | 'power';
  isRemittedToLandlord: boolean;
  isNew: boolean;
}

interface CustomItem {
  id: string;
  description: string;
  amount: number;
  type: 'deductible' | 'income';
  category: string;
  isDeductible: boolean;
  isNew: boolean;
}

const TranscriptEditor: React.FC<TranscriptEditorProps> = ({
  propertyId,
  selectedMonth,
  userId,
  onClose,
  onSaved
}) => {
  const [property, setProperty] = useState<any>(null);
  const [transcript, setTranscript] = useState<TranscriptWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(selectedMonth);
  const [formData, setFormData] = useState<FormData>({
    landlordName: '',
    landlordContact: '',
    notes: ''
  });
  const [utilityItems, setUtilityItems] = useState<UtilityItem[]>([]);
  const [customItems, setCustomItems] = useState<CustomItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadData();
  }, [propertyId, currentMonth]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load property data
      const propertyData = await database.getPropertyById(propertyId);
      setProperty(propertyData);

      // Try to load existing transcript
      const existingTranscripts = await reportsDatabase.getTranscriptsByProperty(propertyId, 12);
      const monthTranscript = existingTranscripts.find(t => t.billingMonth === currentMonth);

      if (monthTranscript) {
        const transcriptWithDetails = await reportsDatabase.getTranscriptWithDetails(monthTranscript.id);
        setTranscript(transcriptWithDetails);
        
        // Populate form with existing data
        setFormData({
          landlordName: transcriptWithDetails.landlordName,
          landlordContact: transcriptWithDetails.landlordContact || '',
          notes: transcriptWithDetails.notes || ''
        });

        // Load utility items (water and power)
        const waterItem = transcriptWithDetails.items.find(item => item.type === 'water');
        const powerItem = transcriptWithDetails.items.find(item => item.type === 'power');
        
        const utilityItemsFromTranscript: UtilityItem[] = [];
        
        if (waterItem) {
          utilityItemsFromTranscript.push({
            id: waterItem.id.toString(),
            description: waterItem.description,
            amount: waterItem.amount,
            type: 'water',
            isRemittedToLandlord: !waterItem.isDeductible,
            isNew: false
          });
        }
        
        if (powerItem) {
          utilityItemsFromTranscript.push({
            id: powerItem.id.toString(),
            description: powerItem.description,
            amount: powerItem.amount,
            type: 'power',
            isRemittedToLandlord: !powerItem.isDeductible,
            isNew: false
          });
        }
        
        setUtilityItems(utilityItemsFromTranscript);

        // Load custom items (excluding rent, water, power, and commission)
        const customTranscriptItems = transcriptWithDetails.items
          .filter(item => !['rent', 'water', 'power'].includes(item.type) && 
                         !item.description.toLowerCase().includes('commission'))
          .map(item => ({
            id: item.id.toString(),
            description: item.description,
            amount: item.amount,
            type: item.isDeductible ? 'deductible' as const : 'income' as const,
            category: item.category || '',
            isDeductible: item.isDeductible,
            isNew: false
          }));
        
        setCustomItems(customTranscriptItems);
      } else {
        // New transcript - prefill utility items from invoices
        await loadUtilityDefaults();
        setFormData({
          landlordName: '',
          landlordContact: '',
          notes: ''
        });
        setCustomItems([]);
      }
    } catch (error) {
      console.error('Error loading transcript editor data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUtilityDefaults = async () => {
    try {
      // Get invoices for the current month to calculate default utility amounts
      const invoices = await database.getInvoices({
        propertyId,
        billingMonth: currentMonth
      });

      const totalWaterCharges = invoices
        .filter(inv => inv.isPaid)
        .reduce((sum, inv) => {
          const waterAmount = (inv.waterCurrentReading - inv.waterPreviousReading) * 
            inv.waterUnitPrice + inv.waterStandingFee;
          return sum + waterAmount;
        }, 0);

      const totalPowerCharges = invoices
        .filter(inv => inv.isPaid)
        .reduce((sum, inv) => {
          const powerAmount = (inv.powerCurrentReading - inv.powerPreviousReading) * 
            inv.powerUnitPrice;
          return sum + powerAmount;
        }, 0);

      const defaultUtilities: UtilityItem[] = [];
      
      if (totalWaterCharges > 0) {
        defaultUtilities.push({
          id: 'water-default',
          description: 'Water Charges',
          amount: totalWaterCharges,
          type: 'water',
          isRemittedToLandlord: true, // Default to remitting to landlord
          isNew: true
        });
      }

      if (totalPowerCharges > 0) {
        defaultUtilities.push({
          id: 'power-default',
          description: 'Power Charges',
          amount: totalPowerCharges,
          type: 'power',
          isRemittedToLandlord: true, // Default to remitting to landlord
          isNew: true
        });
      }

      setUtilityItems(defaultUtilities);
    } catch (error) {
      console.error('Error loading utility defaults:', error);
      // Set empty defaults if there's an error
      setUtilityItems([]);
    }
  };

  const getMonthName = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const [year, month] = currentMonth.split('-').map(Number);
    const currentDate = new Date(year, month - 1);
    
    if (direction === 'prev') {
      currentDate.setMonth(currentDate.getMonth() - 1);
    } else {
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
    
    const newMonth = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`;
    setCurrentMonth(newMonth);
  };

  const updateUtilityItem = (id: string, updates: Partial<UtilityItem>) => {
    setUtilityItems(items => 
      items.map(item => 
        item.id === id 
          ? { ...item, ...updates }
          : item
      )
    );
  };

  const addCustomItem = () => {
    const newItem: CustomItem = {
      id: `new-${Date.now()}`,
      description: '',
      amount: 0,
      type: 'deductible',
      category: '',
      isDeductible: true,
      isNew: true
    };
    setCustomItems([...customItems, newItem]);
  };

  const updateCustomItem = (id: string, updates: Partial<CustomItem>) => {
    setCustomItems(items => 
      items.map(item => 
        item.id === id 
          ? { ...item, ...updates, isDeductible: updates.type === 'deductible' }
          : item
      )
    );
  };

  const removeCustomItem = (id: string) => {
    setCustomItems(items => items.filter(item => item.id !== id));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.landlordName.trim()) {
      newErrors.landlordName = 'Landlord name is required';
    }

    // Validate utility items
    utilityItems.forEach((item) => {
      if (!item.description.trim()) {
        newErrors[`utility-${item.id}-description`] = 'Description is required';
      }
      if (item.amount < 0) {
        newErrors[`utility-${item.id}-amount`] = 'Amount cannot be negative';
      }
    });

    // Validate custom items
    customItems.forEach((item) => {
      if (!item.description.trim()) {
        newErrors[`item-${item.id}-description`] = 'Description is required';
      }
      if (item.amount <= 0) {
        newErrors[`item-${item.id}-amount`] = 'Amount must be greater than 0';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

const handleSave = async () => {
  if (!validateForm()) return;

  try {
    setSaving(true);

    // Prepare utility items with corrected logic
    const utilityItemsInput: TranscriptItemInput[] = utilityItems.map(item => ({
      description: item.description,
      amount: item.amount,
      type: item.type,
      category: 'Utilities',
      // CORRECTED LOGIC: 
      // - When isRemittedToLandlord is TRUE (Remit to Landlord): Not a deduction, it's income (isDeductible = false)
      // - When isRemittedToLandlord is FALSE (Agent Pays): It's a deduction from landlord payment (isDeductible = true)
      isDeductible: !item.isRemittedToLandlord,
      billingMonth: currentMonth
    }));

    // Prepare custom items
    const customItemsInput: TranscriptItemInput[] = customItems.map(item => ({
      description: item.description,
      amount: item.amount,
      type: item.type === 'deductible' ? 'deductible' : 'custom',
      category: item.category,
      isDeductible: item.isDeductible,
      billingMonth: currentMonth
    }));

    // Combine all custom items (utilities + custom)
    const allCustomItems = [...utilityItemsInput, ...customItemsInput];

    // Prepare the transcript input for the new dynamic system
    const transcriptInput: MonthlyTranscriptInput = {
      propertyId,
      billingMonth: currentMonth,
      landlordName: formData.landlordName,
      landlordContact: formData.landlordContact || undefined,
      notes: formData.notes || undefined,
      customItems: allCustomItems
    };

    if (transcript && transcript.id > 0) {
      // UPDATING EXISTING TRANSCRIPT
      console.log(`[TranscriptEditor] Updating existing transcript ${transcript.id}`);

      // Update the summary transcript metadata
      await reportsDatabase.updateTranscriptStatus(
        transcript.id, 
        transcript.status, 
        formData.notes
      );

      // Clear and rebuild all items for this month using the new dynamic system
      // The ReportsDatabase will handle clearing existing items and rebuilding from fresh data + custom items
      await reportsDatabase.generateMonthlyTranscript(transcriptInput, userId);

      console.log(`[TranscriptEditor] Successfully updated transcript ${transcript.id}`);
    } else {
      // CREATING NEW TRANSCRIPT
      console.log(`[TranscriptEditor] Creating new transcript for ${currentMonth}`);

      // Generate new dynamic transcript with custom items
      await reportsDatabase.generateMonthlyTranscript(transcriptInput, userId);

      console.log(`[TranscriptEditor] Successfully created new transcript for ${currentMonth}`);
    }

    // Success - trigger refresh in parent component
    onSaved();
  } catch (error) {
    console.error('[TranscriptEditor] Error saving transcript:', error);
    
    // Show user-friendly error message
    let errorMessage = 'Failed to save transcript. Please try again.';
    
    if (error instanceof Error) {
      if (error.message.includes('Property not found')) {
        errorMessage = 'Property not found. Please refresh and try again.';
      } else if (error.message.includes('restricted')) {
        errorMessage = 'Cannot save transcript for restricted property.';
      } else if (error.message.includes('validation')) {
        errorMessage = 'Please check all fields and try again.';
      }
    }
    
    setErrors({ general: errorMessage });
  } finally {
    setSaving(false);
  }
};

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4">
          <div className="animate-pulse">
            <div className="h-6 bg-gray-200 rounded mb-4"></div>
            <div className="h-4 bg-gray-200 rounded mb-2"></div>
            <div className="h-4 bg-gray-200 rounded mb-2"></div>
            <div className="h-4 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Edit3 className="w-8 h-8" />
              <div>
                <h2 className="text-xl font-bold">
                  {transcript ? 'Edit Transcript' : 'Create Transcript'}
                </h2>
                <p className="text-purple-100 text-sm">Configure landlord remittance details</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Month Navigation */}
              <div className="flex items-center gap-1 bg-white/10 rounded-lg p-1">
                <button
                  onClick={() => navigateMonth('prev')}
                  className="p-1 hover:bg-white/20 rounded transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-medium px-3 min-w-[120px] text-center">
                  {getMonthName(currentMonth)}
                </span>
                <button
                  onClick={() => navigateMonth('next')}
                  className="p-1 hover:bg-white/20 rounded transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          {/* General Error */}
          {errors.general && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-red-800">{errors.general}</p>
            </div>
          )}

          {/* Property Information */}
          {property && (
            <div className="bg-blue-50 rounded-xl p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Property Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="font-medium text-gray-700">Property Name:</span>
                  <div className="text-gray-900">{property.name}</div>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Commission Rate:</span>
                  <div className="text-gray-900">{property.agentCommissionRate}%</div>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Billing Period:</span>
                  <div className="text-gray-900">{getMonthName(currentMonth)}</div>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Status:</span>
                  <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                    transcript 
                      ? transcript.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                        transcript.status === 'finalized' ? 'bg-blue-100 text-blue-800' :
                        transcript.status === 'sent' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {transcript ? (
                      <>
                        <CheckCircle className="w-3 h-3" />
                        {transcript.status.charAt(0).toUpperCase() + transcript.status.slice(1)}
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3 h-3" />
                        New
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Landlord Information */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
              <User className="w-5 h-5" />
              Landlord Information
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Landlord Name *
                </label>
                <input
                  type="text"
                  value={formData.landlordName}
                  onChange={(e) => setFormData({ ...formData, landlordName: e.target.value })}
                  className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all ${
                    errors.landlordName ? 'border-red-500' : 'border-gray-200'
                  }`}
                  placeholder="Enter landlord's full name"
                />
                {errors.landlordName && (
                  <p className="text-red-500 text-sm mt-1">{errors.landlordName}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contact Information
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={formData.landlordContact}
                    onChange={(e) => setFormData({ ...formData, landlordContact: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    placeholder="Phone number or email"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Utility Items */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Droplets className="w-5 h-5" />
              Utility Charges
            </h3>
            
            {utilityItems.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <div className="flex justify-center gap-2 mb-4">
                  <Droplets className="w-12 h-12 text-gray-300" />
                  <Zap className="w-12 h-12 text-gray-300" />
                </div>
                <p className="text-lg font-medium mb-2">No Utility Charges</p>
                <p className="text-sm">No water or power charges found for this billing period.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {utilityItems.map((item) => (
                  <div key={item.id} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-4">
                      {item.type === 'water' ? (
                        <Droplets className="w-5 h-5 text-blue-600" />
                      ) : (
                        <Zap className="w-5 h-5 text-yellow-600" />
                      )}
                      <span className="font-medium text-gray-900 capitalize">{item.type} Charges</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                      <div className="md:col-span-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Description *
                        </label>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateUtilityItem(item.id, { description: e.target.value })}
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all ${
                            errors[`utility-${item.id}-description`] ? 'border-red-500' : 'border-gray-200'
                          }`}
                          placeholder={`${item.type.charAt(0).toUpperCase() + item.type.slice(1)} Charges`}
                        />
                        {errors[`utility-${item.id}-description`] && (
                          <p className="text-red-500 text-xs mt-1">{errors[`utility-${item.id}-description`]}</p>
                        )}
                      </div>

                      <div className="md:col-span-3">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Amount *
                        </label>
                        <input
                          type="number"
                          value={item.amount}
                          onChange={(e) => updateUtilityItem(item.id, { amount: Number(e.target.value) })}
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all ${
                            errors[`utility-${item.id}-amount`] ? 'border-red-500' : 'border-gray-200'
                          }`}
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                        />
                        {errors[`utility-${item.id}-amount`] && (
                          <p className="text-red-500 text-xs mt-1">{errors[`utility-${item.id}-amount`]}</p>
                        )}
                      </div>

                      <div className="md:col-span-5">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Payment Responsibility
                        </label>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`utility-${item.id}-responsibility`}
                              checked={item.isRemittedToLandlord}
                              onChange={() => updateUtilityItem(item.id, { isRemittedToLandlord: true })}
                              className="text-purple-600 focus:ring-purple-500"
                            />
                            <span className="text-sm">Remit to Landlord</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`utility-${item.id}-responsibility`}
                              checked={!item.isRemittedToLandlord}
                              onChange={() => updateUtilityItem(item.id, { isRemittedToLandlord: false })}
                              className="text-purple-600 focus:ring-purple-500"
                            />
                            <span className="text-sm">Agent Pays</span>
                          </label>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {item.isRemittedToLandlord 
                            ? 'This amount will be added to landlord payment' 
                            : 'This amount will be deducted as agent expense'
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Custom Items */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Custom Items & Deductions
              </h3>
              <button
                onClick={addCustomItem}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Item
              </button>
            </div>

            {customItems.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <DollarSign className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-lg font-medium mb-2">No Custom Items</p>
                <p className="text-sm">Add deductions, expenses, or other custom items to the transcript.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {customItems.map((item, index) => (
                  <div key={item.id} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <GripVertical className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-gray-900">Item {index + 1}</span>
                      <button
                        onClick={() => removeCustomItem(item.id)}
                        className="ml-auto p-1 text-red-600 hover:bg-red-100 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                      <div className="md:col-span-5">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Description *
                        </label>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateCustomItem(item.id, { description: e.target.value })}
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all ${
                            errors[`item-${item.id}-description`] ? 'border-red-500' : 'border-gray-200'
                          }`}
                          placeholder="e.g., Maintenance, Repairs, etc."
                        />
                        {errors[`item-${item.id}-description`] && (
                          <p className="text-red-500 text-xs mt-1">{errors[`item-${item.id}-description`]}</p>
                        )}
                      </div>

                      <div className="md:col-span-3">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Amount *
                        </label>
                        <input
                          type="number"
                          value={item.amount}
                          onChange={(e) => updateCustomItem(item.id, { amount: Number(e.target.value) })}
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all ${
                            errors[`item-${item.id}-amount`] ? 'border-red-500' : 'border-gray-200'
                          }`}
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                        />
                        {errors[`item-${item.id}-amount`] && (
                          <p className="text-red-500 text-xs mt-1">{errors[`item-${item.id}-amount`]}</p>
                        )}
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Type
                        </label>
                        <select
                          value={item.type}
                          onChange={(e) => updateCustomItem(item.id, { 
                            type: e.target.value as 'deductible' | 'income',
                            isDeductible: e.target.value === 'deductible'
                          })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                        >
                          <option value="deductible">Deduction</option>
                          <option value="income">Income</option>
                        </select>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Category
                        </label>
                        <input
                          type="text"
                          value={item.category}
                          onChange={(e) => updateCustomItem(item.id, { category: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                          placeholder="Optional"
                        />
                      </div>
                    </div>
                    
                    {/* Type explanation */}
                    <div className="mt-2 text-xs text-gray-500">
                      {item.type === 'deductible' ? (
                        <span className="text-red-600">
                          ⚠️ This amount will be deducted from the landlord payment
                        </span>
                      ) : (
                        <span className="text-green-600">
                          ✓ This amount will be added to the landlord payment
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Additional Notes
            </h3>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={4}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all resize-none"
              placeholder="Add any additional notes or comments for the landlord..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 p-6 flex-shrink-0">
          <div className="flex flex-wrap gap-3 justify-end">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-6 py-3 text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {transcript ? 'Update Transcript' : 'Create Transcript'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TranscriptEditor;
