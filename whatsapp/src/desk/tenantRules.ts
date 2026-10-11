/**
 * Tenant validation that mirrors PMS's own rules (src/pages/tenants/AddTenant.tsx validateForm, Database.canCreateTenant and
 * checkUserLimits). Pure: the caller supplies the landlord's properties and existing tenants.
 */
import { PMS_USER_LIMITS, type PmsTier } from "./constants";

export interface ImportRow { [column: string]: string | number | null }
export interface ImportError { row: number; field: string; reason: string; suggestion?: string }
export interface PropertyRec { id: string; name: string; isRestricted: boolean }
export interface ExistingTenant { id: string; propertyId: string; isRestricted: boolean }
export interface TenantContext { tier: string; properties: PropertyRec[]; existingTenants: ExistingTenant[] }
export interface NewTenant {
  id: number; propertyId: string; propertyName: string; name: string; phone: string; email: string; unitNumber: string;
  rentAmount: number; standingFees: number; depositAmount: number; leaseStart: string | null; leaseEnd: string | null;
}
export interface RowResult { valid: { index: number; tenant: NewTenant }[]; errors: ImportError[] }

const ALIASES: Record<string, string> = {
  id: "id", idnumber: "id", nationalid: "id", tenantid: "id", idno: "id",
  name: "name", tenantname: "name", fullname: "name",
  phone: "phone", phonenumber: "phone", mobile: "phone", tel: "phone",
  email: "email", emailaddress: "email",
  unit: "unitNumber", unitnumber: "unitNumber", unitno: "unitNumber", house: "unitNumber", houseno: "unitNumber", housenumber: "unitNumber",
  rent: "rentAmount", rentamount: "rentAmount", monthlyrent: "rentAmount",
  standingfees: "standingFees", standingfee: "standingFees",
  deposit: "depositAmount", depositamount: "depositAmount",
  leasestart: "leaseStart", leaseend: "leaseEnd",
  property: "property", propertyname: "property", propertyid: "property",
};
const canonicalKey = (k: string): string | undefined => ALIASES[k.toLowerCase().replace(/[^a-z]/g, "")];

