import { CallableRequest, HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { isDeskCode, normaliseDeskCode } from "./codes";
import { DESK, DESK_REGION, DESK_TOP_CODE, MAX_SUPPORT_AGENTS } from "./constants";
import { fs, writeAudit } from "./db";
import { DeskError } from "./errors";
import { toHttpsError } from "./httpsErrors";
import { assignLandlordCode } from "./landlordCode";

export interface SupportAgentView { agentCode: string; name: string; addedAt: number; locked?: boolean }
export interface ListSupportAgentsResult { agents: SupportAgentView[]; landlordCode: string; maxAgents: number }
interface StoredAgent { name?: string; agentId?: string; addedAt?: number }

const TOP_VIEW: SupportAgentView = { agentCode: DESK_TOP_CODE, name: "Samuhia Top Desk", addedAt: 0, locked: true };
const callableOpts = { region: DESK_REGION, cors: true, memory: "256MiB" as const, timeoutSeconds: 30 };

function requireUid(request: CallableRequest<unknown>): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to manage your support agents");
  return uid;
}

/** Stored agents ordered by when they were added (the first one is the default desk for requests). */
export function orderedAgents(map: Record<string, StoredAgent> | undefined): SupportAgentView[] {
  return Object.entries(map ?? {})
    .filter(([code]) => isDeskCode(code) && code !== DESK_TOP_CODE)
    .map(([code, v]) => ({ agentCode: code, name: String(v?.name ?? code), addedAt: Number(v?.addedAt ?? 0) }))
    .sort((a, b) => a.addedAt - b.addedAt || a.agentCode.localeCompare(b.agentCode));
}

/** Only a certified, ACTIVE desk can be connected: the code must belong to a real desk_agents record. */
async function findActiveDesk(code: string): Promise<{ agentId: string; name: string }> {
  const snap = await fs().collection(DESK.agents).where("agentCode", "==", code).limit(1).get();
  if (snap.empty) throw new DeskError("not_found", "No desk with that code exists. Check the code with your desk agent");
  const d = snap.docs[0];
  if (d.get("status") !== "active") throw new DeskError("failed_precondition", "That desk is not active, so it cannot be added");
  return { agentId: d.id, name: String(d.get("name") ?? code) };
}

export const addSupportAgent = onCall(callableOpts, async (request: CallableRequest<{ agentCode?: string }>) => {
  try {
    const uid = requireUid(request);
    const code = normaliseDeskCode(request.data?.agentCode);
    if (!isDeskCode(code)) throw new DeskError("invalid_argument", "Enter a desk code like COG-0001");
    if (code === DESK_TOP_CODE) throw new DeskError("invalid_argument", "COG-0000 is always connected and cannot be added");
    const desk = await findActiveDesk(code);
    const landlordCode = await assignLandlordCode(uid);
    const store = fs();
    const userRef = store.collection("users").doc(uid);
    const added = await store.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new DeskError("not_found", "Account not found");
      const current = (snap.get("supportAgents") ?? {}) as Record<string, StoredAgent>;
      if (current[code]) return false;
      if (orderedAgents(current).length >= MAX_SUPPORT_AGENTS) {
        throw new DeskError("failed_precondition", `You can connect up to ${MAX_SUPPORT_AGENTS} support agents. Remove one first`);
      }
      tx.update(userRef, new FieldPath("supportAgents", code), { name: desk.name, agentId: desk.agentId, addedAt: Date.now() });
      return true;
    });
    if (added) await writeAudit({ action: "pms.support_agent.added", agentId: desk.agentId, entityKey: `pms:${landlordCode}`, meta: { agentCode: code, by: "landlord", uid } });
    return { ok: true };
  } catch (err) { throw toHttpsError(err, "Could not add the support agent. Please try again"); }
});

export const removeSupportAgent = onCall(callableOpts, async (request: CallableRequest<{ agentCode?: string }>) => {
  try {
    const uid = requireUid(request);
    const code = normaliseDeskCode(request.data?.agentCode);
    if (code === DESK_TOP_CODE) throw new DeskError("invalid_argument", "COG-0000 is always connected and cannot be removed");
    if (!isDeskCode(code)) throw new DeskError("invalid_argument", "Enter a desk code like COG-0001");
    const store = fs();
    const userRef = store.collection("users").doc(uid);
    const removed = await store.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new DeskError("not_found", "Account not found");
      const current = (snap.get("supportAgents") ?? {}) as Record<string, StoredAgent>;
      if (!current[code]) return null;
      tx.update(userRef, new FieldPath("supportAgents", code), FieldValue.delete());
      return { agentId: current[code].agentId, landlordCode: String(snap.get("landlordCode") ?? "") };
    });
    if (removed) await writeAudit({ action: "pms.support_agent.removed", agentId: removed.agentId, entityKey: removed.landlordCode ? `pms:${removed.landlordCode}` : undefined, meta: { agentCode: code, by: "landlord", uid } });
    return { ok: true };
  } catch (err) { throw toHttpsError(err, "Could not remove the support agent. Please try again"); }
});

export const listSupportAgents = onCall(callableOpts, async (request: CallableRequest<unknown>): Promise<ListSupportAgentsResult> => {
  try {
    const uid = requireUid(request);
    const landlordCode = await assignLandlordCode(uid);
    const snap = await fs().collection("users").doc(uid).get();
    return { agents: [TOP_VIEW, ...orderedAgents(snap.get("supportAgents"))], landlordCode, maxAgents: MAX_SUPPORT_AGENTS };
  } catch (err) { throw toHttpsError(err, "Could not load your support agents. Please try again"); }
});
