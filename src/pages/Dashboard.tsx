import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronDown, 
  Search, 
  TrendingUp, 
  Users, 
  Building, 
  DollarSign, 
  AlertTriangle,
  Calendar,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Percent,
  TrendingDown,
  Activity,
  BarChart3,
  PieChart as PieChartIcon,
  Home,
  DownloadCloud,
  UploadCloud
} from 'lucide-react';
import { 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  Bar,
  ComposedChart
} from 'recharts';
import PageHeader, { HeaderAction } from '../components/ui/PageHeader';
import { firebaseSyncService } from '../services/database/FirebaseSync';
import { database, type Property, type DashboardData, type MonthlyStats, type InvoiceWithDetails } from '../services/database/Database';
import TrialStatsBanner from '../components/ui/TrialStatsBanner';

interface DashboardProps {userData: any;}

const CHART_COLORS = {
  primary: '#3B82F6',
  secondary: '#8B5CF6', 
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#06B6D4',
  gradient: {
    blue: ['#3B82F6', '#1D4ED8'],
    purple: ['#8B5CF6', '#7C3AED'],
    green: ['#10B981', '#059669'],
    orange: ['#F59E0B', '#D97706'],
    red: ['#EF4444', '#DC2626']
  }
};

// Enhanced Stats Card Component
const StatsCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ComponentType<any>;
  trend?: number;
  color: string;
  loading?: boolean;
  subtitle?: string;
  percentage?: number;
}> = ({ title, value, icon: Icon, trend, color, loading, subtitle, percentage }) => {
  if (loading) {
    return (
      <div className="ui-card p-4">
        <div className="animate-pulse">
          <div className="w-10 h-10 bg-track rounded-lg mb-3"></div>
          <div className="h-4 bg-track rounded mb-2 w-2/3"></div>
          <div className="h-7 bg-track rounded w-3/4"></div>
          {subtitle && <div className="h-3 bg-track rounded mt-2 w-1/2"></div>}
        </div>
      </div>
    );
  }

  return (
    <div className="ui-card ui-card-hover p-4">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-xl ${color} shadow-lg`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center text-sm font-medium px-2 py-1 rounded-full ${
            trend >= 0 
              ? 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30' 
              : 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/30'
          }`}>
            {trend >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-sm font-medium text-ink-muted mb-1">{title}</p>
        <div className="flex items-baseline space-x-2">
          <p className="text-2xl font-bold text-ink">{value}</p>
          {percentage !== undefined && (
            <span className="text-lg font-semibold text-ink-subtle">
              ({percentage.toFixed(1)}%)
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-xs text-ink-subtle mt-1">{subtitle}</p>
        )}
      </div>
    </div>
  );
};

