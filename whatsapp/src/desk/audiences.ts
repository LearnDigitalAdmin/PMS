/** Who an SMS goes to. Pure. */
export const AUDIENCES = ["all_tenants", "tenants_with_arrears"] as const;
export type Audience = typeof AUDIENCES[number];
export interface TenantRec { id: string; propertyId: string; name: string; phone: string; isRestricted: boolean; isActive: boolean }
export interface InvoiceRec { tenantId: string; totalAmount: number; amountPaid: number }
export interface Recipient { id: string; name: string; phone: string }

export const isAudience = (s: unknown): s is Audience => typeof s === "string" && (AUDIENCES as readonly string[]).includes(s);

/**
 * Tenants with a phone number, in a property that is not restricted, not restricted themselves and not deactivated.
 * `tenants_with_arrears` = at least one invoice with more billed than paid (the same test the app uses for overdue checks).
 * `memberIds`, when given, narrows the audience to those tenants.
 */
export function selectRecipients(
  audience: Audience, tenants: TenantRec[], invoices: InvoiceRec[], restrictedProperties: ReadonlySet<string>, memberIds?: readonly string[],
): Recipient[] {
  const owing = new Set(invoices.filter((i) => Number(i.totalAmount) > Number(i.amountPaid)).map((i) => String(i.tenantId)));
  const only = memberIds && memberIds.length > 0 ? new Set(memberIds.map(String)) : null;
  return tenants
    .filter((t) => !t.isRestricted && t.isActive && !restrictedProperties.has(t.propertyId) && t.phone.trim() !== "")
    .filter((t) => (audience === "tenants_with_arrears" ? owing.has(t.id) : true))
    .filter((t) => (only ? only.has(t.id) : true))
    .map((t) => ({ id: t.id, name: t.name, phone: t.phone }));
}
