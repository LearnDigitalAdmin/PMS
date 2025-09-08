import React, { useState, useEffect } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Save,
  Send,
  Building2,
  Calendar,
  User,
  Phone,
  MapPin,
  FileText,
  AlertCircle} from 'lucide-react';
import { reportsDatabase, type TranscriptWithDetails } from '../../services/database/ReportsDatabase';

interface TranscriptProps {
  propertyId: number;
  selectedMonth: string;
  onClose: () => void;
}

const Transcript: React.FC<TranscriptProps> = ({
  propertyId,
  selectedMonth,
  onClose
}) => {
  const [transcript, setTranscript] = useState<TranscriptWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(selectedMonth);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTranscript();
  }, [propertyId, currentMonth]);

  const loadTranscript = async () => {
    try {
      setLoading(true);
      setError(null);

      // Try to get existing transcript for this month
      const existingTranscripts = await reportsDatabase.getTranscriptsByProperty(propertyId, 12);
      const monthTranscript = existingTranscripts.find(t => t.billingMonth === currentMonth);

      if (monthTranscript) {
        const transcriptWithDetails = await reportsDatabase.getTranscriptWithDetails(monthTranscript.id);
        setTranscript(transcriptWithDetails);
      } else {
        // No transcript exists for this month
        setTranscript(null);
      }
    } catch (error) {
      console.error('Error loading transcript:', error);
      setError('Failed to load transcript data');
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
    if (!transcript) return;
    
    try {
      // This would integrate with PDF generation
      console.log('Downloading transcript for', transcript.property.name, currentMonth);
      // await reportsDatabase.exportTranscriptToPDF(transcript.id);
    } catch (error) {
      console.error('Error downloading transcript:', error);
    }
  };

  const handleSave = async () => {
    if (!transcript) return;
    
    try {
      // Save the transcript (in case of any modifications)
      console.log('Saving transcript for', transcript.property.name, currentMonth);
    } catch (error) {
      console.error('Error saving transcript:', error);
    }
  };

  const handleSend = async () => {
    if (!transcript) return;
    
    try {
      await reportsDatabase.updateTranscriptStatus(transcript.id, 'sent');
      await loadTranscript(); // Reload to update status
    } catch (error) {
      console.error('Error sending transcript:', error);
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
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-8 h-8" />
              <div>
                <h2 className="text-xl font-bold">Monthly Transcript</h2>
                <p className="text-blue-100 text-sm">Professional landlord remittance report</p>
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
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Transcript</h3>
              <p className="text-gray-600">{error}</p>
            </div>
          ) : !transcript ? (
            <div className="p-8 text-center">
              <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Transcript Available</h3>
              <p className="text-gray-600 mb-4">
                No transcript has been generated for {getMonthName(currentMonth)} yet.
              </p>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create Transcript
              </button>
            </div>
          ) : (
            <div className="p-8 space-y-8">
              {/* Property & Landlord Information */}
              <div className="bg-gray-50 rounded-xl p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <Building2 className="w-5 h-5" />
                      Property Information
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-700">Property:</span>
                        <span className="text-gray-900">{transcript.property.name}</span>
                      </div>
                      {transcript.property.address && (
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-600">{transcript.property.address}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-600">Period: {getMonthName(transcript.billingMonth)}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <User className="w-5 h-5" />
                      Landlord Information
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-700">Name:</span>
                        <span className="text-gray-900">{transcript.landlordName}</span>
                      </div>
                      {transcript.landlordContact && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-gray-500" />
                          <span className="text-gray-600">{transcript.landlordContact}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-700">Units:</span>
                        <span className="text-gray-600">
                          {transcript.tenantSummary.activeTenants} occupied / {transcript.property.maxUnits} total
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Status Badge */}
                <div className="mt-6 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">Status:</span>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      transcript.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                      transcript.status === 'finalized' ? 'bg-blue-100 text-blue-800' :
                      transcript.status === 'sent' ? 'bg-green-100 text-green-800' :
                      transcript.status === 'acknowledged' ? 'bg-purple-100 text-purple-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {transcript.status.charAt(0).toUpperCase() + transcript.status.slice(1)}
                    </span>
                  </div>
                  
                  {transcript.sentDate && (
                    <div className="text-sm text-gray-600">
                      Sent: {new Date(transcript.sentDate).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>

              {/* Financial Summary */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-800 text-white p-4">
                  <h3 className="text-lg font-bold">Financial Summary</h3>
                </div>
                
                <div className="p-6">
                  <div className="space-y-4">
                    {transcript.items
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map((item, index) => (
                        <div key={item.id} className={`flex justify-between items-center py-3 ${
                          index > 0 ? 'border-t border-gray-100' : ''
                        }`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${
                              item.type === 'rent' ? 'bg-green-500' :
                              item.type === 'water' ? 'bg-blue-500' :
                              item.type === 'power' ? 'bg-yellow-500' :
                              item.isDeductible ? 'bg-red-500' :
                              'bg-gray-500'
                            }`}></div>
                            <div>
                              <span className="font-medium text-gray-900">{item.description}</span>
                              {item.category && (
                                <span className="text-sm text-gray-500 ml-2">({item.category})</span>
                              )}
                            </div>
                          </div>
                          <div className={`text-lg font-bold ${
                            item.isDeductible ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {item.isDeductible ? '-' : '+'}${item.amount.toLocaleString()}
                          </div>
                        </div>
                      ))}
                  </div>

                  {/* Totals */}
                  <div className="mt-6 pt-6 border-t-2 border-gray-800 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-700">Gross Income:</span>
                      <span className="text-lg font-bold text-green-600">
                        ${(transcript.grossRentCollected + transcript.totalWaterCharges + 
                           transcript.totalPowerCharges + transcript.totalOtherCharges).toLocaleString()}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-700">Total Deductions:</span>
                      <span className="text-lg font-bold text-red-600">
                        -${transcript.totalDeductibles.toLocaleString()}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center bg-blue-50 p-4 rounded-lg">
                      <span className="text-xl font-bold text-gray-900">Net Amount to Landlord:</span>
                      <span className="text-2xl font-bold text-blue-600">
                        ${transcript.netAmountToLandlord.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tenant Summary */}
              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Tenant Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">{transcript.tenantSummary.totalTenants}</div>
                    <div className="text-sm text-gray-600">Total Tenants</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{transcript.tenantSummary.activeTenants}</div>
                    <div className="text-sm text-gray-600">Active</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{transcript.tenantSummary.paidInvoices}</div>
                    <div className="text-sm text-gray-600">Paid Bills</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{transcript.tenantSummary.unpaidInvoices}</div>
                    <div className="text-sm text-gray-600">Unpaid Bills</div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {transcript.notes && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-3">Additional Notes</h3>
                  <p className="text-gray-700 leading-relaxed">{transcript.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {transcript && (
          <div className="bg-gray-50 p-6 flex-shrink-0">
            <div className="flex flex-wrap gap-3 justify-end">
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
              
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
              >
                <Save className="w-4 h-4" />
                Save
              </button>
              
              {transcript.status !== 'sent' && transcript.status !== 'acknowledged' && (
                <button
                  onClick={handleSend}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  <Send className="w-4 h-4" />
                  Send to Landlord
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Transcript;