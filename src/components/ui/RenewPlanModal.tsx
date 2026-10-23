import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Capacitor } from '@capacitor/core';
import { CalendarClock, CheckCircle2, Crown, Loader2, Phone, RefreshCw, X } from 'lucide-react';
import { db, functions } from '../../services/database/FirebaseSync';
import { checkSafaricomPhone } from '../../utils/safaricom';
import { formatDate, formatKES } from '../../utils/FormatUtils';
import PricingModal from './PricingPage';

/** Purchasable tiers, lowest to highest. Mirrors PURCHASABLE_PLANS in the Cloud Function. */
export const PLAN_ORDER = ['starter', 'solo', 'business', 'pro', 'enterprise'] as const;
const PLAN_LABEL: Record<string, string> = {
  starter: 'Starter',
  solo: 'Solo',
  business: 'Business',
  pro: 'Professional',
  enterprise: 'Enterprise',
};
const CYCLE_DAYS = { monthly: 30, annual: 365 } as const;
type Cycle = keyof typeof CYCLE_DAYS;

export const planLabel = (tier: string | null | undefined): string =>
  PLAN_LABEL[String(tier || '').toLowerCase()] || (tier ? String(tier) : 'Free');

interface PlanPrice { name?: string; price: number }

export interface RenewPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 'renew' = a paid plan is about to lapse; 'choose' = trial / lapsed / free account picking a plan. */
  mode: 'renew' | 'choose';
  currentTier: string;
  /** ISO expiry of the current plan or trial, if any. */
  expiryIso: string | null;
  isTrial: boolean;
  user: { id: number | string; name?: string; email?: string; phone?: string | number } | null;
}

/**
 * Renew / upgrade in one step. It pipes into the same `processWebSubscription` Cloud Function as the pricing page
 * (M-Pesa STK push), so price, length and expiry are all decided server-side. On the native apps, where plans are bought
 * through the store, it hands over to the existing pricing screen instead.
 */
