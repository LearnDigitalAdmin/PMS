#!/usr/bin/env node
/**
 * Give every existing Plot Yangu landlord (a `users` document) its permanent PYL-#### code. Idempotent: documents that already have
 * a code are skipped, and every assignment is one Firestore transaction on desk_counters/landlords, so the script can be re-run, run
 * twice at once, or run while the creation trigger is live, and no code is ever duplicated or changed.
 *
 * Usage (from the repo root, with Application Default Credentials for the shared project):
 *   node scripts/backfill-landlord-codes.mjs [--project <id>] [--dry-run]
 * Needs the dependencies of the `whatsapp` functions folder (run `npm --prefix whatsapp ci` first).
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "..", "whatsapp", "package.json"));
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const pi = args.indexOf("--project");
const projectId = pi >= 0 ? args[pi + 1] : process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
initializeApp({ credential: applicationDefault(), ...(projectId ? { projectId } : {}) });
const db = getFirestore();

const CODE_RE = /^PYL-\d{4,}$/;
const format = (n) => `PYL-${String(n).padStart(4, "0")}`;

async function assign(uid) {
  return db.runTransaction(async (tx) => {
    const userRef = db.collection("users").doc(uid);
    const counterRef = db.collection("desk_counters").doc("landlords");
    const [user, counter] = await Promise.all([tx.get(userRef), tx.get(counterRef)]);
    if (!user.exists) return null;
    const existing = user.get("landlordCode");
    if (typeof existing === "string" && CODE_RE.test(existing)) return null;
    const last = counter.exists ? Number(counter.get("last")) : 0;
    const code = format(last + 1);
    tx.set(counterRef, { last: last + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.update(userRef, { landlordCode: code, landlordCodeAssignedAt: FieldValue.serverTimestamp() });
    return code;
  });
}

// Oldest accounts first so earlier landlords get the lower numbers. Documents are read in pages by id.
let last = null, scanned = 0, assigned = 0, skipped = 0;
for (;;) {
  let q = db.collection("users").orderBy("__name__").limit(300);
  if (last) q = q.startAfter(last);
  const page = await q.get();
  if (page.empty) break;
  for (const doc of page.docs) {
    scanned += 1;
    const has = doc.get("landlordCode");
    if (typeof has === "string" && CODE_RE.test(has)) { skipped += 1; continue; }
    if (dryRun) { assigned += 1; continue; }
    const code = await assign(doc.id);
    if (code) { assigned += 1; console.log(`${doc.id} -> ${code}`); } else skipped += 1;
  }
  last = page.docs[page.docs.length - 1];
}
console.log(`${dryRun ? "[dry run] " : ""}scanned ${scanned}, ${dryRun ? "would assign" : "assigned"} ${assigned}, already had a code ${skipped}`);
