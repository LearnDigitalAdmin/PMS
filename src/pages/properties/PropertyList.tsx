import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  MapPin} from 'lucide-react';
import { database, type PropertyWithUnits, type PropertyInput, type User } from '../../services/database/Database';
import Property from './Properties';
import PropertyModal from './PropertyModal';
import { USER_LIMITS } from '../../services/database/FirebaseSync';
import PricingModal from '../../components/ui/PricingPage';
import SummariesModal from './Summaries';
import TrialStatsBanner from '../../components/ui/TrialStatsBanner';

interface PropertyListProps {
  onNavigateToProperty: (property: PropertyWithUnits) => void;
  currentUserId: number;
  user: User | null;
}

interface PropertyFormData {
  name: string;
  address: string;
  description: string;
  agentCommissionRate: number;
  maxUnits: number;
  image: string;
  companyId?: number;
}

interface EnhancedProperty extends PropertyWithUnits {
  tenants: any[];
  monthlyRevenue: number;
  occupancyRate: number;
  agentIncome: number;
  activeTenants: number;
}

const Properties: React.FC<PropertyListProps> = ({ 
  currentUserId,
  user 
}) => {
  const [properties, setProperties] = useState<EnhancedProperty[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<EnhancedProperty | null>(null);
  const [showPropModal, setShowPropModal] = useState(false);
  const [propertyId, setPropertyId] = useState<number>(0);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showSummariesModal, setShowSummariesModal] = useState(false);
  const [formData, setFormData] = useState<PropertyFormData>({
    name: '',
    address: '',
    description: '',
    agentCommissionRate: 0,
    maxUnits: 12,
    image: '',
    companyId: undefined
  });
  const [formErrors, setFormErrors] = useState<Partial<PropertyFormData>>({});
  
  // Image handling refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string>('');

  const canSeeSummary = user?.tier === 'enterprise' || user?.tier === 'pro';


  const MAX_FREE_UNITS = USER_LIMITS[user!.tier].tenantsPerProperty;;
  const canAddProperty = user!.tier === 'enterprise' || 
  properties.length < USER_LIMITS[user!.tier].properties;

  const handlePricingModalClose = (planSelected?: string) => {
    setShowPricingModal(false);
    // Plan selection logic can be added here later
    console.log('Plan selected from profile:', planSelected);
  };

  useEffect(() => {
    loadProperties();
    loadCompanies();
  }, [currentUserId]);

  const loadProperties = useCallback(async () => {
    try {
      setLoading(true);
      const propertiesData = await database.getPropertiesWithUnits(currentUserId);
      
      // Enhance each property with calculated data similar to Properties.tsx
      const enhancedProperties = await Promise.all(
        propertiesData.map(async (property) => {
          try {
            // Get tenants for this property
            const tenants = await database.getTenantsByProperty(property.id);
            
            // Calculate monthly revenue from tenants
            const monthlyRevenue = tenants.reduce((sum: number, tenant: { rentAmount: number }) => sum + tenant.rentAmount, 0);
            
            // Calculate agent income
            const agentIncome = monthlyRevenue * (property.agentCommissionRate / 100);
            
            // Calculate occupancy rate: (occupied units / max units) * 100
            const activeTenants = tenants.filter((t: { isActive: boolean }) => t.isActive).length;
            const occupancyRate = property.maxUnits > 0 ? (activeTenants / property.maxUnits) * 100 : 0;

            return {
              ...property,
              tenants,
              monthlyRevenue,
              agentIncome,
              occupancyRate,
              activeTenants
            } as EnhancedProperty;
          } catch (error) {
            console.error(`Error loading data for property ${property.id}:`, error);
            // Return property with default values if error occurs
            return {
              ...property,
              tenants: [],
              monthlyRevenue: 0,
              agentIncome: 0,
              occupancyRate: 0,
              activeTenants: 0
            } as EnhancedProperty;
          }
        })
      );
      
      setProperties(enhancedProperties);
    } catch (error) {
      console.error('Error loading properties:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  const loadCompanies = useCallback(async () => {
    try {
      const data = localStorage.getItem('currentCompany');
      if (data) {
        const company = JSON.parse(data);
        setCompanies([company]);
      } else {
        setCompanies([]);
      }
    } catch (error) {
      console.error('Error loading companies:', error);
      setCompanies([]);
    }
  }, [currentUserId]);

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
      agentCommissionRate: 0,
      maxUnits: 12,
      image: '',
      companyId: undefined
    });
    setFormErrors({});
    setImagePreview('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const validateForm = (): boolean => {
    const errors: Partial<PropertyFormData> = {};
    
    if (!formData.name.trim()) {
      errors.name = 'Property name is required';
    }
    
    if (formData.agentCommissionRate < 0 || formData.agentCommissionRate > 50) {
      //errors.agentCommissionRate = 'Commission rate must be between 0% and 50%';
    }

    if (formData.maxUnits < 1 || formData.maxUnits > MAX_FREE_UNITS) {
      //errors.maxUnits = `Units must be between 1 and ${MAX_FREE_UNITS}`;
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('Image size must be less than 2MB');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setFormData({ ...formData, image: result });
      setImagePreview(result);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setFormData({ ...formData, image: '' });
    setImagePreview('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAddProperty = async () => {
    if (!validateForm()) return;

    try {
      const propertyInput: PropertyInput = {
        userId: currentUserId,
        companyId: formData.companyId,
        name: formData.name.trim(),
        address: formData.address.trim() || undefined,
        description: formData.description.trim() || undefined,
        image: formData.image || undefined,
        agentCommissionRate: formData.agentCommissionRate,
        maxUnits: formData.maxUnits
      };

      await database.createProperty(propertyInput);
      await loadProperties();
      setShowAddModal(false);
      console.log('Property created successfully', propertyInput);
      resetForm();
    } catch (error) {
      console.error('Error creating property:', error);
    }
  };

  const handleEditProperty = async () => {
    if (!validateForm() || !selectedProperty) return;

    try {
      await database.updateProperty(selectedProperty.id, {
        companyId: formData.companyId,
        name: formData.name.trim(),
        address: formData.address.trim() || undefined,
        description: formData.description.trim() || undefined,
        image: formData.image || undefined,
        agentCommissionRate: formData.agentCommissionRate,
        maxUnits: formData.maxUnits
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
      await database.deleteProperty(selectedProperty.id, user!.id);
      await loadProperties();
      setShowDeleteModal(false);
      setSelectedProperty(null);
    } catch (error) {
      console.error('Error deleting property:', error);
    }
  };

  const openEditModal = (property: EnhancedProperty) => {
    setSelectedProperty(property);
    setFormData({
      name: property.name,
      address: property.address || '',
      description: property.description || '',
      agentCommissionRate: property.agentCommissionRate,
      maxUnits: property.maxUnits,
      image: property.image || '',
      companyId: property.companyId
    });
    setImagePreview(property.image || '');
    setShowEditModal(true);
  };

  const openDeleteModal = (property: EnhancedProperty) => {
    setSelectedProperty(property);
    setShowDeleteModal(true);
  };

  const getOccupancyColor = (rate: number) => {
    if (rate >= 80) return 'text-green-600 bg-green-50';
    if (rate >= 50) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const handleProperty = (propertyId: number) => {
    setPropertyId(propertyId);
    setShowPropModal(true);
  };

  const handleCloseModal = () => {
    setPropertyId(0);
    setShowPropModal(false);
  };

  const handleCloseAddModal = () => {
    setShowAddModal(false);
    resetForm();
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setSelectedProperty(null);
    resetForm();
  };

  const PropertyCard: React.FC<{ property: EnhancedProperty; index: number }> = ({ property, index }) => {
    const occupancyPercentage = property.occupancyRate;

    return (
      <div 
        className="group bg-white rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-100 overflow-hidden cursor-pointer animate-fade-in"
        style={{ animationDelay: `${index * 100}ms` }}
        onClick={() => handleProperty(property.id)}
      >
        {/* Property Image */}
        <div className="h-48 bg-gradient-to-br from-white-500 via-blue-600 to-grey-600 relative overflow-hidden">
          {property.image ? (
            <img 
              src={property.image} 
              alt={property.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-blue-600 to-purple-600"></div>
          )}
          <div className="absolute inset-0 bg-black bg-opacity-20"></div>
          <div className="absolute top-4 right-4 flex gap-2 opacity-70 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                openEditModal(property);
              }}
              className="p-2 bg-white bg-opacity-20 backdrop-blur-sm rounded-lg hover:bg-opacity-30 transition-all"
            >
              <Edit3 className="w-4 h-4 text-blue" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                openDeleteModal(property);
              }}
              className="p-2 bg-white bg-opacity-20 backdrop-blur-sm rounded-lg hover:bg-opacity-30 transition-all"
            >
              <Trash2 className="w-4 h-4 text-red" />
            </button>
          </div>
          <div className="absolute bottom-4 left-4 text-white">
            <Building2 className="w-8 h-8 mb-2 opacity-80" />
            <h3 className="text-xl font-bold truncate max-w-[250px]">{property.name}</h3>
            {property.address && (
              <div className="flex items-center mt-1 opacity-90">
                <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                <p className="text-sm truncate max-w-[200px]">{property.address}</p>
              </div>
            )}
          </div>
        </div>

        {/* Property Details */}
        <div className="p-6" onClick={() => handleProperty(property.id)}>
          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <Users className="w-4 h-4 text-blue-600 mr-1" />
                <span className="text-2xl font-bold text-gray-900">
                  {property.activeTenants}
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
                <TrendingUp className={`w-4 h-4 mr-1 ${occupancyPercentage >= 80 ? 'text-green-600' : occupancyPercentage >= 50 ? 'text-yellow-600' : 'text-red-600'}`} />
                <span className={`text-2xl font-bold ${occupancyPercentage >= 80 ? 'text-green-600' : occupancyPercentage >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {occupancyPercentage.toFixed(0)}%
                </span>
              </div>
              <p className="text-xs text-gray-500 font-medium">Occupied</p>
            </div>
          </div>

          {/* Units Info */}
          <div className="mb-4 text-sm text-gray-600">
            <div className="flex justify-between items-center">
              <span>Units: {property.activeTenants}/{property.maxUnits}</span>
              {property.companyId && (
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                  Company Property
                </span>
              )}
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
              {property.agentCommissionRate}% Commission (${property.agentIncome.toLocaleString()}/month)
            </div>
          )}
        </div>
      </div>
    );
  };

  const PropertyListItem: React.FC<{ property: EnhancedProperty; index: number }> = ({ property, index }) => {
    const occupancyPercentage = property.occupancyRate;

    return (
      <div 
        className="group bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 border border-gray-100 p-4 cursor-pointer animate-fade-in"
        style={{ animationDelay: `${index * 50}ms` }}
        onClick={() => handleProperty(property.id)}
      >
        <div className="flex items-center gap-4">
          {/* Property Image Thumbnail */}
          <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
            {property.image ? (
              <img 
                src={property.image} 
                alt={property.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-white" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Property Info */}
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0 pr-4">
                <h3 className="text-lg font-semibold text-gray-900 truncate">
                  {property.name}
                </h3>
                {property.address && (
                  <p className="text-sm text-gray-500 truncate mt-1 flex items-center">
                    <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                    {property.address}
                  </p>
                )}
              </div>
              
              {/* Action Buttons */}
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
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

            {/* Stats Row */}
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center text-gray-600">
                <Users className="w-4 h-4 mr-1 flex-shrink-0" />
                <span className="font-medium">{property.activeTenants}</span>
                <span className="ml-1">tenants</span>
              </div>
              
              <div className="flex items-center text-gray-600">
                <DollarSign className="w-4 h-4 mr-1 flex-shrink-0" />
                <span className="font-medium">${property.monthlyRevenue.toLocaleString()}</span>
                <span className="ml-1">monthly</span>
              </div>
              
              <div className="flex items-center text-gray-600">
                <Building2 className="w-4 h-4 mr-1 flex-shrink-0" />
                <span className="font-medium">{property.activeTenants}/{property.maxUnits}</span>
                <span className="ml-1">units</span>
              </div>
              
              <div className={`flex items-center px-2 py-1 rounded-full text-xs font-medium ${getOccupancyColor(occupancyPercentage)}`}>
                <TrendingUp className="w-3 h-3 mr-1" />
                <span>{occupancyPercentage.toFixed(0)}% occupied</span>
              </div>

              {property.agentCommissionRate > 0 && (
                <div className="flex items-center px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-medium">
                  <span>{property.agentCommissionRate}% commission</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const LoadingSkeleton = () => (
    <div className="animate-pulse">
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="h-48 bg-gray-200"></div>
              <div className="p-6">
                <div className="grid grid-cols-3 gap-4 mb-4">
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="text-center">
                      <div className="h-8 bg-gray-200 rounded mb-1"></div>
                      <div className="h-3 bg-gray-200 rounded"></div>
                    </div>
                  ))}
                </div>
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-4 border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gray-200 rounded-lg flex-shrink-0"></div>
                <div className="flex-1">
                  <div className="h-6 bg-gray-200 rounded w-1/3 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2 mb-3"></div>
                  <div className="flex gap-6">
                    <div className="h-4 bg-gray-200 rounded w-20"></div>
                    <div className="h-4 bg-gray-200 rounded w-24"></div>
                    <div className="h-4 bg-gray-200 rounded w-20"></div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="w-8 h-8 bg-gray-200 rounded-lg"></div>
                  <div className="w-8 h-8 bg-gray-200 rounded-lg"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <Home className="w-6 h-6 text-blue-600 mr-3" />
              <h1 className="text-xl font-bold text-gray-900">{properties.length === 1 ? 'Property' : 'Properties'}</h1>
            </div>
            
            <div className="flex items-center gap-2">
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
                {canSeeSummary && (
                  <button
                  onClick={() => setShowSummariesModal(true)}
                  className={`p-2 rounded-md transition-all ${
                    viewMode === 'list' 
                      ? 'bg-white text-blue-600 shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
                )}
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

          {/* Search - Full width on mobile */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search properties..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>
        </div>
      </div>

      <div className="px-4 pt-4">
        <TrialStatsBanner userId={currentUserId} compact />
      </div>

      {/* Content */}
      <div className="px-4 py-6">
        {loading ? (
          <LoadingSkeleton />
        ) : filteredProperties.length === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-blue-100 to-purple-100 rounded-2xl flex items-center justify-center">
              <Building2 className="w-10 h-10 text-blue-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {properties.length === 0 ? 'No Properties Yet' : 'No Properties Found'}
            </h3>
            <p className="text-gray-500 mb-6 text-sm max-w-sm mx-auto">
              {properties.length === 0 
                ? 'Start by adding your first property to begin managing tenants and billing.'
                : `No properties match "${searchTerm}". Try adjusting your search.`
              }
            </p>
            {properties.length === 0 && canAddProperty && (
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-all"
              >
                <Plus className="w-5 h-5 mr-2" />
                Add Your First Property
              </button>
            )}
          </div>
        ) : (
          <div className={`${
            viewMode === 'grid' 
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4' 
              : 'space-y-3'
          }`}>
            {filteredProperties.map((property, index) => 
              viewMode === 'grid' ? (
                <PropertyCard key={property.id} property={property} index={index} />
              ) : (
                <PropertyListItem key={property.id} property={property} index={index} />
              )
            )}
          </div>
        )}
      </div>

      {/* Property Detail Modal */}
      {showPropModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[95vh] overflow-hidden">
            <Property
              propertyId={propertyId}
              userId={currentUserId}
              onCancel={handleCloseModal}
              isModal={true}
            />
          </div>
        </div>
      )}

      {/* Floating Action Button */}
      {canAddProperty && (
        <button
          onClick={() => setShowAddModal(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-40"
          style={{ marginBottom: '60px' }}
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Upgrade Notice for Free Users */}
      {!canAddProperty && (
        <div className="fixed bottom-17 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm bg-white rounded-xl shadow-xl border border-gray-200 p-4 z-40">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-pink-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-gray-900 text-sm">Property Limit Reached</h4>
              <p className="text-gray-600 text-xs mt-1">
                Upgrade plan to add more properties
              </p>
              <button onClick={() => setShowPricingModal(true)} className="mt-2 text-blue-600 text-xs font-medium hover:text-blue-700">
                Upgrade Now →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Property Form Modals */}
      <PropertyModal
        isOpen={showAddModal}
        onClose={handleCloseAddModal}
        title="Add New Property"
        onSubmit={handleAddProperty}
        formData={formData}
        setFormData={setFormData}
        formErrors={formErrors}
        companies={companies}
        imagePreview={imagePreview}
        fileInputRef={fileInputRef}
        handleImageUpload={handleImageUpload}
        removeImage={removeImage}
        MAX_FREE_UNITS={MAX_FREE_UNITS}
      />

      <PropertyModal
        isOpen={showEditModal}
        onClose={handleCloseEditModal}
        title="Edit Property"
        onSubmit={handleEditProperty}
        formData={formData}
        setFormData={setFormData}
        formErrors={formErrors}
        companies={companies}
        imagePreview={imagePreview}
        fileInputRef={fileInputRef}
        handleImageUpload={handleImageUpload}
        removeImage={removeImage}
        MAX_FREE_UNITS={MAX_FREE_UNITS}
      />

      {/* Pricing Modal */}
            <PricingModal
              isOpen={showPricingModal}
              onClose={handlePricingModalClose}
              canDismiss={true} // Can dismiss from profile page
              currentPlan={user?.tier || 'free'}
              userId={user?.id}
              userPhone={user?.phone}
            />

            <SummariesModal
              isOpen={showSummariesModal}
              onClose={() => setShowSummariesModal(false)}
              userId={currentUserId}
              properties={properties}
            />

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedProperty && (
        <div className="fixed bottom-17 inset-0 bg-white z-50 flex flex-col pb-5">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 text-center mb-2">
                Delete Property
              </h3>
              <p className="text-gray-600 text-center mb-6 text-sm">
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
    </div>
  );
};

export default Properties;