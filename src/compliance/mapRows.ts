// Pure: turns the rows the app holds on the device into the records the report engine takes. No database, no network.
// (The server re-validates everything and sets every price; nothing here decides what anyone pays.)
export type ReportKind = 'mri_monthly' | 'annual_summary';

export interface Rows {
  property: { id: number; name: string; address: string | null; agent_commission_rate: number | null };
  tenants: { id: number; unit_number: string | null; name: string; rent_amount: number; is_active: number; is_restricted?: number | null }[];
  invoices: { id: number; tenant_id: number; billing_month: string; rent_amount: number; total_amount: number }[];
  payments: { invoice_id: number; amount: number; payment_date: string }[];
  items: { billing_month: string; description: string; amount: number; type: string; is_deductible: number }[];
  /** Every tenant of the landlord, for the annual rent band test (it applies to all the landlord's properties together). */
  allTenants: { rent_amount: number; is_active: number; is_restricted?: number | null }[];
  /** Invoices of the whole year to date across all properties, for the rent received so far. */
  yearInvoices: { rent_amount: number; amount_paid: number }[];
  propertyCount: number;
}
export interface Options { kind: ReportKind; month: string; landlordName: string; kraPin: string | null; residential: boolean }

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const keepMoney = (v: unknown): number => Math.round(num(v) * 100) / 100;

export function mapRows(r: Rows, o: Options) {
  const byInvoice = new Map<number, { date: string; amount: number }[]>();
  for (const p of r.payments) {
    if (!p.payment_date) continue;
    const list = byInvoice.get(p.invoice_id) ?? [];
    list.push({ date: String(p.payment_date).slice(0, 10), amount: keepMoney(p.amount) });
    byInvoice.set(p.invoice_id, list);
  }
  const rate = Math.max(0, Math.min(100, num(r.property.agent_commission_rate)));
  const tenants = r.tenants.filter((t) => !t.is_restricted);
  const allowed = new Set(tenants.map((t) => String(t.id)));
  return {
    kind: o.kind,
    month: o.month,
    landlord: { name: o.landlordName, kraPin: o.kraPin },
    property: { id: String(r.property.id), name: r.property.name, address: r.property.address, commissionRatePct: rate, managed: rate > 0, residential: o.residential },
    tenants: tenants.map((t) => ({ id: String(t.id), unit: t.unit_number, name: t.name, rent: keepMoney(t.rent_amount), active: !!t.is_active })),
    invoices: r.invoices.filter((i) => allowed.has(String(i.tenant_id))).map((i) => ({
      id: String(i.id), tenantId: String(i.tenant_id), month: i.billing_month, rent: keepMoney(i.rent_amount), total: keepMoney(i.total_amount), payments: byInvoice.get(i.id) ?? [],
    })),
    // Base rent is income, never a bill: rent lines are dropped here, and the server drops any that slip through.
    statementItems: r.items.filter((x) => x.is_deductible && x.type !== 'rent' && !/^\s*(base\s+)?rent\s*$/i.test(x.description))
      .map((x) => ({ month: x.billing_month, description: x.description, amount: keepMoney(x.amount) })),
    portfolio: {
      propertyCount: Math.max(1, r.propertyCount),
      annualRentRoll: keepMoney(r.allTenants.filter((t) => t.is_active && !t.is_restricted).reduce((s, t) => s + num(t.rent_amount), 0) * 12),
      ytdReceived: keepMoney(r.yearInvoices.reduce((s, i) => s + Math.min(num(i.amount_paid), num(i.rent_amount)), 0)),
    },
  };
}

/** The Nairobi month before today: the return due on the 20th of the current month. */
export function defaultReportMonth(now = new Date()): string {
  const t = new Date(now.getTime() + 3 * 3_600_000);
  const y = t.getUTCFullYear(), m = t.getUTCMonth();                // m is 0-based: this month
  return m === 0 ? `${y - 1}-12` : `${y}-${String(m).padStart(2, '0')}`;
}
export function currentMonth(now = new Date()): string {
  const t = new Date(now.getTime() + 3 * 3_600_000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}
/** The last `count` months, newest first. */
export function recentMonths(count = 18, now = new Date()): string[] {
  const t = new Date(now.getTime() + 3 * 3_600_000);
  let y = t.getUTCFullYear(), m = t.getUTCMonth() + 1;
  const out: string[] = [];
  for (let i = 0; i < count; i++) { out.push(`${y}-${String(m).padStart(2, '0')}`); m -= 1; if (m === 0) { m = 12; y -= 1; } }
  return out;
}
