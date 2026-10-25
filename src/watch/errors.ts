// Map Firebase callable errors to Watch errors. Pure (no firebase import) so it can be unit-tested.
import { LwError, SignInError } from './types.ts';
import type { LwCode } from './types.ts';
import { parseWaitSeconds } from './format.ts';

interface FnErrorLike { code?: unknown; message?: unknown; details?: unknown }

const LW_CODES: ReadonlySet<string> = new Set<LwCode>([
  'LW_BAD_OWNER_ID', 'LW_NOT_FOUND', 'LW_RATE_LIMITED', 'LW_NO_PHONE_ON_FILE', 'LW_OTP_COOLDOWN', 'LW_OTP_WRONG', 'LW_OTP_EXPIRED',
  'LW_OTP_LOCKED', 'LW_SMS_FAILED', 'LW_LOCKED', 'LW_CONNECTION_LIMIT', 'LW_BAD_MONTH', 'LW_PAYMENT_FAILED', 'LW_NOT_ALLOWED', 'LW_UNAVAILABLE',
]);

const shortCode = (e: FnErrorLike): string => String(e.code ?? '').replace(/^functions\//, '');

function isNetwork(e: FnErrorLike, online: boolean): boolean {
  const c = shortCode(e);
  return !online || c === 'unavailable' || c === 'internal' && /network|fetch|failed to/i.test(String(e.message ?? ''));
}

/** Callables throw HttpsError with details = { lw, retryAfterSec?, attemptsLeft? }. Branch on `lw`, never on message text. */
export function toLwError(err: unknown, online: boolean = typeof navigator === 'undefined' ? true : navigator.onLine): LwError {
  if (err instanceof LwError) return err;
  const e = (err ?? {}) as FnErrorLike;
  const d = (e.details && typeof e.details === 'object' ? e.details : {}) as { lw?: unknown; retryAfterSec?: unknown; attemptsLeft?: unknown };
  const extra = {
    retryAfterSec: typeof d.retryAfterSec === 'number' ? d.retryAfterSec : undefined,
    attemptsLeft: typeof d.attemptsLeft === 'number' ? d.attemptsLeft : undefined,
  };
  if (typeof d.lw === 'string' && LW_CODES.has(d.lw)) return new LwError(d.lw as LwCode, extra);
  if (isNetwork(e, online)) return new LwError('LW_NETWORK');
  return new LwError('LW_UNAVAILABLE', extra);
}

/** sendLoginOtp / verifyLoginOtp use plain Firebase error codes (contract section 3). */
export function toSignInError(err: unknown, online: boolean = typeof navigator === 'undefined' ? true : navigator.onLine): SignInError {
  if (err instanceof SignInError) return err;
  const e = (err ?? {}) as FnErrorLike;
  switch (shortCode(e)) {
    case 'invalid-argument': return new SignInError('invalid_number');
    case 'resource-exhausted': {
      const d = (e.details && typeof e.details === 'object' ? e.details : {}) as { retryAfterSec?: unknown };
      return new SignInError('cooldown', typeof d.retryAfterSec === 'number' ? d.retryAfterSec : parseWaitSeconds(String(e.message ?? '')));
    }
    case 'permission-denied': return new SignInError('wrong_code');
    case 'deadline-exceeded': return new SignInError('expired');
    case 'failed-precondition': return new SignInError('no_code');
    case 'unavailable': return online ? new SignInError('sms_failed') : new SignInError('network');
    default: return new SignInError(online ? 'unknown' : 'network');
  }
}
