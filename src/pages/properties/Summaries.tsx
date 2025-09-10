import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Calendar,
  Building2,
  TrendingUp,
  DollarSign,
  FileText,
  Download,
  RefreshCw,
  Plus,
  Edit3,
  Trash2,
  Receipt,
  PieChart,
  BarChart3,
  Users,
  Calculator} from 'lucide-react';
import { summariesService, type MonthlySummary, type BusinessExpense } from '../../services/database/SummariesService';

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
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              {expense ? 'Edit Expense' : 'Add Business Expense'}
            </h3>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Property Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Property
            </label>
            <select
              value={formData.propertyId || ''}
              onChange={(e) => setFormData({ 
                ...formData, 
                propertyId: e.target.value ? parseInt(e.target.value) : undefined 
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">General Business Expense</option>
              {properties.map(property => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </div>

          {/* Category Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category
            </label>
                <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as "office" | "marketing" | "maintenance" | "utilities" | "transport" | "professional" | "insurance" | "other" })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                    {categories.map(cat => (
                        <option key={cat.value} value={cat.value}>
                        {cat.icon} {cat.label}
                        </option>
                    ))}
                </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description *
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.description ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Enter expense description"
            />
            {errors.description && (
              <p className="mt-1 text-sm text-red-600">{errors.description}</p>
            )}
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Amount *
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.amount ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="0.00"
              />
            </div>
            {errors.amount && (
              <p className="mt-1 text-sm text-red-600">{errors.amount}</p>
            )}
          </div>

          {/* Recurring */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="recurring"
              checked={formData.isRecurring}
              onChange={(e) => setFormData({ ...formData, isRecurring: e.target.checked })}
              className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
            />
            <label htmlFor="recurring" className="ml-2 text-sm text-gray-700">
              Recurring monthly expense
            </label>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Additional notes (optional)"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
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
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filters
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  });
  const [selectedProperty, setSelectedProperty] = useState<number | undefined>(undefined);
  const [reportType, setReportType] = useState<'rent-based' | 'commission-based'>('rent-based');
  
  // Expense modal
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<BusinessExpense | undefined>(undefined);
  
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadSummary();
      loadExpenses();
    }
  }, [isOpen, selectedMonth, selectedProperty, reportType]);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const summaryData = await summariesService.generateMonthlySummary(userId, {
        month: selectedMonth,
        propertyId: selectedProperty,
        reportType
      });
      setSummary(summaryData);
    } catch (error) {
      console.error('Error loading summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadExpenses = async () => {
    try {
      const expensesData = await summariesService.getBusinessExpenses(userId, {
        month: selectedMonth,
        propertyId: selectedProperty
      });
      setExpenses(expensesData);
    } catch (error) {
      console.error('Error loading expenses:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadSummary(), loadExpenses()]);
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
      await Promise.all([loadSummary(), loadExpenses()]);
    } catch (error) {
      console.error('Error saving expense:', error);
    }
  };

  const handleExpenseDelete = async (expenseId: number) => {
    if (window.confirm('Are you sure you want to delete this expense?')) {
      try {
        await summariesService.deleteBusinessExpense(expenseId);
        await Promise.all([loadSummary(), loadExpenses()]);
      } catch (error) {
        console.error('Error deleting expense:', error);
      }
    }
  };

  const handleDownloadPDF = () => {
    if (reportRef.current) {
      window.print();
    }
    alert('PDF download functionality will be implemented soon.  Contact us for feature requests.');
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
    <div className="fixed bottom-17 inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center mr-3">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Business Summary Report</h2>
                <p className="text-sm text-gray-500">{getMonthName(selectedMonth)}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Month</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Property</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <select
                  value={selectedProperty || ''}
                  onChange={(e) => setSelectedProperty(e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Report Type</label>
              <div className="relative">
                <TrendingUp className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as 'rent-based' | 'commission-based')}
                  className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="rent-based">Rent-Based</option>
                  <option value="commission-based">Commission-Based</option>
                </select>
              </div>
            </div>

            <div className="flex items-end gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm flex items-center justify-center"
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex items-center text-gray-500">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                Loading report...
              </div>
            </div>
          ) : summary ? (
            <div ref={reportRef} className="p-6 space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-xl border border-green-100">
                  <div className="flex items-center justify-between mb-2">
                    <DollarSign className="w-8 h-8 text-green-600" />
                    <span className="text-xs text-green-600 font-medium">GROSS INCOME</span>
                  </div>
                  <p className="text-2xl font-bold text-green-700">{formatCurrency(summary.grossIncome)}</p>
                  <div className="text-xs text-green-600 mt-1">
                    Rent: {formatCurrency(summary.grossRentIncome)} | 
                    Commission: {formatCurrency(summary.totalCommissionIncome)}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-100">
                  <div className="flex items-center justify-between mb-2">
                    <Calculator className="w-8 h-8 text-blue-600" />
                    <span className="text-xs text-blue-600 font-medium">NET INCOME</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-700">{formatCurrency(summary.netIncome)}</p>
                  <div className="text-xs text-blue-600 mt-1">
                    After all expenses
                  </div>
                </div>

                <div className="bg-gradient-to-br from-orange-50 to-red-50 p-4 rounded-xl border border-orange-100">
                  <div className="flex items-center justify-between mb-2">
                    <Receipt className="w-8 h-8 text-orange-600" />
                    <span className="text-xs text-orange-600 font-medium">EXPENSES</span>
                  </div>
                  <p className="text-2xl font-bold text-orange-700">
                    {formatCurrency(summary.totalBusinessExpenses + summary.totalDeductibles)}
                  </p>
                  <div className="text-xs text-orange-600 mt-1">
                    Business: {formatCurrency(summary.totalBusinessExpenses)}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-4 rounded-xl border border-purple-100">
                  <div className="flex items-center justify-between mb-2">
                    <Building2 className="w-8 h-8 text-purple-600" />
                    <span className="text-xs text-purple-600 font-medium">PROPERTIES</span>
                  </div>
                  <p className="text-2xl font-bold text-purple-700">{summary.totalPropertiesManaged}</p>
                  <div className="text-xs text-purple-600 mt-1">
                    {summary.totalUnitsManaged} units | {formatPercentage(summary.occupancyRate)} occupied
                  </div>
                </div>
              </div>

              {/* Property Breakdown */}
              {summary.propertyBreakdown.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200">
                  <div className="p-4 border-b border-gray-200">
                    <h3 className="font-semibold text-gray-900 flex items-center">
                      <BarChart3 className="w-5 h-5 mr-2 text-blue-600" />
                      Property Performance
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Property</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Rent Income</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Commission</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Expenses</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Net Income</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Occupancy</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {summary.propertyBreakdown.map((property) => (
                          <tr key={property.propertyId} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <div className="text-sm font-medium text-gray-900">{property.propertyName}</div>
                              <div className="text-xs text-gray-500">{property.unitsManaged} units</div>
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-gray-900">
                              {formatCurrency(property.rentIncome)}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-gray-900">
                              {formatCurrency(property.commissionIncome)}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-red-600">
                              {formatCurrency(property.expenses + property.deductibles)}
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                              {formatCurrency(property.netIncome)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                                property.occupancyRate >= 80 
                                  ? 'bg-green-100 text-green-800'
                                  : property.occupancyRate >= 50 
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {formatPercentage(property.occupancyRate)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Expenses Section */}
              <div className="bg-white rounded-xl border border-gray-200">
                <div className="p-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 flex items-center">
                      <Receipt className="w-5 h-5 mr-2 text-orange-600" />
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
                        <div key={expense.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex-1">
                            <div className="flex items-center mb-1">
                              <span className="text-sm font-medium text-gray-900">{expense.description}</span>
                              {expense.isRecurring && (
                                <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                                  Recurring
                                </span>
                              )}
                            </div>
                            <div className="flex items-center text-xs text-gray-500">
                              <span className="capitalize">{expense.category}</span>
                              {expense.propertyId && (
                                <>
                                  <span className="mx-2">•</span>
                                  <span>Property-specific</span>
                                </>
                              )}
                            </div>
                            {expense.notes && (
                              <p className="text-xs text-gray-600 mt-1">{expense.notes}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <span className="font-medium text-gray-900">{formatCurrency(expense.amount)}</span>
                            <button
                              onClick={() => {
                                setEditingExpense(expense);
                                setShowExpenseModal(true);
                              }}
                              className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleExpenseDelete(expense.id)}
                              className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <Receipt className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm">No expenses recorded for this period</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Expense Breakdown Chart */}
              {summary.expenseBreakdown.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200">
                  <div className="p-4 border-b border-gray-200">
                    <h3 className="font-semibold text-gray-900 flex items-center">
                      <PieChart className="w-5 h-5 mr-2 text-purple-600" />
                      Expense Breakdown
                    </h3>
                  </div>
                  <div className="p-4">
                    <div className="space-y-3">
                      {summary.expenseBreakdown.map((breakdown, index) => (
                        <div key={breakdown.category} className="flex items-center justify-between">
                          <div className="flex items-center">
                            <div 
                              className="w-3 h-3 rounded-full mr-3"
                              style={{ 
                                backgroundColor: `hsl(${index * 40}, 70%, 60%)` 
                              }}
                            />
                            <span className="text-sm text-gray-700 capitalize">{breakdown.category}</span>
                          </div>
                          <div className="flex items-center text-sm">
                            <span className="text-gray-900 font-medium mr-2">
                              {formatCurrency(breakdown.amount)}
                            </span>
                            <span className="text-gray-500">
                              ({formatPercentage(breakdown.percentage)})
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Summary Section */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                  <Calculator className="w-5 h-5 mr-2 text-blue-600" />
                  Financial Summary
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Gross Rent Income:</span>
                      <span className="font-medium">{formatCurrency(summary.grossRentIncome)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Commission Income:</span>
                      <span className="font-medium">{formatCurrency(summary.totalCommissionIncome)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Other Income:</span>
                      <span className="font-medium">{formatCurrency(summary.otherIncome)}</span>
                    </div>
                    <div className="flex justify-between border-t border-blue-200 pt-2">
                      <span className="font-semibold text-gray-900">Total Revenue:</span>
                      <span className="font-bold text-green-600">{formatCurrency(summary.grossIncome)}</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Business Expenses:</span>
                      <span className="font-medium text-red-600">-{formatCurrency(summary.totalBusinessExpenses)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Deductibles:</span>
                      <span className="font-medium text-red-600">-{formatCurrency(summary.totalDeductibles)}</span>
                    </div>
                    <div className="flex justify-between border-t border-blue-200 pt-2">
                      <span className="font-semibold text-gray-900">Net Income:</span>
                      <span className="font-bold text-blue-600">{formatCurrency(summary.netIncome)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Profit Margin:</span>
                      <span className="font-medium">
                        {summary.grossIncome > 0 ? formatPercentage((summary.netIncome / summary.grossIncome) * 100) : '0%'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Key Performance Indicators */}
              <div className="bg-white rounded-xl border border-gray-200">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-900 flex items-center">
                    <TrendingUp className="w-5 h-5 mr-2 text-green-600" />
                    Key Performance Indicators
                  </h3>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="text-center">
                      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Users className="w-8 h-8 text-green-600" />
                      </div>
                      <div className="text-2xl font-bold text-gray-900">{formatPercentage(summary.occupancyRate)}</div>
                      <div className="text-sm text-gray-500">Average Occupancy Rate</div>
                    </div>
                    <div className="text-center">
                      <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <DollarSign className="w-8 h-8 text-blue-600" />
                      </div>
                      <div className="text-2xl font-bold text-gray-900">{formatPercentage(summary.collectionRate)}</div>
                      <div className="text-sm text-gray-500">Collection Rate</div>
                    </div>
                    <div className="text-center">
                      <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <TrendingUp className="w-8 h-8 text-purple-600" />
                      </div>
                      <div className="text-2xl font-bold text-gray-900">{formatPercentage(summary.averageCommissionRate)}</div>
                      <div className="text-sm text-gray-500">Avg Commission Rate</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No data available for the selected period</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
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
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh Report
              </button>
              <button
                onClick={handleDownloadPDF}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center"
              >
                <Download className="w-4 h-4 mr-2" />
                Download PDF
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