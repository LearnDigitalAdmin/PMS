import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, createMockApi, mockConfig, resetMock, maskName, maskPhoneLocal, MOCK_CODE } from './mock.ts';
import { LwError } from './types.ts';
import { uiStep, shouldPoll, pollDecision, canRedownload, PAYMENT_POLL_TIMEOUT_MS } from './transcriptFlow.ts';

let clock = Date.parse('2026-10-23T08:00:00Z');
mockConfig.latencyMs = 0;
mockConfig.now = () => clock;
const api = createMockApi();
const reset = () => { resetMock(); clock = Date.parse('2026-10-23T08:00:00Z'); };
const code = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e instanceof LwError ? e : (() => { throw e; })(); } };

test('worked example (contract section 5) at level open', () => {
  const s = buildSnapshot('PYP-0001', '2026-10', 'open', 'otp', null);
  const v = (n: { v: number | null }) => n.v;
  assert.equal(v(s.summary.billed), 56500);
  assert.equal(v(s.summary.collected), 29000);
  assert.equal(v(s.summary.pending), 27500);
  assert.equal(v(s.summary.collectionRatePct), 51.3);
  assert.equal(v(s.summary.baseRent.billed), 52000);
  assert.equal(v(s.summary.baseRent.collected), 34000);
  assert.equal(v(s.summary.commission.onCollected), 3400);
  assert.equal(v(s.summary.commission.onExpected), 5200);
  assert.equal(v(s.summary.net.expected), 51300);
  assert.equal(v(s.summary.net.payable), 25600);
  assert.equal(v(s.summary.net.stillToCollect), 25700);
  assert.equal(s.summary.statement.source, 'estimate');
  assert.equal(v(s.summary.statement.income), 29000);
  assert.equal(v(s.summary.statement.deductions), 3400);
  assert.equal(v(s.summary.statement.netPayable), 25600);
  assert.equal(v(s.summary.tenants.occupiedUnits), 5);
  assert.equal(v(s.summary.tenants.vacantUnits), 1);
  assert.equal(v(s.summary.tenants.occupancyPct), 83.3);
  assert.equal(s.summary.remittance.dueDate, '2026-10-15');
  assert.equal(v(s.summary.remittance.collectedByDue), 20000);
  assert.equal(v(s.summary.remittance.collectedAfterDue), 9000);
  assert.equal(v(s.summary.remittance.netByDue), 17450);
  assert.equal(v(s.summary.remittance.netAfterDue), 8150);
  assert.deepEqual(['paid', 'partial', 'unpaid', 'noInvoice'].map((k) => v((s.summary.invoices as never)[k])), [2, 1, 1, 1]);
  assert.equal(s.summary.billed.d, 'KES 56,500');
  assert.equal(s.tenants[0].status, 'unpaid', 'unpaid first');
  assert.equal(s.tenants.at(-1)!.status, 'no_invoice', 'no_invoice last');
  assert.deepEqual(s.months, ['2026-10', '2026-09', '2026-08']);
});

test('masking: tenant level hides PII, full level hides everything', () => {
  const t = buildSnapshot('PYP-0001', '2026-10', 'tenant', 'locked', null);
  assert.equal(t.summary.billed.v, 56500);
  assert.ok(t.tenants.every((r) => r.name.includes('•••') && r.phone.includes('••')));
  const f = buildSnapshot('PYP-0001', '2026-10', 'full', 'locked', null);
  assert.equal(f.property.name, 'S••• A•••');
  assert.equal(f.property.address, '••••••••');
  assert.equal(f.summary.billed.v, null);
  assert.equal(f.summary.billed.d, 'KES ••,•••');
  assert.equal(f.summary.tenants.active.d, '••');
  assert.equal(f.summary.collectionRatePct.d, '••%');
  assert.ok(f.tenants.length <= 5 && f.tenants.every((r) => r.status === 'masked' && r.paidOn === null));
  assert.equal(f.summary.remittance.dueDate, '2026-10-15');
  assert.equal(maskName('Jane Kamau'), 'J••• K•••');
  assert.equal(maskPhoneLocal('+254722000123'), '07•• ••• 123');
});

