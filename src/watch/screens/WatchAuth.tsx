import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, Eye, RefreshCw, Smartphone } from 'lucide-react';
import { api } from '../api.ts';
import { checkSafaricomPhone } from '../../utils/safaricom';
import { Button, InlineError } from '../components/ui.tsx';
import { OtpInput } from '../components/OtpInput.tsx';
import { LangToggle } from '../components/LangToggle.tsx';
import { useCountdown } from '../useCountdown.ts';
import { useWatch } from '../useWatch.tsx';
import { formatCountdown } from '../format.ts';
import { signInErrorKey } from '../i18n.ts';
import { leaveWatchMode } from '../session.ts';
import { toSignInError } from '../errors.ts';

/** Landlord Watch sign-in: Kenyan mobile number -> SMS code -> signInWithCustomToken (done inside api.auth.verifyOtp). */
export default function WatchAuth() {
  const { t } = useWatch();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [raw, setRaw] = useState('');
  const [e164, setE164] = useState('');
  const [local, setLocal] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cd = useCountdown(0);

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    const check = checkSafaricomPhone(step === 'phone' ? raw : e164);
    if (!check.ok) { setError(t('auth.err.invalid_number')); return; }
    setBusy(true); setError(null);
    try {
      const r = await api.auth.sendOtp(check.e164);
      setE164(check.e164); setLocal(check.local); setCode(''); setStep('code'); cd.start(r.resendInSec);
    } catch (err) {
      const se = toSignInError(err);
      if (se.kind === 'cooldown') { setE164(check.e164); setLocal(check.local); setStep('code'); cd.start(se.retryAfterSec ?? 60); }
      setError(t(signInErrorKey(se.kind)));
    } finally { setBusy(false); }
  };

  const verify = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy || code.length !== 6) return;
    setBusy(true); setError(null);
    try { await api.auth.verifyOtp(e164, code); }
    catch (err) { setError(t(signInErrorKey(toSignInError(err).kind))); setCode(''); setBusy(false); }
    // On success the auth listener moves the app on; nothing else to do here.
  };

  return (
    <main className="app-canvas flex min-h-screen flex-col items-center px-4 py-6">
      <div className="mb-4 flex w-full max-w-md justify-end"><LangToggle /></div>
      <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-pop">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 text-white"><Eye className="h-6 w-6" aria-hidden="true" /></span>
          <div>
            <h1 className="text-lg font-bold text-ink">{t('app.name')}</h1>
            <p className="text-xs text-ink-subtle">{t('app.tagline')}</p>
          </div>
        </div>

        <h2 className="text-base font-semibold text-ink">{t('auth.title')}</h2>
        <p className="mb-5 mt-1 text-sm text-ink-muted">{t('auth.subtitle')}</p>

        {step === 'phone' ? (
          <form onSubmit={sendCode} noValidate>
            <label htmlFor="lw-phone" className="mb-1 block text-sm font-medium text-ink-soft">{t('auth.phone')}</label>
            <div className="relative">
              <Smartphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
              <input id="lw-phone" type="tel" inputMode="tel" autoComplete="tel" autoFocus value={raw}
                onChange={(e) => { setRaw(e.target.value); setError(null); }}
                onPaste={(e) => { e.preventDefault(); setRaw(e.clipboardData.getData('text').trim()); setError(null); }}
                aria-describedby="lw-phone-hint lw-auth-error" aria-invalid={!!error}
                placeholder="0712 345 678"
                className="w-full rounded-xl border border-line-strong bg-surface py-3 pl-10 pr-3 text-base text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
            </div>
            <p id="lw-phone-hint" className="mt-1 text-xs text-ink-subtle">{t('auth.phoneHint')}</p>
            <div id="lw-auth-error"><InlineError message={error} /></div>
            <Button type="submit" busy={busy} disabled={!raw.trim()} className="mt-4 w-full">{t('auth.sendCode')}</Button>
          </form>
        ) : (
          <form onSubmit={verify} noValidate>
            <p className="mb-3 text-sm text-ink-muted">{t('auth.codeSent', { phone: local })}</p>
            <OtpInput value={code} onChange={(v) => { setCode(v); setError(null); }} onSubmit={verify} label={t('auth.codeLabel')} disabled={busy} describedBy="lw-auth-error" />
            <div id="lw-auth-error"><InlineError message={error} /></div>
            <Button type="submit" busy={busy} disabled={code.length !== 6} className="mt-4 w-full">{t('auth.verify')}</Button>
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button variant="ghost" onClick={() => void sendCode()} disabled={!cd.ready || busy} className="min-h-10 px-2">
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                <span aria-live="polite">{cd.ready ? t('auth.resend') : t('auth.resendIn', { time: formatCountdown(cd.left) })}</span>
              </Button>
              <button type="button" onClick={() => { setStep('phone'); setError(null); setCode(''); }} className="text-sm font-medium text-ink-subtle underline">{t('auth.changeNumber')}</button>
            </div>
          </form>
        )}

        <p className="mt-5 text-xs text-ink-subtle">{t('auth.noGoogle')}</p>
        <button type="button" onClick={leaveWatchMode} className="mt-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />{t('auth.backToPms')}
        </button>
      </div>
    </main>
  );
}
