/**
 * Emulator tests: real Firestore transactions. Run with the Firestore emulator up:
 *   firebase emulators:exec --only firestore "cd whatsapp && npm run build && node --test lib/desk/"
 * They skip themselves when FIRESTORE_EMULATOR_HOST is not set. (This spec is excluded from the build by tsconfig's **\/*.spec.ts;
 * to run it, compile with tsx: `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx --test src/desk/desk.emu.spec.ts`.)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { assignLandlordCode } from "./landlordCode";
import { addSupportAgent, listSupportAgents, removeSupportAgent } from "./supportAgents";
import { createDeskRequest, listDeskRequests } from "./requests";
import { firestoreDelegateStore } from "./delegateStore";
import { handleDelegate } from "./delegate";

const enabled = !!process.env.FIRESTORE_EMULATOR_HOST;
const opts = { skip: enabled ? false : "Firestore emulator not running (FIRESTORE_EMULATOR_HOST unset)" };
if (enabled && getApps().length === 0) initializeApp({ projectId: "demo-pms-desk" });
const fs = () => getFirestore();
const callable = (fn: unknown, uid: string, data: unknown) =>
  (fn as { run: (r: unknown) => Promise<any> }).run({ data, auth: { uid, token: {} }, rawRequest: {} });
async function reset() {
  for (const c of ["users", "desk_counters", "desk_agents", "desk_requests", "desk_audit"]) await fs().recursiveDelete(fs().collection(c));
}

test("landlord codes: 25 simultaneous creations get 25 distinct, gap-free codes; a re-run changes nothing", opts, async () => {
  await reset();
  const uids = Array.from({ length: 25 }, (_, i) => `landlord${i}`);
  await Promise.all(uids.map((u) => fs().collection("users").doc(u).set({ name: u })));
  const codes = await Promise.all(uids.map((u) => assignLandlordCode(u)));
  assert.equal(new Set(codes).size, 25);
  assert.deepEqual([...codes].sort(), Array.from({ length: 25 }, (_, i) => `PYL-${String(i + 1).padStart(4, "0")}`).sort());
  const again = await Promise.all(uids.map((u) => assignLandlordCode(u)));
  assert.deepEqual(again, codes);
  assert.equal((await fs().collection("desk_counters").doc("landlords").get()).get("last"), 25);
});

test("support agents: unknown / inactive codes rejected, COG-0000 locked, cap of 5, remove works", opts, async () => {
  await reset();
  await fs().collection("users").doc("u1").set({ name: "Mary", phone: "0700" });
  for (let i = 1; i <= 7; i++) await fs().collection("desk_agents").doc(`a${i}`).set({ agentCode: `COG-000${i}`, name: `Desk ${i}`, status: i === 7 ? "suspended" : "active" });
  await assert.rejects(callable(addSupportAgent, "u1", { agentCode: "COG-0000" }), /always connected/);
  await assert.rejects(callable(addSupportAgent, "u1", { agentCode: "COG-0099" }), /No desk with that code/);
  await assert.rejects(callable(addSupportAgent, "u1", { agentCode: "COG-0007" }), /not active/);
  for (let i = 1; i <= 5; i++) await callable(addSupportAgent, "u1", { agentCode: `COG-000${i}` });
  await callable(addSupportAgent, "u1", { agentCode: "COG-0001" }); // idempotent
  await assert.rejects(callable(addSupportAgent, "u1", { agentCode: "COG-0006" }), /up to 5/);
  await assert.rejects(callable(removeSupportAgent, "u1", { agentCode: "COG-0000" }), /cannot be removed/);
  const list = await callable(listSupportAgents, "u1", {});
  assert.equal(list.agents[0].agentCode, "COG-0000");
  assert.equal(list.agents[0].locked, true);
  assert.equal(list.agents.length, 6);
  await callable(removeSupportAgent, "u1", { agentCode: "COG-0003" });
  assert.equal((await callable(listSupportAgents, "u1", {})).agents.length, 5);
});

test("desk requests: written to desk_requests as pms_<code>_<id>, routed, listed, limited to 5 a day", opts, async () => {
  await reset();
  await fs().collection("users").doc("u1").set({ name: "Mary", phone: "0700", company: { name: "Mary Rentals" } });
  await fs().collection("users").doc("u2").set({ name: "Other" });
  await fs().collection("desk_agents").doc("a1").set({ agentCode: "COG-0001", name: "Desk 1", status: "active" });
  await fs().collection("desk_agents").doc("a2").set({ agentCode: "COG-0002", name: "Desk 2", status: "active" });
  const none = await callable(createDeskRequest, "u1", { category: "sms", subject: "No agent yet", message: "Please help" });
  assert.deepEqual(none.targetDeskCodes, ["COG-0000"]);
  await callable(addSupportAgent, "u1", { agentCode: "COG-0002" });
  await callable(addSupportAgent, "u1", { agentCode: "COG-0001" });
  const first = await callable(createDeskRequest, "u1", { category: "import", subject: "Import tenants", message: "Need help importing" });
  assert.deepEqual(first.targetDeskCodes, ["COG-0002"]);
  const both = await callable(createDeskRequest, "u1", { category: "other", subject: "Both desks", message: "Ask the top desk too", includeTopDesk: true });
  assert.deepEqual(both.targetDeskCodes, ["COG-0002", "COG-0000"]);
  assert.match(first.id, /^pms_PYL-0001_.+/);
  const doc = (await fs().collection("desk_requests").doc(first.id).get()).data()!;
  assert.equal(doc.source, "pms"); assert.equal(doc.status, "new"); assert.equal(doc.entityCode, "PYL-0001"); assert.equal(doc.entityName, "Mary Rentals");
  // desk writes back; the landlord sees it
  await fs().collection("desk_requests").doc(first.id).update({ status: "answered", responses: [{ at: 1, byDeskCode: "COG-0002", text: "Done" }] });
  const listed = await callable(listDeskRequests, "u1", {});
  assert.equal(listed.requests.length, 3);
  const mine = listed.requests.find((r: { id: string }) => r.id === first.id);
  assert.equal(mine.status, "answered"); assert.equal(mine.responses[0].text, "Done");
  assert.equal((await callable(listDeskRequests, "u2", {})).requests.length, 0);
  // limit: 3 used so far; two more fit, the sixth is refused, simultaneous sends cannot exceed it
  const burst = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => callable(createDeskRequest, "u1", { category: "other", subject: `Burst ${i}`, message: "Burst message" })));
  assert.equal(burst.filter((r) => r.status === "fulfilled").length, 2);
  assert.equal((await callable(listDeskRequests, "u1", {})).requests.length, 5);
});

test("deskdelegate on real Firestore: COG-0000 allowed, unconnected desk refused, commit idempotent, tokens deducted atomically", opts, async () => {
  await reset();
  await fs().collection("users").doc("u1").set({ name: "Mary", phone: "0700", tier: "business", tokens: 10, landlordCode: "PYL-0001", supportAgents: {} });
  await fs().collection("users").doc("u1").collection("properties").doc("1").set({ name: "Sunrise", isRestricted: false });
  await fs().collection("desk_agents").doc("a1").set({ agentCode: "COG-0001", status: "active" });
  const sent: string[] = [];
  const deps = {
    store: firestoreDelegateStore(fs()), now: () => Date.now(),
    sms: { normalizePhone: (r: string) => r, validateBody: () => ({ valid: true }), tokensFor: () => 1, send: async (m: string) => { sent.push(m); return { success: true }; } },
  };
  const base = { entityCode: "PYL-0001", payload: {} };
  const refused = await handleDelegate(deps, { ...base, action: "entity_info", agentCode: "COG-0001", requestId: "req-aaaaaaaa" });
  assert.ok(!refused.ok && refused.error.code === "permission_denied");
  const top = await handleDelegate(deps, { ...base, action: "entity_info", agentCode: "COG-0000", requestId: "req-aaaaaaab" });
  assert.ok(top.ok);
  const commit = { ...base, action: "commit_records", agentCode: "COG-0000", requestId: "req-aaaaaaac", payload: { source: "manual", rows: [{ name: "Jane Wanjiru", id: "33333333", phone: "0712345678", unitNumber: "B1", rentAmount: 9000 }] } };
  const [c1, c2] = await Promise.all([handleDelegate(deps, commit), handleDelegate(deps, commit)]);
  assert.ok(c1.ok || c2.ok);
  const replay = await handleDelegate(deps, commit);
  assert.deepEqual(replay.ok && replay.result, { created: 1, skipped: 0, errors: [] });
  assert.equal((await fs().collection("users").doc("u1").collection("tenants").get()).size, 1);
  const send = { ...base, action: "send_sms_now", agentCode: "COG-0000", requestId: "req-aaaaaaad", payload: { message: "Rent is due", audience: "all_tenants" } };
  const s1 = await handleDelegate(deps, send);
  assert.ok(s1.ok);
  assert.deepEqual(await handleDelegate(deps, send), s1);
  assert.equal(sent.length, 1);
  assert.equal((await fs().collection("users").doc("u1").get()).get("tokens"), 9);
  assert.ok((await fs().collection("desk_audit").get()).size >= 3);
});
