/** Production implementation of DelegateStore over the shared Firestore database and the default Storage bucket. */
import { randomUUID } from "node:crypto";
import { FieldValue, type DocumentSnapshot, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { DESK } from "./constants";
import { writeAudit } from "./db";
import type { ClaimResult, DelegateResponse, DelegateStore, Landlord, ScheduleDoc } from "./delegate";
import type { NewTenant } from "./tenantRules";

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const text = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const WRITE_CHUNK = 400;

export function landlordFromSnap(s: DocumentSnapshot): Landlord | null {
  if (!s.exists) return null;
  const d = s.data() ?? {};
  return {
    uid: s.id, code: text(d.landlordCode), name: text(d.name), company: text(d.company?.name), phone: text(d.phone),
    tier: text(d.tier) || "free", tokens: num(d.tokens), supportAgents: (d.supportAgents ?? {}) as Record<string, unknown>,
  };
}

export function firestoreDelegateStore(store: Firestore): DelegateStore {
  const user = (uid: string) => store.collection("users").doc(uid);
  return {
    async findLandlord(code) {
      const q = await store.collection("users").where("landlordCode", "==", code).limit(1).get();
      return q.empty ? null : landlordFromSnap(q.docs[0]);
    },
    async isActiveDesk(agentCode) {
      const q = await store.collection(DESK.agents).where("agentCode", "==", agentCode).limit(1).get();
      return !q.empty && q.docs[0].get("status") === "active";
    },
    async listProperties(uid) {
      const q = await user(uid).collection("properties").get();
      return q.docs.map((d) => ({ id: d.id, name: text(d.get("name")), isRestricted: d.get("isRestricted") === true }));
    },
    async listTenants(uid) {
      const q = await user(uid).collection("tenants").get();
      return q.docs.map((d) => ({
        id: d.id, propertyId: text(d.get("propertyId")), name: text(d.get("name")), phone: text(d.get("phone")),
        isRestricted: d.get("isRestricted") === true, isActive: d.get("isActive") !== false,
        unitNumber: text(d.get("unitNumber")), email: text(d.get("email")), rentAmount: num(d.get("rentAmount")),
        standingFees: num(d.get("standingFees")), depositAmount: num(d.get("depositAmount")),
        leaseStart: text(d.get("leaseStart")), leaseEnd: text(d.get("leaseEnd")),
      }));
    },
    async listInvoices(uid) {
      const q = await user(uid).collection("invoices").get();
      return q.docs.map((d) => ({ tenantId: text(d.get("tenantId")), totalAmount: num(d.get("totalAmount")), amountPaid: num(d.get("amountPaid")) }));
    },

    /**
     * Tenants are created client-side in the app today (local SQLite, then synced to users/{uid}/tenants/{id}). This writes the
     * identical document the app's sync writes (same fields, id = the tenant's ID number) so the app's next sync downloads it.
     */
    async createTenants(uid, tenants: NewTenant[], agentCode) {
      const created: string[] = [], existing: string[] = [];
      const nowIso = new Date().toISOString();
      for (let i = 0; i < tenants.length; i += WRITE_CHUNK) {
        const chunk = tenants.slice(i, i + WRITE_CHUNK);
        const refs = chunk.map((t) => user(uid).collection("tenants").doc(String(t.id)));
        const snaps = await store.getAll(...refs);
        const batch = store.batch();
        chunk.forEach((t, k) => {
          if (snaps[k].exists) { existing.push(String(t.id)); return; }
          batch.create(refs[k], {
            id: t.id, localId: t.id, userId: uid, propertyId: Number(t.propertyId) || t.propertyId, name: t.name, phone: t.phone, email: t.email,
            unitNumber: t.unitNumber, rentAmount: t.rentAmount, standingFees: t.standingFees, depositAmount: t.depositAmount,
            leaseStart: t.leaseStart, leaseEnd: t.leaseEnd, isActive: true, isRestricted: false, createdAt: nowIso, updatedAt: nowIso,
            lastSyncTime: FieldValue.serverTimestamp(), lastModified: nowIso, createdBy: "desk", deskAgentCode: agentCode,
          });
          created.push(String(t.id));
        });
        await batch.commit();
      }
      return { created, existing };
    },

    async claimRequest(uid, requestId, fingerprint): Promise<ClaimResult> {
      const ref = user(uid).collection("deskDelegateRequests").doc(requestId);
      return store.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        if (!s.exists) {
          tx.create(ref, { fingerprint, status: "processing", createdAt: Date.now(), updatedAt: Date.now() });
          return { state: "claimed" } as ClaimResult;
        }
        if (s.get("fingerprint") !== fingerprint) return { state: "conflict" } as ClaimResult;
        if (s.get("status") === "done") return { state: "replay", response: JSON.parse(String(s.get("response"))) as DelegateResponse<unknown> } as ClaimResult;
        return { state: "in_progress" } as ClaimResult;
      });
    },
    async completeRequest(uid, requestId, response) {
      await user(uid).collection("deskDelegateRequests").doc(requestId).update({ status: "done", response: JSON.stringify(response), updatedAt: Date.now() });
    },
    async releaseRequest(uid, requestId) {
      await user(uid).collection("deskDelegateRequests").doc(requestId).delete();
    },

    async reserveTokens(uid, n) {
      const ref = user(uid);
      return store.runTransaction(async (tx) => {
        const available = num((await tx.get(ref)).get("tokens"));
        if (available < n) return { insufficient: available };
        tx.update(ref, { tokens: FieldValue.increment(-n) });
        return { remaining: available - n };
      });
    },
    async refundTokens(uid, n) { await user(uid).update({ tokens: FieldValue.increment(n) }); },
    async recordSmsSent(uid, e) {
      await user(uid).collection("sms-sent-log").add({
        propertyId: null, recipientCount: e.recipientCount, tokensCharged: e.tokensCharged, successCount: e.successCount, failCount: e.failCount,
        sentAt: FieldValue.serverTimestamp(), via: e.via, deskAgentCode: e.agentCode ?? null, scheduleId: e.scheduleId ?? null,
      });
      if (e.successCount > 0) await user(uid).update({ smsSentTotal: FieldValue.increment(e.successCount) });
    },

    async countActiveSchedules(uid) {
      const c = await user(uid).collection("deskSmsSchedules").where("active", "==", true).count().get();
      return c.data().count;
    },
    async saveSchedule(uid, doc: ScheduleDoc) { await user(uid).collection("deskSmsSchedules").doc(doc.id).set(doc); },

    async putExport(uid, fileName, csv, ttlMs) {
      const bucket = getStorage().bucket();
      const path = `deskExports/${uid}/${fileName}`;
      const token = randomUUID();
      const expiresAt = Date.now() + ttlMs;
      await bucket.file(path).save(csv, {
        resumable: false, contentType: "text/csv; charset=utf-8",
        metadata: { metadata: { firebaseStorageDownloadTokens: token, expiresAt: String(expiresAt) } },
      });
      return { downloadUrl: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`, expiresAt };
    },

    async audit(e) {
      await writeAudit({ action: e.action, entityKey: e.entityKey, meta: { ...e.meta, agentCode: e.agentCode, requestId: e.requestId } });
    },
  };
}

/** Delete exported files past their expiry (the download link carries a token and no signature, so expiry is enforced by deletion). */
export async function purgeExpiredExports(now = Date.now()): Promise<number> {
  const [files] = await getStorage().bucket().getFiles({ prefix: "deskExports/" });
  let removed = 0;
  for (const f of files) {
    const exp = Number((f.metadata.metadata as Record<string, string> | undefined)?.expiresAt ?? 0);
    if (exp > 0 && exp < now) { await f.delete({ ignoreNotFound: true }); removed += 1; }
  }
  return removed;
}
