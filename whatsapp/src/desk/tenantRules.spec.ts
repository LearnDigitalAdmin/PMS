import test from "node:test";
import assert from "node:assert/strict";
import { normaliseDate, validateTenantRows, type TenantContext } from "./tenantRules";

const ctx = (over: Partial<TenantContext> = {}): TenantContext => ({
  tier: "business", properties: [{ id: "1", name: "Sunrise Apartments", isRestricted: false }], existingTenants: [], ...over,
});
const row = (o: Record<string, string | number | null> = {}) => ({
  name: "Jane Wanjiru", id: "12345678", phone: "0712345678", unitNumber: "A1", rentAmount: 12000, ...o,
});

test("a complete row is valid; a single property needs no property column", () => {
  const r = validateTenantRows([row()], ctx());
  assert.equal(r.errors.length, 0);
  assert.equal(r.valid[0].tenant.propertyId, "1");
  assert.equal(r.valid[0].tenant.standingFees, 0);
});
test("spreadsheet header aliases are understood", () => {
  const r = validateTenantRows([{ "Tenant Name": "Peter Otieno", "ID Number": "23456789", Mobile: "0722000111", "House No": "B2", "Monthly Rent": "9500", Property: "sunrise apartments" }], ctx());
  assert.equal(r.errors.length, 0);
  assert.equal(r.valid[0].tenant.unitNumber, "B2");
});
test("PMS required-field and format rules", () => {
  const r = validateTenantRows([
    row({ name: "Jo" }), row({ id: "123" }), row({ id: "12a45678" }), row({ phone: "123" }), row({ phone: "07123x5678" }),
    row({ unitNumber: "" }), row({ rentAmount: 0 }), row({ email: "nope" }), row({ leaseStart: "2026-05-01", leaseEnd: "2026-04-01" }),
  ], ctx());
  assert.equal(r.valid.length, 0);
  const fields = r.errors.map((e) => `${e.row}:${e.field}`);
  assert.deepEqual(fields, ["1:name", "2:id", "3:id", "4:phone", "5:phone", "6:unitNumber", "7:rentAmount", "8:email", "9:leaseEnd"]);
});
test("duplicate tenant id: against existing tenants and inside the batch", () => {
  const r = validateTenantRows([row(), row(), row({ id: "99999999" })], ctx({ existingTenants: [{ id: "99999999", propertyId: "1", isRestricted: false }] }));
  assert.deepEqual(r.errors.map((e) => `${e.row}:${e.reason}`), ["2:A tenant with this ID already exists", "3:A tenant with this ID already exists"]);
  assert.equal(r.valid.length, 1);
});
test("restricted or unknown property is refused", () => {
  const c = ctx({ properties: [{ id: "1", name: "A", isRestricted: true }, { id: "2", name: "B", isRestricted: false }] });
  const r = validateTenantRows([row({ property: "A" }), row({ id: "22222222", property: "Nowhere" }), row({ id: "33333333" })], c);
  assert.equal(r.errors.length, 3);
  assert.match(r.errors[0].reason, /restricted/);
  assert.match(r.errors[1].reason, /not found/);
  assert.match(r.errors[2].reason, /Property is required/);
});
test("plan limit: tenants per property counts only non-restricted tenants (free = 5)", () => {
  const existing = [1, 2, 3, 4].map((n) => ({ id: `1000000${n}`, propertyId: "1", isRestricted: false }));
  existing.push({ id: "10000009", propertyId: "1", isRestricted: true });
  const r = validateTenantRows([row({ id: "20000001" }), row({ id: "20000002" })], ctx({ tier: "free", existingTenants: existing }));
  assert.equal(r.valid.length, 1);
  assert.equal(r.errors[0].reason, "Free tier allows maximum 5 tenants per property. Upgrade your plan to add more.");
});
test("plan limit: total tenants (pro 300 across properties) and enterprise unlimited", () => {
  const props = Array.from({ length: 16 }, (_, i) => ({ id: String(i + 1), name: `P${i + 1}`, isRestricted: false }));
  const existing = Array.from({ length: 300 }, (_, i) => ({ id: String(30000000 + i), propertyId: String(Math.floor(i / 19) + 1), isRestricted: false }));
  const full = validateTenantRows([row({ id: "40000001", property: "P16" })], { tier: "pro", properties: props, existingTenants: existing });
  assert.match(full.errors[0].reason, /maximum 300 tenants in total/);
  const ent = validateTenantRows([row({ id: "40000001", property: "P16" })], { tier: "enterprise", properties: props, existingTenants: existing });
  assert.equal(ent.errors.length, 0);
});
test("an unknown tier is treated as free, like USER_LIMITS[tier] || USER_LIMITS.free", () => {
  const existing = [1, 2, 3, 4, 5].map((n) => ({ id: `1000000${n}`, propertyId: "1", isRestricted: false }));
  assert.equal(validateTenantRows([row({ id: "20000001" })], ctx({ tier: "weird", existingTenants: existing })).errors.length, 1);
});
test("dates: ISO and Excel serials, impossible dates refused", () => {
  assert.equal(normaliseDate("2026-02-28"), "2026-02-28");
  assert.equal(normaliseDate(46000), "2025-12-09");
  assert.equal(normaliseDate("2026-02-30"), null);
  assert.equal(normaliseDate("31/01/2026"), null);
});
