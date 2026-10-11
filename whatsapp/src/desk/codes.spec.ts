import test from "node:test";
import assert from "node:assert/strict";
import { formatLandlordCode, isLandlordCode, nairobiDayKey, normaliseDeskCode, routeDeskCodes } from "./codes";
import { PMS_SIGNUP_FREE_TOKENS, PMS_USER_LIMITS } from "./constants";
import { DeskError } from "./errors";

test("landlord codes are PYL-0001, zero padded to 4 digits and growing", () => {
  assert.equal(formatLandlordCode(1), "PYL-0001");
  assert.equal(formatLandlordCode(9999), "PYL-9999");
  assert.equal(formatLandlordCode(10000), "PYL-10000");
  assert.throws(() => formatLandlordCode(0));
  assert.throws(() => formatLandlordCode(1.5));
  assert.ok(isLandlordCode("PYL-0042") && isLandlordCode("PYL-123456") && !isLandlordCode("PYL-42") && !isLandlordCode("SMC-0001"));
});
test("desk codes are normalised before use", () => {
  assert.equal(normaliseDeskCode("  cog-0007 "), "COG-0007");
  assert.equal(normaliseDeskCode(undefined), "");
});
test("routing: first connected non-top desk, else COG-0000", () => {
  assert.deepEqual(routeDeskCodes({ connected: ["COG-0003", "COG-0001"], includeTop: false }), ["COG-0003"]);
  assert.deepEqual(routeDeskCodes({ connected: [], includeTop: false }), ["COG-0000"]);
  assert.deepEqual(routeDeskCodes({ connected: ["COG-0000", "COG-0002"], includeTop: false }), ["COG-0002"]);
});
test("routing: a chosen desk must be connected; opt-in adds COG-0000 once", () => {
  assert.deepEqual(routeDeskCodes({ connected: ["COG-0003", "COG-0001"], chosen: "cog-0001", includeTop: false }), ["COG-0001"]);
  assert.deepEqual(routeDeskCodes({ connected: ["COG-0003"], chosen: "COG-0003", includeTop: true }), ["COG-0003", "COG-0000"]);
  assert.deepEqual(routeDeskCodes({ connected: ["COG-0003"], chosen: "COG-0000", includeTop: true }), ["COG-0000"]);
  assert.deepEqual(routeDeskCodes({ connected: [], includeTop: true }), ["COG-0000"]);
  assert.throws(() => routeDeskCodes({ connected: ["COG-0003"], chosen: "COG-0009", includeTop: false }), (e) => e instanceof DeskError && e.code === "invalid_argument");
});
test("the per-day limit rolls over at midnight Nairobi time (UTC+3)", () => {
  assert.equal(nairobiDayKey(Date.UTC(2026, 9, 11, 20, 59, 59)), "2026-10-11");
  assert.equal(nairobiDayKey(Date.UTC(2026, 9, 11, 21, 0, 0)), "2026-10-12");
});
test("signup free tokens constant is 50", () => assert.equal(PMS_SIGNUP_FREE_TOKENS, 50));
test("plan limits equal the app's USER_LIMITS (src/services/database/FirebaseSync.tsx)", () => {
  assert.deepEqual(PMS_USER_LIMITS, {
    free: { properties: 1, tenantsPerProperty: 5, totalTenants: 5 },
    low: { properties: 3, tenantsPerProperty: 10, totalTenants: 30 },
    business: { properties: 9, tenantsPerProperty: 14, totalTenants: 126 },
    solo: { properties: 1, tenantsPerProperty: 20, totalTenants: 20 },
    pro: { properties: 16, tenantsPerProperty: 20, totalTenants: 300 },
    enterprise: { properties: -1, tenantsPerProperty: -1, totalTenants: -1 },
  });
});