test('lookup and connect', async () => {
  reset();
  assert.equal((await api.lookupProperty('PYP-0001')).found, true);
  assert.equal((await api.lookupProperty('PYP-9999')).found, false);
  assert.equal((await code(api.lookupProperty('nope')))?.lw, 'LW_BAD_OWNER_ID');
  const r = await api.lookupProperty('PYP-0001');
  assert.equal(r.property!.ownerPhoneMasked, '07•• ••• 111');
  await api.connect('PYP-0001');
  assert.equal((await api.listConnections()).length, 1);
});

test('sign-in OTP: wrong code, cooldown, success; auto-unlock by phone match', async () => {
  reset();
  await api.auth.sendOtp('+254722000111');
  await assert.rejects(api.auth.sendOtp('+254722000111'), (e: { kind: string; retryAfterSec: number }) => e.kind === 'cooldown' && e.retryAfterSec === 60);
  await assert.rejects(api.auth.verifyOtp('+254722000111', '000000'), (e: { kind: string }) => e.kind === 'wrong_code');
  clock += 61_000;
  await api.auth.sendOtp('+254722000111');
  await api.auth.verifyOtp('+254722000111', MOCK_CODE);
  await api.connect('PYP-0001');
  const res = await api.getSnapshot({ ownerId: 'PYP-0001' });
  assert.ok(!res.notModified);
  if (!res.notModified) { assert.equal(res.snapshot.mask.level, 'open'); assert.equal(res.snapshot.mask.reason, 'auth_phone_match'); assert.equal(res.snapshot.mask.unlockedUntil, null); }
});

test('OTP unlock: 5 wrong tries lock; one unlock covers properties with the same owner phone; etag changes with level', async () => {
  reset();
  await api.auth.sendOtp('+254711111111'); await api.auth.verifyOtp('+254711111111', MOCK_CODE);
  await api.connect('PYP-0001'); await api.connect('PYP-0002');
  const first = await api.getSnapshot({ ownerId: 'PYP-0001' });
  assert.ok(!first.notModified);
  const etag = first.etag;
  if (!first.notModified) assert.equal(first.snapshot.mask.level, 'tenant');
  assert.equal((await api.getSnapshot({ ownerId: 'PYP-0001', ifNoneMatch: etag })).notModified, true);
  await api.unlockSendOtp('PYP-0001');
  assert.equal((await code(api.unlockVerifyOtp('PYP-0001', '111111')))?.attemptsLeft, 4);
  const u = await api.unlockVerifyOtp('PYP-0001', MOCK_CODE);
  assert.equal(u.level, 'open');
  assert.equal(Date.parse(u.unlockedUntil) - clock, 30 * 60 * 1000);
  const again = await api.getSnapshot({ ownerId: 'PYP-0001', ifNoneMatch: etag });
  assert.ok(!again.notModified, 'etag encodes the mask level');
  const other = await api.getSnapshot({ ownerId: 'PYP-0002' });
  assert.ok(!other.notModified && other.snapshot.mask.level === 'open');
  clock += 31 * 60_000;
  const later = await api.getSnapshot({ ownerId: 'PYP-0001' });
  assert.ok(!later.notModified && later.snapshot.mask.level === 'tenant', 'unlock lapses');
  await api.unlockSendOtp('PYP-0001').catch(() => undefined);
  for (let i = 0; i < 4; i++) await code(api.unlockVerifyOtp('PYP-0001', '000000'));
  assert.equal((await code(api.unlockVerifyOtp('PYP-0001', '000000')))?.lw, 'LW_OTP_LOCKED');
});

