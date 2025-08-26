import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Grid, 
  List, 
  Building2, 
  Users, 
  DollarSign, 
  TrendingUp,
  Edit3,
  Trash2,
  RefreshCw,
  Home,
  MapPin,
  //Calendar
} from 'lucide-react';
import { database, type PropertyWithTenants, type PropertyInput } from '../../services/database/Database';

interface PropertyListProps {
  onNavigateToProperty: (property: PropertyWithTenants) => void;
  currentUserId: number;
  userPlan: 'free' | 'premium';
}

interface PropertyFormData {
  name: string;
  address: string;
  description: string;
  agentCommissionRate: number;
}

const PropertyList: React.FC<PropertyListProps> = ({ 
  onNavigateToProperty, 
  currentUserId,
  userPlan 
}) => {
  const [properties, setProperties] = useState<PropertyWithTenants[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<PropertyWithTenants | null>(null);
  const [formData, setFormData] = useState<PropertyFormData>({
    name: '',
    address: '',
    description: '',
    agentCommissionRate: 0
  });
  const [formErrors, setFormErrors] = useState<Partial<PropertyFormData>>({});

  const MAX_FREE_PROPERTIES = 3;
  const canAddProperty = userPlan === 'premium' || properties.length < MAX_FREE_PROPERTIES;

  useEffect(() => {
    loadProperties();
  }, [currentUserId]);

  const loadProperties = async () => {
    try {
      setLoading(true);
      const data = await database.getPropertiesWithTenants(currentUserId);
      setProperties(data);
    } catch (error) {
      console.error('Error loading properties:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadProperties();
    setRefreshing(false);
  };

  const filteredProperties = properties.filter(property =>
    property.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (property.address && property.address.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const resetForm = () => {
    setFormData({
      name: '',
      address: '',
      description: '',
      agentCommissionRate: 0
    });
    setFormErrors({});
  };

  const validateForm = (): boolean => {
    const errors: Partial<PropertyFormData> = {};
    
    if (!formData.name.trim()) {
      errors.name = 'Property name is required';
    }
    
    if (formData.agentCommissionRate < 0 || formData.agentCommissionRate > 50) {
      //errors.agentCommissionRate = 'Commission rate must be between 0% and 50%';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddProperty = async () => {
    if (!validateForm()) return;

    try {
      const propertyInput: PropertyInput = {
        userId: currentUserId,
        name: formData.name.trim(),
        address: formData.address.trim() || undefined,
        description: formData.description.trim() || undefined,
        agentCommissionRate: formData.agentCommissionRate
      };

      await database.createProperty(propertyInput);
      await loadProperties();
      setShowAddModal(false);
      resetForm();
    } catch (error) {
      console.error('Error creating property:', error);
    }
  };

  const handleEditProperty = async () => {
    if (!validateForm() || !selectedProperty) return;

    try {
      await database.updateProperty(selectedProperty.id, {
        name: formData.name.trim(),
        address: formData.address.trim() || undefined,
        description: formData.description.trim() || undefined,
        agentCommissionRate: formData.agentCommissionRate
      });

      await loadProperties();
      setShowEditModal(false);
      setSelectedProperty(null);
      resetForm();
    } catch (error) {
      console.error('Error updating property:', error);
    }
  };

  const handleDeleteProperty = async () => {
    if (!selectedProperty) return;

    try {
      await database.deleteProperty(selectedProperty.id);
      await loadProperties();
      setShowDeleteModal(false);
      setSelectedProperty(null);
    } catch (error) {
      console.error('Error deleting property:', error);
    }
  };

  const openEditModal = (property: PropertyWithTenants) => {
    setSelectedProperty(property);
    setFormData({
      name: property.name,
      address: property.address || '',
      description: property.description || '',
      agentCommissionRate: property.agentCommissionRate
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (property: PropertyWithTenants) => {
    setSelectedProperty(property);
    setShowDeleteModal(true);
  };

  const PropertyCard: React.FC<{ property: PropertyWithTenants }> = ({ property }) => {
    const occupancyPercentage = property.occupancyRate;
    const occupancyColor = occupancyPercentage >= 80 ? 'text-green-600' : 
                          occupancyPercentage >= 50 ? 'text-yellow-600' : 'text-red-600';

    return (
      <div 
        className="group bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 border border-gray-100 overflow-hidden cursor-pointer"
        onClick={() => onNavigateToProperty(property)}
      >
        {/* Property Image Placeholder */}
        <div className="h-48 bg-gradient-to-br from-blue-500 via-blue-600 to-purple-600 relative overflow-hidden">
          <div className="absolute inset-0 bg-black bg-opacity-20"></div>
          <div className="absolute top-4 right-4 flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                openEditModal(property);
              }}
              className="p-2 bg-white bg-opacity-20 backdrop-blur-sm rounded-lg hover:bg-opacity-30 transition-all"
            >
              <Edit3 className="w-4 h-4 text-white" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                openDeleteModal(property);
              }}
              className="p-2 bg-white bg-opacity-20 backdrop-blur-sm rounded-lg hover:bg-opacity-30 transition-all"
            >
              <Trash2 className="w-4 h-4 text-white" />
            </button>
          </div>
          <div className="absolute bottom-4 left-4 text-white">
            <Building2 className="w-8 h-8 mb-2 opacity-80" />
            <h3 className="text-xl font-bold">{property.name}</h3>
            {property.address && (
              <div className="flex items-center mt-1 opacity-90">
                <MapPin className="w-3 h-3 mr-1" />
                <p className="text-sm truncate">{property.address}</p>
              </div>
            )}
          </div>
        </div>

        {/* Property Details */}
        <div className="p-6">
          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <Users className="w-4 h-4 text-blue-600 mr-1" />
                <span className="text-2xl font-bold text-gray-900">
                  {property.tenants.length}
                </span>
              </div>
              <p className="text-xs text-gray-500 font-medium">Tenants</p>
            </div>
            
            <div className="text-center border-x border-gray-100">
              <div className="flex items-center justify-center mb-1">
                <DollarSign className="w-4 h-4 text-green-600 mr-1" />
                <span className="text-2xl font-bold text-gray-900">
                  ${property.monthlyRevenue.toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-gray-500 font-medium">Monthly</p>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <TrendingUp className={`w-4 h-4 mr-1 ${occupancyColor}`} />
                <span className={`text-2xl font-bold ${occupancyColor}`}>
                  {occupancyPercentage.toFixed(0)}%
                </span>
              </div>
              <p className="text-xs text-gray-500 font-medium">Occupied</p>
            </div>
          </div>

          {/* Description */}
          {property.description && (
            <p className="text-sm text-gray-600 mb-4 line-clamp-2">
              {property.description}
            </p>
          )}

          {/* Commission Badge */}
          {property.agentCommissionRate > 0 && (
            <div className="inline-flex items-center px-3 py-1 bg-orange-100 text-orange-800 text-xs font-medium rounded-full">
              <TrendingUp className="w-3 h-3 mr-1" />
              {property.agentCommissionRate}% Commission
            </div>
          )}
        </div>
      </div>
    );
  };

  const PropertyListItem: React.FC<{ property: PropertyWithTenants }> = ({ property }) => {
    const occupancyPercentage = property.occupancyRate;
    const occupancyColor = occupancyPercentage >= 80 ? 'text-green-600' : 
                          occupancyPercentage >= 50 ? 'text-yellow-600' : 'text-red-600';

    return (
      <div 
        className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 border border-gray-100 p-4 cursor-pointer"
        onClick={() => onNavigateToProperty(property)}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 truncate">
                  {property.name}
                </h3>
                {property.address && (
                  <p className="text-sm text-gray-500 truncate mt-1">
                    <MapPin className="w-3 h-3 inline mr-1" />
                    {property.address}
                  </p>
                )}
              </div>
              <div className="flex gap-2 ml-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditModal(property);
                  }}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openDeleteModal(property);
                  }}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center text-gray-600">
                <Users className="w-4 h-4 mr-1" />
                <span className="font-medium">{property.tenants.length}</span>
                <span className="ml-1">tenants</span>
              </div>
              
              <div className="flex items-center text-gray-600">
                <DollarSign className="w-4 h-4 mr-1" />
                <span className="font-medium">${property.monthlyRevenue.toLocaleString()}</span>
                <span className="ml-1">monthly</span>
              </div>
              
              <div className={`flex items-center ${occupancyColor}`}>
                <TrendingUp className="w-4 h-4 mr-1" />
                <span className="font-medium">{occupancyPercentage.toFixed(0)}%</span>
                <span className="ml-1">occupied</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const SkeletonCard = () => (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-pulse">
      <div className="h-48 bg-gray-200"></div>
      <div className="p-6">
        <div className="grid grid-cols-3 gap-4 mb-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="text-center">
              <div className="h-8 bg-gray-200 rounded mb-1"></div>
              <div className="h-3 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
        <div className="h-4 bg-gray-200 rounded mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
      </div>
    </div>
  );

  const PropertyModal: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    title: string; 
    onSubmit: () => void;
  }> = ({ isOpen, onClose, title, onSubmit }) => {
    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md transform transition-all">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
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
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Home className="w-6 h-6 text-blue-600 mr-3" />
              <h1 className="text-xl font-bold text-gray-900">Properties</h1>
              <span className="ml-3 px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
                {properties.length} {properties.length === 1 ? 'Property' : 'Properties'}
              </span>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search properties..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all w-64"
                />
              </div>

              {/* View Toggle */}
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-md transition-all ${
                    viewMode === 'grid' 
                      ? 'bg-white text-blue-600 shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Grid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-md transition-all ${
                    viewMode === 'list' 
                      ? 'bg-white text-blue-600 shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>

              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
              >
                <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className={`grid gap-6 ${
            viewMode === 'grid' 
              ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' 
              : 'grid-cols-1'
          }`}>
            {[...Array(6)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filteredProperties.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-blue-100 to-purple-100 rounded-2xl flex items-center justify-center">
              <Building2 className="w-12 h-12 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">
              {properties.length === 0 ? 'No Properties Yet' : 'No Properties Found'}
            </h3>
            <p className="text-gray-500 mb-8 max-w-md mx-auto">
              {properties.length === 0 
                ? 'Start by adding your first property to begin managing tenants and billing.'
                : `No properties match "${searchTerm}". Try adjusting your search.`
              }
            </p>
            {properties.length === 0 && canAddProperty && (
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-all transform hover:scale-105"
              >
                <Plus className="w-5 h-5 mr-2" />
                Add Your First Property
              </button>
            )}
          </div>
        ) : (
          <div className={`grid gap-6 ${
            viewMode === 'grid' 
              ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' 
              : 'grid-cols-1'
          }`}>
            {filteredProperties.map((property, index) => (
              <div
                key={property.id}
                className="animate-fade-in-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {viewMode === 'grid' ? (
                  <PropertyCard property={property} />
                ) : (
                  <PropertyListItem property={property} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      {canAddProperty && (
        <button
          onClick={() => setShowAddModal(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xl hover:shadow-2xl transition-all transform hover:scale-110 flex items-center justify-center z-40"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Upgrade Notice for Free Users */}
      {!canAddProperty && (
        <div className="fixed bottom-6 right-6 bg-white rounded-xl shadow-xl border border-gray-200 p-4 max-w-sm z-40">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-pink-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900 text-sm">Property Limit Reached</h4>
              <p className="text-gray-600 text-xs mt-1">
                Upgrade to Premium to add unlimited properties
              </p>
              <button className="mt-2 text-blue-600 text-xs font-medium hover:text-blue-700">
                Upgrade Now →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <PropertyModal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          resetForm();
        }}
        title="Add New Property"
        onSubmit={handleAddProperty}
      />

      <PropertyModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setSelectedProperty(null);
          resetForm();
        }}
        title="Edit Property"
        onSubmit={handleEditProperty}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedProperty && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 text-center mb-2">
                Delete Property
              </h3>
              <p className="text-gray-600 text-center mb-6">
                Are you sure you want to delete "{selectedProperty.name}"? This will also delete all associated tenants and invoices. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setSelectedProperty(null);
                  }}
                  className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteProperty}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fade-in-up {
          animation: fade-in-up 0.6s ease-out forwards;
        }
        
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
};

export default PropertyList;