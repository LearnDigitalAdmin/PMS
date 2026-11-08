// Compliance reports for owners (PAY callables crQuote / crOrder / crCheckout / crStatus / crList, channel "watch"). The owner ID fixes the
// property; the server checks the connection and the phone unlock, and sets the price.
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase.ts';

export type ReportKind = 'mri_monthly' | 'annual_summary';
export type ReportState = 'payment_required' | 'payment_pending' | 'paid' | 'generating' | 'ready' | 'failed' | 'expired';
export interface ReportQuote { period: string; freeIncluded: boolean; freeUsedThisMonth: number; priceKes: number; listPriceKes: number }
export interface ReportOrder {
  orderId: string; month: string; kind: ReportKind; title: string; state: ReportState; priceKes: number; entitled: boolean;
  createdAt: string | null; error: { code: string; message: string } | null; message?: string; url?: string; urlExpiresAt?: string;
}

async function call<Res>(name: string, ownerId: string, data: object = {}): Promise<Res> {
  try {
    return (await httpsCallable<object, Res>(functions, name)({ channel: 'watch', ownerId, ...data })).data;
  } catch (e) {
    const m = (e as { message?: unknown }).message;
    throw new Error(typeof m === 'string' && m && !/^internal$/i.test(m) ? m : 'Something went wrong. Check your connection and try again.');
  }
}

export const reportsApi = {
  quote: (ownerId: string) => call<ReportQuote>('crQuote', ownerId),
  order: (ownerId: string, month: string, kind: ReportKind) => call<ReportOrder>('crOrder', ownerId, { month, kind }),
  checkout: (ownerId: string, orderId: string, phone?: string) => call<ReportOrder>('crCheckout', ownerId, { orderId, phone }),
  status: (ownerId: string, orderId: string) => call<ReportOrder>('crStatus', ownerId, { orderId }),
  list: (ownerId: string) => call<{ items: ReportOrder[] }>('crList', ownerId),
};

/** The last `count` months (YYYY-MM), newest first, by Nairobi time. */
export function reportMonths(count = 18, now = new Date()): string[] {
  const t = new Date(now.getTime() + 3 * 3_600_000);
  let y = t.getUTCFullYear(), m = t.getUTCMonth() + 1;
  const out: string[] = [];
  for (let i = 0; i < count; i++) { out.push(`${y}-${String(m).padStart(2, '0')}`); if (--m === 0) { m = 12; y -= 1; } }
  return out;
}
/** The month whose MRI is due on the 20th of the current month. */
export const defaultMonth = (now = new Date()): string => reportMonths(2, now)[1];