// Enhanced Property Selector Component
const PropertySelector: React.FC<{
  properties: Property[];
  selectedProperty: Property | null;
  onSelect: (property: Property | null) => void;
  loading?: boolean;
}> = ({ properties, selectedProperty, onSelect, loading }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const filteredProperties = properties.filter(property =>
    property.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    property.address?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const updateDropdownPosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
  };

  const handleToggle = () => {
    if (!isOpen) {
      updateDropdownPosition();
    }
    setIsOpen(!isOpen);
  };

  const handleClose = () => {
    setIsOpen(false);
    setSearchTerm('');
  };

  if (loading) {
    return (
      <div className="ui-card p-4">
        <div className="animate-pulse">
          <div className="h-5 bg-track rounded w-1/3 mb-2"></div>
          <div className="h-12 bg-track rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="ui-card p-4">
        <label className="block text-sm font-semibold text-ink-soft mb-3">
          Property Filter
        </label>
        <button
          ref={buttonRef}
          onClick={handleToggle}
          className="w-full flex items-center justify-between p-3.5 bg-surface border-2 border-line rounded-xl hover:border-blue-300 dark:hover:border-blue-500 hover:bg-surface-muted transition-all duration-200 shadow-sm"
        >
          <span className="font-medium text-ink">
            {selectedProperty ? selectedProperty.name : 'All Properties'}
          </span>
          <ChevronDown className={`w-5 h-5 text-ink-subtle transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {isOpen && (
        <div 
          className="fixed inset-0 z-[50000] bg-black/10"
          onClick={handleClose}
        >
          <div 
            className="absolute bg-surface rounded-xl shadow-2xl border border-line max-h-80 overflow-hidden"
            style={{
              top: dropdownPosition.top + 'px',
              left: dropdownPosition.left + 'px',
              width: dropdownPosition.width + 'px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b border-line">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-ink-faint" />
                <input
                  type="text"
                  placeholder="Search properties..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 border border-line-strong rounded-lg bg-surface text-ink focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto">
              <button
                onClick={() => {
                  onSelect(null);
                  handleClose();
                }}
                className="w-full px-4 py-3 text-left hover:bg-surface-sunken text-ink transition-colors duration-150 font-medium"
              >
                All Properties
              </button>
              {filteredProperties.map(property => (
                <button
                  key={property.id}
                  onClick={() => {
                    onSelect(property);
                    handleClose();
                  }}
                  className="w-full px-4 py-3 text-left hover:bg-surface-sunken text-ink transition-colors duration-150"
                >
                  <div className="font-medium">{property.name}</div>
                  {property.address && (
                    <div className="text-sm text-ink-subtle mt-1">{property.address}</div>
                  )}
                </button>
              ))}
              {filteredProperties.length === 0 && (
                <div className="px-4 py-8 text-center text-ink-subtle">
                  <Building className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No properties found</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Enhanced Month/Year Navigation Component
const MonthYearNav: React.FC<{
  currentMonth: string;
  onMonthChange: (month: string) => void;
}> = ({ currentMonth, onMonthChange }) => {
  const [currentDate, setCurrentDate] = useState(new Date(currentMonth + '-01'));

  const formatMonth = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const getMonthString = (date: Date) => {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
    onMonthChange(getMonthString(newDate));
  };

  return (
    <div className="flex items-center justify-between ui-card p-4">
      <button
        onClick={() => navigateMonth('prev')}
        className="p-2.5 rounded-xl hover:bg-surface-sunken transition-colors duration-200 hover:scale-105"
      >
        <ChevronLeft className="w-5 h-5 text-ink-muted" />
      </button>
      
      <div className="flex items-center space-x-3">
        <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/30">
          <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <span className="font-bold text-lg text-ink">
          {formatMonth(currentDate)}
        </span>
      </div>
      
      <button
        onClick={() => navigateMonth('next')}
        className="p-2.5 rounded-xl hover:bg-surface-sunken transition-colors duration-200 hover:scale-105"
      >
        <ChevronRight className="w-5 h-5 text-ink-muted" />
      </button>
    </div>
  );
};

// Enhanced Revenue Chart Component
const RevenueChart: React.FC<{
  data: MonthlyStats[];
  loading?: boolean;
}> = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="ui-card p-4">
        <div className="animate-pulse">
          <div className="h-6 bg-track rounded w-1/3 mb-4"></div>
          <div className="h-80 bg-track rounded"></div>
        </div>
      </div>
    );
  }

  const chartData = data.map(item => ({
    month: new Date(item.month + '-01').toLocaleDateString('en-US', { month: 'short' }),
    revenue: item.revenue,
    profit: item.profit,
    expenses: item.expenses,
    paidCount: item.paidCount,
    unpaidCount: item.unpaidCount
  }));

  return (
    <div className="ui-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-gradient-to-r from-brand-500 to-indigo-600">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <h3 className="text-lg font-bold text-ink">Financial Overview</h3>
        </div>
        <div className="flex items-center space-x-4 text-sm">
          <div className="flex items-center">
            <div className="w-3 h-3 bg-blue-500 rounded mr-2"></div>
            <span className="text-ink-muted font-medium">Revenue</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-green-500 rounded mr-2"></div>
            <span className="text-ink-muted font-medium">Profit</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-orange-500 rounded mr-2"></div>
            <span className="text-ink-muted font-medium">Expenses</span>
          </div>
        </div>
      </div>
      <div className="h-80" style={{ margin: 0, padding: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis 
              dataKey="month" 
              stroke="#6B7280" 
              fontSize={12}
              axisLine={false}
              tickLine={false}
            />
            <YAxis 
              stroke="#6B7280" 
              fontSize={12}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: 'none',
                borderRadius: '12px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                fontSize: '12px'
              }}
              formatter={(value: any) => [`$${value.toLocaleString()}`, '']}
            />
            <Area 
              type="monotone" 
              dataKey="revenue" 
              stackId="1" 
              stroke={CHART_COLORS.primary} 
              fill={CHART_COLORS.primary} 
              fillOpacity={0.2} 
            />
            <Area 
              type="monotone" 
              dataKey="profit" 
              stackId="2" 
              stroke={CHART_COLORS.success} 
              fill={CHART_COLORS.success} 
              fillOpacity={0.2} 
            />
            <Bar 
              dataKey="expenses" 
              fill={CHART_COLORS.warning} 
              opacity={0.8}
              radius={[2, 2, 0, 0]}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Enhanced Payment Status Chart Component
const PaymentStatusChart: React.FC<{
  paidCount: number;
  unpaidCount: number;
  loading?: boolean;
}> = ({ paidCount, unpaidCount, loading }) => {
  if (loading) {
    return (
      <div className="ui-card p-4">
        <div className="animate-pulse">
          <div className="h-6 bg-track rounded w-1/2 mb-4"></div>
          <div className="h-48 bg-track rounded"></div>
        </div>
      </div>
    );
  }

  const total = unpaidCount;
  const paidPercentage = total > 0 ? (paidCount / total) * 100 : 0;
  
  const pieData = [
    { name: 'Paid', value: paidCount, color: CHART_COLORS.success, percentage: paidPercentage },
    { name: 'Unpaid', value: unpaidCount, color: CHART_COLORS.danger, percentage: 100 - paidPercentage }
  ];

  return (
    <div className="ui-card p-4">
      <div className="flex items-center space-x-3 mb-4">
        <div className="p-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600">
          <PieChartIcon className="w-5 h-5 text-white" />
        </div>
        <h3 className="text-lg font-bold text-ink">Payment Status</h3>
      </div>
      <div className="flex items-center justify-between">
        <div className="space-y-3 flex-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
              <span className="text-ink-muted font-medium">Paid</span>
            </div>
            <div className="text-right">
              <span className="font-bold text-ink text-lg">{paidCount}</span>
              <span className="text-sm text-green-600 dark:text-green-400 ml-2">
                ({paidPercentage.toFixed(1)}%)
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <XCircle className="w-5 h-5 text-red-500 mr-2" />
              <span className="text-ink-muted font-medium">Unpaid</span>
            </div>
            <div className="text-right">
              <span className="font-bold text-ink text-lg">{unpaidCount}</span>
              <span className="text-sm text-red-600 dark:text-red-400 ml-2">
                ({(100 - paidPercentage).toFixed(1)}%)
              </span>
            </div>
          </div>
          <div className="pt-3 border-t border-line">
            <div className="flex items-center justify-between">
              <span className="font-bold text-ink">Total</span>
              <span className="font-bold text-xl text-ink">{total}</span>
            </div>
          </div>
        </div>
        {total > 0 && (
          <div className="w-32 h-32 ml-4" style={{ margin: 0, padding: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={25}
                  outerRadius={50}
                  dataKey="value"
                  startAngle={90}
                  endAngle={450}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => [value, '']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

// Enhanced Recent Activity Component
const RecentActivity: React.FC<{
  recentInvoices: InvoiceWithDetails[];
  loading?: boolean;
}> = ({ recentInvoices, loading }) => {
  if (loading) {
    return (
      <div className="ui-card p-4">
        <div className="animate-pulse">
          <div className="h-6 bg-track rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-16 bg-track rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ui-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-gradient-to-r from-brand-500 to-indigo-600">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <h3 className="text-lg font-bold text-ink">Recent Activity</h3>
        </div>
        <Eye className="w-5 h-5 text-ink-subtle" />
      </div>
      <div className="space-y-3 max-h-80 overflow-y-auto">
        {recentInvoices.length === 0 ? (
          <div className="text-center py-12 text-ink-subtle">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No recent activity</p>
            <p className="text-sm mt-1">Invoice data will appear here</p>
          </div>
        ) : (
          recentInvoices.map(invoice => (
            <div key={invoice.id} className="flex items-center justify-between p-3 bg-surface-muted/80 rounded-xl hover:bg-surface-sunken/80 transition-colors duration-200">
              <div className="flex items-center space-x-3 flex-1">
                <div className={`p-2.5 rounded-xl shadow-sm ${
                  invoice.isPaid 
                    ? 'bg-green-100 dark:bg-green-900/30' 
                    : 'bg-red-100 dark:bg-red-900/30'
                }`}>
                  {invoice.isPaid ? (
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <Clock className="w-4 h-4 text-red-600 dark:text-red-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ink text-sm truncate">
                    {invoice.tenantName}
                  </p>
                  <p className="text-xs text-ink-subtle truncate">
                    {invoice.propertyName} • {invoice.billingMonth}
                  </p>
                  <div className="flex items-center mt-1 space-x-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      invoice.isPaid 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {invoice.isPaid ? 'Paid' : 'Pending'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right ml-3">
                <p className="font-bold text-ink text-sm">
                  ${invoice.totalAmount.toLocaleString()}
                </p>
                {invoice.arrears > 0 && (
                  <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                    Arrears: ${invoice.arrears.toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};


// Main Dashboard Component
const Dashboard: React.FC<DashboardProps> = ({userData}) => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  });
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<InvoiceWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load properties (assuming userId = 1 for demo)
      const propertiesData = await database.getProperties(userData.id);
      setProperties(propertiesData);
      console.log('Loaded DDDD properties:', propertiesData);

      // Load dashboard data
      const dashData = await database.getDashboardData(
        userData.id,
        selectedProperty?.id,
        currentMonth
      );
      setDashboardData(dashData);

      // Load monthly stats for the current year
      const year = parseInt(currentMonth.split('-')[0]);
      if (selectedProperty) {
        const statsData = await database.getMonthlyStats(selectedProperty.id, year);
        setMonthlyStats(statsData);
      } else {
        // If no property selected, aggregate stats from all properties
        const allStats: MonthlyStats[] = [];
        for (const property of propertiesData) {
          const stats = await database.getMonthlyStats(property.id, year);
          stats.forEach((stat, index) => {
            if (!allStats[index]) {
              allStats[index] = { ...stat };
            } else {
              allStats[index].revenue += stat.revenue;
              allStats[index].expenses += stat.expenses;
              allStats[index].profit += stat.profit;
              allStats[index].paidCount += stat.paidCount;
              allStats[index].unpaidCount += stat.unpaidCount;
            }
          });
        }
        setMonthlyStats(allStats);
      }

      // Load recent invoices
      const invoicesData = await database.getInvoices({
        propertyId: selectedProperty?.id,
        billingMonth: currentMonth
      });
      setRecentInvoices(invoicesData.slice(0, 15)); // Show latest 15

    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const handleExportReports = () => {
    // Export functionality placeholder
    alert('Export reports functionality will be implemented');
  };

  useEffect(() => {
    loadDashboardData();
  }, [selectedProperty, currentMonth]);

  // Pull to refresh handler
  const startY = useRef<number>(0);
  const pullDistance = useRef<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      pullDistance.current = e.touches[0].clientY - startY.current;
      if (pullDistance.current > 100 && !refreshing) {
        handleRefresh();
      }
    }
  };

  // const canSync = userData.storage;

  const handleSave = async () => {
    //if (userData.storage) {
      setLoading(true);
      await firebaseSyncService.forceUpload(userData.id);
      setLoading(false);
    //}
  };

  const handleDownload = async () => {
    //if (userData.storage) {
      setLoading(true);
      await firebaseSyncService.forceDownload(userData.id);
      setLoading(false);
    //}
  };

  // Calculate enhanced metrics
  const calculateCollectionRate = () => {
    if (!dashboardData || (dashboardData.paidInvoices + dashboardData.unpaidInvoices) === 0) return 0;
    return (dashboardData.paidInvoices / (dashboardData.paidInvoices + dashboardData.unpaidInvoices)) * 100;
  };

  const calculateAverageRent = () => {
    if (!dashboardData || dashboardData.totalTenants === 0) return 0;
    return dashboardData.monthlyRevenue / dashboardData.totalTenants;
  };

  const calculateRevenueTrend = () => {
    if (monthlyStats.length < 2) return 0;
    const current = monthlyStats[monthlyStats.length - 1]?.revenue || 0;
    const previous = monthlyStats[monthlyStats.length - 2]?.revenue || 0;
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  const collectionRate = calculateCollectionRate();
  const averageRent = calculateAverageRent();
  const revenueTrend = calculateRevenueTrend();

  return (
    <div 
      className="space-y-6 pb-6"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >
      <PageHeader
        title="Dashboard"
        subtitle="Your property overview"
        icon={Home}
        actions={
          <>
            <HeaderAction icon={RefreshCw} label="Refresh" onClick={handleRefresh} disabled={refreshing} spin={refreshing} />
            <HeaderAction icon={Download} label="Export reports" onClick={handleExportReports} variant="primary" showLabel />
          </>
        }
      />

      <TrialStatsBanner userId={userData?.id} />

      {/* Filters: side by side on large screens */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
      {/* Property Selector */}
      <PropertySelector
        properties={properties}
        selectedProperty={selectedProperty}
        onSelect={setSelectedProperty}
        loading={loading}
      />

      {/* Month/Year Navigation */}
      <MonthYearNav
        currentMonth={currentMonth}
        onMonthChange={setCurrentMonth}
      />
      </div>

      {/* Enhanced Quick Stats Cards Grid */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 xl:gap-6">
        <StatsCard
          title="Properties"
          value={properties.length || 0}
          icon={Building}
          color="bg-gradient-to-r from-brand-500 to-indigo-600"
          loading={loading}
          subtitle={`${properties.length} total managed`}
        />
        <StatsCard
          title="Active Tenants"
          value={dashboardData?.totalTenants || 0}
          icon={Users}
          color="bg-gradient-to-r from-brand-500 to-indigo-600"
          loading={loading}
          percentage={dashboardData?.occupancyRate}
          subtitle="Occupancy rate"
        />
        <StatsCard
          title="Monthly Revenue"
          value={`${(dashboardData?.monthlyRevenue || 0).toLocaleString()}`}
          icon={DollarSign}
          trend={revenueTrend}
          color="bg-gradient-to-r from-emerald-500 to-teal-600"
          loading={loading}
          subtitle={`Avg: ${averageRent.toLocaleString()}/tenant`}
        />
        <StatsCard
          title="Outstanding"
          value={`${(dashboardData?.totalArrears || 0).toLocaleString()}`}
          icon={AlertTriangle}
          color="bg-gradient-to-r from-red-500 to-rose-600"
          loading={loading}
          percentage={dashboardData?.totalArrears && dashboardData?.monthlyRevenue ? 
            (dashboardData.totalArrears / dashboardData.monthlyRevenue) * 100 : 0}
          subtitle="Of monthly revenue"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Revenue Chart - Takes 2 columns on large screens */}
        <div className="xl:col-span-2 [&>*]:h-full">
          <RevenueChart data={monthlyStats} loading={loading} />
        </div>
        
        {/* Payment Status Chart */}
        <div className="xl:col-span-1 [&>*]:h-full">
          <PaymentStatusChart
            paidCount={dashboardData?.paidInvoices || 0}
            unpaidCount={dashboardData?.unpaidInvoices || 0}
            loading={loading}
          />
        </div>
      </div>

      {/* Collection, occupancy and performance metrics */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Collection Rate Card */}
      <div className="ui-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600">
              <Percent className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ink">Collection Rate</h3>
              <p className="text-sm text-ink-subtle">Payment collection efficiency</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {loading ? '...' : `${collectionRate.toFixed(1)}%`}
            </div>
            <div className="text-sm text-ink-subtle mt-1">
              {loading ? 'Loading...' : `${dashboardData?.paidInvoices || 0} of ${(dashboardData?.paidInvoices || 0) + (dashboardData?.unpaidInvoices || 0)} paid`}
            </div>
          </div>
        </div>
        <div className="w-full bg-track rounded-full h-4 shadow-inner">
          <div 
            className="bg-gradient-to-r from-emerald-500 to-teal-600 h-4 rounded-full transition-all duration-1000 ease-out shadow-sm"
            style={{ width: loading ? '0%' : `${collectionRate}%` }}
          ></div>
        </div>
        <div className="flex justify-between text-sm text-ink-subtle mt-2">
          <span>0%</span>
          <span>Target: 85%</span>
          <span>100%</span>
        </div>
      </div>

        {/* Occupancy Rate Card */}
        <div className="ui-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="p-3 rounded-xl bg-gradient-to-r from-brand-500 to-indigo-600">
                <Building className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-ink">Occupancy Rate</h3>
                <p className="text-sm text-ink-subtle">Property utilization</p>
              </div>
            </div>
            <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
              {loading ? '...' : `${(dashboardData?.occupancyRate || 0).toFixed(1)}%`}
            </div>
          </div>
          <div className="w-full bg-track rounded-full h-4 shadow-inner">
            <div 
              className="bg-gradient-to-r from-brand-500 to-indigo-600 h-4 rounded-full transition-all duration-1000 ease-out shadow-sm"
              style={{ width: loading ? '0%' : `${dashboardData?.occupancyRate || 0}%` }}
            ></div>
          </div>
          <div className="flex justify-between items-center mt-4">
            <div className="text-sm text-ink-muted">
              {loading ? 'Loading...' : `${dashboardData?.totalTenants || 0} of ${dashboardData?.totalProperties || 0} units occupied`}
            </div>
            <div className="text-sm font-medium text-purple-600 dark:text-purple-400">
              {loading ? '' : `${(dashboardData?.totalProperties || 0) - (dashboardData?.totalTenants || 0)} vacant`}
            </div>
          </div>
        </div>

        {/* Performance Summary */}
        <div className="ui-card p-6 xl:col-span-2">
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-ink">Performance</h3>
              <p className="text-sm text-ink-subtle">Key metrics summary</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between p-3 bg-surface-muted/80 rounded-xl">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span className="text-sm font-medium text-ink-soft">Average Rent</span>
              </div>
              <span className="font-bold text-ink">
                ${loading ? '...' : averageRent.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-surface-muted/80 rounded-xl">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-sm font-medium text-ink-soft">Collection Rate</span>
              </div>
              <span className="font-bold text-ink">
                {loading ? '...' : `${collectionRate.toFixed(1)}%`}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-surface-muted/80 rounded-xl">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                <span className="text-sm font-medium text-ink-soft">Occupancy</span>
              </div>
              <span className="font-bold text-ink">
                {loading ? '...' : `${(dashboardData?.occupancyRate || 0).toFixed(1)}%`}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-surface-muted/80 rounded-xl">
              <div className="flex items-center space-x-3">
                <div className={`w-3 h-3 rounded-full ${revenueTrend >= 0 ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm font-medium text-ink-soft">Revenue Trend</span>
              </div>
              <span className={`font-bold ${revenueTrend >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {loading ? '...' : `${revenueTrend >= 0 ? '+' : ''}${revenueTrend.toFixed(1)}%`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <RecentActivity recentInvoices={recentInvoices} loading={loading} />

      {/* Floating data actions: always visible, clear of the bottom nav on phones */}
      <div className="fixed right-4 z-40 flex flex-col gap-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px)+0.75rem)] md:bottom-6 md:right-6">
        <button
          type="button"
          onClick={handleDownload}
          disabled={loading}
          aria-label="Download data"
          title="Download data"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-brand-500 to-indigo-600 text-white shadow-xl transition active:scale-95 disabled:opacity-60"
        >
          <DownloadCloud className="h-6 w-6" />
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          aria-label="Upload (save) data"
          title="Upload (save) data"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-xl transition active:scale-95 disabled:opacity-60"
        >
          <UploadCloud className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
};

export default Dashboard;