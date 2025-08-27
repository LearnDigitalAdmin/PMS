import React, { memo } from 'react';
import { X, ImageIcon } from 'lucide-react';

interface PropertyFormData {
  name: string;
  address: string;
  description: string;
  agentCommissionRate: number;
  maxUnits: number;
  image: string;
  companyId?: number;
}

interface PropertyModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  onSubmit: () => void;
  formData: PropertyFormData;
  setFormData: (data: PropertyFormData) => void;
  formErrors: Partial<PropertyFormData>;
  companies: any[];
  imagePreview: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  removeImage: () => void;
  MAX_FREE_UNITS: number;
}

const PropertyModal: React.FC<PropertyModalProps> = memo(({
  isOpen,
  onClose,
  title,
  onSubmit,
  formData,
  setFormData,
  formErrors,
  companies,
  imagePreview,
  fileInputRef,
  handleImageUpload,
  removeImage,
  MAX_FREE_UNITS
}) => {
  if (!isOpen) return null;

  const handleInputChange = (field: keyof PropertyFormData, value: string | number | undefined) => {
    setFormData({ ...formData, [field]: value });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg transform transition-all max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div className="p-6 space-y-4">
          {/* Company Selection */}
          {companies && companies.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company (Optional)
              </label>
              <select
                value={formData.companyId || ''}
                onChange={(e) => handleInputChange('companyId', e.target.value ? Number(e.target.value) : undefined)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              >
                <option value="">Select Company (Optional)</option>
                {companies.map((company: any) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Property Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Property Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                formErrors.name ? 'border-red-500' : 'border-gray-200'
              }`}
              placeholder="Enter property name"
              autoComplete="off"
            />
            {formErrors.name && (
              <p className="text-red-500 text-sm mt-1">{formErrors.name}</p>
            )}
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Address
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => handleInputChange('address', e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              placeholder="Enter property address"
              autoComplete="off"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
              placeholder="Enter property description"
            />
          </div>

          {/* Max Units */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Maximum Units *
            </label>
            <input
              type="number"
              value={formData.maxUnits}
              onChange={(e) => handleInputChange('maxUnits', Number(e.target.value))}
              min="1"
              max={MAX_FREE_UNITS}
              className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                formErrors.maxUnits ? 'border-red-500' : 'border-gray-200'
              }`}
              placeholder="1"
            />
            {formErrors.maxUnits && (
              <p className="text-red-500 text-sm mt-1">{formErrors.maxUnits}</p>
            )}
            <p className="text-gray-500 text-xs mt-1">Maximum {MAX_FREE_UNITS} units allowed</p>
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Property Image
            </label>
            
            {imagePreview ? (
              <div className="relative">
                <img 
                  src={imagePreview} 
                  alt="Property preview"
                  className="w-full h-48 object-cover rounded-xl border border-gray-200"
                />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-48 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all"
              >
                <ImageIcon className="w-12 h-12 text-gray-400 mb-2" />
                <p className="text-gray-500 text-sm font-medium">Click to upload image</p>
                <p className="text-gray-400 text-xs mt-1">Max 2MB • JPG, PNG, GIF</p>
              </div>
            )}
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>

          {/* Agent Commission Rate */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Agent Commission Rate (%)
            </label>
            <input
              type="number"
              value={formData.agentCommissionRate}
              onChange={(e) => handleInputChange('agentCommissionRate', Number(e.target.value))}
              min="0"
              max="50"
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

        <div className="p-6 bg-gray-50 rounded-b-2xl flex gap-3 sticky bottom-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-medium"
          >
            {title.includes('Add') ? 'Add Property' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
});

PropertyModal.displayName = 'PropertyModal';

export default PropertyModal;