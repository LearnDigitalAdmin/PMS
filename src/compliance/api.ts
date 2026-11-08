// Callables for compliance reports (PAY functions crQuote / crOrder / crCheckout / crStatus / crList). The server decides every price.
import { httpsCallable } from 'firebase/functions';
import { functions } from '../services/database/FirebaseSync';
import type { ReportKind } from './mapRows';

export type OrderState = 'payment_required' | 'payment_pending' | 'paid' | 'generating' | 'ready' | 'failed' | 'expired';
export interface Quote { propertyId: string; period: string; tier: string; freeIncluded: boolean; freeUsedThisMonth: number; priceKes: number; listPriceKes: number }
export interface OrderView {
  orderId: string; propertyId: string; month: string; kind: ReportKind; title: string; state: OrderState; priceKes: number; entitled: boolean;
  createdAt: string | null; readyAt: string | null; error: { code: string; message: string } | null; message?: string; url?: string; urlExpiresAt?: string; fileName?: string;
}

async function call<Res>(name: string, data: object): Promise<Res> {
  try {
    return (await httpsCallable<object, Res>(functions, name)(data)).data;
  } catch (e) {
    const err = e as { message?: string; code?: string };
    const message = typeof err.message === 'string' && err.message && !/^internal$/i.test(err.message) ? err.message : 'Something went wrong. Check your connection and try again.';
    throw new Error(message);
  }
}

export const complianceApi = {
  quote: (propertyId: string) => call<Quote>('crQuote', { propertyId }),
  order: (p: { propertyId: string; month: string; kind: ReportKind; input: unknown }) => call<OrderView>('crOrder', p),
  checkout: (orderId: string, phone?: string) => call<OrderView>('crCheckout', { orderId, phone }),
  status: (orderId: string) => call<OrderView>('crStatus', { orderId }),
  list: (propertyId?: string) => call<{ items: OrderView[] }>('crList', { propertyId }),
};
