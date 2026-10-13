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
  AlertCircle,
  Eye
} from 'lucide-react';
import { reportsDatabase, type TranscriptWithDetails } from '../../services/database/ReportsDatabase';
import { reportsPDFService } from '../../services/pdf/ReportsPDF';
import { Toast } from '@capacitor/toast';

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
  const [isProcessing, setIsProcessing] = useState(false);

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

  const handlePreview = async () => {
    if (!transcript || isProcessing) return;

    try {
      setIsProcessing(true);
      
      await Toast.show({
        text: 'Generating preview...',
        duration: 'short',
        position: 'bottom'
      });

      const previewUrl = await reportsPDFService.generateTranscriptPreview(transcript);
      
      // Open preview in a new window/tab
      const previewWindow = window.open(previewUrl, '_blank');
      if (!previewWindow) {
        throw new Error('Please allow pop-ups to view the preview');
      }

    } catch (error) {
      console.error('Error generating preview:', error);
      await Toast.show({
        text: 'Failed to generate preview. Please try again.',
        duration: 'long',
        position: 'bottom'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = async () => {
    if (!transcript || isProcessing) return;
    
    try {
      setIsProcessing(true);
      
      // Show loading toast
      await Toast.show({
        text: 'Generating PDF transcript...',
        duration: 'short',
        position: 'bottom'
      });

      const result = await reportsPDFService.generateAndSaveTranscriptPDF(transcript, {
        customBranding: {
          companyName: 'PLOT YANGU',
          contactInfo: 'PLOT YANGU | +254791286165'
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
      console.error('Error downloading transcript:', error);
      await Toast.show({
        text: 'Failed to download transcript. Please try again.',
        duration: 'long',
        position: 'bottom'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!transcript) return;
    
    try {
      // Save the transcript (in case of any modifications)
      console.log('Saving transcript for', transcript.property.name, currentMonth);
      await Toast.show({
        text: 'Transcript saved successfully',
        duration: 'short',
        position: 'bottom'
      });
    } catch (error) {
      console.error('Error saving transcript:', error);
      await Toast.show({
        text: 'Failed to save transcript',
        duration: 'short',
        position: 'bottom'
      });
    }
  };

  const showTranscriptShareOptions = (): Promise<{ method: 'whatsapp' | 'general'; phoneNumber?: string } | null> => {
    return new Promise((resolve) => {
      const options = document.createElement('div');
      options.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
      options.innerHTML = `
        <div class="bg-white rounded-xl p-6 max-w-md w-full mx-4">
          <h3 class="text-lg font-bold text-ink mb-4">Send Transcript to Landlord</h3>
          <p class="text-gray-600 mb-6">Choose how to send the monthly remittance transcript to <strong>${transcript?.landlordName}</strong></p>
          
          <div class="space-y-4">
            <!-- WhatsApp Option -->
            <div class="border border-line rounded-lg p-4">
              <label class="flex items-start gap-3 cursor-pointer">
                <input type="radio" name="shareMethod" value="whatsapp" class="mt-1" ${transcript?.landlordContact ? 'checked' : ''}>
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-2">
                    <div class="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                      <span class="text-white text-xs font-bold">W</span>
                    </div>
                    <span class="font-medium text-gray-900">Send via WhatsApp</span>
                  </div>
                  <input type="tel"
                         id="phoneInput"
                         placeholder="Enter landlord's phone number"
                         value="${transcript?.landlordContact || ''}"
                         class="w-full mt-2 px-3 py-2 border border-line-strong rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <p class="text-xs text-ink-subtle mt-1">Direct delivery with read receipts</p>
                </div>
              </label>
            </div>

            <!-- General Share Option -->
            <div class="border border-line rounded-lg p-4">
              <label class="flex items-start gap-3 cursor-pointer">
                <input type="radio" name="shareMethod" value="general" class="mt-1" ${!transcript?.landlordContact ? 'checked' : ''}>
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-2">
                    <div class="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                      <span class="text-white text-xs">📤</span>
                    </div>
                    <span class="font-medium text-gray-900">Share via Other Apps</span>
                  </div>
                  <p class="text-xs text-gray-500">Email, SMS, or other messaging apps</p>
                </div>
              </label>
            </div>
          </div>

          <div class="flex gap-3 mt-6">
            <button id="cancel-transcript" class="flex-1 px-4 py-2 text-ink-muted border border-line-strong rounded-lg hover:bg-surface-muted transition-colors">
              Cancel
            </button>
            <button id="send-transcript" class="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
              Send Transcript
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(options);

      const cleanup = () => {
        document.body.removeChild(options);
      };

      // Handle radio button changes
      const radioButtons = options.querySelectorAll('input[name="shareMethod"]');
      const phoneInput = options.querySelector('#phoneInput') as HTMLInputElement;

      radioButtons.forEach(radio => {
        radio.addEventListener('change', (e) => {
          const target = e.target as HTMLInputElement;
          phoneInput.disabled = target.value !== 'whatsapp';
          if (target.value !== 'whatsapp') {
            phoneInput.classList.add('opacity-50');
          } else {
            phoneInput.classList.remove('opacity-50');
            phoneInput.focus();
          }
        });
      });

      // Initialize state
      if (!transcript?.landlordContact) {
        phoneInput.disabled = true;
        phoneInput.classList.add('opacity-50');
      }

      options.querySelector('#send-transcript')?.addEventListener('click', () => {
        const selectedMethod = options.querySelector('input[name="shareMethod"]:checked') as HTMLInputElement;
        if (selectedMethod) {
          const method = selectedMethod.value as 'whatsapp' | 'general';
          const phoneNumber = phoneInput.value.trim();
          
          if (method === 'whatsapp' && !phoneNumber) {
            Toast.show({
              text: 'Please enter landlord\'s phone number for WhatsApp sharing',
              duration: 'short',
              position: 'bottom'
            });
            return;
          }

          cleanup();
          resolve({
            method,
            phoneNumber: method === 'whatsapp' ? phoneNumber : undefined
          });
        }
      });

      options.querySelector('#cancel-transcript')?.addEventListener('click', () => {
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
    if (!transcript || isProcessing) return;
    
    try {
      setIsProcessing(true);

      // Show options dialog
      const shareOptions = await showTranscriptShareOptions();
      if (!shareOptions) return;

      await Toast.show({
        text: 'Preparing transcript for sharing...',
        duration: 'short',
        position: 'bottom'
      });

      let result;
      if (shareOptions.method === 'whatsapp') {
        result = await reportsPDFService.generateAndShareTranscriptPDF(
          transcript, 
          'whatsapp',
          shareOptions.phoneNumber || transcript.landlordContact, // Use landlord contact if available
          {
            customBranding: {
              companyName: 'PLOT YANGU',
              contactInfo: 'PLOT YANGU | +254791286165'
            }
          }
        );
      } else {
        result = await reportsPDFService.generateAndShareTranscriptPDF(
          transcript,
          'general',
          undefined,
          {
            customBranding: {
              companyName: 'PLOT YANGU',
              contactInfo: 'PLOT YANGU | +254791286165'
            }
          }
        );
      }

      if (result.success) {
        // Update transcript status to sent
        await reportsDatabase.updateTranscriptStatus(transcript.id, 'sent');
        await loadTranscript(); // Reload to update status
        
        await Toast.show({
          text: 'Transcript sent successfully to landlord!',
          duration: 'long',
          position: 'bottom'
        });
      } else {
        throw new Error(result.error || 'Failed to share transcript');
      }
    } catch (error) {
      console.error('Error sending transcript:', error);
      await Toast.show({
        text: 'Failed to send transcript. Please try again.',
        duration: 'long',
        position: 'bottom'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-surface rounded-2xl p-8 max-w-md w-full mx-4">
          <div className="animate-pulse">
            <div className="h-6 bg-track rounded mb-4"></div>
            <div className="h-4 bg-track rounded mb-2"></div>
            <div className="h-4 bg-track rounded mb-2"></div>
            <div className="h-4 bg-track rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-brand-600 to-indigo-700 text-white p-6 flex-shrink-0">
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
              <h3 className="text-lg font-semibold text-ink mb-2">Error Loading Transcript</h3>
              <p className="text-ink-muted">{error}</p>
            </div>
          ) : !transcript ? (
            <div className="p-8 text-center">
              <FileText className="w-16 h-16 text-ink-faint mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-ink mb-2">No Transcript Available</h3>
              <p className="text-ink-muted mb-4">
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
              <div className="bg-surface-muted rounded-xl p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-bold text-ink mb-4 flex items-center gap-2">
                      <Building2 className="w-5 h-5" />
                      Property Information
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink-soft">Property:</span>
                        <span className="text-ink">{transcript.property.name}</span>
                      </div>
                      {transcript.property.address && (
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-ink-subtle mt-0.5 flex-shrink-0" />
                          <span className="text-ink-muted">{transcript.property.address}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-ink-subtle" />
                        <span className="text-ink-muted">Period: {getMonthName(transcript.billingMonth)}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-ink mb-4 flex items-center gap-2">
                      <User className="w-5 h-5" />
                      Landlord Information
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink-soft">Name:</span>
                        <span className="text-ink">{transcript.landlordName}</span>
                      </div>
                      {transcript.landlordContact && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-ink-subtle" />
                          <span className="text-ink-muted">{transcript.landlordContact}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink-soft">Units:</span>
                        <span className="text-ink-muted">
                          {transcript.tenantSummary.activeTenants} occupied / {transcript.property.maxUnits} total
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Status Badge */}
                <div className="mt-6 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-soft">Status:</span>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      transcript.status === 'draft' ? 'bg-yellow-100 dark:bg-yellow-500/15 text-yellow-800 dark:text-yellow-300' :
                      transcript.status === 'finalized' ? 'bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300' :
                      transcript.status === 'sent' ? 'bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-300' :
                      transcript.status === 'acknowledged' ? 'bg-purple-100 dark:bg-purple-500/15 text-purple-800 dark:text-purple-300' :
                      'bg-surface-sunken text-ink'
                    }`}>
                      {transcript.status.charAt(0).toUpperCase() + transcript.status.slice(1)}
                    </span>
                  </div>
                  
                  {transcript.sentDate && (
                    <div className="text-sm text-ink-muted">
                      Sent: {new Date(transcript.sentDate).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>

              {/* Financial Summary */}
              <div className="bg-surface border border-line rounded-xl overflow-hidden">
                <div className="bg-gray-800 text-white p-4">
                  <h3 className="text-lg font-bold">Financial Summary</h3>
                </div>
                
                <div className="p-6">
                  <div className="space-y-4">
                    {transcript.items
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map((item, index) => (
                        <div key={item.id} className={`flex justify-between items-center py-3 ${
                          index > 0 ? 'border-t border-line-soft' : ''
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
                              <span className="font-medium text-ink">{item.description}</span>
                              {item.category && (
                                <span className="text-sm text-ink-subtle ml-2">({item.category})</span>
                              )}
                            </div>
                          </div>
                          <div className={`text-lg font-bold ${
                            item.isDeductible ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                          }`}>
                            {item.isDeductible ? '-' : '+'}${item.amount.toLocaleString()}
                          </div>
                        </div>
                      ))}
                  </div>

                  {/* Totals */}
                  <div className="mt-6 pt-6 border-t-2 border-gray-800 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-ink-soft">Gross Income:</span>
                      <span className="text-lg font-bold text-green-600 dark:text-green-400">
                        ${(transcript.grossRentCollected + transcript.totalWaterCharges + 
                           transcript.totalPowerCharges + transcript.totalOtherCharges).toLocaleString()}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-ink-soft">Total Deductions:</span>
                      <span className="text-lg font-bold text-red-600 dark:text-red-400">
                        -${transcript.totalDeductibles.toLocaleString()}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center bg-blue-50 dark:bg-blue-500/10 p-4 rounded-lg">
                      <span className="text-xl font-bold text-ink">Net Amount to Landlord:</span>
                      <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        ${transcript.netAmountToLandlord.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tenant Summary */}
              <div className="bg-surface-muted rounded-xl p-6">
                <h3 className="text-lg font-bold text-ink mb-4">Tenant Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-ink">{transcript.tenantSummary.totalTenants}</div>
                    <div className="text-sm text-ink-muted">Total Tenants</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">{transcript.tenantSummary.activeTenants}</div>
                    <div className="text-sm text-ink-muted">Active</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{transcript.tenantSummary.paidInvoices}</div>
                    <div className="text-sm text-ink-muted">Paid Bills</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">{transcript.tenantSummary.unpaidInvoices}</div>
                    <div className="text-sm text-ink-muted">Unpaid Bills</div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {transcript.notes && (
                <div className="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/25 rounded-xl p-6">
                  <h3 className="text-lg font-bold text-ink mb-3">Additional Notes</h3>
                  <p className="text-ink-soft leading-relaxed">{transcript.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {transcript && (
          <div className="bg-surface-muted p-6 flex-shrink-0">
            <div className="flex flex-wrap gap-3 justify-end">
              <button
                onClick={handlePreview}
                disabled={isProcessing}
                className={`flex items-center gap-2 px-4 py-2 text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/25 rounded-lg transition-colors ${
                  isProcessing 
                    ? 'opacity-50 cursor-not-allowed' 
                    : 'hover:bg-purple-100 dark:hover:bg-purple-500/15'
                }`}
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>

              <button
                onClick={handleDownload}
                disabled={isProcessing}
                className={`flex items-center gap-2 px-4 py-2 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/25 rounded-lg transition-colors ${
                  isProcessing 
                    ? 'opacity-50 cursor-not-allowed' 
                    : 'hover:bg-blue-100 dark:hover:bg-blue-500/15'
                }`}
              >
                <Download className="w-4 h-4" />
                {isProcessing ? 'Generating...' : 'Download'}
              </button>
              
              <button
                onClick={handleSave}
                disabled={isProcessing}
                className={`flex items-center gap-2 px-4 py-2 text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/25 rounded-lg transition-colors ${
                  isProcessing 
                    ? 'opacity-50 cursor-not-allowed' 
                    : 'hover:bg-green-100 dark:hover:bg-green-500/15'
                }`}
              >
                <Save className="w-4 h-4" />
                Save
              </button>
              
              {transcript.status !== 'sent' && transcript.status !== 'acknowledged' && (
                <button
                  onClick={handleSend}
                  disabled={isProcessing}
                  className={`flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg transition-colors ${
                    isProcessing 
                      ? 'opacity-50 cursor-not-allowed' 
                      : 'hover:bg-purple-700'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  {isProcessing ? 'Sending...' : 'Send to Landlord'}
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