test('transcript: first one free, second costs 99 via M-Pesa with ~6 s pending', async () => {
  reset();
  await api.auth.sendOtp('+254711111111'); await api.auth.verifyOtp('+254711111111', MOCK_CODE);
  await api.connect('PYP-0001');
  let q = await api.transcriptQuota('PYP-0001');
  assert.deepEqual([q.freeLimit, q.freeUsed, q.nextPriceKes, q.period], [1, 0, 0, '2026-10']);

  let r = await api.transcriptStart('PYP-0001', '2026-10');
  assert.equal(uiStep(r), 'otp');
  assert.equal(r.priceKes, 0);
  assert.equal(r.sentTo, '07•• ••• 111');
  assert.equal((await code(api.transcriptResendOtp(r.requestId)))?.lw, 'LW_OTP_COOLDOWN');
  assert.equal((await code(api.transcriptVerifyOtp(r.requestId, '999999')))?.lw, 'LW_OTP_WRONG');
  r = await api.transcriptVerifyOtp(r.requestId, MOCK_CODE);
  assert.equal(r.state, 'generating');
  assert.ok(shouldPoll(r));
  assert.equal((await api.transcriptQuota('PYP-0001')).freeUsed, 0, 'allowance is used only when the PDF is produced');
  clock += 2000;
  r = await api.transcriptStatus(r.requestId);
  assert.equal(r.state, 'ready');
  assert.equal(r.url, 'https://example.com/transcript.pdf');
  assert.ok(canRedownload(r, clock));
  assert.ok(!canRedownload(r, clock + 25 * 3600_000));
  q = await api.transcriptQuota('PYP-0001');
  assert.deepEqual([q.freeUsed, q.nextPriceKes], [1, 99]);

  // second one: paid
  let p = await api.transcriptStart('PYP-0001', '2026-09');
  assert.equal(p.priceKes, 99);
  p = await api.transcriptVerifyOtp(p.requestId, MOCK_CODE);
  assert.equal(uiStep(p), 'pay');
  assert.equal(p.priceKes, 99);
  assert.equal((await code(api.transcriptPay(p.requestId, '+254700000000')))?.lw, 'LW_PAYMENT_FAILED');
  p = await api.transcriptPay(p.requestId, '+254711111111');
  assert.equal(uiStep(p), 'waiting_payment');
  const t0 = clock;
  clock += 3000; p = await api.transcriptStatus(p.requestId); assert.equal(p.state, 'payment_pending');
  assert.equal(pollDecision(p, t0, clock), 'poll');
  clock += 3500; p = await api.transcriptStatus(p.requestId); assert.equal(p.state, 'generating');
  clock += 2000; p = await api.transcriptStatus(p.requestId); assert.equal(p.state, 'ready');
  assert.equal((await api.transcriptList('PYP-0001')).items.length, 2);
  assert.equal((await code(api.transcriptStart('PYP-0001', '2026-01')))?.lw, 'LW_BAD_MONTH');

  clock += 25 * 3600_000;
  assert.equal((await api.transcriptStatus(p.requestId)).state, 'expired');
});

test('poll timeout: payment polling stops after 90 s', () => {
  const req = { requestId: 'r', ownerId: 'x', month: '2026-10', state: 'payment_pending' as const, priceKes: 99, createdAt: '' };
  assert.equal(pollDecision(req, 0, PAYMENT_POLL_TIMEOUT_MS - 1), 'poll');
  assert.equal(pollDecision(req, 0, PAYMENT_POLL_TIMEOUT_MS), 'timeout');
  assert.equal(pollDecision({ ...req, state: 'ready' }, 0, 1), 'stop');
  assert.equal(uiStep({ ...req, state: 'failed' }), 'failed');
  assert.equal(uiStep({ ...req, state: 'expired' }), 'expired');
  assert.equal(uiStep(null), 'start');
});

test('connection limit', async () => {
  reset();
  mockConfig.maxConnections = 2;
  try {
    await api.connect('PYP-0001'); await api.connect('PYP-0002');
    await api.connect('PYP-0002'); // reconnecting is idempotent
    assert.equal((await code(api.connect('PYP-0003')))?.lw, 'LW_CONNECTION_LIMIT');
    assert.equal((await api.listConnections()).length, 2);
  } finally { mockConfig.maxConnections = 25; }
});
