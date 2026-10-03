import React, { useMemo, useState } from 'react';
import { Send, MessageSquare, Loader, Users, AlertTriangle } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/database/FirebaseSync';
import { useSmsTokens } from '../../hooks/useSmsTokens';

const CHARS_PER_TOKEN = 140;

// Must mirror the Cloud Function's ALLOWED_SMS_BODY_REGEX / LINK_PATTERN
// exactly, so the person sees the same rejection here that the server would
// enforce — the server re-validates regardless, this is just fast feedback.
const ALLOWED_BODY_REGEX = /^[A-Za-z0-9 .,'\-!?():\/]*$/;
const LINK_PATTERN = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|co|ke|net|org|io|ly|me)\b)/i;

interface SmsRecipient {
  id: number;
  name: string;
  phone?: string;
}

interface SendSmsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: number | string;
  propertyId?: number;
  recipients: SmsRecipient[]; // a single tenant, or every tenant in a property
  senderSignature: string;    // e.g. "Acme Properties, 0712345678" — company name (or user name) + phone
}

const SendSmsModal: React.FC<SendSmsModalProps> = ({
  isOpen,
  onClose,
  userId,
  propertyId,
  recipients,
  senderSignature,
}) => {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const { tokens: availableCredits } = useSmsTokens(userId);

  const validRecipients = useMemo(() => recipients.filter((r) => !!r.phone), [recipients]);
  const missingPhoneCount = recipients.length - validRecipients.length;

  const bodyIssue = useMemo(() => {
    if (!message.trim()) return null;
    if (LINK_PATTERN.test(message)) return 'Links are not allowed in SMS messages.';
    if (!ALLOWED_BODY_REGEX.test(message)) return 'No special characters, emojis, or symbols are allowed.';
    return null;
  }, [message]);

  // Per-recipient composed message + token cost — mirrors the server's exact
  // "Dear {name}, {message} - {signature}" composition, since names vary in
  // length and the token boundary counts the WHOLE composed message.
  const composed = useMemo(() => {
    return validRecipients.map((r) => {
      const full = `Dear ${r.name}, ${message.trim()} - ${senderSignature}`;
      return { recipient: r, full, tokens: Math.max(1, Math.ceil(full.length / CHARS_PER_TOKEN)) };
    });
  }, [validRecipients, message, senderSignature]);

  const totalTokensNeeded = composed.reduce((sum, c) => sum + c.tokens, 0);
  const longestMessage = composed.reduce((max, c) => Math.max(max, c.full.length), 0);
  const canSend =
    !!message.trim() &&
    !bodyIssue &&
    validRecipients.length > 0 &&
    availableCredits !== null &&
    availableCredits >= totalTokensNeeded;

  if (!isOpen) return null;

  const handleSend = async () => {
    setError('');
    setResult(null);
    if (!canSend) return;

    setIsSending(true);
    try {
      const sendPmsSms = httpsCallable(functions, 'sendPmsSms');
      const response = await sendPmsSms({
        recipients: validRecipients.map((r) => ({ name: r.name, phone: r.phone })),
        message: message.trim(),
        propertyId: propertyId ? String(propertyId) : undefined,
      });
      const data = response.data as any;
      setResult({ sent: data.sent ?? 0, failed: data.failed ?? 0 });
      if (data.sent > 0) setMessage('');
    } catch (err: any) {
      console.error('sendPnsSms error:', err);
      setError(err?.message || 'Failed to send SMS. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-2xl max-w-lg w-full mx-auto overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-r from-brand-600 to-indigo-700 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white flex items-center">
            <MessageSquare className="w-5 h-5 mr-2" />
            Send SMS {recipients.length > 1 ? `(${validRecipients.length} tenants)` : ''}
          </h3>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="flex items-center justify-between text-sm bg-surface-muted rounded-lg p-3 border border-line">
            <span className="flex items-center gap-2 text-ink-soft">
              <Users className="w-4 h-4" /> {validRecipients.length} recipient{validRecipients.length !== 1 ? 's' : ''}
            </span>
            <span className="text-ink-soft">
              Credits available: <span className="font-semibold">{availableCredits ?? '—'}</span>
            </span>
          </div>

          {missingPhoneCount > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 rounded-lg p-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {missingPhoneCount} recipient{missingPhoneCount !== 1 ? 's have' : ' has'} no phone number and will be skipped.
            </p>
          )}

          <div>
            <label className="block text-sm font-semibold text-ink mb-2">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none ${
                bodyIssue ? 'border-red-500' : 'border-line-strong'
              }`}
              placeholder="e.g. Please clear this month's rent by the 5th to avoid late fees."
            />
            <p className="text-xs text-ink-subtle mt-1">
              Every message opens with "Dear [tenant name]," and closes with your signature — {senderSignature}. No links, emojis, or special characters.
            </p>
            {bodyIssue && <p className="text-red-500 text-xs mt-1">{bodyIssue}</p>}
          </div>

          <div className="bg-surface-muted rounded-xl p-4 border border-line space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-muted">Longest composed message</span>
              <span className="font-medium">{longestMessage} chars</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Credits required</span>
              <span className="font-medium">{totalTokensNeeded}</span>
            </div>
          </div>

          {availableCredits !== null && availableCredits < totalTokensNeeded && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Not enough SMS credits. You need {totalTokensNeeded - availableCredits} more.
            </p>
          )}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {result && (
            <p className="text-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/25 rounded-lg p-2">
              Sent to {result.sent} recipient{result.sent !== 1 ? 's' : ''}
              {result.failed > 0 ? `, ${result.failed} failed` : ''}.
            </p>
          )}
        </div>

        <div className="p-6 pt-0">
          <button
            onClick={handleSend}
            disabled={!canSend || isSending}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            {isSending ? <Loader className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            {isSending ? 'Sending...' : `Send (${totalTokensNeeded} credit${totalTokensNeeded !== 1 ? 's' : ''})`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SendSmsModal;
