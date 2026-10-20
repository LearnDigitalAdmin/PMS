/**
 * One definition of an invoice's payment status, used by every screen.
 *   paid    — fully paid (`isPaid`, which is only ever set once amountPaid covers the total)
 *   partial — something paid, a balance remains (it stays due: it is reminded when overdue like an unpaid invoice)
 *   unpaid  — nothing paid yet
 */
export type InvoiceStatus = 'paid' | 'partial' | 'unpaid';

export interface InvoiceLike { isPaid?: boolean; amountPaid?: number; totalAmount?: number; dueDate?: string | null; createdAt?: string }

export function invoiceStatus(inv: InvoiceLike): InvoiceStatus {
  if (inv.isPaid) return 'paid';
  return (inv.amountPaid || 0) > 0 ? 'partial' : 'unpaid';
}

/** Money still owed on the invoice. */
export const invoiceBalance = (inv: InvoiceLike): number =>
  inv.isPaid ? 0 : Math.max(0, Math.round(((inv.totalAmount || 0) - (inv.amountPaid || 0)) * 100) / 100);

/** Due date passed and a balance remains — true for unpaid AND partial invoices. */
export function isInvoiceOverdue(inv: InvoiceLike, now: Date = new Date()): boolean {
  if (invoiceStatus(inv) === 'paid') return false;
  return new Date(inv.dueDate || inv.createdAt || now) < now;
}

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = { paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid' };