/** Map a spreadsheet/manual row's column names onto canonical field names (unknown columns are ignored). */
export function canonicalRow(row: ImportRow): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  for (const [k, v] of Object.entries(row ?? {})) {
    const c = canonicalKey(k);
    if (c && (out[c] === undefined || out[c] === null || out[c] === "")) out[c] = v;
  }
  return out;
}

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s\-()]{7,15}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD`, or an Excel date serial. Returns null when it is not a real date. */
export function normaliseDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  let ms: number;
  if (typeof v === "number" || /^\d+(\.\d+)?$/.test(String(v).trim())) {
    const serial = Number(v);
    if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
    ms = Math.round((serial - 25569) * 86400 * 1000);
  } else {
    const s = String(v).trim();
    if (!ISO_DATE_RE.test(s)) return null;
    ms = Date.parse(`${s}T00:00:00Z`);
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== s) return null;
  }
  return new Date(ms).toISOString().slice(0, 10);
}

const tierLabel = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
export const limitsFor = (tier: string) => PMS_USER_LIMITS[(tier in PMS_USER_LIMITS ? tier : "free") as PmsTier];

export function validateTenantRows(rows: ImportRow[], ctx: TenantContext): RowResult {
  const errors: ImportError[] = [];
  const valid: RowResult["valid"] = [];
  const tier = tier_(ctx.tier);
  const limits = limitsFor(tier);
  const byId = new Map(ctx.properties.map((p) => [p.id, p]));
  const byName = new Map(ctx.properties.map((p) => [p.name.trim().toLowerCase(), p]));
  const liveProps = new Set(ctx.properties.filter((p) => !p.isRestricted).map((p) => p.id));
  const takenIds = new Set(ctx.existingTenants.map((t) => t.id));
  const perProperty = new Map<string, number>();
  let total = 0;
  for (const t of ctx.existingTenants) {
    if (t.isRestricted || !liveProps.has(t.propertyId)) continue; // PMS counts only non-restricted tenants in non-restricted properties
    perProperty.set(t.propertyId, (perProperty.get(t.propertyId) ?? 0) + 1);
    total += 1;
  }
  const batchIds = new Set<string>();

  rows.forEach((raw, i) => {
    const rowNo = i + 1;
    const r = canonicalRow(raw);
    const rowErrors: ImportError[] = [];
    const bad = (field: string, reason: string, suggestion?: string) => rowErrors.push({ row: rowNo, field, reason, ...(suggestion ? { suggestion } : {}) });

    const name = str(r.name);
    if (!name) bad("name", "Tenant name is required");
    else if (name.length < 3) bad("name", "Name must be at least 3 characters");

    const idStr = str(r.id);
    if (!idStr) bad("id", "Tenant id is required");
    else if (idStr.length < 7 || idStr.length > 10) bad("id", "Tenant id must be between 7 and 10 characters");
    else if (!/^\d+$/.test(idStr)) bad("id", "Tenant id must contain digits only", "Remove spaces and letters from the ID number");
    else if (takenIds.has(String(Number(idStr))) || batchIds.has(String(Number(idStr)))) bad("id", "A tenant with this ID already exists");

    const phone = str(r.phone);
    if (!phone) bad("phone", "Phone number is required");
    else if (phone.length < 10 || phone.length > 12) bad("phone", "Phone number must be between 10 and 12 characters", "Use the format 0712345678 or 254712345678");
    else if (Number.isNaN(parseFloat(phone)) || !PHONE_RE.test(phone)) bad("phone", "Please enter a valid phone number");

    const unitNumber = str(r.unitNumber);
    if (!unitNumber) bad("unitNumber", "Unit number is required");

    const rentRaw = str(r.rentAmount);
    const rent = Number(rentRaw);
    if (!rentRaw) bad("rentAmount", "Rent amount is required");
    else if (!Number.isFinite(rent) || rent <= 0) bad("rentAmount", "Please enter a valid rent amount");

    const email = str(r.email);
    if (email && !EMAIL_RE.test(email)) bad("email", "Please enter a valid email address");

    const optNumber = (field: "standingFees" | "depositAmount"): number => {
      const s = str(r[field]);
      if (!s) return 0;
      const n = Number(s);
      if (!Number.isFinite(n) || n < 0) { bad(field, "Please enter a valid amount (0 or more)"); return 0; }
      return n;
    };
    const standingFees = optNumber("standingFees");
    const depositAmount = optNumber("depositAmount");

    const leaseStart = normaliseDate(r.leaseStart);
    const leaseEnd = normaliseDate(r.leaseEnd);
    if (str(r.leaseStart) && !leaseStart) bad("leaseStart", "Lease start must be a date like 2026-01-31");
    if (str(r.leaseEnd) && !leaseEnd) bad("leaseEnd", "Lease end must be a date like 2026-12-31");
    if (leaseStart && leaseEnd && Date.parse(leaseStart) >= Date.parse(leaseEnd)) bad("leaseEnd", "End date must be after start date");

    // Property: by id or by name; a landlord with a single property needs no column.
    const propRaw = str(r.property);
    let property: PropertyRec | undefined;
    if (propRaw) property = byId.get(propRaw) ?? byName.get(propRaw.toLowerCase());
    else if (ctx.properties.length === 1) property = ctx.properties[0];
    if (!property) bad("property", propRaw ? `Property "${propRaw}" was not found` : "Property is required", "Use the exact property name from Plot Yangu");
    else if (property.isRestricted) bad("property", "This property is restricted due to plan limitations. Upgrade to access.");

    if (rowErrors.length === 0 && property) {
      const used = perProperty.get(property.id) ?? 0;
      if (limits.tenantsPerProperty !== -1 && used >= limits.tenantsPerProperty) {
        bad("property", `${tierLabel(tier)} tier allows maximum ${limits.tenantsPerProperty} tenants per property. Upgrade your plan to add more.`);
      } else if (limits.totalTenants !== -1 && total >= limits.totalTenants) {
        bad("property", `${tierLabel(tier)} tier allows maximum ${limits.totalTenants} tenants in total. Upgrade your plan to add more.`);
      }
    }

    if (rowErrors.length > 0 || !property) { errors.push(...rowErrors); return; }
    const id = Number(idStr);
    batchIds.add(String(id));
    perProperty.set(property.id, (perProperty.get(property.id) ?? 0) + 1);
    total += 1;
    valid.push({ index: i, tenant: { id, propertyId: property.id, propertyName: property.name, name, phone, email, unitNumber, rentAmount: rent, standingFees, depositAmount, leaseStart, leaseEnd } });
  });
  return { valid, errors };
}

const tier_ = (t: string): string => (t in PMS_USER_LIMITS ? t : "free");

/** The canonical row form returned to desk as "valid" (commit_records re-validates it from scratch). */
export function toImportRow(t: NewTenant): ImportRow {
  return {
    property: t.propertyName, propertyId: t.propertyId, id: String(t.id), name: t.name, phone: t.phone, email: t.email, unitNumber: t.unitNumber,
    rentAmount: t.rentAmount, standingFees: t.standingFees, depositAmount: t.depositAmount, leaseStart: t.leaseStart, leaseEnd: t.leaseEnd,
  };
}
