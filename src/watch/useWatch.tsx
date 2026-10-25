import { useCallback, useContext } from 'react';
import { Ctx } from './watchContext.ts';
import type { WatchCtx } from './watchContext.ts';
import { toLwError } from './errors.ts';
import { LwError } from './types.ts';
import type { Key } from './i18n.ts';

export function useWatch(): WatchCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWatch must be used inside WatchProvider');
  return v;
}

/** Message for any error thrown by api.ts. */
export function useErrorText() {
  const { t } = useWatch();
  return useCallback((e: unknown, fmtTime: (sec: number) => string): string => {
    const err = e instanceof LwError ? e : toLwError(e);
    if (err.lw === 'LW_OTP_WRONG' && typeof err.attemptsLeft === 'number') return t('err.LW_OTP_WRONG_LEFT', { n: err.attemptsLeft });
    if ((err.lw === 'LW_OTP_COOLDOWN' || err.lw === 'LW_RATE_LIMITED') && err.retryAfterSec) return t(`err.${err.lw}`, { time: fmtTime(err.retryAfterSec) });
    if (err.lw === 'LW_OTP_COOLDOWN' || err.lw === 'LW_RATE_LIMITED') return t(`err.${err.lw}`, { time: '1:00' });
    return t(`err.${err.lw}` as Key);
  }, [t]);
}
