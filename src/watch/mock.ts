// In-memory stand-in for the Landlord Watch backend (contract section 15). Enabled with VITE_LW_MOCK=1.
// Everything here plays the SERVER: it computes money, masking, OTP and the transcript state machine.
// Try: sign in with any Safaricom number (code 123456). 0722000111 is the owner phone of PYP-0001 and
// PYP-0002 (auto-unlock). PYP-0003 starts fully masked. PYP-9999 does not exist.
import type {
  AuthState, Connection, LookupResult, MaskLevel, N, OtpSent, Quota, Snapshot, SnapshotResponse,
  Statement, TenantRow, TranscriptRequest, UnlockResult,
} from './types.ts';
import { LwError, SignInError } from './types.ts';
import type { WatchApi } from './api-types.ts';

// ---- test hooks -----------------------------------------------------------
export const mockConfig = { latencyMs: 350, now: () => Date.now(), maxConnections: 25 };
const sleep = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());
const lat = () => sleep(mockConfig.latencyMs * (0.6 + Math.random() * 0.8));

export const MOCK_CODE = '123456';
const FREE_LIMIT = 1;
const PRICE = 99;
const UNLOCK_MS = 30 * 60 * 1000;
const PAY_DELAY_MS = 6000;
const GEN_MS = 1500;

