import test from "node:test";
import assert from "node:assert/strict";
import { renewedExpiry } from "./subscriptionExpiry";

const NOW = new Date("2026-10-23T09:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

test("paying early keeps the days already paid for", () => {
  const user = { type: "paid", subscriptionExpiry: days(3) };
  assert.equal(renewedExpiry(user, 30, NOW).getTime(), days(33).getTime());
  assert.equal(renewedExpiry({ type: "paid", subscriptionExpiry: { toDate: () => days(3) } }, 365, NOW).getTime(), days(368).getTime());
});
test("an expired plan, a trial or a new account starts from today", () => {
  assert.equal(renewedExpiry({ type: "paid", subscriptionExpiry: days(-2) }, 30, NOW).getTime(), days(30).getTime());
  assert.equal(renewedExpiry({ type: "free", isTrial: true, subscriptionExpiry: days(4) }, 30, NOW).getTime(), days(30).getTime());
  assert.equal(renewedExpiry({ type: "paid", isTrial: true, subscriptionExpiry: days(4) }, 30, NOW).getTime(), days(30).getTime());
  assert.equal(renewedExpiry(undefined, 30, NOW).getTime(), days(30).getTime());
  assert.equal(renewedExpiry({ type: "free" }, 30, NOW).getTime(), days(30).getTime());
});
