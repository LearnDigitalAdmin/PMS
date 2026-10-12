import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import type { defineSecret } from "firebase-functions/params";
import { DESK_REGION } from "./constants";
import { fs } from "./db";
import { handleDelegate, type DelegateDeps, type SmsPort } from "./delegate";
import { firestoreDelegateStore, purgeExpiredExports } from "./delegateStore";
import { runDueSchedules } from "./scheduleRunner";

/** PMS's own SMS machinery (validation, phone normalising, token pricing, HostPinnacle sender) and the secrets that sender needs. */
export interface DeskSmsWiring extends SmsPort { secrets: ReturnType<typeof defineSecret>[] }

const deps = (sms: SmsPort): DelegateDeps => ({ store: firestoreDelegateStore(fs()), sms, now: () => Date.now() });

/**
 * `deskdelegate`: private Cloud Run service (invoker "private" => only callers holding run.invoker, i.e. desk's service account,
 * get through; everyone else receives 403 from Google's front end before this code runs).
 */
export function createDeskdelegate(w: DeskSmsWiring) {
  return onRequest(
    { region: DESK_REGION, invoker: "private", cors: false, timeoutSeconds: 300, memory: "512MiB", cpu: "gcf_gen1", maxInstances: 2, secrets: w.secrets },
    async (req, res) => {
      if (req.method !== "POST") { res.status(405).json({ ok: false, error: { code: "invalid_argument", message: "Use POST" } }); return; }
      if (!req.body || typeof req.body !== "object") { res.status(400).json({ ok: false, error: { code: "invalid_argument", message: "Send a JSON body" } }); return; }
      res.status(200).json(await handleDelegate(deps(w), req.body));
    },
  );
}

/** Runs due desk-created SMS schedules and removes expired export files. (Cloud Scheduler is not offered in africa-south1: same region as PMS's other schedules.) */
export function createDeskScheduleRunner(w: DeskSmsWiring) {
  return onSchedule(
    { schedule: "every 15 minutes", timeZone: "Africa/Nairobi", region: "us-central1", timeoutSeconds: 540, memory: "512MiB", secrets: w.secrets },
    async () => {
      const r = await runDueSchedules(fs(), deps(w));
      const purged = await purgeExpiredExports();
      console.log(`desk schedules: ran ${r.ran}, failed ${r.failed}, skipped ${r.skipped}; purged ${purged} exports`);
    },
  );
}