// ---- number / mask helpers -----------------------------------------------
const money = (v: number): string => {
  const s = (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
  const [i, f] = s.split('.');
  return `KES ${i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${f ? `.${f}` : ''}`;
};
export function maskName(name: string): string { return name.split(/\s+/).filter(Boolean).map((w) => `${w[0]}•••`).join(' '); }
export function maskPhoneLocal(e164: string): string {
  const local = `0${e164.replace(/^\+254/, '')}`;
  return `${local.slice(0, 2)}•• ••• ${local.slice(-3)}`;
}

function makers(level: MaskLevel) {
  const hide = level === 'full';
  return {
    money: (v: number): N => (hide ? { v: null, d: 'KES ••,•••' } : { v, d: money(v) }),
    count: (v: number): N => (hide ? { v: null, d: '••' } : { v, d: String(v) }),
    pct: (v: number): N => (hide ? { v: null, d: '••%' } : { v, d: `${Math.round(v)}%` }),
  };
}

// ---- seed data ------------------------------------------------------------
interface SeedTenant {
  ref: string; name: string; phone: string; unit: string;
  invoice: Record<string, { rent: number; bills: number; paid: number; firstPaid: string | null } | undefined>;
  noInvoice?: string[]; // months in which the tenant is active but has no invoice
}
interface Seed {
  ownerId: string; name: string; address: string; ownerPhone: string; maxUnits: number; commission: number;
  managedByAgency: boolean; startLevel: 'tenant' | 'full'; tenants: SeedTenant[];
  statements: Record<string, { status: Statement['status']; notes: string | null; extra: { label: string; kind: 'income' | 'deduction'; amount: number }[] }>;
}

const T = (ref: string, name: string, phone: string, unit: string, invoice: SeedTenant['invoice'], noInvoice?: string[]): SeedTenant => ({ ref, name, phone, unit, invoice, noInvoice });

const SEEDS: Seed[] = [
  {
    ownerId: 'PYP-0001', name: 'Sunrise Apartments', address: 'Naivasha, Nakuru', ownerPhone: '+254722000111',
    maxUnits: 6, commission: 10, managedByAgency: true, startLevel: 'tenant',
    tenants: [
      T('t_a1b2c3', 'Amina Wanjiru', '+254711333444', 'A1', {
        '2026-10': { rent: 14000, bills: 1000, paid: 15000, firstPaid: '2026-10-04' },
        '2026-09': { rent: 14000, bills: 1000, paid: 15000, firstPaid: '2026-09-03' },
        '2026-08': { rent: 14000, bills: 800, paid: 14800, firstPaid: '2026-08-05' },
      }),
      T('t_9f3a1c', 'Daniel Otieno', '+254722111222', 'D4', {
        '2026-10': { rent: 18000, bills: 2000, paid: 0, firstPaid: null },
        '2026-09': { rent: 18000, bills: 1800, paid: 19800, firstPaid: '2026-09-09' },
        '2026-08': { rent: 18000, bills: 1500, paid: 19500, firstPaid: '2026-08-12' },
      }),
      T('t_4be07d', 'Brian Kiptoo', '+254733555666', 'B2', {
        '2026-10': { rent: 11500, bills: 1000, paid: 5000, firstPaid: '2026-10-08' },
        '2026-09': { rent: 11500, bills: 900, paid: 12400, firstPaid: '2026-09-06' },
        '2026-08': { rent: 11500, bills: 900, paid: 12400, firstPaid: '2026-08-07' },
      }),
      T('t_7c21de', 'Grace Achieng', '+254700777888', 'C3', {
        '2026-10': { rent: 8500, bills: 500, paid: 9000, firstPaid: '2026-10-17' },
        '2026-09': { rent: 8500, bills: 500, paid: 9000, firstPaid: '2026-09-14' },
        '2026-08': { rent: 8500, bills: 500, paid: 9000, firstPaid: '2026-08-14' },
      }),
      T('t_e55f90', 'Joseph Mwangi', '+254745999000', 'E5', {
        '2026-09': { rent: 9000, bills: 600, paid: 9600, firstPaid: '2026-09-02' },
        '2026-08': { rent: 9000, bills: 600, paid: 9600, firstPaid: '2026-08-02' },
      }, ['2026-10']),
    ],
    statements: {
      '2026-09': { status: 'sent', notes: 'Roof gutter repair deducted.', extra: [{ label: 'Roof gutter repair', kind: 'deduction', amount: 2000 }] },
      '2026-08': { status: 'finalized', notes: null, extra: [] },
    },
  },
  {
    ownerId: 'PYP-0002', name: 'Lakeview Court', address: 'Nakuru Town', ownerPhone: '+254722000111',
    maxUnits: 4, commission: 8, managedByAgency: true, startLevel: 'tenant',
    tenants: [
      T('t_l1', 'Mercy Njeri', '+254712000001', 'L1', { '2026-10': { rent: 12000, bills: 800, paid: 12800, firstPaid: '2026-10-03' }, '2026-09': { rent: 12000, bills: 700, paid: 12700, firstPaid: '2026-09-04' } }),
      T('t_l2', 'Peter Kamau', '+254712000002', 'L2', { '2026-10': { rent: 12000, bills: 800, paid: 0, firstPaid: null }, '2026-09': { rent: 12000, bills: 700, paid: 12700, firstPaid: '2026-09-15' } }),
      T('t_l3', 'Faith Chebet', '+254712000003', 'L3', { '2026-10': { rent: 10000, bills: 500, paid: 4000, firstPaid: '2026-10-12' }, '2026-09': { rent: 10000, bills: 500, paid: 10500, firstPaid: '2026-09-10' } }),
    ],
    statements: {},
  },
  {
    ownerId: 'PYP-0003', name: 'Mwangaza Flats', address: 'Milimani, Kisumu', ownerPhone: '+254733000222',
    maxUnits: 8, commission: 10, managedByAgency: true, startLevel: 'full',
    tenants: [
      T('t_m1', 'Otieno Odhiambo', '+254733100001', 'M1', { '2026-10': { rent: 15000, bills: 1000, paid: 16000, firstPaid: '2026-10-02' }, '2026-09': { rent: 15000, bills: 900, paid: 15900, firstPaid: '2026-09-02' } }),
      T('t_m2', 'Akinyi Ouma', '+254733100002', 'M2', { '2026-10': { rent: 15000, bills: 1000, paid: 0, firstPaid: null }, '2026-09': { rent: 15000, bills: 900, paid: 15900, firstPaid: '2026-09-20' } }),
    ],
    statements: {},
  },
];
const seedOf = (ownerId: string) => SEEDS.find((s) => s.ownerId === ownerId);
const monthsOf = (s: Seed): string[] => {
  const set = new Set<string>();
  for (const t of s.tenants) for (const m of Object.keys(t.invoice)) set.add(m);
  return [...set].sort().reverse();
};

// ---- the server's calculations (contract section 5) -----------------------
interface Calc {
  billed: number; collected: number; pending: number; rate: number; baseBilled: number; baseCollected: number;
  comOnCollected: number; comOnExpected: number; netExpected: number; netStill: number;
  counts: { paid: number; partial: number; unpaid: number; noInvoice: number; total: number; active: number };
  byDue: number; afterDue: number; comByDue: number; comAfterDue: number;
  rows: { t: SeedTenant; status: TenantRow['status']; rent: number; billed: number; paid: number; balance: number; firstPaid: string | null }[];
}
const r2 = (n: number) => Math.round(n * 100) / 100;

function calc(seed: Seed, month: string): Calc {
  const due = `${month}-15`;
  const c: Calc = {
    billed: 0, collected: 0, pending: 0, rate: 0, baseBilled: 0, baseCollected: 0, comOnCollected: 0, comOnExpected: 0,
    netExpected: 0, netStill: 0, counts: { paid: 0, partial: 0, unpaid: 0, noInvoice: 0, total: 0, active: 0 },
    byDue: 0, afterDue: 0, comByDue: 0, comAfterDue: 0, rows: [],
  };
  const activeInMonth = seed.tenants.filter((t) => t.invoice[month] || t.noInvoice?.includes(month));
  for (const t of activeInMonth) {
    c.counts.active++;
    const inv = t.invoice[month];
    if (!inv) { c.counts.noInvoice++; c.rows.push({ t, status: 'no_invoice', rent: 0, billed: 0, paid: 0, balance: 0, firstPaid: null }); continue; }
    const total = inv.rent + inv.bills;
    c.counts.total++;
    c.billed += total; c.collected += inv.paid; c.baseBilled += inv.rent;
    const bal = Math.max(0, total - inv.paid);
    c.pending += bal;
    const status: TenantRow['status'] = inv.paid >= total ? 'paid' : inv.paid > 0 ? 'partial' : 'unpaid';
    c.counts[status]++;
    if (status !== 'unpaid') {
      c.baseCollected += inv.rent;
      const com = (inv.rent * seed.commission) / 100;
      if (inv.firstPaid && inv.firstPaid <= due) { c.byDue += inv.paid; c.comByDue += com; } else { c.afterDue += inv.paid; c.comAfterDue += com; }
    }
    c.rows.push({ t, status, rent: inv.rent, billed: total, paid: inv.paid, balance: bal, firstPaid: inv.firstPaid });
  }
  c.rate = c.billed > 0 ? Math.round((c.collected / c.billed) * 1000) / 10 : 0;
  c.comOnCollected = r2((c.baseCollected * seed.commission) / 100);
  c.comOnExpected = r2((c.baseBilled * seed.commission) / 100);
  c.netExpected = r2(c.billed - c.comOnExpected);
  c.netStill = r2(Math.max(0, c.pending - (c.comOnExpected - c.comOnCollected)));
  const order = { unpaid: 0, partial: 1, paid: 2, no_invoice: 3, masked: 4 } as const;
  c.rows.sort((a, b) => order[a.status] - order[b.status]);
  return c;
}

function buildStatement(seed: Seed, month: string, c: Calc, level: MaskLevel): Statement {
  const mk = makers(level);
  const hide = level === 'full';
  const meta = seed.statements[month];
  const lbl = (s: string) => (hide ? '••••••' : s);
  const items: Statement['items'] = [];
  let income: number; let deductions: number;
  if (meta) {
    items.push({ label: lbl('Collectable rent and bills'), kind: 'income', amount: mk.money(c.collected) });
    items.push({ label: lbl(`Agent commission (${seed.commission}% of base rent)`), kind: 'deduction', amount: mk.money(c.comOnCollected) });
    income = c.collected; deductions = c.comOnCollected;
    for (const e of meta.extra) {
      items.push({ label: lbl(e.label), kind: e.kind, amount: mk.money(e.amount) });
      if (e.kind === 'income') income += e.amount; else deductions += e.amount;
    }
  } else {
    items.push({ label: lbl('Collected (rent and bills)'), kind: 'income', amount: mk.money(c.collected) });
    items.push({ label: lbl(`Agent commission (${seed.commission}% of base rent)`), kind: 'deduction', amount: mk.money(c.comOnCollected) });
    income = c.collected; deductions = c.comOnCollected;
  }
  return {
    source: meta ? 'agent' : 'estimate', status: meta ? meta.status : null, notes: hide ? null : meta?.notes ?? null,
    items, income: mk.money(income), deductions: mk.money(deductions), netPayable: mk.money(r2(income - deductions)),
  };
}

function netPayable(seed: Seed, month: string): number {
  const c = calc(seed, month);
  const meta = seed.statements[month];
  let inc = c.collected; let ded = c.comOnCollected;
  for (const e of meta?.extra ?? []) { if (e.kind === 'income') inc += e.amount; else ded += e.amount; }
  return r2(inc - ded);
}

export function buildSnapshot(ownerId: string, month: string, level: MaskLevel, reason: Snapshot['mask']['reason'], unlockedUntil: string | null): Snapshot {
  const seed = seedOf(ownerId)!;
  const c = calc(seed, month);
  const mk = makers(level);
  const open = level === 'open';
  const full = level === 'full';
  const months = monthsOf(seed);
  const occupied = c.counts.active;
  const due = `${month}-15`;

  let tenants: TenantRow[] = c.rows.map(({ t, status, rent, billed, paid, balance, firstPaid }) => ({
    ref: t.ref,
    name: open ? t.name : maskName(t.name),
    phone: open ? t.phone : maskPhoneLocal(t.phone),
    unit: full ? '••' : t.unit,
    status: full ? 'masked' : status,
    rent: mk.money(rent), billed: mk.money(billed), paid: mk.money(paid), balance: mk.money(balance),
    dueDate: full || status === 'no_invoice' ? null : `${month}-05`,
    paidOn: full ? null : firstPaid,
    paidOnTime: full || !firstPaid ? null : firstPaid <= `${month}-05`,
  }));
  if (full) tenants = tenants.slice(0, 5).map((r, i) => ({ ...r, ref: `t_masked${i + 1}` }));

  return {
    schema: 1, ownerId, month, generatedAt: new Date(mockConfig.now()).toISOString(),
    mask: { level, reason, unlockedUntil, canUnlock: true },
    property: {
      name: full ? maskName(seed.name) : seed.name, address: full ? '••••••••' : seed.address,
      maxUnits: mk.count(seed.maxUnits), commissionRatePct: mk.pct(seed.commission), managedByAgency: seed.managedByAgency,
    },
    months,
    summary: {
      tenants: {
        active: mk.count(c.counts.active), occupiedUnits: mk.count(occupied),
        vacantUnits: mk.count(Math.max(0, seed.maxUnits - occupied)), occupancyPct: mk.pct(Math.round((occupied / seed.maxUnits) * 1000) / 10),
      },
      invoices: { total: mk.count(c.counts.total), paid: mk.count(c.counts.paid), partial: mk.count(c.counts.partial), unpaid: mk.count(c.counts.unpaid), noInvoice: mk.count(c.counts.noInvoice) },
      billed: mk.money(c.billed), collected: mk.money(c.collected), pending: mk.money(c.pending), collectionRatePct: mk.pct(c.rate),
      baseRent: { billed: mk.money(c.baseBilled), collected: mk.money(c.baseCollected) },
      commission: { ratePct: mk.pct(seed.commission), onCollected: mk.money(c.comOnCollected), onExpected: mk.money(c.comOnExpected) },
      net: { expected: mk.money(c.netExpected), payable: mk.money(netPayable(seed, month)), stillToCollect: mk.money(c.netStill) },
      statement: buildStatement(seed, month, c, level),
      remittance: {
        dueDate: due,
        collectedByDue: mk.money(c.byDue), collectedAfterDue: mk.money(c.afterDue),
        netByDue: mk.money(r2(c.byDue - c.comByDue)), netAfterDue: mk.money(r2(c.afterDue - c.comAfterDue)),
      },
    },
    tenants,
    trend: [...months].reverse().slice(-6).map((m) => {
      const cc = calc(seed, m);
      return { month: m, billed: mk.money(cc.billed), collected: mk.money(cc.collected), pending: mk.money(cc.pending), netPayable: mk.money(netPayable(seed, m)) };
    }),
  };
}

// ---- server state ----------------------------------------------------------
type Req = TranscriptRequest & { _readyAt?: number; _payAt?: number; _free?: boolean; _counted?: boolean };
interface OtpState { sentAt: number; attempts: number; code: string }
const state = {
  phone: null as string | null,
  authListeners: new Set<(s: AuthState) => void>(),
  connections: new Map<string, Connection>(),
  unlocks: new Map<string, number>(),            // owner phone -> until (ms)
  loginOtp: new Map<string, OtpState>(),         // by phone
  unlockOtp: new Map<string, OtpState>(),        // by owner phone
  tOtp: new Map<string, OtpState>(),             // by requestId
  requests: new Map<string, Req>(),
  freeUsed: new Map<string, number>(),           // `${ownerId}|${period}`
  lookups: [] as number[],
  seq: 1,
};
const LS_PHONE = 'lw.mock.phone';
const LS_CONN = 'lw.mock.connections';

function persist() {
  try { localStorage.setItem(LS_CONN, JSON.stringify([...state.connections.values()])); } catch { /* node tests */ }
}
function restore() {
  try {
    state.phone = localStorage.getItem(LS_PHONE);
    const raw = localStorage.getItem(LS_CONN);
    if (raw) for (const c of JSON.parse(raw) as Connection[]) state.connections.set(c.ownerId, c);
  } catch { /* node tests */ }
}
restore();

export function resetMock(): void {
  state.phone = null; state.connections.clear(); state.unlocks.clear(); state.loginOtp.clear(); state.unlockOtp.clear();
  state.tOtp.clear(); state.requests.clear(); state.freeUsed.clear(); state.lookups = []; state.seq = 1;
  try { localStorage.removeItem(LS_PHONE); localStorage.removeItem(LS_CONN); } catch { /* ignore */ }
}

const notify = () => { const s = authState(); state.authListeners.forEach((f) => f(s)); };
const authState = (): AuthState => (state.phone ? { status: 'signedIn', phone: state.phone } : { status: 'signedOut' });
const iso = (ms: number) => new Date(ms).toISOString();
const now = () => mockConfig.now();

function otpSend(map: Map<string, OtpState>, key: string): { expiresInSec: 300; resendInSec: 60 } {
  const prev = map.get(key);
  if (prev && now() - prev.sentAt < 60_000) throw new LwError('LW_OTP_COOLDOWN', { retryAfterSec: Math.ceil((60_000 - (now() - prev.sentAt)) / 1000) });
  map.set(key, { sentAt: now(), attempts: 0, code: MOCK_CODE });
  return { expiresInSec: 300, resendInSec: 60 };
}
function otpCheck(map: Map<string, OtpState>, key: string, code: string): void {
  const o = map.get(key);
  if (!o) throw new LwError('LW_OTP_EXPIRED');
  if (now() - o.sentAt > 300_000) { map.delete(key); throw new LwError('LW_OTP_EXPIRED'); }
  if (o.attempts >= 5) throw new LwError('LW_OTP_LOCKED');
  if (code !== o.code) {
    o.attempts++;
    if (o.attempts >= 5) throw new LwError('LW_OTP_LOCKED');
    throw new LwError('LW_OTP_WRONG', { attemptsLeft: 5 - o.attempts });
  }
  map.delete(key);
}

function requireSeed(ownerId: string): Seed {
  if (!/^PYP-\d{4,}$/.test(ownerId)) throw new LwError('LW_BAD_OWNER_ID');
  const s = seedOf(ownerId);
  if (!s) throw new LwError('LW_NOT_FOUND');
  return s;
}
function requireConnected(ownerId: string): Seed {
  const s = requireSeed(ownerId);
  if (!state.connections.has(ownerId)) throw new LwError('LW_NOT_ALLOWED');
  return s;
}

function maskFor(seed: Seed): { level: MaskLevel; reason: Snapshot['mask']['reason']; until: string | null } {
  if (state.phone && state.phone === seed.ownerPhone) return { level: 'open', reason: 'auth_phone_match', until: null };
  const u = state.unlocks.get(seed.ownerPhone);
  if (u && u > now()) return { level: 'open', reason: 'otp', until: iso(u) };
  return { level: seed.startLevel, reason: 'locked', until: null };
}

function connectionOf(seed: Seed, connectedAt: string): Connection {
  const m = maskFor(seed);
  return { ownerId: seed.ownerId, propertyName: seed.name, address: seed.address, connectedAt, unlocked: m.level === 'open', unlockedUntil: m.until };
}

function periodNow(): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit' }).formatToParts(new Date(now()));
  return `${p.find((x) => x.type === 'year')!.value}-${p.find((x) => x.type === 'month')!.value}`;
}
function quotaOf(ownerId: string): Quota {
  const period = periodNow();
  const used = state.freeUsed.get(`${ownerId}|${period}`) ?? 0;
  return { period, freeLimit: FREE_LIMIT, freeUsed: used, nextPriceKes: used >= FREE_LIMIT ? PRICE : 0 };
}

