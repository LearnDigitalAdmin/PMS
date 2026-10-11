import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { runScheduledSend, type DelegateDeps, type ScheduleDoc } from "./delegate";
import { landlordFromSnap } from "./delegateStore";
import { nextRunAt } from "./schedule";

/** A run more than this late (outage) is skipped rather than sent at an unexpected time. */
export const MISSED_AFTER_MS = 6 * 60 * 60 * 1000;

/**
 * Executes due desk-created SMS schedules. A schedule is CLAIMED first (next run computed and saved in a transaction), then
 * sent, so a crash can only skip a run, never send it twice. Each send uses the landlord's own SMS tokens, like any PMS SMS.
 */
export async function runDueSchedules(store: Firestore, deps: DelegateDeps, now = Date.now()): Promise<{ ran: number; failed: number; skipped: number }> {
  const due = await store.collectionGroup("deskSmsSchedules").where("active", "==", true).where("nextRunAt", "<=", now).limit(200).get();
  let ran = 0, failed = 0, skipped = 0;
  for (const snap of due.docs) {
    const userRef = snap.ref.parent.parent;
    if (!userRef) continue;
    const claimed = await store.runTransaction(async (tx) => {
      const fresh = await tx.get(snap.ref);
      const s = fresh.data() as ScheduleDoc | undefined;
      if (!s || !s.active || s.nextRunAt === null || s.nextRunAt > now) return null;
      const next = nextRunAt(s.schedule, now);
      tx.update(snap.ref, { nextRunAt: next, active: next !== null, lastRunAt: now, runs: (s.runs ?? 0) + 1 });
      return s;
    });
    if (!claimed) continue;
    if (now - (claimed.nextRunAt ?? now) > MISSED_AFTER_MS) {
      skipped += 1;
      await snap.ref.update({ lastError: "Skipped: the run was missed by more than 6 hours", lastErrorAt: Timestamp.now() });
      continue;
    }
    try {
      const landlord = landlordFromSnap(await userRef.get());
      if (!landlord) throw new Error("Landlord account not found");
      const out = await runScheduledSend(deps, landlord, claimed);
      ran += 1;
      await snap.ref.update({ lastResult: { queued: out.queued, creditsUsed: out.creditsUsed, at: now }, lastError: null });
    } catch (e) {
      failed += 1;
      await snap.ref.update({ lastError: (e as Error).message, lastErrorAt: Timestamp.now() });
    }
  }
  return { ran, failed, skipped };
}
