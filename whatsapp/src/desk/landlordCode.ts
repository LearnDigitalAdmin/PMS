import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { formatLandlordCode, isLandlordCode } from "./codes";
import { DESK, DESK_REGION } from "./constants";
import { fs } from "./db";
import { DeskError } from "./errors";

/**
 * Give a landlord their permanent PYL-#### code. The counter `desk_counters/landlords` and the user document are read and
 * written in ONE Firestore transaction, so two simultaneous creations can never take the same number, and a re-run (trigger
 * retry, backfill, lazy assignment) returns the code already stored and never changes it.
 */
export async function assignLandlordCode(uid: string, store: Firestore = fs()): Promise<string> {
  if (!uid) throw new DeskError("invalid_argument", "A landlord id is required");
  return store.runTransaction(async (tx) => {
    const userRef = store.collection("users").doc(uid);
    const counterRef = store.collection(DESK.counters).doc("landlords");
    const [user, counter] = await Promise.all([tx.get(userRef), tx.get(counterRef)]);
    if (!user.exists) throw new DeskError("not_found", "Landlord account not found");
    const existing = user.get("landlordCode");
    if (isLandlordCode(existing)) return existing;
    const last = counter.exists ? Number(counter.get("last")) : 0;
    if (!Number.isSafeInteger(last) || last < 0) throw new DeskError("internal", "Landlord counter is corrupted");
    const code = formatLandlordCode(last + 1);
    tx.set(counterRef, { last: last + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.update(userRef, { landlordCode: code, landlordCodeAssignedAt: FieldValue.serverTimestamp() });
    return code;
  });
}

/** Covers landlords created by PAY's createUserWithFirebaseAuth and by the app: both create `users/{uid}`. */
export const pmsAssignLandlordCode = onDocumentCreated(
  { document: "users/{uid}", region: DESK_REGION, retry: true, memory: "256MiB", cpu: "gcf_gen1", maxInstances: 2 },
  async (event) => {
    const uid = event.params.uid;
    const code = await assignLandlordCode(uid);
    console.log(`landlord ${uid} has code ${code}`);
  },
);
