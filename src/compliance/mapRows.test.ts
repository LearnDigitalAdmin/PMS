import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultReportMonth, mapRows, recentMonths, type Rows } from './mapRows.ts';

const rows = (): Rows => ({
  property: { id: 3, name: 'Block A', address: 'Ruiru', agent_commission_rate: 8 },
  tenants: [
    { id: 1, unit_number: 'A1', name: 'Amina', rent_amount: 10000, is_active: 1 },
    { id: 2, unit_number: 'A2', name: 'Hidden', rent_amount: 9000, is_active: 1, is_restricted: 1 },
  ],
  invoices: [
    { id: 10, tenant_id: 1, billing_month: '2026-10', rent_amount: 10000, total_amount: 10500 },
    { id: 11, tenant_id: 2, billing_month: '2026-10', rent_amount: 9000, total_amount: 9000 },
  ],
  payments: [{ invoice_id: 10, amount: 10500, payment_date: '2026-10-03T09:00:00Z' }, { invoice_id: 10, amount: 5, payment_date: '' }],
  items: [
    { billing_month: '2026-10', description: 'Gate repair', amount: 1500.456, type: 'deductible', is_deductible: 1 },
    { billing_month: '2026-10', description: 'Rent', amount: 5000, type: 'rent', is_deductible: 1 },
    { billing_month: '2026-10', description: 'Base rent', amount: 5000, type: 'custom', is_deductible: 1 },
    { billing_month: '2026-10', description: 'Not deductible', amount: 70, type: 'water', is_deductible: 0 },
  ],
  allTenants: [{ rent_amount: 10000, is_active: 1 }, { rent_amount: 5000, is_active: 0 }, { rent_amount: 9000, is_active: 1, is_restricted: 1 }],
  yearInvoices: [{ rent_amount: 10000, amount_paid: 10500 }, { rent_amount: 8000, amount_paid: 3000 }],
  propertyCount: 2,
});
const opts = { kind: 'mri_monthly' as const, month: '2026-10', landlordName: 'Wanjiru', kraPin: null, residential: true };

test('maps the device rows into report records', () => {
  const m = mapRows(rows(), opts);
  assert.deepEqual(m.property, { id: '3', name: 'Block A', address: 'Ruiru', commissionRatePct: 8, managed: true, residential: true });
  assert.deepEqual(m.tenants.map((t) => t.id), ['1']);                        // restricted tenants are never sent
  assert.deepEqual(m.invoices.map((i) => i.id), ['10']);
  assert.deepEqual(m.invoices[0].payments, [{ date: '2026-10-03', amount: 10500 }]);
});
test('base rent never goes in as a bill; only deductible, non-rent items are sent', () => {
  const m = mapRows(rows(), opts);
  assert.deepEqual(m.statementItems, [{ month: '2026-10', description: 'Gate repair', amount: 1500.46 }]);
});
test('portfolio totals cover every property: active tenants x 12, and rent received so far (rent first)', () => {
  const m = mapRows(rows(), opts);
  assert.equal(m.portfolio.annualRentRoll, 120000);
  assert.equal(m.portfolio.ytdReceived, 13000);                              // min(10500, 10000) + min(3000, 8000)
  assert.equal(m.portfolio.propertyCount, 2);
});
test('no agent commission rate means the property is not agent managed', () => {
  const r = rows(); r.property.agent_commission_rate = 0;
  const m = mapRows(r, opts);
  assert.equal(m.property.managed, false); assert.equal(m.property.commissionRatePct, 0);
});
test('default month is the Nairobi month before today; the list is newest first', () => {
  assert.equal(defaultReportMonth(new Date('2026-11-05T10:00:00Z')), '2026-10');
  assert.equal(defaultReportMonth(new Date('2026-01-15T10:00:00Z')), '2025-12');
  assert.equal(defaultReportMonth(new Date('2026-10-31T21:30:00Z')), '2026-10');   // already 1 November in Nairobi
  assert.deepEqual(recentMonths(3, new Date('2026-01-10T00:00:00Z')), ['2026-01', '2025-12', '2025-11']);
});
