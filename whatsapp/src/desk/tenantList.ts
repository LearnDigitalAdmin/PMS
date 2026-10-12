/**
 * `list_tenants` (desk contract v5, scope rent_stk): one page of a landlord's rent-collectable tenants.
 * Pure: the delegate supplies the landlord's tenants, properties and invoices. Phones leave PMS only masked.
 */
import type { InvoiceRec, TenantRec } from "./audiences";

export const TENANT_PAGE_DEFAULT = 50;
export const TENANT_PAGE_MAX = 50;

export interface TenantListRow { tenantId: string; name: string; unit: string; phoneMasked: string; rentDueMinor?: number }
export interface TenantListPage { tenants: TenantListRow[]; nextCursor?: string }
type ListedTenant = TenantRec & { unitNumber: string };

/** +2547•• ••• 123 style, the same shape desk shows. Anything that is not a usable phone becomes "•••". */
export function maskTenantPhone(normalised: string): string {
  const p = normalised.replace(/[\s-]/g, "");
  return /^\+?\d{9,15}$/.test(p) ? `${p.slice(0, 5)}•• ••• ${p.slice(-3)}` : "•••";
}

export function listTenantsPage(
  p: { limit?: unknown; cursor?: unknown; query?: unknown },
  tenants: readonly ListedTenant[],
  invoices: readonly InvoiceRec[],
  restrictedProperties: ReadonlySet<string>,
  normalizePhone: (raw: string) => string,
): TenantListPage {
  const limit = Math.min(TENANT_PAGE_MAX, Math.max(1, Number.isInteger(p.limit) ? (p.limit as number) : TENANT_PAGE_DEFAULT));
  const q = typeof p.query === "string" ? p.query.trim().toLowerCase().slice(0, 60) : "";
  const cursor = typeof p.cursor === "string" && p.cursor.length > 0 && p.cursor.length <= 300 ? p.cursor : "";

  const owedKes = new Map<string, number>();
  for (const i of invoices) {
    const due = Number(i.totalAmount) - Number(i.amountPaid);
    if (due > 0) owedKes.set(String(i.tenantId), (owedKes.get(String(i.tenantId)) ?? 0) + due);
  }

  const live = tenants
    .filter((t) => !t.isRestricted && t.isActive && !restrictedProperties.has(t.propertyId))
    .filter((t) => q === "" || t.name.toLowerCase().includes(q) || t.unitNumber.toLowerCase().includes(q))
    .sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Cursor = "<lowercased name>\u0000<id>" of the last row sent; the next page starts strictly after it.
  const key = (t: ListedTenant) => `${t.name.toLowerCase()}\u0000${t.id}`;
  const rest = cursor ? live.filter((t) => key(t) > cursor) : live;
  const page = rest.slice(0, limit);

  const rows: TenantListRow[] = page.map((t) => {
    let masked = "•••";
    try { masked = maskTenantPhone(normalizePhone(t.phone)); } catch { /* unusable phone stays masked as ••• */ }
    const row: TenantListRow = { tenantId: t.id, name: t.name, unit: t.unitNumber, phoneMasked: masked };
    const owed = owedKes.get(t.id);
    if (owed !== undefined) row.rentDueMinor = Math.round(owed * 100);
    return row;
  });
  const last = page[page.length - 1];
  return { tenants: rows, ...(rest.length > page.length && last ? { nextCursor: key(last) } : {}) };
}
