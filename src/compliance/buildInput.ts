// Reads the property's records from the device (works offline, for every plan) and shapes them for the report engine.
import { database } from '../services/database/Database';
import { mapRows, type Options, type Rows } from './mapRows';

type Row = Record<string, any>;
const all = async (sql: string, params: unknown[]): Promise<Row[]> => ((await database.db!.query(sql, params)).values ?? []) as Row[];

export async function buildReportInput(userId: number, propertyId: number, o: Options) {
  const year = Number(o.month.slice(0, 4));
  const from = `${year - 1}-07`, to = `${year}-12`;                      // invoices that can carry a payment dated this year
  const [prop] = await all('SELECT id, name, address, agent_commission_rate FROM properties WHERE id = ? AND user_id = ?', [propertyId, userId]);
  if (!prop) throw new Error('Property not found on this device.');
  const [tenants, invoices, items, allTenants, yearInvoices, props] = await Promise.all([
    all('SELECT id, unit_number, name, rent_amount, is_active, is_restricted FROM tenants WHERE property_id = ?', [propertyId]),
    all('SELECT id, tenant_id, billing_month, rent_amount, total_amount FROM invoices WHERE property_id = ? AND billing_month >= ? AND billing_month <= ?', [propertyId, from, to]),
    all("SELECT billing_month, description, amount, type, is_deductible FROM transcript_items WHERE property_id = ? AND billing_month >= ? AND billing_month <= ?", [propertyId, `${year}-01`, o.month]),
    all('SELECT t.rent_amount, t.is_active, t.is_restricted FROM tenants t JOIN properties p ON p.id = t.property_id WHERE p.user_id = ?', [userId]),
    all('SELECT i.rent_amount, i.amount_paid FROM invoices i JOIN properties p ON p.id = i.property_id WHERE p.user_id = ? AND i.billing_month >= ? AND i.billing_month <= ?', [userId, `${year}-01`, o.month]),
    all('SELECT COUNT(*) AS n FROM properties WHERE user_id = ?', [userId]),
  ]);
  // payments for those invoices, in chunks (SQLite limits the number of parameters)
  const ids = invoices.map((i) => Number(i.id));
  const payments: Row[] = [];
  for (let k = 0; k < ids.length; k += 400) {
    const chunk = ids.slice(k, k + 400);
    payments.push(...(await all(`SELECT invoice_id, amount, payment_date FROM payments WHERE invoice_id IN (${chunk.map(() => '?').join(',')})`, chunk)));
  }
  const rows: Rows = {
    property: prop as Rows['property'], tenants: tenants as Rows['tenants'], invoices: invoices as Rows['invoices'], payments: payments as Rows['payments'],
    items: items as Rows['items'], allTenants: allTenants as Rows['allTenants'], yearInvoices: yearInvoices as Rows['yearInvoices'], propertyCount: Number(props[0]?.n ?? 1),
  };
  return mapRows(rows, o);
}
