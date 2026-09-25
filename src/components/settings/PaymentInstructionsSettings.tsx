import React, { useState, useEffect } from 'react';
import { CreditCard, Check } from 'lucide-react';
import {
  type PaymentInstructions,
  getGlobalPaymentInstructions,
  saveGlobalPaymentInstructions
} from '../../services/settings/PaymentSettings';

// Global payment instructions editor. Every invoice forks a read-only copy
// of whatever is saved here — invoices no longer let you edit these details
// individually, so this is the one place to keep them current.
const PaymentInstructionsSettings: React.FC = () => {
  const [instructions, setInstructions] = useState<PaymentInstructions>({});
  const [savedRecently, setSavedRecently] = useState(false);

  useEffect(() => {
    setInstructions(getGlobalPaymentInstructions());
  }, []);

  const updateField = (field: keyof PaymentInstructions, value: string) => {
    setInstructions(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    saveGlobalPaymentInstructions(instructions);
    setSavedRecently(true);
    setTimeout(() => setSavedRecently(false), 2000);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <CreditCard className="w-5 h-5 text-purple-500" />
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Payment Instructions</h3>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        These details appear on every invoice you create — set them once here instead of re-entering them each time.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            M-Pesa Till Number
          </label>
          <input
            type="text"
            value={instructions.mpesaTillNumber || ''}
            onChange={(e) => updateField('mpesaTillNumber', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder="e.g., 123456"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Bank Name
            </label>
            <input
              type="text"
              value={instructions.bankName || ''}
              onChange={(e) => updateField('bankName', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="e.g., Equity Bank"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Account Number
            </label>
            <input
              type="text"
              value={instructions.accountNumber || ''}
              onChange={(e) => updateField('accountNumber', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder="e.g., 1234567890"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Additional Instructions
          </label>
          <textarea
            value={instructions.customInstructions || ''}
            onChange={(e) => updateField('customInstructions', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none dark:bg-gray-700 dark:text-white"
            placeholder="e.g., Please make payment within 7 days. Include your name and invoice number as reference."
          />
        </div>

        <button
          onClick={handleSave}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-xl transition-all font-medium"
        >
          {savedRecently ? (
            <>
              <Check className="w-4 h-4" />
              Saved
            </>
          ) : (
            'Save Payment Instructions'
          )}
        </button>
      </div>
    </div>
  );
};

export default PaymentInstructionsSettings;
