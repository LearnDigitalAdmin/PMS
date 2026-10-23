// src/hooks/useSubscriptionInfo.ts
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/database/FirebaseSync';

export interface SubscriptionInfo {
  tier: string;
  type?: string; // 'paid' once a plan has been bought
  isTrial: boolean;
  subscriptionExpiry: string | null; // ISO string
  tokens: number;
  smsSentTotal: number; // lifetime count of successfully-sent SMS, incremented server-side
  planName?: string | null; // display name of the last purchased plan
  subscriptionExpiredAt?: string | null; // ISO string, set server-side when a paid plan lapses and the account drops to free
}

const CACHE_KEY = 'subscriptionInfo';

function readCache(): SubscriptionInfo | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(info: SubscriptionInfo) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(info));
}

/**
 * Live subscription/trial/token state for a user, read straight from
 * Firestore (users/{uid}) — never touches local SQLite. Falls back to
 * the last cached value in localStorage while offline.
 */
export function useSubscriptionInfo(userId: number | string | undefined) {
  const [info, setInfo] = useState<SubscriptionInfo | null>(() => readCache());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setInfo(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      doc(db, 'users', String(userId)),
      (snap) => {
        if (!snap.exists()) {
          setInfo(null);
          setLoading(false);
          return;
        }
        const data = snap.data();
        const parsed: SubscriptionInfo = {
          tier: data.tier ?? 'free',
          type: data.type ?? undefined,
          isTrial: data.isTrial ?? false,
          subscriptionExpiry: data.subscriptionExpiry?.toDate?.().toISOString() ?? null,
          tokens: data.tokens ?? 0,
          smsSentTotal: data.smsSentTotal ?? 0,
          planName: data.planName ?? null,
          subscriptionExpiredAt: data.subscriptionExpiredAt?.toDate?.().toISOString() ?? null,
        };
        setInfo(parsed);
        writeCache(parsed);
        setLoading(false);
      },
      (err) => {
        console.error('useSubscriptionInfo: listener error, using cached value', err);
        setInfo(readCache());
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  return { info, loading };
}