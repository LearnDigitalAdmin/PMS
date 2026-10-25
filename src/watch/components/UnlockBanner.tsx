import { useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import type { Snapshot } from '../types.ts';
import { Button, Sheet } from './ui.tsx';
import { OtpStep } from './OtpStep.tsx';
import { api } from '../api.ts';
import { useErrorText, useWatch } from '../useWatch.tsx';
import { dateTimeLabel, formatCountdown } from '../format.ts';

/** Unlock flow (lwUnlockSendOtp / lwUnlockVerifyOtp). The server decides the mask; we only reflect it. */
export function UnlockSheet({ ownerId, onClose }: { ownerId: string; onClose: () => void }) {
  const { t, lang, afterUnlock } = useWatch();
  const errText = useErrorText();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const send = async () => {
    setSending(true); setErr(null);
    try { const r = await api.unlockSendOtp(ownerId, lang); setSentTo(r.sentTo ?? ''); }
    catch (e) { setErr(errText(e, formatCountdown)); }
    finally { setSending(false); }
  };

  return (
    <Sheet title={t('unlock.title')} onClose={onClose}>
      {done ? (
        <div className="py-4 text-center text-sm text-ink-soft" role="status">{t('unlock.done')}</div>
      ) : sentTo === null ? (
        <div>
          <p className="mb-4 text-sm text-ink-muted">{t('unlock.body')}</p>
          {err ? <p role="alert" className="mb-3 text-sm text-red-600">{err}</p> : null}
          <Button onClick={send} busy={sending} className="w-full"><Unlock className="h-4 w-4" aria-hidden="true" />{t('unlock.send')}</Button>
        </div>
      ) : (
        <OtpStep
          intro={t('auth.codeSent', { phone: sentTo })}
          onResend={() => api.unlockSendOtp(ownerId, lang)}
          onVerify={async (code) => { await api.unlockVerifyOtp(ownerId, code); setDone(true); await afterUnlock(); onClose(); }}
        />
      )}
    </Sheet>
  );
}

/** Obvious "Unlock details" action when the data is masked and the owner has a phone on file. */
export function UnlockBanner({ mask, ownerId }: { mask: Snapshot['mask']; ownerId: string }) {
  const { t, lang } = useWatch();
  const [open, setOpen] = useState(false);
  if (mask.level === 'open') {
    const text = mask.reason === 'otp' ? t('mask.reason.otp', { time: dateTimeLabel(mask.unlockedUntil, lang) }) : t('mask.reason.auth_phone_match');
    return (
      <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800" role="status">
        <Unlock className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{mask.reason === 'otp' || mask.reason === 'auth_phone_match' ? text : t(`mask.reason.${mask.reason}`)}</span>
      </div>
    );
  }
  return (
    <>
      <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2 text-sm text-amber-900">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{mask.canUnlock ? (mask.level === 'full' ? t('mask.banner.full') : t('mask.banner.tenant')) : t('mask.noPhone')}</span>
        </div>
        {mask.canUnlock ? <Button onClick={() => setOpen(true)} className="shrink-0"><Unlock className="h-4 w-4" aria-hidden="true" />{t('mask.unlock')}</Button> : null}
      </div>
      {open ? <UnlockSheet ownerId={ownerId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
