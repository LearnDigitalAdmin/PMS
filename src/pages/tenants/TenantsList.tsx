import React, { useState, useEffect } from 'react';
import { 
  Search, 
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
  TrendingUp,
  TrendingDown,
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Activity,
  Target,
  Award,
  MessageSquare
} from 'lucide-react';
import { database } from '../../services/database/Database';
import type { TenantWithInvoices } from '../../services/database/Database';
import AddTenant from './AddTenant';
import { useAuth } from '../../components/auh/AuthWrapper';
import SendSmsModal from '../sms/SendSmsModal';

interface TenantsListProps {
  propertyId: number;
  userId: number;
  onTenantAdded?: () => void;
}

interface ScreeningQuickView {
  tenant_id: number;
  screening_score: number;
  risk_level: 'low' | 'medium' | 'high';
  on_time_payment_rate: number;
  total_arrears: number;
  months_tracked: number;
  last_payment_status: 'early' | 'on_time' | 'late' | 'unpaid';
  days_since_last_payment: number | null;
  early_warning_flags: string[];
  data_quality_score: number;
  recommended_action: 'approve' | 'conditional' | 'review' | 'reject';
  portfolio_percentile: number | null;
}

const TenantsList: React.FC<TenantsListProps> = ({ propertyId, userId, onTenantAdded }) => {
  const [tenants, setTenants] = useState<TenantWithInvoices[]>([]);
  const [filteredTenants, setFilteredTenants] = useState<TenantWithInvoices[]>([]);
  const [screeningData, setScreeningData] = useState<Map<number, ScreeningQuickView>>(new Map());
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTenant, setExpandedTenant] = useState<number | null>(null);
  const [deletingTenant, setDeletingTenant] = useState<number | null>(null);

  const { user, company } = useAuth();
  const [smsTarget, setSmsTarget] = useState<TenantWithInvoices | null>(null);
  const senderSignature = `${company?.name || user?.name || 'Property Manager'}, ${user?.phone || ''}`;
  // next to the Call/WhatsApp buttons:
  
  // Edit tenant state
  const [showEditTenant, setShowEditTenant] = useState(false);
  const [editingTenant, setEditingTenant] = useState<TenantWithInvoices | null>(null);

  // Get current billing month
  const getCurrentBillingMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  };

  const loadTenants = async () => {
    try {
      setLoading(true);
      setError(null);
      const currentMonth = getCurrentBillingMonth();
      const tenantsData = await database.getTenantsWithInvoices(propertyId, currentMonth);
      setTenants(tenantsData);
      setFilteredTenants(tenantsData);
      
      // Load screening data
      await loadScreeningData(tenantsData);
    } catch (err) {
      console.error('Error loading tenants:', err);
      setError('Failed to load tenants. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadScreeningData = async (tenantsData: TenantWithInvoices[]) => {
  try {
    console.log('[ScreeningData] Loading screening data for tenants:', tenantsData.length);
    
    if (!database.db) {
      console.warn('[ScreeningData] Database not initialized');
      return;
    }
    
    const tenantIds = tenantsData.map(t => t.id);
    if (tenantIds.length === 0) {
      console.log('[ScreeningData] No tenant IDs to fetch');
      return;
    }
    
    const placeholders = tenantIds.map(() => '?').join(',');
    console.log('[ScreeningData] Fetching for tenant IDs:', tenantIds);
    
    const results = await database.db.query(`
      SELECT * FROM tenant_screening_quick_view 
      WHERE tenant_id IN (${placeholders})
    `, tenantIds);
    
    console.log('[ScreeningData] Query results:', results);
    
    const screeningMap = new Map<number, ScreeningQuickView>();
    
    // Capacitor SQLite returns { values: [...] }
    const rows = results.values || [];
    
    console.log('[ScreeningData] Processing rows:', rows.length);
    
    rows.forEach((row: any) => {
      screeningMap.set(row.tenant_id, {
        ...row,
        early_warning_flags: row.early_warning_flags ? JSON.parse(row.early_warning_flags) : []
      });
    });
    
    console.log('[ScreeningData] ✅ Loaded screening data for tenants:', screeningMap.size);
    setScreeningData(screeningMap);
    
  } catch (err) {
    console.error('[ScreeningData] ❌ Error loading screening data:', err);
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
      await database.deleteTenant(tenantId, userId);
      await loadTenants();
      onTenantAdded?.();
    } catch (err) {
      console.error('Error deleting tenant:', err);
      alert('Failed to delete tenant. Please try again.');
    } finally {
      setDeletingTenant(null);
    }
  };

  const handleEditTenant = (tenant: TenantWithInvoices) => {
    setEditingTenant(tenant);
    setShowEditTenant(true);
  };

  const handleEditComplete = () => {
    setShowEditTenant(false);
    setEditingTenant(null);
    loadTenants();
    onTenantAdded?.();
  };

  const handleContactAction = (type: 'call' | 'whatsapp', phone: string) => {
    if (!phone) return;
    
    if (type === 'call') {
      window.location.href = `tel:${phone}`;
    } else {
      const cleanPhone = phone.replace(/\D/g, '');
      window.open(`https://wa.me/${cleanPhone}`, '_blank');
    }
  };

  const getPaymentStatusBadge = (tenant: TenantWithInvoices) => {
    if (!tenant.currentInvoice) {
      return <span className="px-2 py-1 bg-surface-sunken text-ink-muted text-xs rounded-full">No Invoice</span>;
    }

    if (tenant.currentInvoice.isPaid) {
      return <span className="px-2 py-1 bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-300 text-xs rounded-full">Paid</span>;
    }

    const dueDate = tenant.currentInvoice.dueDate ? new Date(tenant.currentInvoice.dueDate) : null;
    const isOverdue = dueDate && dueDate < new Date();
    const isPartial = (tenant.currentInvoice.amountPaid || 0) > 0;

    if (isOverdue) {
      return <span className="px-2 py-1 bg-red-100 dark:bg-red-500/15 text-red-800 dark:text-red-300 text-xs rounded-full">{isPartial ? 'Partial · Overdue' : 'Overdue'}</span>;
    }

    if (isPartial) {
      return <span className="px-2 py-1 bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 text-xs rounded-full">Partial</span>;
    }

    return <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-500/15 text-yellow-800 dark:text-yellow-300 text-xs rounded-full">Pending</span>;
  };

  const getRiskBadge = (screening: ScreeningQuickView | undefined) => {
    if (!screening) {
      return <span className="px-2 py-1 bg-surface-sunken text-ink-muted text-xs rounded-full flex items-center gap-1">
        <Activity className="h-3 w-3" />
        No Score
      </span>;
    }

    const riskConfig = {
      low: { bg: 'bg-green-100 dark:bg-green-500/15', text: 'text-green-800 dark:text-green-300', icon: CheckCircle, label: 'Low Risk' },
      medium: { bg: 'bg-yellow-100 dark:bg-yellow-500/15', text: 'text-yellow-800 dark:text-yellow-300', icon: AlertTriangle, label: 'Medium Risk' },
      high: { bg: 'bg-red-100 dark:bg-red-500/15', text: 'text-red-800 dark:text-red-300', icon: XCircle, label: 'High Risk' }
    };

    const config = riskConfig[screening.risk_level];
    const Icon = config.icon;

    return (
      <span className={`px-2 py-1 ${config.bg} ${config.text} text-xs rounded-full flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </span>
    );
  };

  const getScreeningScoreBadge = (screening: ScreeningQuickView | undefined) => {
    if (!screening) return null;

    let bgColor = 'bg-surface-sunken';
    let textColor = 'text-ink';
    let borderColor = 'border-line-strong';

    if (screening.screening_score >= 75) {
      bgColor = 'bg-green-50 dark:bg-green-500/10';
      textColor = 'text-green-700 dark:text-green-300';
      borderColor = 'border-green-300 dark:border-green-500/40';
    } else if (screening.screening_score >= 50) {
      bgColor = 'bg-yellow-50 dark:bg-yellow-500/10';
      textColor = 'text-yellow-700 dark:text-yellow-300';
      borderColor = 'border-yellow-300 dark:border-yellow-500/40';
    } else {
      bgColor = 'bg-red-50 dark:bg-red-500/10';
      textColor = 'text-red-700 dark:text-red-300';
      borderColor = 'border-red-300 dark:border-red-500/40';
    }

    return (
      <div className={`px-2 py-1 ${bgColor} ${textColor} border ${borderColor} text-xs rounded-md flex items-center gap-1 font-semibold`}>
        <Shield className="h-3 w-3" />
        {screening.screening_score.toFixed(0)}/100
      </div>
    );
  };

  const getWarningFlags = (screening: ScreeningQuickView | undefined) => {
    if (!screening || screening.early_warning_flags.length === 0) return null;

    return (
      <div className="flex items-center gap-1 px-2 py-1 bg-orange-100 dark:bg-orange-500/15 text-orange-800 dark:text-orange-300 text-xs rounded-full">
        <AlertCircle className="h-3 w-3" />
        {screening.early_warning_flags.length} Alert{screening.early_warning_flags.length > 1 ? 's' : ''}
      </div>
    );
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

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(0)}%`;
  };

  const renderScreeningDetails = (screening: ScreeningQuickView) => {
    return (
      <div className="mt-4 pt-4 border-t border-line">
        <h5 className="font-medium text-ink mb-3 text-sm sm:text-base flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          Tenant Screening Report
        </h5>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {/* Screening Score */}
          <div className={`p-3 rounded-lg border ${
            screening.screening_score >= 75 ? 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/25' :
            screening.screening_score >= 50 ? 'bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/25' :
            'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/25'
          }`}>
            <div className="flex items-center gap-1 mb-1">
              <Target className={`h-3 w-3 ${
                screening.screening_score >= 75 ? 'text-green-600 dark:text-green-400' :
                screening.screening_score >= 50 ? 'text-yellow-600 dark:text-yellow-400' :
                'text-red-600 dark:text-red-400'
              }`} />
              <span className="text-xs text-ink-muted">Score</span>
            </div>
            <div className={`text-lg font-bold ${
              screening.screening_score >= 75 ? 'text-green-700 dark:text-green-300' :
              screening.screening_score >= 50 ? 'text-yellow-700 dark:text-yellow-300' :
              'text-red-700 dark:text-red-300'
            }`}>
              {screening.screening_score.toFixed(0)}/100
            </div>
          </div>

          {/* On-Time Rate */}
          <div className={`p-3 rounded-lg border ${
            screening.on_time_payment_rate >= 0.8 ? 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/25' :
            screening.on_time_payment_rate >= 0.6 ? 'bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/25' :
            'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/25'
          }`}>
            <div className="flex items-center gap-1 mb-1">
              <CheckCircle className={`h-3 w-3 ${
                screening.on_time_payment_rate >= 0.8 ? 'text-green-600 dark:text-green-400' :
                screening.on_time_payment_rate >= 0.6 ? 'text-yellow-600 dark:text-yellow-400' :
                'text-red-600 dark:text-red-400'
              }`} />
              <span className="text-xs text-ink-muted">On-Time</span>
            </div>
            <div className={`text-lg font-bold ${
              screening.on_time_payment_rate >= 0.8 ? 'text-green-700 dark:text-green-300' :
              screening.on_time_payment_rate >= 0.6 ? 'text-yellow-700 dark:text-yellow-300' :
              'text-red-700 dark:text-red-300'
            }`}>
              {formatPercentage(screening.on_time_payment_rate)}
            </div>
          </div>

          {/* Arrears */}
          <div className={`p-3 rounded-lg border ${
            screening.total_arrears === 0 ? 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/25' :
            screening.total_arrears < 5000 ? 'bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/25' :
            'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/25'
          }`}>
            <div className="flex items-center gap-1 mb-1">
              <AlertCircle className={`h-3 w-3 ${
                screening.total_arrears === 0 ? 'text-green-600 dark:text-green-400' :
                screening.total_arrears < 5000 ? 'text-yellow-600 dark:text-yellow-400' :
                'text-red-600 dark:text-red-400'
              }`} />
              <span className="text-xs text-ink-muted">Arrears</span>
            </div>
            <div className={`text-sm font-bold ${
              screening.total_arrears === 0 ? 'text-green-700 dark:text-green-300' :
              screening.total_arrears < 5000 ? 'text-yellow-700 dark:text-yellow-300' :
              'text-red-700 dark:text-red-300'
            }`}>
              {formatCurrency(screening.total_arrears)}
            </div>
          </div>

          {/* History */}
          <div className="p-3 rounded-lg border bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/25">
            <div className="flex items-center gap-1 mb-1">
              <Calendar className="h-3 w-3 text-blue-600 dark:text-blue-400" />
              <span className="text-xs text-ink-muted">History</span>
            </div>
            <div className="text-lg font-bold text-blue-700 dark:text-blue-300">
              {screening.months_tracked} mo
            </div>
          </div>
        </div>

        {/* Portfolio Percentile */}
        {screening.portfolio_percentile !== null && (
          <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/25 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Award className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <span className="text-sm font-medium text-purple-900 dark:text-purple-300">Portfolio Ranking</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-purple-200 dark:bg-purple-500/25 rounded-full h-2 overflow-hidden">
                <div 
                  className="h-full bg-purple-600 rounded-full transition-all duration-500"
                  style={{ width: `${screening.portfolio_percentile}%` }}
                />
              </div>
              <span className="text-sm font-bold text-purple-700 dark:text-purple-300">
                {screening.portfolio_percentile}th percentile
              </span>
            </div>
            <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
              {screening.portfolio_percentile >= 75 ? 'Top 25% performer in your portfolio' :
               screening.portfolio_percentile >= 50 ? 'Above average performer' :
               screening.portfolio_percentile >= 25 ? 'Below average performer' :
               'Bottom 25% - needs attention'}
            </p>
          </div>
        )}

        {/* Warning Flags */}
        {screening.early_warning_flags.length > 0 && (
          <div className="mb-4 p-3 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/25 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <span className="text-sm font-medium text-orange-900 dark:text-orange-300">Early Warning Alerts</span>
            </div>
            <div className="space-y-1">
              {screening.early_warning_flags.map((flag, index) => (
                <div key={index} className="flex items-start gap-2 text-xs text-orange-800 dark:text-orange-300">
                  <span className="mt-0.5">•</span>
                  <span className="capitalize">{flag.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Last Payment Info */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-2 bg-surface-muted rounded-lg">
            <span className="text-ink-muted block mb-1">Last Payment</span>
            <div className="flex items-center gap-1">
              {screening.last_payment_status === 'early' && <TrendingUp className="h-3 w-3 text-green-600 dark:text-green-400" />}
              {screening.last_payment_status === 'on_time' && <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />}
              {screening.last_payment_status === 'late' && <TrendingDown className="h-3 w-3 text-orange-600 dark:text-orange-400" />}
              {screening.last_payment_status === 'unpaid' && <XCircle className="h-3 w-3 text-red-600 dark:text-red-400" />}
              <span className={`font-medium capitalize ${
                screening.last_payment_status === 'early' || screening.last_payment_status === 'on_time' 
                  ? 'text-green-700 dark:text-green-300' 
                  : screening.last_payment_status === 'late'
                  ? 'text-orange-700 dark:text-orange-300'
                  : 'text-red-700 dark:text-red-300'
              }`}>
                {screening.last_payment_status.replace('_', ' ')}
              </span>
            </div>
          </div>

          {screening.days_since_last_payment !== null && (
            <div className="p-2 bg-surface-muted rounded-lg">
              <span className="text-ink-muted block mb-1">Days Since Payment</span>
              <span className={`font-medium ${
                screening.days_since_last_payment <= 30 ? 'text-green-700 dark:text-green-300' :
                screening.days_since_last_payment <= 60 ? 'text-yellow-700 dark:text-yellow-300' :
                'text-red-700 dark:text-red-300'
              }`}>
                {screening.days_since_last_payment} days
              </span>
            </div>
          )}
        </div>

        {/* Recommendation */}
        <div className={`mt-3 p-3 rounded-lg border ${
          screening.recommended_action === 'approve' ? 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/25' :
          screening.recommended_action === 'conditional' ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/25' :
          screening.recommended_action === 'review' ? 'bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/25' :
          'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/25'
        }`}>
          <div className="flex items-center gap-2">
            <Activity className={`h-4 w-4 ${
              screening.recommended_action === 'approve' ? 'text-green-600 dark:text-green-400' :
              screening.recommended_action === 'conditional' ? 'text-blue-600 dark:text-blue-400' :
              screening.recommended_action === 'review' ? 'text-yellow-600 dark:text-yellow-400' :
              'text-red-600 dark:text-red-400'
            }`} />
            <span className="text-xs font-medium text-ink-soft">
              Recommendation: <span className="capitalize font-bold">{screening.recommended_action}</span>
            </span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-surface rounded-xl sm:rounded-2xl shadow-sm border border-line-soft p-4 sm:p-6">
        <div className="flex items-center justify-center py-8 sm:py-12">
          <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-sm sm:text-base text-ink-muted">Loading tenants...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface rounded-xl sm:rounded-2xl shadow-sm border border-line-soft p-4 sm:p-6">
        <div className="flex flex-col items-center justify-center py-8 sm:py-12">
          <AlertCircle className="h-8 w-8 sm:h-12 sm:w-12 text-red-500 mb-3 sm:mb-4" />
          <p className="text-sm sm:text-base text-ink-muted text-center mb-3 sm:mb-4">{error}</p>
          <button
            onClick={loadTenants}
            className="px-3 py-2 sm:px-4 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-xl sm:rounded-2xl shadow-sm border border-line-soft overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-line-soft">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <h3 className="text-lg sm:text-xl font-bold text-ink">
            Tenants ({filteredTenants.length})
          </h3>
        </div>

        {/* Search */}
        {tenants.length > 0 && (
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-ink-faint" />
            <input
              type="text"
              placeholder="Search tenants by name, unit, phone, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 sm:pl-10 pr-4 py-2 sm:py-3 border border-line rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 sm:p-6">
        {filteredTenants.length === 0 ? (
          <div className="text-center py-8 sm:py-12">
            <User className="mx-auto h-8 w-8 sm:h-12 sm:w-12 text-ink-faint mb-3 sm:mb-4" />
            <h4 className="text-base sm:text-lg font-medium text-ink mb-2">
              {searchTerm ? 'No tenants found' : 'No tenants yet'}
            </h4>
            <p className="text-sm sm:text-base text-ink-subtle mb-4 sm:mb-6">
              {searchTerm 
                ? 'Try adjusting your search terms' 
                : 'Add your first tenant to get started with billing and management'
              }
            </p>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4 xl:grid xl:grid-cols-2 xl:items-start xl:gap-4 xl:space-y-0">
            {filteredTenants.map((tenant) => {
              const screening = screeningData.get(tenant.id);
              
              return (
                <div key={tenant.id} className="border border-line rounded-lg bg-surface-muted shadow-sm">
                  {/* Tenant Card Header */}
                  <div className="p-3 sm:p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 sm:gap-3 mb-2 flex-wrap">
                          <h4 className="font-semibold text-ink text-sm sm:text-base">{tenant.name}</h4>
                          {tenant.unitNumber && (
                            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300 text-xs rounded-full whitespace-nowrap">
                              Unit {tenant.unitNumber}
                            </span>
                          )}
                          {getPaymentStatusBadge(tenant)}
                          {!tenant.isActive && (
                            <span className="px-2 py-1 bg-surface-sunken text-ink-muted text-xs rounded-full whitespace-nowrap">
                              Inactive
                            </span>
                          )}
                        </div>
                        
                        {/* Screening Badges Row */}
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          {getScreeningScoreBadge(screening)}
                          {getRiskBadge(screening)}
                          {getWarningFlags(screening)}
                        </div>
                        
                        <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm text-ink-muted flex-wrap">
                          <span className="flex items-center gap-1 whitespace-nowrap">
                            <DollarSign className="h-3 w-3" />
                            {formatCurrency(tenant.rentAmount)}/month
                          </span>
                          {tenant.totalArrears > 0 && (
                            <span className="flex items-center gap-1 text-red-600 dark:text-red-400 whitespace-nowrap">
                              <AlertCircle className="h-3 w-3" />
                              {formatCurrency(tenant.totalArrears)} arrears
                            </span>
                          )}
                          {screening && screening.months_tracked > 0 && (
                            <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 whitespace-nowrap">
                              <Activity className="h-3 w-3" />
                              {screening.months_tracked} months tracked
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => setExpandedTenant(expandedTenant === tenant.id ? null : tenant.id)}
                        className="p-1.5 sm:p-2 hover:bg-surface-sunken rounded transition-colors ml-2"
                      >
                        {expandedTenant === tenant.id ? (
                          <ChevronUp className="h-4 w-4 text-ink-subtle" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-ink-subtle" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedTenant === tenant.id && (
                    <div className="border-t border-line p-3 sm:p-4 bg-surface">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                        {/* Contact Information */}
                        <div>
                          <h5 className="font-medium text-ink mb-3 text-sm sm:text-base">Contact Information</h5>
                          <div className="space-y-2">
                            {tenant.phone && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs sm:text-sm text-ink-muted">Phone:</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs sm:text-sm font-medium">{tenant.phone}</span>
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => handleContactAction('call', tenant.phone!)}
                                      className="p-1 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-500/15 rounded transition-colors"
                                      title="Call"
                                    >
                                      <Phone className="h-3 w-3" />
                                    </button>
                                    <button
                                      onClick={() => handleContactAction('whatsapp', tenant.phone!)}
                                      className="p-1 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-500/15 rounded transition-colors"
                                      title="WhatsApp"
                                    >
                                      <MessageCircle className="h-3 w-3" />
                                    </button>
                                    <button onClick={() => setSmsTarget(tenant)} className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/15 rounded transition-colors" title="Send SMS">
                                      <MessageSquare className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                            {tenant.email && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs sm:text-sm text-ink-muted">Email:</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs sm:text-sm font-medium truncate max-w-[120px]" title={tenant.email}>
                                    {tenant.email}
                                  </span>
                                  <button
                                    onClick={() => window.location.href = `mailto:${tenant.email}`}
                                    className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/15 rounded transition-colors"
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
                          <h5 className="font-medium text-ink mb-3 text-sm sm:text-base">Financial Details</h5>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs sm:text-sm text-ink-muted">Rent Amount:</span>
                              <span className="text-xs sm:text-sm font-medium">{formatCurrency(tenant.rentAmount)}</span>
                            </div>
                            {tenant.standingFees > 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs sm:text-sm text-ink-muted">Standing Fees:</span>
                                <span className="text-xs sm:text-sm font-medium">{formatCurrency(tenant.standingFees)}</span>
                              </div>
                            )}
                            {tenant.depositAmount > 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs sm:text-sm text-ink-muted">Deposit:</span>
                                <span className="text-xs sm:text-sm font-medium">{formatCurrency(tenant.depositAmount)}</span>
                              </div>
                            )}
                            {tenant.lastPaymentDate && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs sm:text-sm text-ink-muted">Last Payment:</span>
                                <span className="text-xs sm:text-sm font-medium">{formatDate(tenant.lastPaymentDate)}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Lease Information */}
                        {(tenant.leaseStart || tenant.leaseEnd) && (
                          <div className="sm:col-span-2">
                            <h5 className="font-medium text-ink mb-3 text-sm sm:text-base">Lease Information</h5>
                            <div className="flex flex-wrap gap-3 sm:gap-4">
                              {tenant.leaseStart && (
                                <div className="flex items-center gap-1 text-xs sm:text-sm">
                                  <Calendar className="h-3 w-3 text-ink-faint" />
                                  <span className="text-ink-muted">Start:</span>
                                  <span className="font-medium">{formatDate(tenant.leaseStart)}</span>
                                </div>
                              )}
                              {tenant.leaseEnd && (
                                <div className="flex items-center gap-1 text-xs sm:text-sm">
                                  <Calendar className="h-3 w-3 text-ink-faint" />
                                  <span className="text-ink-muted">End:</span>
                                  <span className="font-medium">{formatDate(tenant.leaseEnd)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Screening Details */}
                      {screening && renderScreeningDetails(screening)}

                      {/* Action Buttons */}
                      <div className="flex flex-wrap gap-2 mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-line">
                        <button
                          onClick={() => handleEditTenant(tenant)}
                          className="flex items-center gap-1 px-2 py-1.5 sm:px-3 sm:py-1.5 text-xs sm:text-sm bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-500/25 transition-colors"
                          title="Edit Tenant"
                        >
                          <Edit3 className="h-3 w-3" />
                          Edit
                        </button>
                        
                        {tenant.currentInvoice && !tenant.currentInvoice.isPaid && (
                          <button
                            className="flex items-center gap-1 px-2 py-1.5 sm:px-3 sm:py-1.5 text-xs sm:text-sm bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-500/25 transition-colors"
                            title="Resend Invoice"
                          >
                            <Receipt className="h-3 w-3" />
                            Resend Invoice
                          </button>
                        )}
                        
                        <button
                          onClick={() => handleDeleteTenant(tenant.id, tenant.name)}
                          disabled={deletingTenant === tenant.id}
                          className="flex items-center gap-1 px-2 py-1.5 sm:px-3 sm:py-1.5 text-xs sm:text-sm bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-500/25 transition-colors disabled:opacity-50"
                          title="Delete Tenant"
                        >
                          <Trash2 className="h-3 w-3" />
                          {deletingTenant === tenant.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {smsTarget && (
              <SendSmsModal
                isOpen={!!smsTarget}
                onClose={() => setSmsTarget(null)}
                userId={userId}
                recipients={[{ id: smsTarget.id, name: smsTarget.name, phone: smsTarget.phone }]}
                senderSignature={senderSignature}
              />
            )}
          </div>
        )}
      </div>

      {/* Edit Tenant Modal */}
      {showEditTenant && editingTenant && (
        <AddTenant
          propertyId={propertyId}
          tenant={editingTenant}
          onClose={() => {
            setShowEditTenant(false);
            setEditingTenant(null);
          }}
          onTenantAdded={handleEditComplete}
        />
      )}
    </div>
  );
};

export default TenantsList;