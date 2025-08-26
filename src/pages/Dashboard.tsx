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
  Eye
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { database, type Property, type DashboardData, type MonthlyStats, type InvoiceWithDetails } from '../services/database/Database';

interface DashboardProps {}

// Sample chart colors
//const CHART_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444'];

// Quick Stats Card Component
const StatsCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ComponentType<any>;
  trend?: number;
  color: string;
  loading?: boolean;
}> = ({ title, value, icon: Icon, trend, color, loading }) => {
  if (loading) {
    return (
      <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl p-4 shadow-lg border border-gray-200/50 dark:border-gray-700/50">
        <div className="animate-pulse">
          <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg mb-3"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl p-4 shadow-lg border border-gray-200/50 dark:border-gray-700/50 hover:shadow-xl transition-all duration-300">
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center text-sm ${trend >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            <TrendingUp className={`w-4 h-4 mr-1 ${trend < 0 ? 'rotate-180' : ''}`} />
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{title}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
};

// Property Selector Component
const PropertySelector: React.FC<{
  properties: Property[];
  selectedProperty: Property | null;
  onSelect: (property: Property | null) => void;
  loading?: boolean;
}> = ({ properties, selectedProperty, onSelect, loading }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredProperties = properties.filter(property =>
    property.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    property.address?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl p-4 shadow-lg border border-gray-200/50 dark:border-gray-700/50">
        <div className="animate-pulse">
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2"></div>
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl p-4 shadow-lg border border-gray-200/50 dark:border-gray-700/50">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Select Property
      </label>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors duration-200"
      >
        <span className="text-gray-900 dark:text-white">
          {selectedProperty ? selectedProperty.name : 'All Properties'}
        </span>
        <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-700 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 z-50 max-h-64 overflow-hidden">
          <div className="p-3 border-b border-gray-200 dark:border-gray-600">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search properties..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            <button
              onClick={() => {
                onSelect(null);
                setIsOpen(false);
                setSearchTerm('');
              }}
              className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-white transition-colors duration-150"
            >
              All Properties
            </button>
            {filteredProperties.map(property => (
              <button
                key={property.id}
                onClick={() => {
                  onSelect(property);
                  setIsOpen(false);
                  setSearchTerm('');
                }}
                className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-white transition-colors duration-150"
              >
                <div className="font-medium">{property.name}</div>
                {property.address && (
                  <div className="text-sm text-gray-500 dark:text-gray-400">{property.address}</div>
                )}
              </button>
            ))}
            {filteredProperties.length === 0 && (
              <div className="px-3 py-4 text-center text-gray-500 dark:text-gray-400">
                No properties found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Month/Year Navigation Component
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
    <div className="flex items-center justify-between bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl p-4 shadow-lg border border-gray-200/50 dark:border-gray-700/50">
      <button
        onClick={() => navigateMonth('prev')}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200"
      >
        <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
      </button>
      
      <div className="flex items-center space-x-2">
        <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        <span className="font-semibold text-gray-900 dark:text-white">
          {formatMonth(currentDate)}
        </span>
      </div>
      
      <button
        onClick={() => navigateMonth('next')}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200"
      >
        <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
      </button>
    </div>
  );
};

// Revenue Chart Component
const RevenueChart: React.FC<{
  data: MonthlyStats[];
  loading?: boolean;
}> = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl p-6 shadow-lg border border-gray-200/50 dark:border-gray-700/50">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  const chartData = data.map(item => ({
    month: new Date(item.month + '-01').toLocaleDateString('en-US', { month: 'short' }),
    revenue: item.revenue,
    profit: item.profit
  }));

  return (
    <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl p-6 shadow-lg border border-gray-200/50 dark:border-gray-700/50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Monthly Revenue</h3>
        <div className="flex items-center space-x-4 text-sm">
          <div className="flex items-center">
            <div className="w-3 h-3 bg-blue-500 rounded mr-2"></div>
            <span className="text-gray-600 dark:text-gray-400">Revenue</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-green-500 rounded mr-2"></div>
            <span className="text-gray-600 dark:text-gray-400">Profit</span>
          </div>
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis dataKey="month" stroke="#6B7280" />
            <YAxis stroke="#6B7280" />
            <Tooltip 
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                border: 'none',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
            />
            <Area type="monotone" dataKey="revenue" stackId="1" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.6} />
            <Area type="monotone" dataKey="profit" stackId="2" stroke="#10B981" fill="#10B981" fillOpacity={0.6} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Invoice Overview Component
const InvoiceOverview: React.FC<{
  paidCount: number;
  unpaidCount: number;
  loading?: boolean;
}> = ({ paidCount, unpaidCount, loading }) => {
  if (loading) {
    return (
      <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl p-6 shadow-lg border border-gray-200/50 dark:border-gray-700/50">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-4"></div>
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  const total = paidCount + unpaidCount;
  const pieData = [
    { name: 'Paid', value: paidCount, color: '#10B981' },
    { name: 'Unpaid', value: unpaidCount, color: '#EF4444' }
  ];

  return (
    <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl p-6 shadow-lg border border-gray-200/50 dark:border-gray-700/50">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Invoice Status</h3>
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="flex items-center">
            <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
            <span className="text-gray-600 dark:text-gray-400">Paid: {paidCount}</span>
          </div>
          <div className="flex items-center">
            <XCircle className="w-5 h-5 text-red-500 mr-2" />
            <span className="text-gray-600 dark:text-gray-400">Unpaid: {unpaidCount}</span>
          </div>
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <span className="font-semibold text-gray-900 dark:text-white">Total: {total}</span>
          </div>
        </div>
        {total > 0 && (
          <div className="w-24 h-24">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={20}
                  outerRadius={40}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

// Recent Activity Component
const RecentActivity: React.FC<{
  recentInvoices: InvoiceWithDetails[];
  loading?: boolean;
}> = ({ recentInvoices, loading }) => {
  if (loading) {
    return (
      <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl p-6 shadow-lg border border-gray-200/50 dark:border-gray-700/50">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl p-6 shadow-lg border border-gray-200/50 dark:border-gray-700/50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Activity</h3>
        <Eye className="w-5 h-5 text-gray-500" />
      </div>
      <div className="space-y-3 max-h-64 overflow-y-auto">
        {recentInvoices.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No recent activity</p>
          </div>
        ) : (
          recentInvoices.map(invoice => (
            <div key={invoice.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-full ${invoice.isPaid ? 'bg-green-100 dark:bg-green-900' : 'bg-red-100 dark:bg-red-900'}`}>
                  {invoice.isPaid ? (
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <Clock className="w-4 h-4 text-red-600 dark:text-red-400" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white text-sm">
                    {invoice.tenantName}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {invoice.propertyName} • {invoice.billingMonth}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-900 dark:text-white text-sm">
                  ${invoice.totalAmount.toLocaleString()}
                </p>
                <p className={`text-xs ${invoice.isPaid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {invoice.isPaid ? 'Paid' : 'Pending'}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Main Dashboard Component
const Dashboard: React.FC<DashboardProps> = () => {
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
      const propertiesData = await database.getProperties(1);
      setProperties(propertiesData);

      // Load dashboard data
      const dashData = await database.getDashboardData(
        selectedProperty?.id,
        currentMonth
      );
      setDashboardData(dashData);

      // Load monthly stats for the current year
      const year = parseInt(currentMonth.split('-')[0]);
      if (selectedProperty) {
        const statsData = await database.getMonthlyStats(selectedProperty.id, year);
        setMonthlyStats(statsData);
      }

      // Load recent invoices
      const invoicesData = await database.getInvoices({
        propertyId: selectedProperty?.id,
        billingMonth: currentMonth
      });
      setRecentInvoices(invoicesData.slice(0, 10)); // Show latest 10

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

  return (
    <div 
      className="space-y-6"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400">Welcome back! Here's your property overview.</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200/50 dark:border-gray-700/50 hover:shadow-xl transition-all duration-200"
          >
            <RefreshCw className={`w-5 h-5 text-gray-600 dark:text-gray-400 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleExportReports}
            className="p-2 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200/50 dark:border-gray-700/50 hover:shadow-xl transition-all duration-200"
          >
            <Download className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      </div>

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

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-2 gap-4">
        <StatsCard
          title="Properties"
          value={dashboardData?.totalProperties || 0}
          icon={Building}
          color="bg-blue-500"
          loading={loading}
        />
        <StatsCard
          title="Tenants"
          value={dashboardData?.totalTenants || 0}
          icon={Users}
          color="bg-indigo-500"
          loading={loading}
        />
        <StatsCard
          title="Revenue"
          value={`${dashboardData?.monthlyRevenue.toLocaleString() || 0}`}
          icon={DollarSign}
          trend={15}
          color="bg-green-500"
          loading={loading}
        />
        <StatsCard
          title="Arrears"
          value={`${dashboardData?.totalArrears.toLocaleString() || 0}`}
          icon={AlertTriangle}
          color="bg-red-500"
          loading={loading}
        />
      </div>

      {/* Revenue Chart */}
      <RevenueChart data={monthlyStats} loading={loading} />

      {/* Invoice Overview and Recent Activity */}
      <div className="grid grid-cols-1 gap-4">
        <InvoiceOverview
          paidCount={dashboardData?.paidInvoices || 0}
          unpaidCount={dashboardData?.unpaidInvoices || 0}
          loading={loading}
        />
        <RecentActivity recentInvoices={recentInvoices} loading={loading} />
      </div>

      {/* Occupancy Rate Card */}
      <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl p-6 shadow-lg border border-gray-200/50 dark:border-gray-700/50">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Occupancy Rate</h3>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {loading ? '...' : `${dashboardData?.occupancyRate.toFixed(1) || 0}%`}
          </div>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
          <div 
            className="bg-gradient-to-r from-blue-500 to-purple-600 h-3 rounded-full transition-all duration-1000 ease-out"
            style={{ width: loading ? '0%' : `${dashboardData?.occupancyRate || 0}%` }}
          ></div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
          {loading ? 'Loading...' : `${dashboardData?.totalTenants || 0} of ${dashboardData?.totalProperties || 0} units occupied`}
        </p>
      </div>
    </div>
  );
};

export default Dashboard;