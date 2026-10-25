import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotCache, isFresh, isPrivacyExpired, FRESH_CURRENT_MS, FRESH_PAST_MS, MAX_MONTHS_PER_PROPERTY } from './cache.ts';
import { buildSnapshot } from './mock.ts';
import type { KV } from './cache.ts';

function memKV(limit = Infinity): KV & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    removeItem: (k) => { map.delete(k); },
    setItem: (k, v) => {
      let size = v.length; for (const [kk, vv] of map) if (kk !== k) size += vv.length;
      if (size > limit) throw new Error('QuotaExceededError');
      map.set(k, v);
    },
  };
}
const snap = (month = '2026-10', level: 'tenant' | 'open' = 'tenant', until: string | null = null) =>
  buildSnapshot('PYP-0001', month, level, level === 'open' ? 'otp' : 'locked', until);

test('put/get round trip and etag', () => {
  const c = new SnapshotCache(memKV());
  assert.equal(c.get('PYP-0001', '2026-10'), null);
  c.put('PYP-0001', '2026-10', 'etag-1', snap(), 1000);
  const e = c.get('PYP-0001', '2026-10', 2000)!;
  assert.equal(e.etag, 'etag-1');
  assert.equal(e.savedAt, 1000);
  assert.equal(e.snapshot.ownerId, 'PYP-0001');
});

test('freshness windows: 10 min current month, 6 h past months', () => {
  const entry = { etag: 'x', savedAt: 0, snapshot: snap() };
  assert.ok(isFresh(entry, '2026-10', '2026-10', FRESH_CURRENT_MS - 1));
  assert.ok(!isFresh(entry, '2026-10', '2026-10', FRESH_CURRENT_MS));
  assert.ok(isFresh(entry, '2026-09', '2026-10', FRESH_PAST_MS - 1));
  assert.ok(!isFresh(entry, '2026-09', '2026-10', FRESH_PAST_MS));
});

test('an open snapshot is never served after unlockedUntil', () => {
  const kv = memKV();
  const c = new SnapshotCache(kv);
  const until = new Date(5000).toISOString();
  c.put('PYP-0001', '2026-10', 'e', snap('2026-10', 'open', until), 1000);
  assert.ok(c.get('PYP-0001', '2026-10', 4999));
  assert.equal(c.get('PYP-0001', '2026-10', 5000), null);
  assert.equal(kv.map.size, 0, 'expired open data is dropped, not just hidden');
  assert.ok(!isPrivacyExpired(snap('2026-10', 'open', null), 9e15), 'auto-unlock (null) does not expire');
  assert.ok(!isPrivacyExpired(snap('2026-10', 'tenant'), 9e15));
});

test('keeps only the 12 newest months per property', () => {
  const c = new SnapshotCache(memKV());
  const months = Array.from({ length: 14 }, (_, i) => `2025-${String(i + 1).padStart(2, '0')}`.replace('2025-13', '2026-01').replace('2025-14', '2026-02'));
  for (const m of months) c.put('PYP-0001', m, 'e', { ...snap(), month: m }, 1);
  const kept = c.months('PYP-0001');
  assert.equal(kept.length, MAX_MONTHS_PER_PROPERTY);
  assert.equal(kept[0], '2026-02');
  assert.ok(!kept.includes('2025-01'));
});

test('clear on disconnect and on sign-out; markStale', () => {
  const kv = memKV();
  const c = new SnapshotCache(kv);
  c.put('PYP-0001', '2026-10', 'e', snap(), 1000);
  c.put('PYP-0002', '2026-10', 'e', snap(), 1000);
  c.putConnections([]);
  c.markStale(['PYP-0001']);
  assert.equal(c.get('PYP-0001', '2026-10')!.savedAt, 0);
  assert.equal(c.get('PYP-0002', '2026-10')!.savedAt, 1000);
  c.clearProperty('PYP-0001');
  assert.equal(c.get('PYP-0001', '2026-10'), null);
  assert.ok(c.get('PYP-0002', '2026-10'));
  c.clearAll();
  assert.equal(kv.map.size, 0);
});

test('storage full: oldest entries are evicted, no throw', () => {
  const one = JSON.stringify({ etag: 'e', savedAt: 1, snapshot: snap() }).length;
  const c = new SnapshotCache(memKV(one * 3 + 50));
  c.put('PYP-0001', '2026-08', 'e', { ...snap(), month: '2026-08' }, 1);
  c.put('PYP-0001', '2026-09', 'e', { ...snap(), month: '2026-09' }, 2);
  c.put('PYP-0001', '2026-10', 'e', snap(), 3);
  c.put('PYP-0002', '2026-10', 'e', snap(), 4);
  assert.ok(c.get('PYP-0002', '2026-10'));
});

test('corrupt entries are ignored', () => {
  const kv = memKV();
  kv.setItem('lw.snap.PYP-0001.2026-10', '{not json');
  const c = new SnapshotCache(kv);
  assert.equal(c.get('PYP-0001', '2026-10'), null);
});
