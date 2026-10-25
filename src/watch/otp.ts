// OTP resend cool-down: pure helpers (the hook lives in components/useCountdown.ts).
export const DEFAULT_RESEND_SEC = 60;

/** Epoch ms at which resend becomes possible again. */
export function cooldownEndsAt(now: number, resendInSec: number | undefined): number {
  const sec = typeof resendInSec === 'number' && resendInSec > 0 ? resendInSec : DEFAULT_RESEND_SEC;
  return now + sec * 1000;
}

export function canResend(endsAt: number, now: number): boolean { return now >= endsAt; }
