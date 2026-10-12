/**
 * Plot Yangu's side of the desk delegate API (contract: DelegateAction). Desk never writes PMS data itself: it calls this and PMS
 * runs its OWN rules. All Firestore/SMS access goes through the ports below so the rules are unit-testable; the production
 * implementations are in delegateStore.ts and index.ts.
 */
import { createHash } from "node:crypto";
import { DESK_CODE_RE, DESK_TOP_CODE, LANDLORD_CODE_RE } from "./constants";
import { isAudience, selectRecipients, AUDIENCES, type Audience, type InvoiceRec, type Recipient, type TenantRec } from "./audiences";
import { toCsv } from "./csv";
import { listTenantsPage } from "./tenantList";
import { DeskError } from "./errors";
import { nextRunAt, validateSchedule, type ScheduleSpec } from "./schedule";
import { toImportRow, validateTenantRows, type ExistingTenant, type ImportError, type ImportRow, type NewTenant, type PropertyRec } from "./tenantRules";

export const DELEGATE_ACTIONS = ["entity_info", "validate_records", "commit_records", "schedule_sms", "send_sms_now", "run_report", "export_data", "list_tenants"] as const;
export type DelegateAction = typeof DELEGATE_ACTIONS[number];
export type DelegateResponse<T> = { ok: true; result: T } | { ok: false; error: { code: string; message: string } };

export const MAX_ROWS = 500;
export const MAX_SMS_RECIPIENTS = 200; // sendPmsSms: "Maximum 200 recipients per send."
export const MAX_ACTIVE_SCHEDULES = 20;
export const EXPORT_KINDS = ["tenants"] as const;
export const EXPORT_TTL_MS = 60 * 60 * 1000;
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;

export interface Landlord {
  uid: string; code: string; name: string; company: string; phone: string; tier: string; tokens: number;
  supportAgents: Record<string, unknown>;
}
export interface ScheduleDoc {
  id: string; name: string; message: string; audience: Audience; memberIds: string[]; schedule: ScheduleSpec;
  active: boolean; nextRunAt: number | null; createdByAgent: string; createdAt: number; runs: number;
}
export type ClaimResult = { state: "claimed" } | { state: "replay"; response: DelegateResponse<unknown> } | { state: "conflict" } | { state: "in_progress" };
export interface SmsLogEntry { recipientCount: number; tokensCharged: number; successCount: number; failCount: number; via: string; agentCode?: string; scheduleId?: string }

export interface DelegateStore {
  findLandlord(code: string): Promise<Landlord | null>;
  isActiveDesk(agentCode: string): Promise<boolean>;
  listProperties(uid: string): Promise<PropertyRec[]>;
  listTenants(uid: string): Promise<(TenantRec & { unitNumber: string; email: string; rentAmount: number; standingFees: number; depositAmount: number; leaseStart: string; leaseEnd: string })[]>;
  listInvoices(uid: string): Promise<InvoiceRec[]>;
  /** Create-only: a tenant document that already exists is left untouched and reported back in `existing`. */
  createTenants(uid: string, tenants: NewTenant[], agentCode: string): Promise<{ created: string[]; existing: string[] }>;
  claimRequest(uid: string, requestId: string, fingerprint: string): Promise<ClaimResult>;
  completeRequest(uid: string, requestId: string, response: DelegateResponse<unknown>): Promise<void>;
  releaseRequest(uid: string, requestId: string): Promise<void>;
  /** Atomically deduct `n` tokens when the balance covers them: the balance after, or `insufficient` carrying the balance that was available. */
  reserveTokens(uid: string, n: number): Promise<{ remaining: number } | { insufficient: number }>;
  refundTokens(uid: string, n: number): Promise<void>;
  recordSmsSent(uid: string, entry: SmsLogEntry): Promise<void>;
  countActiveSchedules(uid: string): Promise<number>;
  saveSchedule(uid: string, doc: ScheduleDoc): Promise<void>;
  putExport(uid: string, fileName: string, csv: string, ttlMs: number): Promise<{ downloadUrl: string; expiresAt: number }>;
  audit(entry: { action: string; entityKey: string; agentCode: string; requestId: string; meta: Record<string, unknown> }): Promise<void>;
}
export interface SmsPort {
  normalizePhone(raw: string): string;
  validateBody(raw: string): { valid: boolean; reason?: string };
  tokensFor(fullMessage: string): number;
  send(mobile: string, message: string): Promise<{ success: boolean; error?: string }>;
}
export interface DelegateDeps { store: DelegateStore; sms: SmsPort; now: () => number }

