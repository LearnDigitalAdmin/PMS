import { useCallback, useEffect, useState } from 'react';
import { database } from '../services/database/Database';
import { useSubscriptionInfo } from './useSubscriptionInfo';
import { getDaysRemaining } from '../utils/trial';

export interface TrialStats {
  totalInvoices: number;
  totalTenants: number;
  amountCollected: number;
  totalSmsSent: number;
  daysRemaining: number | null;
  isTrial: boolean;
  tier: string;
}

type LocalTotals = { totalInvoices: number; totalTenants: number; amountCollected: number };

const CACHE_PREFIX = 'trialStats:';

function readCache(userId: number | string): LocalTotals | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + userId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(userId: number | string, data: LocalTotals) {
  try {
    localStorage.setItem(CACHE_PREFIX + userId, JSON.stringify(data));
  } catch {
    // localStorage full/unavailable — non-fatal, the banner just won't have an offline fallback yet.
  }
}

/**
 * Data for the trial-stats banner (invoices sent, SMS sent, amount collected,
 * total tenants, days remaining). Invoice/tenant/collection totals are
 * read-only queries against the local SQLite database — never written back
 * to it — and are cached in localStorage so they paint instantly offline.
 * SMS-sent total, trial status, and expiry ride on the existing live
 * Firestore subscription listener (see useSubscriptionInfo) for fast sync
 * whenever the device is online.
 */
export function useTrialStats(userId: number | string | undefined) {
  const numericUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
  const { info, loading: infoLoading } = useSubscriptionInfo(userId);

  const [local, setLocal] = useState<LocalTotals | null>(() =>
    userId !== undefined ? readCache(userId) : null
  );
  const [loading, setLoading] = useState(!local);

  const refresh = useCallback(async () => {
    if (!numericUserId) return;
    try {
      const totals = await database.getTrialStats(numericUserId);
      setLocal(totals);
      if (userId !== undefined) writeCache(userId, totals);
    } catch (err) {
      console.error('useTrialStats: failed to read local totals', err);
    } finally {
      setLoading(false);
    }
  }, [numericUserId, userId]);

  useEffect(() => {
    if (!numericUserId) {
      setLoading(false);
      return;
    }
    refresh();
    // Local totals can change (new invoice, payment recorded) without any
    // Firestore event firing, so re-check periodically while the app is open.
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [numericUserId, refresh]);

  const stats: TrialStats = {
    totalInvoices: local?.totalInvoices ?? 0,
    totalTenants: local?.totalTenants ?? 0,
    amountCollected: local?.amountCollected ?? 0,
    totalSmsSent: info?.smsSentTotal ?? 0,
    daysRemaining: getDaysRemaining(info?.subscriptionExpiry),
    isTrial: info?.isTrial ?? false,
    tier: info?.tier ?? 'free',
  };

  return { stats, loading: loading || infoLoading, refresh };
}
