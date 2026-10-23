import test from "node:test";
import assert from "node:assert/strict";
import { formatOwnerId, OWNER_ID_PATTERN } from "./ownerId";

test("owner ids pad to four digits and keep scaling", () => {
  assert.equal(formatOwnerId(1), "PYP-0001");
  assert.equal(formatOwnerId(42), "PYP-0042");
  assert.equal(formatOwnerId(9999), "PYP-9999");
  assert.equal(formatOwnerId(10000), "PYP-10000");
  assert.ok(OWNER_ID_PATTERN.test("PYP-0001") && OWNER_ID_PATTERN.test("PYP-123456"));
  assert.ok(!OWNER_ID_PATTERN.test("PYP-001") && !OWNER_ID_PATTERN.test("COG-0001"));
  assert.throws(() => formatOwnerId(0));
});
