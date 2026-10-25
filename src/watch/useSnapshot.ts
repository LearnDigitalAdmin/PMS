// Snapshot loading: stale-while-revalidate with ifNoneMatch (contract section 10).
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.ts';
import { isFresh, snapshotCache } from './cache.ts';
import { nairobiMonth } from './format.ts';
import { toLwError } from './errors.ts';
import { LwError } from './types.ts';
import type { Lang, Snapshot } from './types.ts';

export interface SnapshotState {
  snapshot: Snapshot | null;
  /** True while there is nothing to show yet. */
  loading: boolean;
  /** True while revalidating in the background. */
  refreshing: boolean;
  error: LwError | null;
  /** True when the last attempt failed for lack of a connection and cached data is shown. */
  offline: boolean;
  lastUpdated: number | null;
  refresh: () => void;
}

export function useSnapshot(ownerId: string | null, month: string | null, lang: Lang, epoch: number): SnapshotState {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<LwError | null>(null);
  const [offline, setOffline] = useState(false);
  const [tick, setTick] = useState(0);
  const force = useRef(false);

  useEffect(() => {
    if (!ownerId) { setSnapshot(null); setLoading(false); return; }
    let cancelled = false;
    const now = Date.now();
    const current = nairobiMonth(now);
    const cacheMonth = month ?? current;
    const cached = snapshotCache.get(ownerId, cacheMonth, now);
    const forced = force.current; force.current = false;

    if (cached) { setSnapshot(cached.snapshot); setSavedAt(cached.savedAt); setLoading(false); }
    else { setSnapshot(null); setSavedAt(null); setLoading(true); }
    setError(null);

    if (cached && !forced && isFresh(cached, cacheMonth, current, now)) { setOffline(false); return; }

    setRefreshing(true);
    (async () => {
      try {
        const res = await api.getSnapshot({ ownerId, month: month ?? undefined, lang, ifNoneMatch: cached?.etag });
        if (cancelled) return;
        const at = Date.now();
        if ('snapshot' in res && res.snapshot) {
          snapshotCache.put(ownerId, res.snapshot.month, res.etag, res.snapshot, at);
          setSnapshot(res.snapshot); setSavedAt(at);
        } else if (cached) {
          snapshotCache.touch(ownerId, cacheMonth, at); setSavedAt(at);
        }
        setOffline(false);
      } catch (e) {
        if (cancelled) return;
        const err = toLwError(e);
        if (err.lw === 'LW_NETWORK') setOffline(true);
        // Never keep showing data the server just said we may no longer see.
        if (err.lw === 'LW_LOCKED' || err.lw === 'LW_NOT_ALLOWED') { snapshotCache.clearProperty(ownerId); setSnapshot(null); }
        if (!cached || err.lw !== 'LW_NETWORK') setError(err);
      } finally {
        if (!cancelled) { setLoading(false); setRefreshing(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [ownerId, month, lang, epoch, tick]);

  // Going back online revalidates.
  useEffect(() => {
    const on = () => { force.current = true; setTick((n) => n + 1); };
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, []);

  // An unlocked (open) snapshot must disappear the moment unlockedUntil passes.
  useEffect(() => {
    const until = snapshot?.mask.level === 'open' ? snapshot.mask.unlockedUntil : null;
    if (!until) return;
    const ms = Date.parse(until) - Date.now();
    if (Number.isNaN(ms)) return;
    const id = window.setTimeout(() => { setSnapshot(null); force.current = true; setTick((n) => n + 1); }, Math.max(0, ms) + 50);
    return () => window.clearTimeout(id);
  }, [snapshot]);

  const refresh = useCallback(() => { force.current = true; setTick((n) => n + 1); }, []);
  return { snapshot, loading, refreshing, error, offline, lastUpdated: savedAt, refresh };
}
