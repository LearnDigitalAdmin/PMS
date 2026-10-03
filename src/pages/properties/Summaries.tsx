import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Calendar,
  Building2,
  TrendingUp,
  DollarSign,
  Download,
  RefreshCw,
  Plus,
  Edit3,
  Trash2,
  Receipt,
  PieChart,
  BarChart3,
  Users,
  Calculator,
  Target,
  Percent,
  Home,
  Activity,
  Briefcase,
  //BookOpen
} from 'lucide-react';
import { 
  summariesService, 
  type AgentBusinessSummary, 
  type BusinessExpense, 
  type ProfitLossStatement,
//   type BalanceSheet,
  type AgentKPIs
} from '../../services/database/SummariesService';

interface SummariesModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: number;
  properties: any[];
}

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  expense?: BusinessExpense;
  onSave: (expense: any) => void;
  properties: any[];
  selectedMonth: string;
}

const ExpenseModal: React.FC<ExpenseModalProps> = ({ 
  isOpen, 
  onClose, 
  expense, 
  onSave, 
  properties, 
  selectedMonth 
}) => {
  const [formData, setFormData] = useState({
    propertyId: expense?.propertyId || undefined,
    description: expense?.description || '',
    amount: expense?.amount || 0,
    category: expense?.category || 'office',
    isRecurring: expense?.isRecurring || false,
    notes: expense?.notes || ''
  });

  const [errors, setErrors] = useState<any>({});

  const categories = [
    { value: 'office', label: 'Office & Admin', icon: '🏢' },
    { value: 'marketing', label: 'Marketing', icon: '📢' },
    { value: 'maintenance', label: 'Maintenance', icon: '🔧' },
    { value: 'utilities', label: 'Utilities', icon: '💡' },
    { value: 'transport', label: 'Transportation', icon: '🚗' },
    { value: 'professional', label: 'Professional Services', icon: '💼' },
    { value: 'insurance', label: 'Insurance', icon: '🛡️' },
    { value: 'software', label: 'Software & Tech', icon: '💻' },
    { value: 'legal', label: 'Legal & Compliance', icon: '⚖️' },
    { value: 'other', label: 'Other', icon: '📋' }
  ];

  useEffect(() => {
    if (expense) {
      setFormData({
        propertyId: expense.propertyId,
        description: expense.description,
        amount: expense.amount,
        category: expense.category,
        isRecurring: expense.isRecurring,
        notes: expense.notes || ''
      });
    }
  }, [expense]);

  const validateForm = () => {
    const newErrors: any = {};
    
    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }
    
    if (formData.amount <= 0) {
      newErrors.amount = 'Amount must be greater than 0';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    onSave({
      ...formData,
      month: selectedMonth
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-surface rounded-xl w-full max-w-md max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-line">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-ink">
              {expense ? 'Edit Business Expense' : 'Add Business Expense'}
            </h3>
            <button
              onClick={onClose}
              className="p-2 hover:bg-surface-sunken rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-2">
              Property (Optional)
            </label>
            <select
              value={formData.propertyId || ''}
              onChange={(e) => setFormData({ 
                ...formData, 
                propertyId: e.target.value ? parseInt(e.target.value) : undefined 
              })}
              className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">General Business Expense</option>
              {properties.map(property => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-soft mb-2">
              Category *
            </label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
              className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {categories.map(cat => (
                <option key={cat.value} value={cat.value}>
                  {cat.icon} {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-soft mb-2">
              Description *
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.description ? 'border-red-300 dark:border-red-500/40' : 'border-line-strong'
              }`}
              placeholder="Enter expense description"
            />
            {errors.description && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.description}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-soft mb-2">
              Amount *
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-ink-faint" />
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.amount ? 'border-red-300 dark:border-red-500/40' : 'border-line-strong'
                }`}
                placeholder="0.00"
              />
            </div>
            {errors.amount && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.amount}</p>
            )}
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="recurring"
              checked={formData.isRecurring}
              onChange={(e) => setFormData({ ...formData, isRecurring: e.target.checked })}
              className="rounded border-line-strong text-blue-600 dark:text-blue-400 shadow-sm focus:border-blue-300 dark:focus:border-blue-500/40 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
            />
            <label htmlFor="recurring" className="ml-2 text-sm text-ink-soft">
              Recurring monthly expense
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-soft mb-2">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Additional notes (optional)"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-ink-soft bg-surface-sunken rounded-lg hover:bg-track transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {expense ? 'Update' : 'Add'} Expense
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const SummariesModal: React.FC<SummariesModalProps> = ({ 
  isOpen, 
  onClose, 
  userId, 
  properties 
}) => {
  const [summary, setSummary] = useState<AgentBusinessSummary | null>(null);
  const [plStatement, setPLStatement] = useState<ProfitLossStatement | null>(null);
  //const [balanceSheet, setBalanceSheet] = useState<BalanceSheet | null>(null);
  const [kpis, setKPIs] = useState<AgentKPIs | null>(null);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'pl' | 'balance' | 'kpis'>('summary');
  
  // Filters
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  });
  const [selectedProperty, setSelectedProperty] = useState<number | undefined>(undefined);
  
  // Expense modal
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<BusinessExpense | undefined>(undefined);
  
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadAllData();
    }
  }, [isOpen, selectedMonth, selectedProperty]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const filters = { month: selectedMonth, propertyId: selectedProperty };
      
      const [summaryData, plData, _balanceData, kpiData, expensesData] = await Promise.all([
        summariesService.generateAgentSummary(userId, filters),
        summariesService.generateProfitLossStatement(userId, filters),
        summariesService.generateBalanceSheet(userId, filters),
        summariesService.generateKPIs(userId, filters),
        summariesService.getBusinessExpenses(userId, { 
          month: selectedMonth,
          propertyId: selectedProperty
        })
      ]);

      setSummary(summaryData);
      setPLStatement(plData);
      //setBalanceSheet(balanceData);
      setKPIs(kpiData);
      setExpenses(expensesData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
  };

  const handleExpenseSave = async (expenseData: any) => {
    try {
      if (editingExpense) {
        await summariesService.updateBusinessExpense(editingExpense.id, expenseData);
      } else {
        await summariesService.addBusinessExpense(userId, expenseData);
      }
      
      setShowExpenseModal(false);
      setEditingExpense(undefined);
      await loadAllData();
    } catch (error) {
      console.error('Error saving expense:', error);
    }
  };

  const handleExpenseDelete = async (expenseId: number) => {
    if (window.confirm('Are you sure you want to delete this expense?')) {
      try {
        await summariesService.deleteBusinessExpense(expenseId);
        await loadAllData();
      } catch (error) {
        console.error('Error deleting expense:', error);
      }
    }
  };

  const handleDownloadPDF = () => {
    if (reportRef.current) {
      window.print();
    }
    alert('PDF download functionality will be implemented soon. Contact us for feature requests.');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const getMonthName = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-17 inset-0 md:bottom-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-xl w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-line bg-gradient-to-r from-blue-50 dark:from-blue-500/10 to-indigo-50 dark:to-indigo-500/10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-gradient-to-br from-brand-500 to-indigo-600 rounded-lg flex items-center justify-center mr-4">
                <Briefcase className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-ink">Agent Business Dashboard</h2>
                <p className="text-sm text-ink-muted">{getMonthName(selectedMonth)}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-surface/50 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink-soft mb-1">Month</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-ink-faint" />
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 text-sm border border-line-strong rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-surface"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-soft mb-1">Property Filter</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-ink-faint" />
                <select
                  value={selectedProperty || ''}
                  onChange={(e) => setSelectedProperty(e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full pl-10 pr-3 py-2 text-sm border border-line-strong rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-surface"
                >
                  <option value="">All Properties</option>
                  {properties.map(property => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-end">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm flex items-center justify-center"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh Data
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex space-x-1 mt-4">
            {[
              { id: 'summary', label: 'Business Summary', icon: BarChart3 },
              { id: 'pl', label: 'P&L Statement', icon: Calculator },
              //{ id: 'balance', label: 'Balance Sheet', icon: BookOpen },
              { id: 'kpis', label: 'KPIs', icon: Target }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-surface text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-ink-muted hover:text-ink hover:bg-surface/50'
                }`}
              >
                <tab.icon className="w-4 h-4 mr-2" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex items-center text-ink-subtle">
                <RefreshCw className="w-6 h-6 animate-spin mr-3" />
                <span className="text-lg">Loading business data...</span>
              </div>
            </div>
          ) : (
            <div ref={reportRef} className="p-6">
              {activeTab === 'summary' && summary && (
                <div className="space-y-6">
                  {/* Key Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-gradient-to-br from-green-50 dark:from-green-500/10 to-emerald-50 dark:to-emerald-500/10 p-6 rounded-xl border border-green-100 dark:border-green-500/25">
                      <div className="flex items-center justify-between mb-3">
                        <DollarSign className="w-10 h-10 text-green-600 dark:text-green-400" />
                        <span className="text-xs text-green-600 dark:text-green-400 font-semibold">COMMISSION REVENUE</span>
                      </div>
                      <p className="text-3xl font-bold text-green-700 dark:text-green-300 mb-1">
                        {formatCurrency(summary.totalCommissionRevenue)}
                      </p>
                      <div className="text-xs text-green-600 dark:text-green-400">
                        {formatPercentage(summary.averageCommissionRate)} avg rate
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-blue-50 dark:from-blue-500/10 to-indigo-50 dark:to-indigo-500/10 p-6 rounded-xl border border-blue-100 dark:border-blue-500/25">
                      <div className="flex items-center justify-between mb-3">
                        <Activity className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                        <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold">OTHER INCOME</span>
                      </div>
                      <p className="text-3xl font-bold text-blue-700 dark:text-blue-300 mb-1">
                        {formatCurrency(summary.totalOtherIncomeRevenue)}
                      </p>
                      <div className="text-xs text-blue-600 dark:text-blue-400">
                        Fees & charges
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-brand-50 dark:from-brand-500/10 to-indigo-50 dark:to-indigo-500/10 p-6 rounded-xl border border-purple-100 dark:border-purple-500/25">
                      <div className="flex items-center justify-between mb-3">
                        <Calculator className="w-10 h-10 text-purple-600 dark:text-purple-400" />
                        <span className="text-xs text-purple-600 dark:text-purple-400 font-semibold">NET INCOME</span>
                      </div>
                      <p className="text-3xl font-bold text-purple-700 dark:text-purple-300 mb-1">
                        {formatCurrency(summary.netIncome)}
                      </p>
                      <div className="text-xs text-purple-600 dark:text-purple-400">
                        {formatPercentage(summary.profitMargin)} margin
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-orange-50 dark:from-orange-500/10 to-red-50 dark:to-red-500/10 p-6 rounded-xl border border-orange-100 dark:border-orange-500/25">
                      <div className="flex items-center justify-between mb-3">
                        <Building2 className="w-10 h-10 text-orange-600 dark:text-orange-400" />
                        <span className="text-xs text-orange-600 dark:text-orange-400 font-semibold">PORTFOLIO</span>
                      </div>
                      <p className="text-3xl font-bold text-orange-700 dark:text-orange-300 mb-1">
                        {summary.totalPropertiesManaged}
                      </p>
                      <div className="text-xs text-orange-600 dark:text-orange-400">
                        {summary.totalUnitsManaged} units • {formatPercentage(summary.portfolioOccupancyRate)} occupied
                      </div>
                    </div>
                  </div>

                  {/* Commission Revenue Table */}
                  <div className="bg-surface rounded-xl border border-line shadow-sm">
                    <div className="p-4 border-b border-line">
                      <h3 className="font-semibold text-ink flex items-center">
                        <DollarSign className="w-5 h-5 mr-2 text-green-600 dark:text-green-400" />
                        Monthly Recurring Revenue (Commission)
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-surface-muted">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-ink-subtle uppercase">Property</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-ink-subtle uppercase">Gross Rent</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-ink-subtle uppercase">Rate</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-ink-subtle uppercase">Commission</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-ink-subtle uppercase">Occupancy</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-ink-subtle uppercase">Vacancies</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-ink-subtle uppercase">Avg Rent/Unit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {summary.commissionBreakdown.map((item) => (
                            <tr key={item.propertyId} className="hover:bg-surface-muted">
                              <td className="px-4 py-3">
                                <div className="font-medium text-ink">{item.propertyName}</div>
                                <div className="text-xs text-ink-subtle">{item.totalUnits} total units</div>
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-ink">
                                {formatCurrency(item.grossRentCollected)}
                              </td>
                              <td className="px-4 py-3 text-right text-ink-muted">
                                {formatPercentage(item.commissionRate)}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-green-600 dark:text-green-400">
                                {formatCurrency(item.commissionAmount)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                                  item.occupancyRate >= 90 
                                    ? 'bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-300'
                                    : item.occupancyRate >= 70 
                                    ? 'bg-yellow-100 dark:bg-yellow-500/15 text-yellow-800 dark:text-yellow-300'
                                    : 'bg-red-100 dark:bg-red-500/15 text-red-800 dark:text-red-300'
                                }`}>
                                  {formatPercentage(item.occupancyRate)}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-ink-muted">
                                {item.vacancyCount}
                              </td>
                              <td className="px-4 py-3 text-right text-ink-muted">
                                {formatCurrency(item.averageRentPerUnit)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Other Income Table */}
                  {summary.otherIncomeBreakdown.length > 0 && (
                    <div className="bg-surface rounded-xl border border-line shadow-sm">
                      <div className="p-4 border-b border-line">
                        <h3 className="font-semibold text-ink flex items-center">
                          <Activity className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
                          Other Income & Fees
                        </h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-surface-muted">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-ink-subtle uppercase">Property</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-ink-subtle uppercase">Source</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-ink-subtle uppercase">Amount</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-ink-subtle uppercase">Description</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {summary.otherIncomeBreakdown.map((item, index) => (
                              <tr key={`${item.propertyId}-${index}`} className="hover:bg-surface-muted">
                                <td className="px-4 py-3 font-medium text-ink">
                                  {item.propertyName}
                                </td>
                                <td className="px-4 py-3 text-ink-muted">
                                  {item.source}
                                </td>
                                <td className="px-4 py-3 text-right font-bold text-blue-600 dark:text-blue-400">
                                  {formatCurrency(item.amount)}
                                </td>
                                <td className="px-4 py-3 text-ink-subtle text-sm">
                                  {item.description || '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Business Expenses */}
                  <div className="bg-surface rounded-xl border border-line shadow-sm">
                    <div className="p-4 border-b border-line">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-ink flex items-center">
                          <Receipt className="w-5 h-5 mr-2 text-orange-600 dark:text-orange-400" />
                          Business Expenses
                        </h3>
                        <button
                          onClick={() => setShowExpenseModal(true)}
                          className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors flex items-center"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add Expense
                        </button>
                      </div>
                    </div>
                    <div className="p-4">
                      {expenses.length > 0 ? (
                        <div className="space-y-3">
                          {expenses.map((expense) => (
                            <div key={expense.id} className="flex items-center justify-between p-4 bg-surface-muted rounded-lg border">
                              <div className="flex-1">
                                <div className="flex items-center mb-2">
                                  <span className="text-sm font-medium text-ink">{expense.description}</span>
                                  {expense.isRecurring && (
                                    <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300 rounded-full">
                                      Recurring
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center text-xs text-ink-subtle">
                                  <span className="capitalize bg-track px-2 py-1 rounded text-ink-soft">
                                    {expense.category}
                                  </span>
                                  {expense.propertyId && (
                                    <>
                                      <span className="mx-2">•</span>
                                      <span>Property-specific</span>
                                    </>
                                  )}
                                </div>
                                {expense.notes && (
                                  <p className="text-xs text-ink-muted mt-2 italic">{expense.notes}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-3 ml-4">
                                <span className="font-bold text-lg text-red-600 dark:text-red-400">{formatCurrency(expense.amount)}</span>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingExpense(expense);
                                      setShowExpenseModal(true);
                                    }}
                                    className="p-2 text-ink-faint hover:text-blue-600 dark:hover:text-blue-400 transition-colors rounded-lg hover:bg-blue-50 dark:hover:bg-blue-500/10"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleExpenseDelete(expense.id)}
                                    className="p-2 text-ink-faint hover:text-red-600 dark:hover:text-red-400 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-ink-subtle">
                          <Receipt className="w-12 h-12 mx-auto mb-3 text-ink-faint" />
                          <p>No expenses recorded for this period</p>
                          <button
                            onClick={() => setShowExpenseModal(true)}
                            className="mt-3 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                          >
                            Add your first expense
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expense Breakdown Chart */}
                  {summary.expenseBreakdown.length > 0 && (
                    <div className="bg-surface rounded-xl border border-line shadow-sm">
                      <div className="p-4 border-b border-line">
                        <h3 className="font-semibold text-ink flex items-center">
                          <PieChart className="w-5 h-5 mr-2 text-purple-600 dark:text-purple-400" />
                          Expense Breakdown by Category
                        </h3>
                      </div>
                      <div className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {summary.expenseBreakdown.map((breakdown, index) => (
                            <div key={breakdown.category} className="flex items-center justify-between p-3 border rounded-lg">
                              <div className="flex items-center">
                                <div 
                                  className="w-4 h-4 rounded-full mr-3"
                                  style={{ backgroundColor: `hsl(${index * 40}, 70%, 60%)` }}
                                />
                                <div>
                                  <span className="text-sm font-medium text-ink-soft capitalize">{breakdown.category}</span>
                                  <div className="text-xs text-ink-subtle">{breakdown.itemCount} items</div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-bold text-ink">
                                  {formatCurrency(breakdown.amount)}
                                </div>
                                <div className="text-xs text-ink-subtle">
                                  {formatPercentage(breakdown.percentage)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'pl' && plStatement && (
                <div className="space-y-6">
                  <div className="bg-surface rounded-xl border border-line shadow-sm">
                    <div className="p-6 border-b border-line">
                      <h3 className="text-xl font-bold text-ink flex items-center">
                        <Calculator className="w-6 h-6 mr-3 text-blue-600 dark:text-blue-400" />
                        Profit & Loss Statement
                      </h3>
                      <p className="text-sm text-ink-muted mt-1">Financial performance for {getMonthName(selectedMonth)}</p>
                    </div>

                    <div className="p-6 space-y-8">
                      {/* Revenue Section */}
                      <div className="bg-green-50 dark:bg-green-500/10 rounded-lg p-6 border border-green-100 dark:border-green-500/25">
                        <h4 className="text-lg font-semibold text-green-800 dark:text-green-300 mb-4">Revenue</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span className="text-ink-soft">Commission Income:</span>
                            <span className="font-medium text-green-700 dark:text-green-300">{formatCurrency(plStatement.revenue.commissionIncome)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-ink-soft">Other Income:</span>
                            <span className="font-medium text-green-700 dark:text-green-300">{formatCurrency(plStatement.revenue.otherIncome)}</span>
                          </div>
                          <div className="flex justify-between border-t border-green-200 dark:border-green-500/25 pt-3 text-lg">
                            <span className="font-bold text-green-800 dark:text-green-300">Total Revenue:</span>
                            <span className="font-bold text-green-800 dark:text-green-300">{formatCurrency(plStatement.revenue.totalRevenue)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Operating Expenses Section */}
                      <div className="bg-red-50 dark:bg-red-500/10 rounded-lg p-6 border border-red-100 dark:border-red-500/25">
                        <h4 className="text-lg font-semibold text-red-800 dark:text-red-300 mb-4">Operating Expenses</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                          <div className="flex justify-between">
                            <span className="text-ink-soft">Office & Admin:</span>
                            <span className="font-medium text-red-700 dark:text-red-300">{formatCurrency(plStatement.operatingExpenses.officeAdmin)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-ink-soft">Marketing:</span>
                            <span className="font-medium text-red-700 dark:text-red-300">{formatCurrency(plStatement.operatingExpenses.marketing)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-ink-soft">Professional Services:</span>
                            <span className="font-medium text-red-700 dark:text-red-300">{formatCurrency(plStatement.operatingExpenses.professional)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-ink-soft">Software & Tech:</span>
                            <span className="font-medium text-red-700 dark:text-red-300">{formatCurrency(plStatement.operatingExpenses.software)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-ink-soft">Transportation:</span>
                            <span className="font-medium text-red-700 dark:text-red-300">{formatCurrency(plStatement.operatingExpenses.transport)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-ink-soft">Utilities:</span>
                            <span className="font-medium text-red-700 dark:text-red-300">{formatCurrency(plStatement.operatingExpenses.utilities)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-ink-soft">Legal & Compliance:</span>
                            <span className="font-medium text-red-700 dark:text-red-300">{formatCurrency(plStatement.operatingExpenses.legal)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-ink-soft">Other Expenses:</span>
                            <span className="font-medium text-red-700 dark:text-red-300">{formatCurrency(plStatement.operatingExpenses.other)}</span>
                          </div>
                        </div>
                        <div className="flex justify-between border-t border-red-200 dark:border-red-500/25 pt-3 mt-4 text-lg">
                          <span className="font-bold text-red-800 dark:text-red-300">Total Operating Expenses:</span>
                          <span className="font-bold text-red-800 dark:text-red-300">{formatCurrency(plStatement.operatingExpenses.totalOperatingExpenses)}</span>
                        </div>
                      </div>

                      {/* Net Income Section */}
                      <div className="bg-blue-50 dark:bg-blue-500/10 rounded-lg p-6 border border-blue-100 dark:border-blue-500/25">
                        <h4 className="text-lg font-semibold text-blue-800 dark:text-blue-300 mb-4">Profitability</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span className="text-ink-soft">Gross Profit:</span>
                            <span className="font-medium text-blue-700 dark:text-blue-300">{formatCurrency(plStatement.grossProfit)}</span>
                          </div>
                          <div className="flex justify-between text-xl">
                            <span className="font-bold text-blue-800 dark:text-blue-300">Net Income:</span>
                            <span className="font-bold text-blue-800 dark:text-blue-300">{formatCurrency(plStatement.netIncome)}</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-4 border-t border-blue-200 dark:border-blue-500/25">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatPercentage(plStatement.grossMargin)}</div>
                              <div className="text-sm text-ink-muted">Gross Margin</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatPercentage(plStatement.netMargin)}</div>
                              <div className="text-sm text-ink-muted">Net Margin</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatPercentage(plStatement.operatingExpenseRatio)}</div>
                              <div className="text-sm text-ink-muted">Expense Ratio</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              

              {activeTab === 'kpis' && kpis && (
                <div className="space-y-6">
                  {/* Key Performance Indicators */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-surface rounded-xl border border-line shadow-sm p-6">
                      <div className="flex items-center justify-between mb-4">
                        <Users className="w-8 h-8 text-green-600 dark:text-green-400" />
                        <Target className="w-5 h-5 text-ink-faint" />
                      </div>
                      <div className="text-3xl font-bold text-ink mb-2">
                        {formatPercentage(kpis.portfolioOccupancyRate)}
                      </div>
                      <div className="text-sm text-ink-muted">Portfolio Occupancy</div>
                      <div className="text-xs text-ink-subtle mt-1">{kpis.unitsUnderManagement} units managed</div>
                    </div>

                    <div className="bg-surface rounded-xl border border-line shadow-sm p-6">
                      <div className="flex items-center justify-between mb-4">
                        <Percent className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                        <Target className="w-5 h-5 text-ink-faint" />
                      </div>
                      <div className="text-3xl font-bold text-ink mb-2">
                        {formatPercentage(kpis.averageCommissionRate)}
                      </div>
                      <div className="text-sm text-ink-muted">Avg Commission Rate</div>
                      <div className="text-xs text-ink-subtle mt-1">{kpis.propertiesUnderManagement} properties</div>
                    </div>

                    <div className="bg-surface rounded-xl border border-line shadow-sm p-6">
                      <div className="flex items-center justify-between mb-4">
                        <DollarSign className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                        <Target className="w-5 h-5 text-ink-faint" />
                      </div>
                      <div className="text-3xl font-bold text-ink mb-2">
                        {formatCurrency(kpis.monthlyRecurringRevenue)}
                      </div>
                      <div className="text-sm text-ink-muted">Monthly Recurring Revenue</div>
                      <div className="text-xs text-ink-subtle mt-1">Commission-based</div>
                    </div>

                    <div className="bg-surface rounded-xl border border-line shadow-sm p-6">
                      <div className="flex items-center justify-between mb-4">
                        <TrendingUp className="w-8 h-8 text-orange-600 dark:text-orange-400" />
                        <Target className="w-5 h-5 text-ink-faint" />
                      </div>
                      <div className="text-3xl font-bold text-ink mb-2">
                        {formatPercentage(kpis.profitMargin)}
                      </div>
                      <div className="text-sm text-ink-muted">Profit Margin</div>
                      <div className="text-xs text-ink-subtle mt-1">After all expenses</div>
                    </div>
                  </div>

                  {/* Performance Metrics */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-surface rounded-xl border border-line shadow-sm">
                      <div className="p-6 border-b border-line">
                        <h3 className="font-semibold text-ink flex items-center">
                          <BarChart3 className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
                          Financial Performance
                        </h3>
                      </div>
                      <div className="p-6 space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-ink-muted">Revenue per Property:</span>
                          <span className="font-bold text-ink">{formatCurrency(kpis.revenuePerProperty)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-ink-muted">Revenue per Unit:</span>
                          <span className="font-bold text-ink">{formatCurrency(kpis.revenuePerUnit)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-ink-muted">Expense Ratio:</span>
                          <span className="font-bold text-ink">{formatPercentage(kpis.expenseRatio)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-ink-muted">Collection Rate:</span>
                          <span className="font-bold text-ink">{formatPercentage(kpis.collectionRate)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-surface rounded-xl border border-line shadow-sm">
                      <div className="p-6 border-b border-line">
                        <h3 className="font-semibold text-ink flex items-center">
                          <Home className="w-5 h-5 mr-2 text-green-600 dark:text-green-400" />
                          Portfolio Management
                        </h3>
                      </div>
                      <div className="p-6 space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-ink-muted">Properties Managed:</span>
                          <span className="font-bold text-ink">{kpis.propertiesUnderManagement}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-ink-muted">Units Under Management:</span>
                          <span className="font-bold text-ink">{kpis.unitsUnderManagement}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-ink-muted">Avg Occupancy Rate:</span>
                          <span className="font-bold text-ink">{formatPercentage(kpis.portfolioOccupancyRate)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-ink-muted">Turnover Rate:</span>
                          <span className="font-bold text-ink">{formatPercentage(kpis.turnoverRate)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-line bg-surface-muted">
          <div className="flex items-center justify-between">
            <div className="text-sm text-ink-subtle">
              Report generated on {new Date().toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="px-4 py-2 text-ink-soft bg-surface border border-line-strong rounded-lg hover:bg-surface-muted transition-colors flex items-center"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh Data
              </button>
              <button
                onClick={handleDownloadPDF}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center"
              >
                <Download className="w-4 h-4 mr-2" />
                Export PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Expense Modal */}
      <ExpenseModal
        isOpen={showExpenseModal}
        onClose={() => {
          setShowExpenseModal(false);
          setEditingExpense(undefined);
        }}
        expense={editingExpense}
        onSave={handleExpenseSave}
        properties={properties}
        selectedMonth={selectedMonth}
      />
    </div>
  );
};

export default SummariesModal;