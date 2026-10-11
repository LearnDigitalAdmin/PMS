import test from "node:test";
import assert from "node:assert/strict";
import { handleDelegate, fingerprintOf, type ClaimResult, type DelegateDeps, type DelegateResponse, type DelegateStore, type Landlord, type ScheduleDoc, type SmsPort } from "./delegate";
import type { NewTenant } from "./tenantRules";

// ---- test doubles (test file only) ----
function world(over: Partial<Landlord> = {}) {
  const landlord: Landlord = { uid: "u1", code: "PYL-0001", name: "Mary Landlord", company: "Mary Rentals", phone: "0700111222", tier: "business", tokens: 100, supportAgents: { "COG-0001": { name: "Desk One" } }, ...over };
  const s = {
    landlord, activeDesks: new Set(["COG-0001", "COG-0002"]),
    tenants: [
      { id: "11111111", propertyId: "1", name: "Ann Wangui", phone: "0711000001", isRestricted: false, isActive: true, unitNumber: "A1", email: "", rentAmount: 1, standingFees: 0, depositAmount: 0, leaseStart: "", leaseEnd: "" },
      { id: "22222222", propertyId: "1", name: "Bob Otieno", phone: "0711000002", isRestricted: false, isActive: true, unitNumber: "A2", email: "", rentAmount: 1, standingFees: 0, depositAmount: 0, leaseStart: "", leaseEnd: "" },
    ],
    invoices: [{ tenantId: "22222222", totalAmount: 1000, amountPaid: 200 }, { tenantId: "11111111", totalAmount: 1000, amountPaid: 1000 }],
    claims: new Map<string, { fp: string; response?: DelegateResponse<unknown> }>(),
    created: [] as NewTenant[], schedules: [] as ScheduleDoc[], audits: [] as string[], sent: [] as string[], smsLog: 0, exports: 0,
    failPhones: new Set<string>(),
  };
  const store: DelegateStore = {
    findLandlord: async (c) => (c === landlord.code ? landlord : null),
    isActiveDesk: async (c) => s.activeDesks.has(c),
    listProperties: async () => [{ id: "1", name: "Sunrise", isRestricted: false }],
    listTenants: async () => [...s.tenants, ...s.created.map((t) => ({ id: String(t.id), propertyId: t.propertyId, name: t.name, phone: t.phone, isRestricted: false, isActive: true, unitNumber: t.unitNumber, email: "", rentAmount: t.rentAmount, standingFees: 0, depositAmount: 0, leaseStart: "", leaseEnd: "" }))],
    listInvoices: async () => s.invoices,
    createTenants: async (_u, ts) => { s.created.push(...ts); return { created: ts.map((t) => String(t.id)), existing: [] }; },
    claimRequest: async (_u, id, fp): Promise<ClaimResult> => {
      const c = s.claims.get(id);
      if (!c) { s.claims.set(id, { fp }); return { state: "claimed" }; }
      if (c.fp !== fp) return { state: "conflict" };
      return c.response ? { state: "replay", response: c.response } : { state: "in_progress" };
    },
    completeRequest: async (_u, id, r) => { s.claims.get(id)!.response = r; },
    releaseRequest: async (_u, id) => { s.claims.delete(id); },
    reserveTokens: async (_u, n) => { if (landlord.tokens < n) return { insufficient: landlord.tokens }; landlord.tokens -= n; return { remaining: landlord.tokens }; },
    refundTokens: async (_u, n) => { landlord.tokens += n; },
    recordSmsSent: async () => { s.smsLog += 1; },
    countActiveSchedules: async () => s.schedules.filter((x) => x.active).length,
    saveSchedule: async (_u, d) => { s.schedules.push(d); },
    putExport: async (_u, name, csv) => { s.exports += 1; s.lastCsv = csv; return { downloadUrl: `https://files.test/${name}`, expiresAt: 1 }; },
    audit: async (e) => { s.audits.push(e.action); },
  } as DelegateStore;
  const sms: SmsPort = {
    normalizePhone: (r) => r.replace(/^0/, "254"),
    validateBody: (r) => (/^[A-Za-z0-9 .,'\-!?():/]*$/.test(r) && r.trim() ? { valid: true } : { valid: false, reason: "Message contains characters that are not allowed (no emojis, symbols, or special characters)." }),
    tokensFor: (m) => Math.max(1, Math.ceil(m.length / 150)),
    send: async (mobile, message) => { if (s.failPhones.has(mobile)) return { success: false, error: "provider said no" }; s.sent.push(`${mobile}|${message}`); return { success: true }; },
  };
  const deps: DelegateDeps = { store, sms, now: () => Date.UTC(2026, 9, 11, 9, 0) };
  return Object.assign(s, { deps, lastCsv: "" });
}
const call = (w: ReturnType<typeof world>, over: Record<string, unknown>) =>
  handleDelegate(w.deps, { action: "entity_info", entityCode: "PYL-0001", agentCode: "COG-0001", requestId: "req-00000001", payload: {}, ...over });
const good = { name: "Jane Wanjiru", id: "33333333", phone: "0712345678", unitNumber: "B1", rentAmount: 9000 };

test("an unauthorised desk is refused on every action", async () => {
  const w = world();
  for (const action of ["entity_info", "validate_records", "commit_records", "send_sms_now", "export_data", "run_report", "schedule_sms"]) {
    const r = await call(w, { action, agentCode: "COG-0002", payload: { rows: [good], source: "manual", message: "Hi", audience: "all_tenants", kind: "tenants" } });
    assert.deepEqual(r.ok === false && r.error.code, "permission_denied", action);
  }
  assert.equal(w.created.length, 0);
  assert.equal(w.sent.length, 0);
});
test("a connected desk that has been suspended is refused", async () => {
  const w = world(); w.activeDesks.delete("COG-0001");
  const r = await call(w, {});
  assert.ok(!r.ok && r.error.code === "permission_denied");
});
test("COG-0000 is always authorised, even when the landlord has no support agents", async () => {
  const w = world({ supportAgents: {} });
  const r = await call(w, { agentCode: "COG-0000" });
  assert.ok(r.ok);
  assert.deepEqual(r.ok && (r.result as { adminName: string; plan: string; creditsBalance: number; audiences: string[]; reportTypes: string[]; exportKinds: string[] }), {
    displayName: "Mary Rentals", adminName: "Mary Landlord", adminPhone: "0700111222", agentAuthorised: true, plan: "business",
    creditsBalance: 100, audiences: ["all_tenants", "tenants_with_arrears"], reportTypes: [], exportKinds: ["tenants"],
  });
});
test("unknown landlord, malformed requests and unknown actions are rejected cleanly", async () => {
  const w = world();
  assert.ok(!(await call(w, { entityCode: "PYL-9999" })).ok);
  assert.ok(!(await call(w, { entityCode: "nonsense" })).ok);
  assert.ok(!(await call(w, { agentCode: "AGT-1" })).ok);
  assert.ok(!(await call(w, { requestId: "x" })).ok);
  assert.ok(!(await call(w, { action: "drop_tables" })).ok);
  assert.ok(!(await handleDelegate(w.deps, null)).ok);
});
test("run_report is not_found because PMS has no report engine", async () => {
  const r = await call(world(), { action: "run_report", payload: { reportType: "x", params: {} } });
  assert.ok(!r.ok && r.error.code === "not_found");
});
test("validate_records returns canonical valid rows and row errors, writes nothing", async () => {
  const w = world();
  const r = await call(w, { action: "validate_records", payload: { rows: [good, { ...good, id: "1" }] } });
  assert.ok(r.ok);
  const res = r.ok ? (r.result as { valid: unknown[]; errors: { row: number; field: string }[] }) : null;
  assert.equal(res?.valid.length, 1);
  assert.deepEqual(res?.errors.map((e) => `${e.row}:${e.field}`), ["2:id"]);
  assert.equal(w.created.length, 0);
});
test("commit_records is idempotent by requestId: a replay creates nothing more and returns the same answer", async () => {
  const w = world();
  const payload = { rows: [good], source: "excel" };
  const a = await call(w, { action: "commit_records", payload });
  const b = await call(w, { action: "commit_records", payload });
  assert.deepEqual(a, b);
  assert.equal(w.created.length, 1);
  assert.deepEqual(a.ok && a.result, { created: 1, skipped: 0, errors: [] });
});
test("reusing a requestId for a different request is refused", async () => {
  const w = world();
  await call(w, { action: "commit_records", payload: { rows: [good], source: "excel" } });
  const r = await call(w, { action: "commit_records", payload: { rows: [{ ...good, id: "44444444" }], source: "excel" } });
  assert.ok(!r.ok && r.error.code === "invalid_argument");
  assert.equal(w.created.length, 1);
});
test("commit_records re-validates: duplicates and invalid rows are skipped and reported", async () => {
  const w = world();
  const r = await call(w, { action: "commit_records", payload: { rows: [good, good, { ...good, id: "55555555", rentAmount: -1 }], source: "manual" } });
  assert.deepEqual(r.ok && r.result, { created: 1, skipped: 2, errors: [{ row: 2, field: "id", reason: "A tenant with this ID already exists" }, { row: 3, field: "rentAmount", reason: "Please enter a valid rent amount" }] });
});
test("send_sms_now dryRun counts recipients and credits without sending or charging", async () => {
  const w = world();
  const r = await call(w, { action: "send_sms_now", payload: { message: "Rent is due", audience: "all_tenants", dryRun: true } });
  assert.deepEqual(r.ok && r.result, { queued: 2, creditsUsed: 2, creditsRemaining: 100 });
  assert.equal(w.sent.length, 0);
  assert.equal(w.landlord.tokens, 100);
});
test("send_sms_now composes like sendPmsSms, deducts tokens, and is idempotent", async () => {
  const w = world();
  const p = { message: "Rent is due", audience: "tenants_with_arrears" };
  const a = await call(w, { action: "send_sms_now", payload: p });
  const b = await call(w, { action: "send_sms_now", payload: p });
  assert.deepEqual(a, b);
  assert.deepEqual(w.sent, ["254711000002|Dear Bob Otieno, Rent is due - Mary Rentals, 0700111222"]);
  assert.deepEqual(a.ok && a.result, { queued: 1, creditsUsed: 1, creditsRemaining: 99 });
  assert.equal(w.landlord.tokens, 99);
  assert.equal(w.smsLog, 1);
});
test("failed sends are refunded; nothing delivered ends as an error that keeps the credits", async () => {
  const w = world();
  w.failPhones.add("254711000001");
  const half = await call(w, { action: "send_sms_now", payload: { message: "Hello all", audience: "all_tenants" } });
  assert.deepEqual(half.ok && half.result, { queued: 1, creditsUsed: 1, creditsRemaining: 99 });
  const w2 = world(); w2.failPhones.add("254711000001"); w2.failPhones.add("254711000002");
  const none = await call(w2, { action: "send_sms_now", payload: { message: "Hello all", audience: "all_tenants" } });
  assert.ok(!none.ok && /No messages could be sent/.test(none.error.message));
  assert.equal(w2.landlord.tokens, 100);
});
test("PMS SMS rules: strict body, credit balance", async () => {
  const w = world({ tokens: 1 });
  const bad = await call(w, { action: "send_sms_now", payload: { message: "Pay now 😀", audience: "all_tenants" } });
  assert.ok(!bad.ok && /not allowed/.test(bad.error.message));
  const poor = await call(w, { action: "send_sms_now", payload: { message: "Hello all", audience: "all_tenants" }, requestId: "req-00000002" });
  assert.ok(!poor.ok && poor.error.message === "Insufficient SMS credits. Required: 2, available: 1.");
  assert.equal(w.sent.length, 0);
});
test("schedule_sms stores one schedule per requestId and quotes the credits per run", async () => {
  const w = world();
  const payload = { name: "Rent reminder", message: "Rent is due on the 5th", audience: "all_tenants", schedule: { kind: "monthly", at: "09:00", days: [3] } };
  const a = await call(w, { action: "schedule_sms", payload });
  const b = await call(w, { action: "schedule_sms", payload });
  assert.deepEqual(a, b);
  assert.deepEqual(a.ok && a.result, { scheduleId: "sch_req-00000001", recipients: 2, creditsPerRun: 2 });
  assert.equal(w.schedules.length, 1);
  assert.equal(w.schedules[0].nextRunAt, Date.UTC(2026, 10, 3, 6, 0));
  assert.equal(w.landlord.tokens, 100);
});
test("export_data builds a CSV of the landlord's tenants and neutralises formulas", async () => {
  const w = world(); w.tenants[0].name = "=cmd|' /C calc'!A0";
  const r = await call(w, { action: "export_data", payload: { kind: "tenants" } });
  assert.ok(r.ok);
  assert.match(w.lastCsv, /^property,id,name,phone/);
  assert.match(w.lastCsv, /'=cmd/);
  assert.equal(w.exports, 1);
  const rep = await call(w, { action: "export_data", payload: { kind: "reports" }, requestId: "req-00000009" });
  assert.ok(!rep.ok && rep.error.code === "not_found");
});
test("fingerprints ignore key order", () => {
  assert.equal(fingerprintOf("a", "PYL-0001", "COG-0001", { x: 1, y: [1, 2] }), fingerprintOf("a", "PYL-0001", "COG-0001", { y: [1, 2], x: 1 }));
});
