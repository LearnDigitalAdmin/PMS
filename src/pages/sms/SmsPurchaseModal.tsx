import React, { useMemo, useState } from 'react';
import { MessageSquare, Phone, Loader, CreditCard } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/database/FirebaseSync';
import { normalizeKenyanPhone } from '../../utils/phone';

// Mirrors PMS_TIER_SMS_RATE in the Cloud Function — this is a PREVIEW only.
// The server re-derives the real rate from the user's Firestore `tier` field
// and ignores any price sent from here, so this can never be used to get a
// cheaper rate than the account actually qualifies for.
const TIER_SMS_RATE: Record<string, number> = {
  solo: 0.70,
  business: 0.60,
  pro: 0.50,
  enterprise: 0.40,
};
const DEFAULT_SMS_RATE = 0.75; // free / low / starter / anything unrecognized

interface SmsPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: number | string;
  userTier: string;
}

const SmsPurchaseModal: React.FC<SmsPurchaseModalProps> = ({ isOpen, onClose, userId, userTier }) => {
  const [credits, setCredits] = useState('500');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const rate = TIER_SMS_RATE[(userTier || '').toLowerCase()] ?? DEFAULT_SMS_RATE;
  const creditsNum = Math.max(0, parseInt(credits, 10) || 0);
  const estimatedCost = useMemo(() => Math.round(creditsNum * rate * 100) / 100, [creditsNum, rate]);

  if (!isOpen) return null;

  const handlePurchase = async () => {
    setError('');
    const normalized = normalizeKenyanPhone(phone);
    if (!normalized) {
      setPhoneError('Enter a valid Safaricom/M-Pesa number (e.g. 0712345678)');
      return;
    }
    setPhoneError('');

    if (creditsNum < 10) {
      setError('Minimum purchase is 10 SMS credits.');
      return;
    }

    setIsLoading(true);
    try {
      const chargeSmsTopUp = httpsCallable(functions, 'chargeSmsTopUp');
      const result = await chargeSmsTopUp({
        phone: normalized,
        tokens: creditsNum,
        amountKes: 0, // ignored server-side — the server derives the real price from the user's tier
        userId: String(userId),
        targetApp: 'pms',
      });
      const data = result.data as any;
      if (data.success) {
        alert('M-Pesa prompt sent! Enter your PIN to complete the purchase. Your SMS credits will update once payment is confirmed.');
        onClose();
      } else {
        setError(data.message || 'Failed to start purchase.');
      }
    } catch (err: any) {
      console.error('SMS purchase error:', err);
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-auto overflow-hidden">
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white flex items-center">
            <MessageSquare className="w-5 h-5 mr-2" />
            Buy SMS Credits
          </h3>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">SMS Credits</label>
            <input
              type="number"
              min={10}
              step={10}
              value={credits}
              onChange={(e) => setCredits(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              placeholder="e.g. 500"
            />
            <p className="text-xs text-gray-500 mt-1">
              1 credit ≈ 1 SMS of up to 150 characters (including the greeting and your signature).
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">M-Pesa Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`w-full pl-10 pr-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                  phoneError ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="0712345678, 254712345678, or 712345678"
              />
            </div>
            {phoneError && <p className="text-red-500 text-xs mt-1">{phoneError}</p>}
          </div>

          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 flex items-center justify-between">
            <span className="text-sm text-gray-600">
              Estimated cost ({userTier} tier @ KES {rate.toFixed(2)}/credit)
            </span>
            <span className="text-xl font-bold text-gray-900">KES {estimatedCost.toLocaleString()}</span>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={handlePurchase}
            disabled={isLoading || creditsNum < 10}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            {isLoading ? <Loader className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
            {isLoading ? 'Processing...' : `Pay KES ${estimatedCost.toLocaleString()} with M-Pesa`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SmsPurchaseModal;