const RenewPlanModal: React.FC<RenewPlanModalProps> = ({ isOpen, onClose, mode, currentTier, expiryIso, isTrial, user }) => {
  const isWeb = Capacitor.getPlatform() === 'web';
  const tier = String(currentTier || '').toLowerCase();
  const currentRank = PLAN_ORDER.indexOf(tier as (typeof PLAN_ORDER)[number]);
  const canRenew = mode === 'renew' && currentRank >= 0;
  const upgradeTiers = useMemo(() => PLAN_ORDER.filter((_, i) => i > currentRank), [currentRank]);

  const [tab, setTab] = useState<'renew' | 'upgrade'>(canRenew ? 'renew' : 'upgrade');
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const [selected, setSelected] = useState<string>(canRenew ? tier : upgradeTiers[0] || 'solo');
  const [prices, setPrices] = useState<Record<string, PlanPrice>>({});
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);
  const [sent, setSent] = useState(false);

  // Reset whenever the modal is (re)opened.
  useEffect(() => {
    if (!isOpen) return;
    setTab(canRenew ? 'renew' : 'upgrade');
    setSelected(canRenew ? tier : upgradeTiers[0] || 'solo');
    setCycle('monthly');
    setError('');
    setPhoneError('');
    setSent(false);
    setPaying(false);
    const check = checkSafaricomPhone(user?.phone);
    setPhone(check.ok ? check.local : user?.phone ? String(user.phone) : '');
  }, [isOpen, canRenew, tier, upgradeTiers, user?.phone]);

  // Official prices: the same plans/{tier}_{cycle} documents the pricing page reads.
  useEffect(() => {
    if (!isOpen || !isWeb) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingPrices(true);
        const snap = await getDocs(collection(db, 'plans'));
        const map: Record<string, PlanPrice> = {};
        snap.forEach((d) => {
          const data = d.data() as { price?: number; name?: string };
          if (typeof data.price === 'number') map[d.id] = { price: data.price, name: data.name };
        });
        if (!cancelled) setPrices(map);
      } catch (e) {
        console.error('RenewPlanModal: could not load plan prices', e);
        if (!cancelled) setError('Could not load plan prices. Check your connection and try again.');
      } finally {
        if (!cancelled) setLoadingPrices(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, isWeb]);

  if (!isOpen) return null;

  // Store-billed apps keep using the existing pricing screen.
  if (!isWeb) {
    return (
      <PricingModal
        isOpen
        onClose={() => onClose()}
        canDismiss
        currentPlan={tier || 'free'}
        userId={typeof user?.id === 'number' ? user.id : Number(user?.id) || undefined}
        userPhone={Number(user?.phone) || undefined}
      />
    );
  }

  const priceOf = (planId: string): number | undefined => prices[`${planId}_${cycle}`]?.price;
  const price = priceOf(selected);
  const days = CYCLE_DAYS[cycle];

  // Preview of the new expiry. Mirrors the server: time left on an active PAID plan is kept; a trial or lapsed plan starts today.
  const now = Date.now();
  const currentExpiryMs = expiryIso ? new Date(expiryIso).getTime() : NaN;
  const stacks = !isTrial && Number.isFinite(currentExpiryMs) && currentExpiryMs > now;
  const newExpiry = new Date((stacks ? currentExpiryMs : now) + days * 86_400_000);

  const handlePay = async () => {
    setError('');
    const check = checkSafaricomPhone(phone);
    if (!check.ok) {
      setPhoneError(check.message);
      return;
    }
    setPhoneError('');
    if (!user?.id) { setError('Please sign in again and retry.'); return; }
    if (!user.email || !user.name) { setError('Your profile needs a name and email before you can pay. Update it in Profile, then retry.'); return; }
    if (price === undefined) { setError('This plan is not available right now. Please try again later.'); return; }

    setPaying(true);
    try {
      const processWebSubscription = httpsCallable(functions, 'processWebSubscription');
      const result = await processWebSubscription({
        userId: user.id,
        userName: user.name,
        email: user.email,
        phone: check.e164,
        planId: selected,
        planName: planLabel(selected),
        billingCycle: cycle,
        amount: price,
        daysToAdd: days,
      });
      const data = result.data as { success?: boolean; message?: string };
      if (data?.success) setSent(true);
      else setError(data?.message || 'Could not start the payment. Please try again.');
    } catch (e: unknown) {
      console.error('RenewPlanModal payment error:', e);
      setError((e as { message?: string })?.message || 'Something went wrong. Please try again or contact support.');
    } finally {
      setPaying(false);
    }
  };

  const title = tab === 'renew' ? `Renew ${planLabel(tier)}` : mode === 'renew' ? 'Upgrade your plan' : 'Choose a plan';
  const options = tab === 'renew' ? [tier] : upgradeTiers.length ? [...upgradeTiers] : [...PLAN_ORDER];

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/55 backdrop-blur-sm md:items-center md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => { if (e.target === e.currentTarget && !paying) onClose(); }}
    >
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-line bg-surface text-ink shadow-pop md:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 bg-gradient-to-r from-brand-600 to-indigo-600 px-5 py-4 text-white">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-lg font-bold">
              {tab === 'renew' ? <RefreshCw className="h-5 w-5 shrink-0" /> : <Crown className="h-5 w-5 shrink-0" />}
              <span className="truncate">{title}</span>
            </h3>
            {Number.isFinite(currentExpiryMs) && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/85">
                <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                {currentExpiryMs > now ? `${isTrial ? 'Trial ends' : 'Current plan ends'} ${formatDate(new Date(currentExpiryMs))}` : `Ended ${formatDate(new Date(currentExpiryMs))}`}
              </p>
            )}
          </div>
          <button onClick={onClose} disabled={paying} aria-label="Close" className="rounded-full p-1.5 text-white/85 hover:bg-white/15 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {sent ? (
          <div className="space-y-4 p-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <h4 className="text-lg font-bold">Check your phone</h4>
            <p className="text-sm text-ink-muted">
              Enter your M-Pesa PIN to pay {price !== undefined ? formatKES(price) : ''} for {planLabel(selected)}. Your plan updates by itself as soon as the payment is confirmed. There is nothing else to do.
            </p>
            <button onClick={onClose} className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white hover:bg-brand-700">Done</button>
          </div>
        ) : (
          <div className="space-y-5 p-5">
            {canRenew && upgradeTiers.length > 0 && (
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-sunken p-1 text-sm font-semibold">
                {(['renew', 'upgrade'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setTab(t); setSelected(t === 'renew' ? tier : upgradeTiers[0]); }}
                    className={`rounded-lg py-2 transition-colors ${tab === t ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
                  >
                    {t === 'renew' ? 'Renew' : 'Upgrade'}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {(['monthly', 'annual'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCycle(c)}
                  className={`rounded-xl border-2 px-3 py-2 text-left text-sm transition-colors ${cycle === c ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'border-line hover:border-line-strong'}`}
                >
                  <span className="block font-semibold capitalize">{c}</span>
                  <span className="text-xs text-ink-subtle">{CYCLE_DAYS[c]} days</span>
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {options.map((planId) => {
                const p = priceOf(planId);
                return (
                  <button
                    key={planId}
                    onClick={() => setSelected(planId)}
                    disabled={options.length === 1}
                    className={`flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-colors ${selected === planId ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'border-line hover:border-line-strong'}`}
                  >
                    <span className="font-semibold">{prices[`${planId}_${cycle}`]?.name || planLabel(planId)}</span>
                    <span className="text-sm font-bold">{loadingPrices ? '…' : p !== undefined ? formatKES(p) : 'Unavailable'}</span>
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl bg-surface-muted px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">New expiry</span>
                <span className="font-semibold">{formatDate(newExpiry)}</span>
              </div>
              {stacks && <p className="mt-1 text-xs text-ink-subtle">Your remaining days are kept. The new period is added on top.</p>}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold" htmlFor="renew-phone">M-Pesa number (Safaricom)</label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                <input
                  id="renew-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setPhoneError(''); }}
                  placeholder="0712 345 678"
                  className={`w-full rounded-xl border-2 py-3 pl-10 pr-3 ${phoneError ? 'border-red-500' : 'border-line-strong'}`}
                />
              </div>
              {phoneError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{phoneError}</p>}
            </div>

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}

            <button
              onClick={handlePay}
              disabled={paying || loadingPrices || price === undefined}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 py-3.5 font-semibold text-white shadow-lg disabled:opacity-60"
            >
              {paying ? <><Loader2 className="h-5 w-5 animate-spin" /> Sending request…</> : `Pay ${price !== undefined ? formatKES(price) : ''} with M-Pesa`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RenewPlanModal;
