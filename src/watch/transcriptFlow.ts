// Transcript flow (contract section 9): pure helpers that turn a server TranscriptRequest into a UI step.
import type { TranscriptRequest } from './types.ts';

export type UiStep = 'start' | 'otp' | 'working' | 'pay' | 'waiting_payment' | 'ready' | 'failed' | 'expired';

export const POLL_INTERVAL_MS = 3000;
export const PAYMENT_POLL_TIMEOUT_MS = 90_000;
export const GENERATE_POLL_TIMEOUT_MS = 120_000;

export function uiStep(req: TranscriptRequest | null): UiStep {
  if (!req) return 'start';
  switch (req.state) {
    case 'otp_pending': return 'otp';
    case 'payment_required': return 'pay';
    case 'payment_pending': return 'waiting_payment';
    case 'paid':
    case 'generating': return 'working';
    case 'ready': return 'ready';
    case 'expired': return 'expired';
    default: return 'failed';
  }
}

/** The client polls lwTranscriptStatus while the server is waiting for M-Pesa or generating. */
export function shouldPoll(req: TranscriptRequest | null): boolean {
  return !!req && (req.state === 'payment_pending' || req.state === 'paid' || req.state === 'generating');
}

export function pollTimeoutMs(req: TranscriptRequest): number {
  return req.state === 'payment_pending' ? PAYMENT_POLL_TIMEOUT_MS : GENERATE_POLL_TIMEOUT_MS;
}

/** 'poll' = ask again, 'timeout' = stop and offer a manual refresh. */
export function pollDecision(req: TranscriptRequest, startedAt: number, now: number): 'poll' | 'timeout' | 'stop' {
  if (!shouldPoll(req)) return 'stop';
  return now - startedAt >= pollTimeoutMs(req) ? 'timeout' : 'poll';
}

/** Whole-percent progress shown while paying/generating (indicative only). */
export function progressPct(req: TranscriptRequest | null, elapsedMs: number): number {
  if (!req) return 0;
  const base = req.state === 'payment_pending' ? 25 : req.state === 'paid' ? 70 : req.state === 'generating' ? 85 : 100;
  const span = req.state === 'payment_pending' ? 40 : 14;
  const f = Math.min(1, elapsedMs / (req.state === 'payment_pending' ? PAYMENT_POLL_TIMEOUT_MS : 20_000));
  return Math.min(99, Math.round(base + span * f));
}

/** A finished transcript can be fetched again only while `expiresAt` is in the future. */
export function canRedownload(req: TranscriptRequest, now: number): boolean {
  if (req.state !== 'ready') return false;
  if (!req.expiresAt) return false;
  const t = Date.parse(req.expiresAt);
  return !Number.isNaN(t) && t > now;
}
