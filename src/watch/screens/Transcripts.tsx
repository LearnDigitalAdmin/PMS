import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, FileText, Smartphone } from 'lucide-react';
import { api } from '../api.ts';
import type { SnapshotState } from '../useSnapshot.ts';
import type { Quota, TranscriptRequest } from '../types.ts';
import { Button, Card, ErrorBox, InlineError, SectionTitle, Skeleton, Spinner } from '../components/ui.tsx';
import { MonthPicker } from '../components/MonthPicker.tsx';
import { OtpStep } from '../components/OtpStep.tsx';
import { useErrorText, useWatch } from '../useWatch.tsx';
import { checkSafaricomPhone } from '../../utils/safaricom';
import { dateTimeLabel, formatCountdown, kesLabel, monthLabel, nairobiMonth } from '../format.ts';
import { canRedownload, pollDecision, POLL_INTERVAL_MS, progressPct, shouldPoll, uiStep } from '../transcriptFlow.ts';
import { openDownload } from '../download.ts';

/** Guided flow (contract section 9): OTP to the owner phone -> free download OR KES price by M-Pesa -> download. */
export default function Transcripts({ data, ownerId, signedPhone }: { data: SnapshotState; ownerId: string; signedPhone: string | null }) {
  const { t, lang } = useWatch();
  const errText = useErrorText();
  const snapMonths = data.snapshot?.months;
  const months = useMemo(() => snapMonths ?? [], [snapMonths]);
  const [month, setMonth] = useState<string>(() => (months.includes(nairobiMonth()) ? nairobiMonth() : months[0] ?? nairobiMonth()));
  const [quota, setQuota] = useState<Quota | null>(null);
  const [quotaErr, setQuotaErr] = useState<string | null>(null);
  const [req, setReq] = useState<TranscriptRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<TranscriptRequest[] | null>(null);
  const [phone, setPhone] = useState(() => { const c = checkSafaricomPhone(signedPhone); return c.ok ? c.local : ''; });
  const [timedOut, setTimedOut] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

  useEffect(() => { if (months.length && !months.includes(month)) setMonth(months[0]); }, [months, month]);

  const loadQuota = useCallback(async () => {
    setQuotaErr(null);
    try { setQuota(await api.transcriptQuota(ownerId)); } catch (e) { setQuotaErr(errText(e, formatCountdown)); }
  }, [ownerId, errText]);
  const loadRecent = useCallback(async () => {
    try { setRecent((await api.transcriptList(ownerId)).items); } catch { setRecent((r) => r ?? []); }
  }, [ownerId]);
  useEffect(() => { setReq(null); setError(null); setQuota(null); setRecent(null); void loadQuota(); void loadRecent(); }, [ownerId, loadQuota, loadRecent]);

  // Poll while paying / generating: every 3 s, payment up to 90 s, then offer a manual check.
  const reqId = req?.requestId; const reqState = req?.state;
  useEffect(() => {
    if (!req || !shouldPoll(req)) return;
    startedAt.current = Date.now(); setTimedOut(false); setElapsed(0);
    let stop = false;
    const id = window.setInterval(async () => {
      const now = Date.now();
      setElapsed(now - startedAt.current);
      if (pollDecision(req, startedAt.current, now) === 'timeout') { window.clearInterval(id); setTimedOut(true); return; }
      try { const next = await api.transcriptStatus(req.requestId); if (!stop) setReq(next); } catch { /* keep polling; the user can retry */ }
    }, POLL_INTERVAL_MS);
    return () => { stop = true; window.clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqId, reqState]);

  useEffect(() => { if (req?.state === 'ready') { void loadQuota(); void loadRecent(); } }, [req?.state, loadQuota, loadRecent]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(errText(e, formatCountdown)); } finally { setBusy(false); }
  };

  const start = () => run(async () => { setTimedOut(false); setReq(await api.transcriptStart(ownerId, month, lang)); });
  const payClick = async () => {
    const c = checkSafaricomPhone(phone);
    if (!c.ok) { setError(t('auth.err.invalid_number')); return; }
    setBusy(true); setError(null);
    try { setReq(await api.transcriptPay(req!.requestId, c.e164)); } catch (e) { setError(errText(e, formatCountdown)); } finally { setBusy(false); }
  };
  const check = () => run(async () => { setTimedOut(false); setReq(await api.transcriptStatus(req!.requestId)); });
  const redownload = (r: TranscriptRequest) => run(async () => {
    const fresh = await api.transcriptStatus(r.requestId);
    if (fresh.state === 'ready' && fresh.url) await openDownload(fresh.url); else { await loadRecent(); }
  });

  const step = uiStep(req);
  const price = req ? kesLabel(req.priceKes) : '';
  const quotaLabel = quota ? (quota.nextPriceKes === 0 ? t('tr.quota.free', { n: Math.max(0, quota.freeLimit - quota.freeUsed) }) : t('tr.quota.paid', { price: kesLabel(quota.nextPriceKes) })) : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-ink">{t('tr.title')}</h1>
        <p className="text-sm text-ink-muted">{t('tr.subtitle')}</p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <MonthPicker months={months} value={month} onChange={(m) => { setMonth(m); }} label={t('tr.pickMonth')} />
          {quotaLabel ? <span className={`rounded-full px-3 py-1 text-xs font-semibold ${quota?.nextPriceKes === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{quotaLabel}</span>
            : quotaErr ? null : <Skeleton className="h-6 w-28" />}
        </div>
        {quotaErr ? <div className="mt-3"><ErrorBox message={quotaErr} onRetry={loadQuota} retryLabel={t('common.retry')} /></div> : null}

        <div className="mt-4">
          {step === 'start' ? (
            <Button onClick={start} busy={busy} disabled={!months.length} className="w-full"><FileText className="h-4 w-4" aria-hidden="true" />{t('tr.start')} · {monthLabel(month, lang)}</Button>
          ) : null}

          {step === 'otp' && req ? (
            <div>
              <h3 className="mb-1 text-sm font-semibold text-ink">{t('tr.step.otp')}</h3>
              <OtpStep intro={t('tr.otpBody', { phone: req.sentTo ?? '' })} initialResendSec={req.resendInSec ?? 60}
                verifyLabel={t('auth.verify')}
                onResend={() => api.transcriptResendOtp(req.requestId)}
                onVerify={async (code) => { setReq(await api.transcriptVerifyOtp(req.requestId, code)); }} />
            </div>
          ) : null}

          {step === 'pay' && req ? (
            <div>
              <h3 className="text-sm font-semibold text-ink">{t('tr.payTitle', { price })}</h3>
              <p className="mb-3 mt-1 text-sm text-ink-muted">{t('tr.payBody')}</p>
              <label htmlFor="lw-mpesa" className="mb-1 block text-sm font-medium text-ink-soft">{t('tr.mpesaPhone')}</label>
              <div className="relative">
                <Smartphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
                <input id="lw-mpesa" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setError(null); }}
                  placeholder="0712 345 678"
                  className="w-full rounded-xl border border-line-strong bg-surface py-3 pl-10 pr-3 text-base text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
              </div>
              <Button onClick={payClick} busy={busy} disabled={!phone.trim()} className="mt-3 w-full">{t('tr.payNow', { price })}</Button>
            </div>
          ) : null}

          {step === 'waiting_payment' || step === 'working' ? (
            <div role="status" aria-live="polite" className="py-2">
              <div className="flex items-center gap-2 text-sm font-medium text-ink"><Spinner />{step === 'waiting_payment' ? (req?.message ?? t('tr.waitingPay')) : t('tr.preparing')}</div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPct(req, elapsed)}>
                <div className="h-full rounded-full bg-brand-600 transition-all duration-700" style={{ width: `${progressPct(req, elapsed)}%` }} />
              </div>
              {timedOut ? (
                <div className="mt-3">
                  <p className="mb-2 text-sm text-ink-muted">{t('tr.waitingLong')}</p>
                  <Button variant="secondary" onClick={check} busy={busy}>{t('tr.checkStatus')}</Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 'ready' && req ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-ink">{t('tr.ready')}</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">
                {req.url ? <a href={req.url} target="_blank" rel="noopener noreferrer" onClick={(e) => { e.preventDefault(); void openDownload(req.url!); }}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700"><Download className="h-4 w-4" aria-hidden="true" />{t('tr.download')}</a> : null}
                <Button variant="secondary" onClick={() => { setReq(null); setTimedOut(false); }}>{t('tr.again')}</Button>
              </div>
            </div>
          ) : null}

          {step === 'failed' || step === 'expired' ? (
            <div>
              <ErrorBox message={step === 'expired' ? t('tr.expired') : t('tr.failed')} />
              <Button variant="secondary" onClick={() => { setReq(null); setError(null); }} className="mt-3">{t('tr.again')}</Button>
            </div>
          ) : null}

          <InlineError message={error} />
        </div>
      </Card>

      <Card>
        <SectionTitle>{t('tr.recent')}</SectionTitle>
        {recent === null ? <Skeleton className="h-12 w-full" /> : recent.length === 0 ? <p className="text-sm text-ink-subtle">{t('tr.recentEmpty')}</p> : (
          <ul className="divide-y divide-line-soft">
            {recent.map((r) => (
              <li key={r.requestId} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{monthLabel(r.month, lang)}</p>
                  <p className="truncate text-xs text-ink-subtle">
                    {t(`tr.state.${r.state}`)} · {r.priceKes === 0 ? t('tr.free') : kesLabel(r.priceKes)}
                    {canRedownload(r, Date.now()) ? ` · ${t('tr.expiresAt', { time: dateTimeLabel(r.expiresAt, lang) })}` : ''}
                  </p>
                </div>
                {canRedownload(r, Date.now()) ? <Button variant="ghost" onClick={() => redownload(r)} disabled={busy} className="shrink-0 px-3"><Download className="h-4 w-4" aria-hidden="true" />{t('tr.downloadAgain')}</Button> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