const ok = <T>(result: T): DelegateResponse<T> => ({ ok: true, result });
const fail = (code: string, message: string): DelegateResponse<never> => ({ ok: false, error: { code, message } });

/** Deterministic JSON so the same payload always hashes the same. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}
export const fingerprintOf = (action: string, entityCode: string, agentCode: string, payload: unknown): string =>
  createHash("sha256").update(stableStringify({ action, entityCode, agentCode, payload })).digest("hex");

export const isAuthorised = (landlord: Landlord, agentCode: string): boolean =>
  agentCode === DESK_TOP_CODE || Object.prototype.hasOwnProperty.call(landlord.supportAgents ?? {}, agentCode);

interface Parsed { action: DelegateAction; entityCode: string; agentCode: string; requestId: string; payload: Record<string, unknown> }
function parseRequest(body: unknown): Parsed {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== "object") throw new DeskError("invalid_argument", "Request body must be a JSON object");
  const action = String(b.action ?? "") as DelegateAction;
  if (!DELEGATE_ACTIONS.includes(action)) throw new DeskError("invalid_argument", `Unknown action "${String(b.action ?? "")}"`);
  const entityCode = String(b.entityCode ?? "").trim().toUpperCase();
  if (!LANDLORD_CODE_RE.test(entityCode)) throw new DeskError("invalid_argument", "entityCode must be a landlord code like PYL-0001");
  const agentCode = String(b.agentCode ?? "").trim().toUpperCase();
  if (agentCode !== DESK_TOP_CODE && !DESK_CODE_RE.test(agentCode)) throw new DeskError("invalid_argument", "agentCode must be a desk code like COG-0001");
  const requestId = String(b.requestId ?? "");
  if (!REQUEST_ID_RE.test(requestId)) throw new DeskError("invalid_argument", "requestId must be 8-128 letters, digits, - or _");
  const payload = b.payload === undefined ? {} : b.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new DeskError("invalid_argument", "payload must be an object");
  return { action, entityCode, agentCode, requestId, payload: payload as Record<string, unknown> };
}

const EFFECTFUL: ReadonlySet<DelegateAction> = new Set(["commit_records", "schedule_sms", "send_sms_now", "export_data"]);

export async function handleDelegate(deps: DelegateDeps, body: unknown): Promise<DelegateResponse<unknown>> {
  let req: Parsed;
  try { req = parseRequest(body); } catch (e) { return toFailure(e); }
  const { store } = deps;
  try {
    const landlord = await store.findLandlord(req.entityCode);
    if (!landlord) throw new DeskError("not_found", "No Plot Yangu landlord has that code");
    if (!isAuthorised(landlord, req.agentCode)) throw new DeskError("permission_denied", "This desk is not one of the landlord's support agents");
    if (req.agentCode !== DESK_TOP_CODE && !(await store.isActiveDesk(req.agentCode))) throw new DeskError("permission_denied", "This desk is not active");

    const dryRun = req.action === "send_sms_now" && req.payload.dryRun === true;
    const effectful = EFFECTFUL.has(req.action) && !dryRun;
    if (!effectful) return ok(await run(deps, landlord, req));

    const claim = await store.claimRequest(landlord.uid, req.requestId, fingerprintOf(req.action, req.entityCode, req.agentCode, req.payload));
    if (claim.state === "replay") return claim.response;
    if (claim.state === "conflict") throw new DeskError("invalid_argument", "This requestId was already used for a different request");
    if (claim.state === "in_progress") throw new DeskError("failed_precondition", "This request is still being processed. Wait and retry with the same requestId");

    let response: DelegateResponse<unknown>;
    try {
      response = ok(await run(deps, landlord, req));
    } catch (e) {
      if (e instanceof DeskError) {
        response = toFailure(e); // deterministic refusal: replayed identically
      } else if (req.action === "send_sms_now") {
        console.error("deskdelegate send_sms_now failed after claim", e);
        response = fail("internal", "The send may have partly completed. Check the landlord's message history before sending again");
      } else {
        console.error(`deskdelegate ${req.action} failed`, e);
        await store.releaseRequest(landlord.uid, req.requestId); // nothing partial to protect: let the same requestId retry
        return fail("internal", "Plot Yangu could not complete the request. Please try again");
      }
    }
    await store.completeRequest(landlord.uid, req.requestId, response);
    return response;
  } catch (e) {
    return toFailure(e);
  }
}

function toFailure(e: unknown): DelegateResponse<never> {
  if (e instanceof DeskError) return fail(e.code, e.message);
  console.error("deskdelegate unexpected error", e);
  return fail("internal", "Plot Yangu could not complete the request. Please try again");
}

async function run(deps: DelegateDeps, l: Landlord, req: Parsed): Promise<unknown> {
  const { store } = deps;
  const entityKey = `pms:${l.code}`;
  const audit = (action: string, meta: Record<string, unknown>) =>
    store.audit({ action: `pms.delegate.${action}`, entityKey, agentCode: req.agentCode, requestId: req.requestId, meta });

  switch (req.action) {
    case "entity_info": {
      const out = {
        displayName: l.company || l.name || l.code, adminName: l.name, adminPhone: l.phone, agentAuthorised: true, plan: l.tier,
        creditsBalance: l.tokens, audiences: [...AUDIENCES] as string[],
        reportTypes: [] as string[], // PMS has no server-side report engine (reports are built inside the app from local data)
        exportKinds: [...EXPORT_KINDS] as string[],
      };
      await audit("entity_info", {});
      return out;
    }

    case "validate_records": {
      const rows = rowsOf(req.payload);
      const { valid, errors } = validateTenantRows(rows, await tenantContext(store, l));
      await audit("validate_records", { rows: rows.length, valid: valid.length, errors: errors.length });
      return { valid: valid.map((v) => toImportRow(v.tenant)), errors };
    }

    case "commit_records": {
      const rows = rowsOf(req.payload);
      const source = req.payload.source;
      if (source !== "excel" && source !== "manual") throw new DeskError("invalid_argument", 'payload.source must be "excel" or "manual"');
      // Never trust an earlier validation: re-validate against the landlord's current data, then create.
      const { valid, errors } = validateTenantRows(rows, await tenantContext(store, l));
      const { created, existing } = valid.length > 0 ? await store.createTenants(l.uid, valid.map((v) => v.tenant), req.agentCode) : { created: [], existing: [] as string[] };
      const lost = new Set(existing);
      const raceErrors: ImportError[] = valid.filter((v) => lost.has(String(v.tenant.id))).map((v) => ({ row: v.index + 1, field: "id", reason: "A tenant with this ID already exists" }));
      const allErrors = [...errors, ...raceErrors].sort((a, b) => a.row - b.row);
      const result = { created: created.length, skipped: rows.length - created.length, errors: allErrors };
      await audit("commit_records", { source, rows: rows.length, created: created.length, errors: allErrors.length });
      return result;
    }

    case "send_sms_now": {
      const p = smsPayload(req.payload);
      const plan = await planSend(deps, l, p.message, p.audience, p.memberIds);
      if (p.dryRun) {
        await audit("send_sms_now.dry_run", { audience: p.audience, recipients: plan.items.length, credits: plan.totalTokens });
        return { queued: plan.items.length, creditsUsed: plan.totalTokens, creditsRemaining: l.tokens };
      }
      const out = await sendPlan(deps, l, plan, { via: "desk", agentCode: req.agentCode });
      await audit("send_sms_now", { audience: p.audience, recipients: plan.items.length, queued: out.queued, credits: out.creditsUsed });
      return out;
    }

    case "schedule_sms": {
      const name = String(req.payload.name ?? "").trim();
      if (name.length < 1 || name.length > 60) throw new DeskError("invalid_argument", "Schedule name must be 1-60 characters");
      const message = String(req.payload.message ?? "");
      const audience = req.payload.audience;
      if (!isAudience(audience)) throw new DeskError("invalid_argument", `Audience must be one of: ${AUDIENCES.join(", ")}`);
      const memberIds = idList(req.payload.memberIds);
      const now = deps.now();
      const spec = validateSchedule(req.payload.schedule, now);
      const plan = await planSend(deps, l, message, audience, memberIds);
      if ((await store.countActiveSchedules(l.uid)) >= MAX_ACTIVE_SCHEDULES) {
        throw new DeskError("failed_precondition", `This landlord already has ${MAX_ACTIVE_SCHEDULES} active schedules. Remove one first`);
      }
      const scheduleId = `sch_${req.requestId}`; // deterministic: a retried request can never create a second schedule
      await store.saveSchedule(l.uid, {
        id: scheduleId, name, message: message.trim(), audience, memberIds, schedule: spec, active: true,
        nextRunAt: nextRunAt(spec, now), createdByAgent: req.agentCode, createdAt: now, runs: 0,
      });
      await audit("schedule_sms", { scheduleId, audience, kind: spec.kind, recipients: plan.items.length, creditsPerRun: plan.totalTokens });
      return { scheduleId, recipients: plan.items.length, creditsPerRun: plan.totalTokens };
    }

    case "export_data": {
      const kind = String(req.payload.kind ?? "");
      if (kind === "reports") throw new DeskError("not_found", "Plot Yangu has no server-side report engine, so there is nothing to export for reports");
      if (!(EXPORT_KINDS as readonly string[]).includes(kind)) throw new DeskError("invalid_argument", `Export kind must be one of: ${EXPORT_KINDS.join(", ")}`);
      const [props, tenants] = await Promise.all([store.listProperties(l.uid), store.listTenants(l.uid)]);
      const names = new Map(props.map((p) => [p.id, p.name]));
      const live = tenants.filter((t) => !t.isRestricted && !props.find((p) => p.id === t.propertyId)?.isRestricted);
      const csv = toCsv(
        ["property", "id", "name", "phone", "email", "unit", "rent", "standing_fees", "deposit", "lease_start", "lease_end"],
        live.map((t) => [names.get(t.propertyId) ?? t.propertyId, t.id, t.name, t.phone, t.email, t.unitNumber, t.rentAmount, t.standingFees, t.depositAmount, t.leaseStart, t.leaseEnd]),
      );
      const file = await store.putExport(l.uid, `${l.code}-tenants-${req.requestId}.csv`, csv, EXPORT_TTL_MS);
      await audit("export_data", { kind, rows: live.length });
      return file;
    }

    case "list_tenants": {
      const [props, tenants, invoices] = await Promise.all([store.listProperties(l.uid), store.listTenants(l.uid), store.listInvoices(l.uid)]);
      const restricted = new Set(props.filter((x) => x.isRestricted).map((x) => x.id));
      const page = listTenantsPage(req.payload, tenants, invoices, restricted, (raw) => deps.sms.normalizePhone(raw));
      await audit("list_tenants", { returned: page.tenants.length, searched: typeof req.payload.query === "string" && req.payload.query.trim() !== "", paged: Boolean(req.payload.cursor) });
      return page;
    }

    case "run_report":
      throw new DeskError("not_found", "Plot Yangu has no server-side report engine; reports are produced inside the app. No report types are available");
  }
}

function rowsOf(payload: Record<string, unknown>): ImportRow[] {
  const rows = payload.rows;
  if (!Array.isArray(rows) || rows.length === 0) throw new DeskError("invalid_argument", "payload.rows must be a non-empty list");
  if (rows.length > MAX_ROWS) throw new DeskError("invalid_argument", `Send at most ${MAX_ROWS} rows at a time`);
  if (rows.some((r) => !r || typeof r !== "object" || Array.isArray(r))) throw new DeskError("invalid_argument", "Every row must be an object");
  return rows as ImportRow[];
}
function idList(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 1000) throw new DeskError("invalid_argument", "memberIds must be a list of tenant ids");
  return v.map((x) => String(x));
}
function smsPayload(p: Record<string, unknown>): { message: string; audience: Audience; memberIds: string[]; dryRun: boolean } {
  if (!isAudience(p.audience)) throw new DeskError("invalid_argument", `Audience must be one of: ${AUDIENCES.join(", ")}`);
  return { message: String(p.message ?? ""), audience: p.audience, memberIds: idList(p.memberIds), dryRun: p.dryRun === true };
}

async function tenantContext(store: DelegateStore, l: Landlord) {
  const [properties, tenants] = await Promise.all([store.listProperties(l.uid), store.listTenants(l.uid)]);
  const existingTenants: ExistingTenant[] = tenants.map((t) => ({ id: t.id, propertyId: t.propertyId, isRestricted: t.isRestricted }));
  return { tier: l.tier, properties, existingTenants };
}

interface SendItem { recipient: Recipient; mobile: string; full: string; tokens: number }
interface SendPlan { items: SendItem[]; totalTokens: number }

/** Same composition and validation as PMS's sendPmsSms: "Dear {name}, {message} - {sender, phone}", whole message validated, priced on the final text. */
async function planSend(deps: DelegateDeps, l: Landlord, message: string, audience: Audience, memberIds: string[]): Promise<SendPlan> {
  const { store, sms } = deps;
  const body = sms.validateBody(message);
  if (!body.valid) throw new DeskError("invalid_argument", body.reason || "Invalid message.");
  const [props, tenants, invoices] = await Promise.all([store.listProperties(l.uid), store.listTenants(l.uid), audience === "tenants_with_arrears" ? store.listInvoices(l.uid) : Promise.resolve([] as InvoiceRec[])]);
  const restricted = new Set(props.filter((p) => p.isRestricted).map((p) => p.id));
  const recipients = selectRecipients(audience, tenants, invoices, restricted, memberIds);
  if (recipients.length === 0) throw new DeskError("failed_precondition", "No tenants match this audience");
  if (recipients.length > MAX_SMS_RECIPIENTS) throw new DeskError("invalid_argument", `Maximum ${MAX_SMS_RECIPIENTS} recipients per send. Narrow the audience`);
  const senderName = l.company || l.name || "Property Manager";
  const signature = l.phone ? `${senderName}, ${l.phone}` : senderName;
  const items: SendItem[] = recipients.map((r) => {
    const nameCheck = sms.validateBody(r.name);
    if (!nameCheck.valid) throw new DeskError("invalid_argument", `Recipient name "${r.name}" contains disallowed characters.`);
    const full = `Dear ${r.name}, ${message.trim()} - ${signature}`;
    const finalCheck = sms.validateBody(full);
    if (!finalCheck.valid) throw new DeskError("invalid_argument", finalCheck.reason || "Composed message is invalid.");
    return { recipient: r, mobile: sms.normalizePhone(r.phone), full, tokens: sms.tokensFor(full) };
  });
  return { items, totalTokens: items.reduce((s, i) => s + i.tokens, 0) };
}

