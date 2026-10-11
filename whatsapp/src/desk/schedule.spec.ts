import test from "node:test";
import assert from "node:assert/strict";
import { nextRunAt, parseOnce, validateSchedule } from "./schedule";

const EAT = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h - 3, mi);
const NOW = EAT(2026, 10, 11, 12, 0);

test("once: no zone means Nairobi time; past or far-future refused", () => {
  assert.equal(parseOnce("2026-11-05T09:00"), EAT(2026, 11, 5, 9, 0));
  assert.equal(parseOnce("2026-11-05T09:00:00Z"), Date.UTC(2026, 10, 5, 9, 0));
  assert.deepEqual(validateSchedule({ kind: "once", at: "2026-11-05T09:00" }, NOW), { kind: "once", at: "2026-11-05T09:00" });
  assert.throws(() => validateSchedule({ kind: "once", at: "2026-10-11T12:00" }, NOW));
  assert.throws(() => validateSchedule({ kind: "once", at: "2028-01-01T09:00" }, NOW));
  assert.throws(() => validateSchedule({ kind: "once", at: "tomorrow" }, NOW));
});
test("daily: today if still ahead, otherwise tomorrow", () => {
  assert.equal(nextRunAt({ kind: "daily", at: "18:00" }, NOW), EAT(2026, 10, 11, 18, 0));
  assert.equal(nextRunAt({ kind: "daily", at: "08:00" }, NOW), EAT(2026, 10, 12, 8, 0));
});
test("weekly: next matching weekday (2026-10-11 is a Sunday)", () => {
  assert.equal(nextRunAt({ kind: "weekly", at: "09:00", days: [1, 4] }, NOW), EAT(2026, 10, 12, 9, 0));
  assert.equal(nextRunAt({ kind: "weekly", at: "09:00", days: [0] }, NOW), EAT(2026, 10, 18, 9, 0));
});
test("monthly: a day beyond the month's length runs on the last day", () => {
  assert.equal(nextRunAt({ kind: "monthly", at: "09:00", days: [31] }, EAT(2026, 11, 5, 0, 0)), EAT(2026, 11, 30, 9, 0));
  assert.equal(nextRunAt({ kind: "monthly", at: "09:00", days: [5] }, NOW), EAT(2026, 11, 5, 9, 0));
});
test("a one-off that has passed has no next run", () => {
  assert.equal(nextRunAt({ kind: "once", at: "2026-10-01T09:00" }, NOW), null);
});
test("recurring schedules need valid days and a time", () => {
  assert.throws(() => validateSchedule({ kind: "weekly", at: "09:00" }, NOW));
  assert.throws(() => validateSchedule({ kind: "weekly", at: "09:00", days: [7] }, NOW));
  assert.throws(() => validateSchedule({ kind: "monthly", at: "09:00", days: [0] }, NOW));
  assert.throws(() => validateSchedule({ kind: "daily", at: "9am" }, NOW));
  assert.deepEqual(validateSchedule({ kind: "weekly", at: "09:00", days: [3, 1, 3] }, NOW), { kind: "weekly", at: "09:00", days: [1, 3] });
});
