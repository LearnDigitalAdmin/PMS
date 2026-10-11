import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DEFAULT_SHARE_CONFIG, floorPct2, mergeShareConfig, sharePlan } from "./shares";
import { splitKey, validateSplit } from "./splitKey";

// Vectors copied from the desk kernel (functions-desk/src/money.test.ts).
test("kernel vector: subscription / report shares by rank", () => {
  assert.equal(sharePlan("senior", "subscription", DEFAULT_SHARE_CONFIG).agentSharePct, 30);
  assert.equal(sharePlan("clerk", "report", DEFAULT_SHARE_CONFIG).agentSharePct, 25);
  assert.deepEqual(sharePlan("clerk", "subscription", DEFAULT_SHARE_CONFIG), { agentSharePct: 25, rule: "subscription" });
  assert.equal(sharePlan("lead", "subscription", DEFAULT_SHARE_CONFIG).agentSharePct, 30);
});
test("kernel vector: KES 999 subscription, fee 14.99, senior 30% nets the agent KES 295.20", () => {
  const gross = 99900, fee = 1499, pct = sharePlan("senior", "subscription", DEFAULT_SHARE_CONFIG).agentSharePct;
  const net = gross - fee;
  assert.equal(net, 98401);
  assert.equal(Math.floor((net * Math.round(pct * 100)) / 10000), 29520);
});
test("floorPct2 never rounds up and survives float artefacts", () => {
  assert.equal(floorPct2(71.03), 71.03);
  assert.equal(floorPct2(97.5), 97.5);
  assert.equal(floorPct2(30.019), 30.01);
});
test("rates from desk_config/global merge over the defaults", () => {
  const cfg = mergeShareConfig({ subShareByRank: { clerk: 20 } } as never);
  assert.equal(sharePlan("clerk", "subscription", cfg).agentSharePct, 20);
  assert.equal(sharePlan("senior", "subscription", cfg).agentSharePct, 30);
});
test("splitKey is order independent and equals sha256 of the canonical string", () => {
  const a = splitKey([{ subaccount: "ACCT_b", sharePct: 30 }, { subaccount: "ACCT_a", sharePct: 25 }]);
  const b = splitKey([{ subaccount: "ACCT_a", sharePct: 25 }, { subaccount: "ACCT_b", sharePct: 30 }]);
  assert.equal(a, b);
  assert.equal(splitKey([{ subaccount: "ACCT_x", sharePct: 30 }]), createHash("sha256").update("ACCT_x:3000").digest("hex").slice(0, 32));
});
test("validateSplit refuses bad subaccounts and shares that leave nothing for the platform", () => {
  assert.throws(() => validateSplit([{ subaccount: "x", sharePct: 30 }]));
  assert.throws(() => validateSplit([{ subaccount: "ACCT_x", sharePct: 100 }]));
  assert.throws(() => validateSplit([{ subaccount: "ACCT_x", sharePct: 0 }]));
  assert.doesNotThrow(() => validateSplit([{ subaccount: "ACCT_x", sharePct: 30 }]));
});