/** Reserve tokens up front, send each message, refund the ones that failed (the sendPmsSms pattern, with an atomic reservation). */
export async function sendPlan(
  deps: DelegateDeps, l: Pick<Landlord, "uid" | "tokens">, plan: SendPlan, meta: { via: string; agentCode?: string; scheduleId?: string },
): Promise<{ queued: number; creditsUsed: number; creditsRemaining: number }> {
  const { store, sms } = deps;
  const reservation = await store.reserveTokens(l.uid, plan.totalTokens);
  if ("insufficient" in reservation) {
    throw new DeskError("failed_precondition", `Insufficient SMS credits. Required: ${plan.totalTokens}, available: ${reservation.insufficient}.`);
  }
  let refund = 0, success = 0, firstError = "";
  for (const item of plan.items) {
    let r: { success: boolean; error?: string };
    try { r = await sms.send(item.mobile, item.full); } catch (e) { r = { success: false, error: (e as Error).message }; }
    if (r.success) success += 1; else { refund += item.tokens; firstError ||= r.error ?? "SMS provider error"; }
  }
  let remaining = reservation.remaining;
  try {
    if (refund > 0) { await store.refundTokens(l.uid, refund); remaining += refund; }
    await store.recordSmsSent(l.uid, { recipientCount: plan.items.length, tokensCharged: plan.totalTokens - refund, successCount: success, failCount: plan.items.length - success, ...meta });
  } catch (e) { console.error("deskdelegate SMS bookkeeping failed", e); }
  if (success === 0) throw new DeskError("failed_precondition", `No messages could be sent: ${firstError}. Your credits were not used`);
  return { queued: success, creditsUsed: plan.totalTokens - refund, creditsRemaining: remaining };
}

/** Used by the schedule runner: resolve the audience fresh and send. */
export async function runScheduledSend(deps: DelegateDeps, l: Landlord, s: ScheduleDoc): Promise<{ queued: number; creditsUsed: number }> {
  const plan = await planSend(deps, l, s.message, s.audience, s.memberIds);
  const out = await sendPlan(deps, l, plan, { via: "desk_schedule", agentCode: s.createdByAgent, scheduleId: s.id });
  return { queued: out.queued, creditsUsed: out.creditsUsed };
}
