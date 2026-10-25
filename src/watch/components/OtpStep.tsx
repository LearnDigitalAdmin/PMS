import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button, InlineError } from './ui.tsx';
import { OtpInput } from './OtpInput.tsx';
import { useCountdown } from '../useCountdown.ts';
import { formatCountdown } from '../format.ts';
import { useErrorText, useWatch } from '../useWatch.tsx';
import { LwError } from '../types.ts';
import type { OtpSent } from '../types.ts';

/** Shared "enter the code + resend with countdown" block (unlock and transcript downloads). */
export function OtpStep({ intro, initialResendSec = 60, onVerify, onResend, verifyLabel }: {
  intro: string; initialResendSec?: number; verifyLabel?: string;
  onVerify: (code: string) => Promise<void>;
  onResend: () => Promise<OtpSent>;
}) {
  const { t } = useWatch();
  const errText = useErrorText();
  const cd = useCountdown(initialResendSec);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = async () => {
    if (code.length !== 6 || busy) return;
    setBusy(true); setError(null);
    try { await onVerify(code); } catch (e) { setError(errText(e, formatCountdown)); setCode(''); } finally { setBusy(false); }
  };
  const resend = async () => {
    if (!cd.ready || sending) return;
    setSending(true); setError(null);
    try { const r = await onResend(); cd.start(r.resendInSec); setCode(''); }
    catch (e) {
      if (e instanceof LwError && e.lw === 'LW_OTP_COOLDOWN' && e.retryAfterSec) cd.start(e.retryAfterSec);
      setError(errText(e, formatCountdown));
    } finally { setSending(false); }
  };

  return (
    <div>
      <p className="mb-3 text-sm text-ink-muted">{intro}</p>
      <OtpInput value={code} onChange={setCode} onSubmit={verify} label={t('auth.codeLabel')} disabled={busy} describedBy="lw-otp-error" />
      <div id="lw-otp-error"><InlineError message={error} /></div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button onClick={verify} busy={busy} disabled={code.length !== 6} className="flex-1">{verifyLabel ?? t('auth.verify')}</Button>
        <Button variant="secondary" onClick={resend} busy={sending} disabled={!cd.ready} className="flex-1">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          <span aria-live="polite">{cd.ready ? t('auth.resend') : t('auth.resendIn', { time: formatCountdown(cd.left) })}</span>
        </Button>
      </div>
    </div>
  );
}
