import { CallableRequest, HttpsError, onCall } from "firebase-functions/v2/https";
import { nairobiDayKey, routeDeskCodes } from "./codes";
import { DESK, DESK_REGION, DESK_REQUESTS_PER_DAY, REQUEST_CATEGORIES, type RequestCategory } from "./constants";
import { fs, writeAudit } from "./db";
import { DeskError } from "./errors";
import { toHttpsError } from "./httpsErrors";
import { assignLandlordCode } from "./landlordCode";
import { orderedAgents } from "./supportAgents";

export type RequestStatus = "new" | "open" | "answered" | "closed";
export interface RequestResponse { at: number; byDeskCode: string; text: string }
/** The shape of desk's own `desk_requests/{id}` documents (desk contract: DeskRequestDoc). */
export interface DeskRequestDoc {
  id: string; source: "pms"; entityCode: string; entityName: string;
  requesterName: string; requesterPhone: string; category: string; subject: string; message: string;
  status: RequestStatus; targetDeskCodes: string[]; responses: RequestResponse[];
  createdAt: number; updatedAt: number; outboxId?: string;
}
export interface CreateDeskRequestIn { category?: string; subject?: string; message?: string; deskCode?: string; includeTopDesk?: boolean }
export interface DeskRequestView extends Omit<DeskRequestDoc, "source" | "outboxId"> { }

const callableOpts = { region: DESK_REGION, cors: true, memory: "256MiB" as const, cpu: "gcf_gen1" as const, maxInstances: 2, timeoutSeconds: 30 };
const SUBJECT_MIN = 3, SUBJECT_MAX = 120, MESSAGE_MIN = 5, MESSAGE_MAX = 2000, LIST_LIMIT = 50;

/** Pure validation of what the landlord typed. Throws a message the person can act on. */
export function validateRequestInput(d: CreateDeskRequestIn): { category: RequestCategory; subject: string; message: string } {
  const category = String(d.category ?? "").trim() as RequestCategory;
  if (!REQUEST_CATEGORIES.includes(category)) throw new DeskError("invalid_argument", "Choose a category for your request");
  const subject = String(d.subject ?? "").trim();
  if (subject.length < SUBJECT_MIN || subject.length > SUBJECT_MAX) throw new DeskError("invalid_argument", `Subject must be ${SUBJECT_MIN}-${SUBJECT_MAX} characters`);
  const message = String(d.message ?? "").trim();
  if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) throw new DeskError("invalid_argument", `Message must be ${MESSAGE_MIN}-${MESSAGE_MAX} characters`);
  return { category, subject, message };
}

/**
 * Plot Yangu lives in desk's own database, so the request is written straight into desk_requests as
 * `pms_<landlordCode>_<autoId>`. The per-day limit is a counter document in the same transaction as the write, so
 * simultaneous submissions cannot exceed it.
 */
export const createDeskRequest = onCall(callableOpts, async (request: CallableRequest<CreateDeskRequestIn>) => {
  try {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to contact a desk");
    const input = validateRequestInput(request.data ?? {});
    const landlordCode = await assignLandlordCode(uid);
    const store = fs();
    const userRef = store.collection("users").doc(uid);
    const now = Date.now();
    const quotaRef = userRef.collection("deskRequestQuota").doc(nairobiDayKey(now));
    const reqRef = store.collection(DESK.requests).doc();
    const id = `pms_${landlordCode}_${reqRef.id}`;
    const docRef = store.collection(DESK.requests).doc(id);

    const targets = await store.runTransaction(async (tx) => {
      const [user, quota] = await Promise.all([tx.get(userRef), tx.get(quotaRef)]);
      if (!user.exists) throw new DeskError("not_found", "Account not found");
      const used = quota.exists ? Number(quota.get("count") ?? 0) : 0;
      if (used >= DESK_REQUESTS_PER_DAY) {
        throw new DeskError("failed_precondition", `You can send ${DESK_REQUESTS_PER_DAY} requests per day. Please try again tomorrow`);
      }
      const connected = orderedAgents(user.get("supportAgents")).map((a) => a.agentCode);
      const targetDeskCodes = routeDeskCodes({ connected, chosen: request.data?.deskCode, includeTop: request.data?.includeTopDesk === true });
      const doc: DeskRequestDoc = {
        id, source: "pms", entityCode: landlordCode,
        entityName: String(user.get("company")?.name || user.get("name") || landlordCode),
        requesterName: String(user.get("name") ?? ""), requesterPhone: String(user.get("phone") ?? ""),
        category: input.category, subject: input.subject, message: input.message,
        status: "new", targetDeskCodes, responses: [], createdAt: now, updatedAt: now, outboxId: reqRef.id,
      };
      tx.set(quotaRef, { count: used + 1, day: nairobiDayKey(now), updatedAt: now }, { merge: true });
      tx.create(docRef, doc);
      return targetDeskCodes;
    });
    await writeAudit({ action: "pms.desk_request.created", entityKey: `pms:${landlordCode}`, meta: { id, targetDeskCodes: targets, category: input.category, by: "landlord", uid } });
    return { id, targetDeskCodes: targets };
  } catch (err) { throw toHttpsError(err, "Could not send your request. Please try again"); }
});

/** This landlord's requests, newest first, with the status and replies desk writes back. */
export const listDeskRequests = onCall(callableOpts, async (request: CallableRequest<unknown>) => {
  try {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in to see your requests");
    const landlordCode = await assignLandlordCode(uid);
    const snap = await fs().collection(DESK.requests).where("entityCode", "==", landlordCode).orderBy("createdAt", "desc").limit(LIST_LIMIT).get();
    const requests: DeskRequestView[] = snap.docs
      .map((d) => d.data() as DeskRequestDoc)
      .filter((r) => r.source === "pms")
      .map((r) => ({
        id: r.id, entityCode: r.entityCode, entityName: r.entityName, requesterName: r.requesterName, requesterPhone: r.requesterPhone,
        category: r.category, subject: r.subject, message: r.message, status: r.status, targetDeskCodes: r.targetDeskCodes ?? [],
        responses: Array.isArray(r.responses) ? r.responses : [], createdAt: r.createdAt, updatedAt: r.updatedAt,
      }));
    return { requests, landlordCode, dailyLimit: DESK_REQUESTS_PER_DAY };
  } catch (err) { throw toHttpsError(err, "Could not load your requests. Please try again"); }
});
