import test from "node:test";
import assert from "node:assert/strict";
import { resolveSubscriptionAttribution, legacyAgentId, type AttributionDeps } from "./attribution";
import { DEFAULT_SHARE_CONFIG } from "./shares";

interface World {
  landlord?: { landlordCode?: string; cyberId?: unknown } | null;
  customer?: { ownerAgentId?: string; selfOwned?: boolean } | null;
  agent?: { agentCode?: string; status?: string; rank?: string } | null;
  subaccount?: string;
  legacySplit?: string | undefined;
  splitThrows?: boolean; customerThrows?: boolean;
}
function deps(w: World, calls: string[] = []): AttributionDeps {
  return {
    getLandlord: async () => (w.landlord === undefined ? null : w.landlord),
    getCustomer: async (key) => { calls.push(`customer:${key}`); if (w.customerThrows) throw new Error("boom"); return w.customer ?? null; },
    getDeskAgent: async () => w.agent ?? null,
    getMainSubaccount: async () => w.subaccount,
    getShareConfig: async () => DEFAULT_SHARE_CONFIG,
    getSplitCode: async (subs) => { if (w.splitThrows) throw new Error("paystack down"); calls.push(`split:${subs[0].subaccount}:${subs[0].sharePct}`); return "SPL_desk"; },
    legacySplitCode: async (id) => { calls.push(`legacy:${id}`); return w.legacySplit; },
  };
}
const deskWorld: World = {
  landlord: { landlordCode: "PYL-0001", cyberId: "legacyAgent" },
  customer: { ownerAgentId: "agentUid", selfOwned: false },
  agent: { agentCode: "COG-0007", status: "active", rank: "senior" },
  subaccount: "ACCT_main", legacySplit: "SPL_legacy",
};

test("(a) a desk-owned landlord pays the rank share through the shared split cache, even if a legacy agent is also recorded", async () => {
  const calls: string[] = [];
  const a = await resolveSubscriptionAttribution(deps(deskWorld, calls), "u1");
  assert.deepEqual(a, { kind: "desk", splitCode: "SPL_desk", commission: { agentCode: "COG-0007", agentId: "agentUid", sharePct: 30, rule: "subscription", entityKey: "pms:PYL-0001" } });
  assert.deepEqual(calls, ["customer:pms:PYL-0001", "split:ACCT_main:30"]);
});
test("(a) a clerk earns 25%", async () => {
  const a = await resolveSubscriptionAttribution(deps({ ...deskWorld, agent: { agentCode: "COG-0002", status: "active", rank: "clerk" } }), "u1");
  assert.equal(a.kind === "desk" && a.commission.sharePct, 25);
});
test("(b) no desk owner: the legacy agent keeps today's behaviour (split through the legacy path, agentId recorded)", async () => {
  const calls: string[] = [];
  const a = await resolveSubscriptionAttribution(deps({ ...deskWorld, customer: null }, calls), "u1");
  assert.deepEqual(a, { kind: "legacy", agentId: "legacyAgent", splitCode: "SPL_legacy" });
  assert.deepEqual(calls, ["customer:pms:PYL-0001", "legacy:legacyAgent"]);
});
test("(b) legacy agent without a payment account: still attributed, no split, subscription proceeds", async () => {
  const a = await resolveSubscriptionAttribution(deps({ ...deskWorld, customer: null, legacySplit: undefined }), "u1");
  assert.deepEqual(a, { kind: "legacy", agentId: "legacyAgent", splitCode: undefined });
});
test("(c) neither: no split", async () => {
  assert.deepEqual(await resolveSubscriptionAttribution(deps({ landlord: { landlordCode: "PYL-0001" } }), "u1"), { kind: "none" });
  assert.deepEqual(await resolveSubscriptionAttribution(deps({ landlord: null }), "u1"), { kind: "none" });
});
test("a self-owned, suspended, subaccount-less or unranked desk customer does not earn through desk", async () => {
  for (const w of [
    { ...deskWorld, customer: { ownerAgentId: "agentUid", selfOwned: true } },
    { ...deskWorld, agent: { agentCode: "COG-0007", status: "suspended", rank: "senior" } },
    { ...deskWorld, subaccount: undefined },
    { ...deskWorld, agent: { agentCode: "COG-0007", status: "active", rank: "boss" } },
  ] as World[]) {
    assert.equal((await resolveSubscriptionAttribution(deps(w), "u1")).kind, "legacy");
  }
});
test("a desk failure never blocks the subscription: it falls through to the legacy agent, then to none", async () => {
  assert.equal((await resolveSubscriptionAttribution(deps({ ...deskWorld, splitThrows: true }), "u1")).kind, "legacy");
  assert.equal((await resolveSubscriptionAttribution(deps({ ...deskWorld, customerThrows: true }), "u1")).kind, "legacy");
  assert.equal((await resolveSubscriptionAttribution(deps({ landlord: { landlordCode: "PYL-0001" }, customerThrows: true }), "u1")).kind, "none");
});
test("a landlord with no code yet cannot be desk-owned", async () => {
  const calls: string[] = [];
  const a = await resolveSubscriptionAttribution(deps({ ...deskWorld, landlord: { cyberId: "legacyAgent" } }, calls), "u1");
  assert.equal(a.kind, "legacy");
  assert.ok(!calls.some((c) => c.startsWith("customer")));
});
test("the client can no longer choose the agent: only the stored cyberId counts", () => {
  assert.equal(legacyAgentId("abc"), "abc");
  assert.equal(legacyAgentId({ uid: "xyz" }), "xyz");
  assert.equal(legacyAgentId(""), undefined);
  assert.equal(legacyAgentId(undefined), undefined);
});