function publicReq(r: Req): TranscriptRequest {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) if (!k.startsWith('_')) out[k] = v;
  return out as unknown as TranscriptRequest;
}

/** Move a request forward in time (the real server does this on each status call). */
function advance(r: Req): void {
  const t = now();
  if (r.state === 'payment_pending' && r._payAt && t >= r._payAt + PAY_DELAY_MS) {
    r.state = 'generating'; r._readyAt = r._payAt + PAY_DELAY_MS + GEN_MS; r.message = undefined;
  }
  if (r.state === 'generating' && r._readyAt && t >= r._readyAt) {
    r.state = 'ready'; r.url = 'https://example.com/transcript.pdf'; r.expiresAt = iso(r._readyAt + 24 * 3600_000);
    if (r._free && !r._counted) {
      const k = `${r.ownerId}|${periodNow()}`; state.freeUsed.set(k, (state.freeUsed.get(k) ?? 0) + 1); r._counted = true;
    }
  }
  if (r.state === 'ready' && r.expiresAt && t > Date.parse(r.expiresAt)) { r.state = 'expired'; delete r.url; }
}

// ---- the mock API ----------------------------------------------------------
export function createMockApi(): WatchApi {
  return {
    auth: {
      onChange(cb) { state.authListeners.add(cb); void lat().then(() => cb(authState())); return () => { state.authListeners.delete(cb); }; },
      async sendOtp(phone) {
        await lat();
        if (!/^\+254[17]\d{8}$/.test(phone)) throw new SignInError('invalid_number');
        try { return otpSend(state.loginOtp, phone); }
        catch (e) { if (e instanceof LwError) throw new SignInError('cooldown', e.retryAfterSec); throw e; }
      },
      async verifyOtp(phone, code) {
        await lat();
        const o = state.loginOtp.get(phone);
        if (!o) throw new SignInError('no_code');
        if (now() - o.sentAt > 300_000) { state.loginOtp.delete(phone); throw new SignInError('expired'); }
        if (code !== MOCK_CODE) { o.attempts++; throw new SignInError('wrong_code'); }
        state.loginOtp.delete(phone);
        state.phone = phone;
        try { localStorage.setItem(LS_PHONE, phone); } catch { /* ignore */ }
        notify();
      },
      async signOut() {
        state.phone = null; state.connections.clear();
        try { localStorage.removeItem(LS_PHONE); localStorage.removeItem(LS_CONN); } catch { /* ignore */ }
        notify();
      },
    },

    async lookupProperty(ownerId): Promise<LookupResult> {
      await lat();
      if (!/^PYP-\d{4,}$/.test(ownerId)) throw new LwError('LW_BAD_OWNER_ID');
      const t = now();
      state.lookups = state.lookups.filter((x) => t - x < 3600_000);
      if (state.lookups.length >= 20) throw new LwError('LW_RATE_LIMITED', { retryAfterSec: 600 });
      state.lookups.push(t);
      const s = seedOf(ownerId);
      if (!s) return { found: false };
      return { found: true, property: { ownerId, name: s.name, address: s.address, ownerPhoneMasked: maskPhoneLocal(s.ownerPhone), managedByAgency: s.managedByAgency } };
    },
    async connect(ownerId) {
      await lat();
      const s = requireSeed(ownerId);
      const existing = state.connections.get(ownerId);
      if (!existing && state.connections.size >= mockConfig.maxConnections) throw new LwError('LW_CONNECTION_LIMIT');
      const at = existing?.connectedAt ?? iso(now());
      state.connections.set(ownerId, connectionOf(s, at));
      persist();
      return state.connections.get(ownerId)!;
    },
    async disconnect(ownerId) { await lat(); state.connections.delete(ownerId); persist(); return; },
    async listConnections() {
      await lat();
      const list = [...state.connections.values()].map((c) => connectionOf(seedOf(c.ownerId)!, c.connectedAt));
      list.forEach((c) => state.connections.set(c.ownerId, c));
      return list;
    },

    async unlockSendOtp(ownerId): Promise<OtpSent> {
      await lat();
      const s = requireConnected(ownerId);
      return { sentTo: maskPhoneLocal(s.ownerPhone), ...otpSend(state.unlockOtp, s.ownerPhone) };
    },
    async unlockVerifyOtp(ownerId, code): Promise<UnlockResult> {
      await lat();
      const s = requireConnected(ownerId);
      otpCheck(state.unlockOtp, s.ownerPhone, code);
      const until = now() + UNLOCK_MS;
      state.unlocks.set(s.ownerPhone, until); // one OTP unlocks every property sharing this owner phone
      return { unlocked: true, unlockedUntil: iso(until), level: 'open' };
    },

    async getSnapshot({ ownerId, month, ifNoneMatch }): Promise<SnapshotResponse> {
      await lat();
      const s = requireConnected(ownerId);
      const months = monthsOf(s);
      const cur = periodNow();
      const m = month ?? (months.includes(cur) ? cur : months[0]);
      if (!/^\d{4}-\d{2}$/.test(m) || !months.includes(m)) throw new LwError('LW_BAD_MONTH');
      const k = maskFor(s);
      const etag = `W/"${ownerId}:${m}:${k.level}:${k.reason}"`;
      if (ifNoneMatch && ifNoneMatch === etag) return { notModified: true, etag };
      return { snapshot: buildSnapshot(ownerId, m, k.level, k.reason, k.until), etag };
    },

    async transcriptQuota(ownerId) { await lat(); requireConnected(ownerId); return quotaOf(ownerId); },
    async transcriptStart(ownerId, month): Promise<TranscriptRequest> {
      await lat();
      const s = requireConnected(ownerId);
      if (!monthsOf(s).includes(month)) throw new LwError('LW_BAD_MONTH');
      const id = `req_${state.seq++}`;
      const q = quotaOf(ownerId);
      const r: Req = {
        requestId: id, ownerId, month, state: 'otp_pending', priceKes: q.nextPriceKes,
        sentTo: maskPhoneLocal(s.ownerPhone), expiresInSec: 300, resendInSec: 60, createdAt: iso(now()),
      };
      otpSend(state.tOtp, id);
      state.requests.set(id, r);
      return publicReq(r);
    },
    async transcriptResendOtp(requestId): Promise<OtpSent> {
      await lat();
      const r = state.requests.get(requestId); if (!r) throw new LwError('LW_NOT_ALLOWED');
      return { sentTo: r.sentTo, ...otpSend(state.tOtp, requestId) };
    },
    async transcriptVerifyOtp(requestId, code) {
      await lat();
      const r = state.requests.get(requestId); if (!r) throw new LwError('LW_NOT_ALLOWED');
      otpCheck(state.tOtp, requestId, code);
      const q = quotaOf(r.ownerId);
      if (q.freeUsed < q.freeLimit) { r.priceKes = 0; r._free = true; r.state = 'generating'; r._readyAt = now() + GEN_MS; }
      else { r.priceKes = q.nextPriceKes; r.state = 'payment_required'; }
      delete r.sentTo;
      advance(r);
      return publicReq(r);
    },
    async transcriptPay(requestId, phone) {
      await lat();
      const r = state.requests.get(requestId); if (!r) throw new LwError('LW_NOT_ALLOWED');
      if (r.state !== 'payment_required' && r.state !== 'failed') throw new LwError('LW_NOT_ALLOWED');
      if (!/^\+254[17]\d{8}$/.test(phone) || phone === '+254700000000') throw new LwError('LW_PAYMENT_FAILED');
      r.state = 'payment_pending'; r._payAt = now(); r.reference = `MOCK${r.requestId.toUpperCase()}`;
      r.message = 'Check your phone for the M-Pesa prompt'; delete r.error;
      return publicReq(r);
    },
    async transcriptStatus(requestId) {
      await lat();
      const r = state.requests.get(requestId); if (!r) throw new LwError('LW_NOT_ALLOWED');
      advance(r);
      return publicReq(r);
    },
    async transcriptList(ownerId) {
      await lat();
      requireConnected(ownerId);
      const items = [...state.requests.values()].filter((r) => r.ownerId === ownerId);
      items.forEach(advance);
      return { items: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12).map(publicReq) };
    },
  };
}
