import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle, Clock, MessageSquare, X } from 'lucide-react';
import { useAuth } from '../auh/AuthWrapper';
import { useSmsTokens } from '../../hooks/useSmsTokens';
import { useSubscriptionInfo } from '../../hooks/useSubscriptionInfo';
import { formatDate } from '../../utils/FormatUtils';
import RenewPlanModal, { planLabel } from './RenewPlanModal';
import SmsPurchaseModal from '../../pages/sms/SmsPurchaseModal';

/** A paid plan starts warning this many days before it ends (a trial, which is short, warns later). */
const PLAN_WARN_DAYS = 14;
const TRIAL_WARN_DAYS = 7;
/** In the last days the ribbon is pinned: no close button. */
const PINNED_DAYS = 5;
/** The SMS ribbon appears at or below this many credits. */
const SMS_LOW_CREDITS = 20;

const DAY_MS = 86_400_000;
const today = () => new Date().toISOString().slice(0, 10);

/** "Dismissed for today" flag, per user and per reason. */
function useDailyDismiss(key: string) {
  const storageKey = `ribbonDismissed:${key}`;
  const read = () => {
    try { return localStorage.getItem(storageKey) === today(); } catch { return false; }
  };
  const [dismissed, setDismissed] = useState(read);
  useEffect(() => { setDismissed(read()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [storageKey]);
  const dismiss = () => {
    try { localStorage.setItem(storageKey, today()); } catch { /* storage unavailable: dismiss for this session only */ }
    setDismissed(true);
  };
  return [dismissed, dismiss] as const;
}

/**
 * Sticky ribbons under the status bar:
 *  1. plan / trial expiry, with a one-tap renew or upgrade modal (pinned, no close button, in the last 5 days and once expired)
 *  2. low SMS credits, with the existing top-up modal
 * While shown, the ribbon height is published as --ribbon-height so sticky page headers sit below it.
 */
const PlanRibbon: React.FC = () => {
  const { user } = useAuth();
  const { info } = useSubscriptionInfo(user?.id);
  const { tokens } = useSmsTokens(user?.id);
  const [showRenew, setShowRenew] = useState(false);
  const [showSms, setShowSms] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const uid = String(user?.id ?? '');
  const tier = String(info?.tier ?? user?.tier ?? 'free').toLowerCase();
  // A paid account is never "on trial", even if a stale isTrial flag is still set.
  const isTrial = !!info?.isTrial && info?.type !== 'paid';
  const expiryMs = info?.subscriptionExpiry ? new Date(info.subscriptionExpiry).getTime() : NaN;
  const hasExpiry = Number.isFinite(expiryMs);
  const now = Date.now();
  const expired = hasExpiry && expiryMs <= now;
  const daysLeft = hasExpiry ? Math.max(0, Math.ceil((expiryMs - now) / DAY_MS)) : null;
  // A paid plan that lapsed has already been dropped to free by the server job.
  const lapsed = !isTrial && tier === 'free' && !!info?.subscriptionExpiredAt;

  let kind: 'warn' | 'expired' | 'lapsed' | null = null;
  if (lapsed) kind = 'lapsed';
  else if (hasExpiry && (isTrial || tier !== 'free')) {
    if (expired) kind = 'expired';
    else if (daysLeft !== null && daysLeft <= (isTrial ? TRIAL_WARN_DAYS : PLAN_WARN_DAYS)) kind = 'warn';
  }

  const pinned = kind === 'expired' || (kind === 'warn' && daysLeft !== null && daysLeft <= PINNED_DAYS);
  const [expiryDismissed, dismissExpiry] = useDailyDismiss(`${uid}:expiry:${info?.subscriptionExpiry ?? 'none'}`);
  const [smsDismissed, dismissSms] = useDailyDismiss(`${uid}:sms`);

  const showExpiry = kind !== null && (pinned || !expiryDismissed) && !(kind === 'lapsed' && expiryDismissed);
  const showSmsRibbon = tokens !== null && tokens <= SMS_LOW_CREDITS && !smsDismissed;

  // Publish the combined height for sticky headers below.
  useLayoutEffect(() => {
    const el = rootRef.current;
    const root = document.documentElement;
    if (!el || (!showExpiry && !showSmsRibbon)) {
      root.style.removeProperty('--ribbon-height');
      return;
    }
    const set = () => root.style.setProperty('--ribbon-height', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty('--ribbon-height'); };
  }, [showExpiry, showSmsRibbon]);

  if (!user) return null;

  const urgent = kind === 'expired' || kind === 'lapsed' || (daysLeft !== null && daysLeft <= PINNED_DAYS);
  const what = isTrial ? 'free trial' : `${planLabel(tier)} plan`;
  let message = '';
  if (kind === 'warn' && daysLeft !== null) {
    message = `Your ${what} ends ${daysLeft <= 1 ? 'within 24 hours' : `in ${daysLeft} days`} (${formatDate(new Date(expiryMs))}).`;
  } else if (kind === 'expired') {
    message = `Your ${what} has ended. Renew to keep your plan limits, cloud sync and SMS.`;
  } else if (kind === 'lapsed') {
    message = 'Your plan has ended and your account is on the free tier. Subscribe to restore your plan.';
  }
  const action = isTrial || kind === 'lapsed' ? 'Choose plan' : 'Renew now';
  const modalMode: 'renew' | 'choose' = isTrial || kind === 'lapsed' ? 'choose' : 'renew';

  return (
    <>
      <div ref={rootRef} className="plan-ribbon app-chrome">
        {showExpiry && (
          <div
            role="status"
            className={`flex items-center gap-2 px-3 py-2 text-sm text-white sm:px-6 ${urgent ? 'bg-red-600' : 'bg-amber-500'}`}
          >
            {urgent ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <Clock className="h-4 w-4 shrink-0" />}
            <span className="min-w-0 flex-1 leading-snug">{message}</span>
            <button
              onClick={() => setShowRenew(true)}
              className="shrink-0 rounded-lg bg-white px-3 py-1 text-xs font-bold text-slate-900 shadow-sm hover:bg-white/90"
            >
              {action}
            </button>
            {!pinned && (
              <button onClick={dismissExpiry} aria-label="Dismiss for today" className="shrink-0 rounded-full p-1 hover:bg-white/20">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {showSmsRibbon && (
          <div role="status" className="flex items-center gap-2 bg-emerald-600 px-3 py-2 text-sm text-white sm:px-6">
            <MessageSquare className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 leading-snug">
              {tokens === 0 ? 'You are out of SMS credits. Tenant reminders will not send.' : `Only ${tokens} SMS credit${tokens === 1 ? '' : 's'} left.`}
            </span>
            <button
              onClick={() => setShowSms(true)}
              className="shrink-0 rounded-lg bg-white px-3 py-1 text-xs font-bold text-slate-900 shadow-sm hover:bg-white/90"
            >
              Buy credits
            </button>
            <button onClick={dismissSms} aria-label="Dismiss for today" className="shrink-0 rounded-full p-1 hover:bg-white/20">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <RenewPlanModal
        isOpen={showRenew}
        onClose={() => setShowRenew(false)}
        mode={modalMode}
        currentTier={tier}
        expiryIso={info?.subscriptionExpiry ?? null}
        isTrial={isTrial}
        user={user}
      />
      <SmsPurchaseModal isOpen={showSms} onClose={() => setShowSms(false)} userId={user.id} userTier={tier} />
    </>
  );
};

export default PlanRibbon;
