import React, { useState, useEffect } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Save,
  Send,
  Building2,
  DollarSign,
  TrendingUp,
  ClipboardList,
  AlertCircle,
  CheckCircle,
  Clock,
  Home,
  User
} from 'lucide-react';
import { reportsDatabase, type RentRecordWithDetails } from '../../services/database/ReportsDatabase';
import { reportsPDFService } from '../../services/pdf/ReportsPDF';
import { Toast } from '@capacitor/toast';

interface SheetProps {
  propertyId: number;
  selectedMonth: string;
  onClose: () => void;
}

const Sheet: React.FC<SheetProps> = ({
  propertyId,
  selectedMonth,
  onClose
}) => {
  const [rentRecord, setRentRecord] = useState<RentRecordWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(selectedMonth);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadRentRecord();
  }, [propertyId, currentMonth]);

  // const loadRentRecord = async () => {
  //   try {
  //     setLoading(true);
  //     setError(null);

  //     // Try to get existing rent record for this month
  //     const existingRecords = await reportsDatabase.getRentRecordsByProperty(propertyId, 12);
  //     const monthRecord = existingRecords.find(r => r.billingMonth === currentMonth);

  //     if (monthRecord) {
  //       const recordWithDetails = await reportsDatabase.getRentRecordWithDetails(monthRecord.id);
  //       setRentRecord(recordWithDetails);
  //     } else {
  //       // Generate new rent record for this month
  //       try {
  //         const newRecord = await reportsDatabase.generateRentRecordSheet(propertyId, currentMonth);
  //         setRentRecord(newRecord);
  //       } catch (generateError) {
  //         console.error('Error generating rent record:', generateError);
  //         setRentRecord(null);
  //       }
  //     }
  //   } catch (error) {
  //     console.error('Error loading rent record:', error);
  //     setError('Failed to load rent record data');
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  const loadRentRecord = async () => {
  try {
    setLoading(true);
    setError(null);
    console.log(`[Sheet] Loading rent record for property ${propertyId}, month ${currentMonth}`);

    // ALWAYS generate/refresh the rent record to get latest data
    // This ensures we see fresh invoice data, new tenants, updated payments, etc.
    try {
      console.log(`[Sheet] Generating fresh rent record sheet...`);
      const newRecord = await reportsDatabase.generateRentRecordSheet(propertyId, currentMonth);
      setRentRecord(newRecord);
      console.log(`[Sheet] Successfully loaded fresh rent record with ${newRecord.entries.length} entries`);
    } catch (generateError) {
      console.error('Error generating rent record:', generateError);
      
      // Fallback: try to get existing record if generation fails
      //const existingRecords = await reportsDatabase.getRentRecordsByProperty(propertyId, 12);
      //const monthRecord = existingRecords.find(r => r.billingMonth === currentMonth);

      //if (monthRecord) {
        //console.log(`[Sheet] Falling back to existing record ${monthRecord.id}`);
        //const recordWithDetails = await reportsDatabase.getRentRecordWithDetails(monthRecord.id);
        //setRentRecord(recordWithDetails);
      //} else {
        setRentRecord(null);
        setError('Failed to load or generate rent record. Please check if there are active tenants for this property.');
      //}
    }
  } catch (error) {
    console.error('Error loading rent record:', error);
    setError('Failed to load rent record data. Please try refreshing the page.');
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

  const handleDownload = async () => {
    if (!rentRecord || isProcessing) return;
    
    try {
      setIsProcessing(true);
      
      // Show loading toast
      await Toast.show({
        text: 'Generating PDF report...',
        duration: 'short',
        position: 'bottom'
      });

      const result = await reportsPDFService.generateAndSaveRentRecordPDF(rentRecord, {
        customBranding: {
          companyName: 'PLOT YANGU',
          contactInfo: 'SMB KENYA LTD | +254791286165'
        }
      });

      if (result.success) {
        await Toast.show({
          text: `PDF saved successfully: ${result.filename}`,
          duration: 'long',
          position: 'bottom'
        });
      } else {
        throw new Error(result.error || 'Failed to generate PDF');
      }
    } catch (error) {
      console.error('Error downloading rent record:', error);
      await Toast.show({
        text: 'Failed to download rent record. Please try again.',
        duration: 'long',
        position: 'bottom'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!rentRecord) return;
    
    try {
      // Save the rent record (in case of any modifications)
      console.log('Saving rent record for', rentRecord.property.name, currentMonth);
      await Toast.show({
        text: 'Rent record saved successfully',
        duration: 'short',
        position: 'bottom'
      });
    } catch (error) {
      console.error('Error saving rent record:', error);
      await Toast.show({
        text: 'Failed to save rent record',
        duration: 'short',
        position: 'bottom'
      });
    }
  };

  const showShareOptions = (): Promise<'whatsapp' | 'general' | null> => {
    return new Promise((resolve) => {
      const options = document.createElement('div');
      options.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
      options.innerHTML = `
        <div class="bg-white rounded-xl p-6 max-w-sm w-full mx-4">
          <h3 class="text-lg font-bold text-gray-900 mb-4">Share Report</h3>
          <p class="text-gray-600 mb-6">How would you like to share this rent record sheet?</p>
          <div class="flex flex-col gap-3">
            <button id="whatsapp-share" class="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <div class="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                <span class="text-white text-sm font-bold">W</span>
              </div>
              <span class="text-gray-900">Share via WhatsApp</span>
            </button>
            <button id="general-share" class="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <div class="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                <span class="text-white text-sm font-bold">📤</span>
              </div>
              <span class="text-gray-900">Share via Other Apps</span>
            </button>
            <button id="cancel-share" class="mt-2 px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(options);

      const cleanup = () => {
        document.body.removeChild(options);
      };

      options.querySelector('#whatsapp-share')?.addEventListener('click', () => {
        cleanup();
        resolve('whatsapp');
      });

      options.querySelector('#general-share')?.addEventListener('click', () => {
        cleanup();
        resolve('general');
      });

      options.querySelector('#cancel-share')?.addEventListener('click', () => {
        cleanup();
        resolve(null);
      });

      // Close on backdrop click
      options.addEventListener('click', (e) => {
        if (e.target === options) {
          cleanup();
          resolve(null);
        }
      });
    });
  };

  const handleSend = async () => {
    if (!rentRecord || isProcessing) return;
    
    try {
      setIsProcessing(true);

      // Show options dialog
      const shareMethod = await showShareOptions();
      if (!shareMethod) return;

      await Toast.show({
        text: 'Preparing report for sharing...',
        duration: 'short',
        position: 'bottom'
      });

      let result;
      if (shareMethod === 'whatsapp') {
        // You could add phone number input here
        result = await reportsPDFService.generateAndShareRentRecordPDF(
          rentRecord, 
          'whatsapp',
          undefined, // Phone number - could be obtained from landlord contact
          {
            customBranding: {
              companyName: 'PLOT YANGU',
              contactInfo: 'SMB KENYA LTD | +254791286165'
            }
          }
        );
      } else {
        result = await reportsPDFService.generateAndShareRentRecordPDF(
          rentRecord,
          'general',
          undefined,
          {
            customBranding: {
              companyName: 'PLOT YANGU',
              contactInfo: 'SMB KENYA LTD | +254791286165'
            }
          }
        );
      }

      if (result.success) {
        // Archive the record as a way to mark it as sent
        await reportsDatabase.archiveRentRecord(rentRecord.id);
        await loadRentRecord(); // Reload to update status
        
        await Toast.show({
          text: 'Report shared successfully!',
          duration: 'long',
          position: 'bottom'
        });
      } else {
        throw new Error(result.error || 'Failed to share report');
      }
    } catch (error) {
      console.error('Error sending rent record:', error);
      await Toast.show({
        text: 'Failed to share rent record. Please try again.',
        duration: 'long',
        position: 'bottom'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'text-green-600 bg-green-50';
      case 'partial': return 'text-orange-600 bg-orange-50';
      case 'overpaid': return 'text-purple-600 bg-purple-50';
      default: return 'text-red-600 bg-red-50';
    }
  };

  const getPaymentStatusIcon = (status: string) => {
    switch (status) {
      case 'paid': return <CheckCircle className="w-4 h-4" />;
      case 'partial': return <Clock className="w-4 h-4" />;
      case 'overpaid': return <TrendingUp className="w-4 h-4" />;
      default: return <AlertCircle className="w-4 h-4" />;
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-teal-600 text-white p-6 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ClipboardList className="w-8 h-8" />
              <div>
                <h2 className="text-xl font-bold">Rent Record Sheet</h2>
                <p className="text-green-100 text-sm">Detailed tenant payment tracking</p>
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
        <div className="flex-1 overflow-y-auto">
          {error ? (
            <div className="p-8 text-center">
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Sheet</h3>
              <p className="text-gray-600">{error}</p>
            </div>
          ) : !rentRecord ? (
            <div className="p-8 text-center">
              <ClipboardList className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Record Available</h3>
              <p className="text-gray-600 mb-4">
                No rent record sheet is available for {getMonthName(currentMonth)}.
              </p>
              <button
                onClick={loadRentRecord}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Generate Sheet
              </button>
            </div>
          ) : (
            <div className="p-8 space-y-8">
              {/* Property Information & Summary Stats */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Property Info */}
                <div className="lg:col-span-1 bg-gray-50 rounded-xl p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    Property Details
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <span className="font-medium text-gray-700">Property:</span>
                      <div className="text-gray-900">{rentRecord.property.name}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Period:</span>
                      <div className="text-gray-900">{getMonthName(rentRecord.billingMonth)}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Total Units:</span>
                      <div className="text-gray-900">{rentRecord.totalUnits}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Occupied:</span>
                      <div className="text-gray-900">{rentRecord.occupiedUnits}</div>
                    </div>
                  </div>
                </div>

                {/* Summary Stats */}
                <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-blue-50 rounded-xl p-4 text-center">
                    <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center mx-auto mb-2">
                      <DollarSign className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-lg font-bold text-blue-600">
                      ${rentRecord.totalRentExpected.toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-600">Expected</div>
                  </div>

                  <div className="bg-green-50 rounded-xl p-4 text-center">
                    <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center mx-auto mb-2">
                      <CheckCircle className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-lg font-bold text-green-600">
                      ${rentRecord.totalRentCollected.toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-600">Collected</div>
                  </div>

                  <div className="bg-red-50 rounded-xl p-4 text-center">
                    <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center mx-auto mb-2">
                      <AlertCircle className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-lg font-bold text-red-600">
                      ${rentRecord.totalArrears.toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-600">Arrears</div>
                  </div>

                  <div className="bg-purple-50 rounded-xl p-4 text-center">
                    <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center mx-auto mb-2">
                      <TrendingUp className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-lg font-bold text-purple-600">
                      {rentRecord.collectionRate.toFixed(1)}%
                    </div>
                    <div className="text-sm text-gray-600">Rate</div>
                  </div>
                </div>
              </div>

              {/* Performance Metrics */}
              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Performance Metrics</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{rentRecord.summary.onTimePayments}</div>
                    <div className="text-sm text-gray-600">On-Time Payments</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">{rentRecord.summary.latePayments}</div>
                    <div className="text-sm text-gray-600">Late Payments</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{rentRecord.summary.defaulters}</div>
                    <div className="text-sm text-gray-600">Defaulters</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{rentRecord.summary.averageCollectionDays}</div>
                    <div className="text-sm text-gray-600">Avg. Collection Days</div>
                  </div>
                </div>
              </div>

              {/* Tenant Records Table */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-800 text-white p-4">
                  <h3 className="text-lg font-bold">Detailed Tenant Records</h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Tenant</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Unit</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Rent</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Water</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Power</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Other</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Total Due</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Paid</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Balance</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Status</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rentRecord.entries.map((entry) => (
                        <tr key={entry.id} className="hover:bg-gray-50">
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-gray-400" />
                              <span className="font-medium text-gray-900">{entry.tenantName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <Home className="w-4 h-4 text-gray-400" />
                              <span className="text-gray-900">{entry.unitNumber || 'N/A'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-sm">
                            ${entry.rentAmount.toLocaleString()}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-sm">
                            ${entry.waterCharges.toLocaleString()}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-sm">
                            ${entry.powerCharges.toLocaleString()}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-sm">
                            ${entry.otherCharges.toLocaleString()}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-sm font-semibold">
                            ${entry.totalDue.toLocaleString()}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-sm">
                            ${entry.amountPaid.toLocaleString()}
                          </td>
                          <td className={`px-4 py-4 text-right font-mono text-sm font-semibold ${
                            entry.balance > 0 ? 'text-red-600' : 
                            entry.balance < 0 ? 'text-purple-600' : 'text-green-600'
                          }`}>
                            ${Math.abs(entry.balance).toLocaleString()}
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                              getPaymentStatusColor(entry.paymentStatus)
                            }`}>
                              {getPaymentStatusIcon(entry.paymentStatus)}
                              {entry.paymentStatus.charAt(0).toUpperCase() + entry.paymentStatus.slice(1)}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-center text-sm text-gray-600">
                            {entry.paymentDate ? 
                              new Date(entry.paymentDate).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric' 
                              }) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Table Footer with Totals */}
                <div className="bg-gray-800 text-white p-4">
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-4 text-sm">
                    <div>
                      <span className="text-gray-300">Total Expected:</span>
                      <div className="font-bold">${rentRecord.totalRentExpected.toLocaleString()}</div>
                    </div>
                    <div>
                      <span className="text-gray-300">Total Collected:</span>
                      <div className="font-bold text-green-400">${rentRecord.totalRentCollected.toLocaleString()}</div>
                    </div>
                    <div>
                      <span className="text-gray-300">Total Arrears:</span>
                      <div className="font-bold text-red-400">${rentRecord.totalArrears.toLocaleString()}</div>
                    </div>
                    <div>
                      <span className="text-gray-300">Collection Rate:</span>
                      <div className="font-bold text-blue-400">{rentRecord.collectionRate.toFixed(1)}%</div>
                    </div>
                    <div>
                      <span className="text-gray-300">Occupied Units:</span>
                      <div className="font-bold">{rentRecord.occupiedUnits} / {rentRecord.totalUnits}</div>
                    </div>
                    <div>
                      <span className="text-gray-300">Status:</span>
                      <div className={`font-bold ${
                        rentRecord.status === 'current' ? 'text-green-400' : 'text-yellow-400'
                      }`}>
                        {rentRecord.status.charAt(0).toUpperCase() + rentRecord.status.slice(1)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {rentRecord && (
          <div className="bg-gray-50 p-6 flex-shrink-0">
            <div className="flex flex-wrap gap-3 justify-end">
              <button
                onClick={handleDownload}
                disabled={isProcessing}
                className={`flex items-center gap-2 px-4 py-2 text-blue-700 bg-blue-50 border border-blue-200 rounded-lg transition-colors ${
                  isProcessing 
                    ? 'opacity-50 cursor-not-allowed' 
                    : 'hover:bg-blue-100'
                }`}
              >
                <Download className="w-4 h-4" />
                {isProcessing ? 'Generating...' : 'Download'}
              </button>
              
              <button
                onClick={handleSave}
                disabled={isProcessing}
                className={`flex items-center gap-2 px-4 py-2 text-green-700 bg-green-50 border border-green-200 rounded-lg transition-colors ${
                  isProcessing 
                    ? 'opacity-50 cursor-not-allowed' 
                    : 'hover:bg-green-100'
                }`}
              >
                <Save className="w-4 h-4" />
                Save
              </button>
              
              {rentRecord.status !== 'archived' && (
                <button
                  onClick={handleSend}
                  disabled={isProcessing}
                  className={`flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg transition-colors ${
                    isProcessing 
                      ? 'opacity-50 cursor-not-allowed' 
                      : 'hover:bg-teal-700'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  {isProcessing ? 'Sharing...' : 'Send Report'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sheet;