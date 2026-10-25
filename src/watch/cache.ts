// Snapshot cache (contract section 10). localStorage only, never SQLite.
// Key (ownerId, month); { etag, savedAt, snapshot }; keep the 12 newest months per property.
import type { Connection, Snapshot } from './types.ts';

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  key(i: number): string | null;
  readonly length: number;
}

export interface CacheEntry { etag: string; savedAt: number; snapshot: Snapshot }

const SNAP = 'lw.snap.';
const CONN = 'lw.connections';
export const MAX_MONTHS_PER_PROPERTY = 12;
export const FRESH_CURRENT_MS = 10 * 60 * 1000;
export const FRESH_PAST_MS = 6 * 60 * 60 * 1000;

function defaultStore(): KV | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

const snapKey = (ownerId: string, month: string) => `${SNAP}${ownerId}.${month}`;

/** True when the stored snapshot must not be shown any more: an `open` snapshot past `unlockedUntil`. */
export function isPrivacyExpired(s: Snapshot, now: number): boolean {
  if (s.mask.level !== 'open') return false;
  if (s.mask.unlockedUntil === null) return false;
  const t = Date.parse(s.mask.unlockedUntil);
  return Number.isNaN(t) || t <= now;
}

/** Fresh = do not call the backend. Current month 10 minutes, past months 6 hours. */
export function isFresh(entry: CacheEntry, month: string, currentMonth: string, now: number): boolean {
  const age = now - entry.savedAt;
  if (age < 0) return false;
  return age < (month === currentMonth ? FRESH_CURRENT_MS : FRESH_PAST_MS);
}

export class SnapshotCache {
  private kv: KV | null;
  constructor(kv?: KV | null) { this.kv = kv === undefined ? defaultStore() : kv; }

  private listKeys(prefix: string): string[] {
    const kv = this.kv; if (!kv) return [];
    const out: string[] = [];
    for (let i = 0; i < kv.length; i++) { const k = kv.key(i); if (k && k.startsWith(prefix)) out.push(k); }
    return out;
  }

  get(ownerId: string, month: string, now: number = Date.now()): CacheEntry | null {
    const kv = this.kv; if (!kv) return null;
    const k = snapKey(ownerId, month);
    try {
      const raw = kv.getItem(k); if (!raw) return null;
      const e = JSON.parse(raw) as CacheEntry;
      if (!e || !e.snapshot || e.snapshot.schema !== 1) { kv.removeItem(k); return null; }
      if (isPrivacyExpired(e.snapshot, now)) { kv.removeItem(k); return null; }
      return e;
    } catch { try { kv.removeItem(k); } catch { /* ignore */ } return null; }
  }

  put(ownerId: string, month: string, etag: string, snapshot: Snapshot, now: number = Date.now()): void {
    const kv = this.kv; if (!kv) return;
    const value = JSON.stringify({ etag, savedAt: now, snapshot } satisfies CacheEntry);
    const k = snapKey(ownerId, month);
    try { kv.setItem(k, value); } catch {
      this.evictOldest(5);
      try { kv.setItem(k, value); } catch { return; }
    }
    this.trim(ownerId);
  }

  /** Re-stamp an entry after a `notModified` reply. */
  touch(ownerId: string, month: string, now: number = Date.now()): void {
    const kv = this.kv; if (!kv) return;
    const e = this.get(ownerId, month, now); if (!e) return;
    try { kv.setItem(snapKey(ownerId, month), JSON.stringify({ ...e, savedAt: now })); } catch { /* ignore */ }
  }

  /** Mark every cached month of these properties as stale (savedAt = 0) so the next view revalidates. */
  markStale(ownerIds: string[]): void {
    const kv = this.kv; if (!kv) return;
    for (const id of ownerIds) {
      for (const k of this.listKeys(`${SNAP}${id}.`)) {
        try {
          const raw = kv.getItem(k); if (!raw) continue;
          const e = JSON.parse(raw) as CacheEntry;
          kv.setItem(k, JSON.stringify({ ...e, savedAt: 0 }));
        } catch { try { kv.removeItem(k); } catch { /* ignore */ } }
      }
    }
  }

  months(ownerId: string): string[] {
    const prefix = `${SNAP}${ownerId}.`;
    return this.listKeys(prefix).map((k) => k.slice(prefix.length)).sort().reverse();
  }

  clearProperty(ownerId: string): void {
    const kv = this.kv; if (!kv) return;
    for (const k of this.listKeys(`${SNAP}${ownerId}.`)) kv.removeItem(k);
  }

  clearAll(): void {
    const kv = this.kv; if (!kv) return;
    for (const k of this.listKeys(SNAP)) kv.removeItem(k);
    kv.removeItem(CONN);
  }

  private trim(ownerId: string): void {
    const kv = this.kv; if (!kv) return;
    const months = this.months(ownerId); // newest first
    for (const m of months.slice(MAX_MONTHS_PER_PROPERTY)) kv.removeItem(snapKey(ownerId, m));
  }

  private evictOldest(n: number): void {
    const kv = this.kv; if (!kv) return;
    const all: { k: string; t: number }[] = [];
    for (const k of this.listKeys(SNAP)) {
      try { all.push({ k, t: (JSON.parse(kv.getItem(k) ?? '{}') as CacheEntry).savedAt ?? 0 }); } catch { all.push({ k, t: 0 }); }
    }
    all.sort((a, b) => a.t - b.t);
    for (const x of all.slice(0, n)) kv.removeItem(x.k);
  }

  // Connections list (cached for offline start-up, refreshed on every app start).
  getConnections(): Connection[] | null {
    const kv = this.kv; if (!kv) return null;
    try { const raw = kv.getItem(CONN); return raw ? (JSON.parse(raw) as Connection[]) : null; } catch { return null; }
  }
  putConnections(list: Connection[]): void {
    const kv = this.kv; if (!kv) return;
    try { kv.setItem(CONN, JSON.stringify(list)); } catch { /* ignore */ }
  }
}

export const snapshotCache = new SnapshotCache();
