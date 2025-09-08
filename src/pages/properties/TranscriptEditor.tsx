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
  GripVertical
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

interface CustomItem {
  id: string;
  description: string;
  amount: number;
  type: 'deductible' | 'custom';
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

        // Load custom items (excluding auto-generated ones)
        const customTranscriptItems = transcriptWithDetails.items
          .filter(item => !['rent', 'water', 'power'].includes(item.type) || item.type === 'custom')
          .map(item => ({
            id: item.id.toString(),
            description: item.description,
            amount: item.amount,
            type: item.isDeductible ? 'deductible' as const : 'custom' as const,
            category: item.category || '',
            isDeductible: item.isDeductible,
            isNew: false
          }));
        
        setCustomItems(customTranscriptItems);
      } else {
        // New transcript - set default landlord name from property if available
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

    // Validate custom items
    customItems.forEach((item, _index) => {
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

      const customItemsInput: TranscriptItemInput[] = customItems.map(item => ({
        transcriptId: 0, // Will be set during creation
        description: item.description,
        amount: item.amount,
        type: item.type,
        category: item.category,
        isDeductible: item.isDeductible
      }));

      const transcriptInput: MonthlyTranscriptInput = {
        propertyId,
        billingMonth: currentMonth,
        landlordName: formData.landlordName,
        landlordContact: formData.landlordContact || undefined,
        notes: formData.notes || undefined,
        customItems: customItemsInput
      };

      if (transcript) {
        // Update existing transcript
        // First update the basic transcript info
        await reportsDatabase.updateTranscriptStatus(
          transcript.id, 
          transcript.status, 
          formData.notes
        );

        // Handle custom items updates
        for (const item of customItems) {
          if (item.isNew) {
            // Add new item
            await reportsDatabase.addTranscriptItem({
              transcriptId: transcript.id,
              description: item.description,
              amount: item.amount,
              type: item.type,
              category: item.category,
              isDeductible: item.isDeductible
            });
          } else {
            // Update existing item
            await reportsDatabase.updateTranscriptItem(parseInt(item.id), {
              description: item.description,
              amount: item.amount,
              type: item.type,
              category: item.category,
              isDeductible: item.isDeductible
            });
          }
        }

        // Remove deleted items (items that were in original transcript but not in current customItems)
        const originalCustomItems = transcript.items.filter(item => 
          !['rent', 'water', 'power'].includes(item.type) || item.type === 'custom'
        );
        
        for (const originalItem of originalCustomItems) {
          const stillExists = customItems.some(item => 
            !item.isNew && item.id === originalItem.id.toString()
          );
          if (!stillExists) {
            await reportsDatabase.deleteTranscriptItem(originalItem.id);
          }
        }
      } else {
        // Create new transcript
        await reportsDatabase.generateMonthlyTranscript(transcriptInput, userId);
      }

      onSaved();
    } catch (error) {
      console.error('Error saving transcript:', error);
      setErrors({ general: 'Failed to save transcript. Please try again.' });
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
                            type: e.target.value as 'deductible' | 'custom',
                            isDeductible: e.target.value === 'deductible'
                          })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                        >
                          <option value="deductible">Deduction</option>
                          <option value="custom">Income</option>
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