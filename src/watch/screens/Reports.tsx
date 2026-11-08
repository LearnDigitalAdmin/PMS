import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, FileCheck2, Smartphone } from 'lucide-react';
import { Button, Card, InlineError, Spinner } from '../components/ui.tsx';
import { MonthPicker } from '../components/MonthPicker.tsx';
import { useWatch } from '../useWatch.tsx';
import { checkSafaricomPhone } from '../../utils/safaricom';
import { kesLabel, monthLabel } from '../format.ts';
import { openDownload } from '../download.ts';
import { defaultMonth, reportMonths, reportsApi, type ReportKind, type ReportOrder, type ReportQuote } from '../reports.ts';

const POLL_MS = 3000, POLL_MAX_MS = 120_000;
const KINDS: ReportKind[] = ['mri_monthly', 'annual_summary'];

/** Compliance reports for an owner: checkout first (free allowance or M-Pesa), download only after it is confirmed. */
export default function Reports({ ownerId, signedPhone }: { ownerId: string; signedPhone: string | null }) {
  const { t, lang } = useWatch();
  const months = useMemo(() => reportMonths(24), []);
  const [month, setMonth] = useState(defaultMonth());
  const [kind, setKind] = useState<ReportKind>('mri_monthly');
  const [quote, setQuote] = useState<ReportQuote | null>(null);
  const [order, setOrder] = useState<ReportOrder | null>(null);
  const [recent, setRecent] = useState<ReportOrder[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [phone, setPhone] = useState(() => { const c = checkSafaricomPhone(signedPhone); return c.ok ? c.local : ''; });
  const startedAt = useRef(0);

  const load = useCallback(async () => {
    try { setQuote(await reportsApi.quote(ownerId)); } catch { setQuote(null); }
    try { setRecent((await reportsApi.list(ownerId)).items); } catch { /* convenience only */ }
  }, [ownerId]);
  useEffect(() => { setOrder(null); setError(null); void load(); }, [ownerId, load]);

  const orderId = order?.orderId, orderState = order?.state;
  useEffect(() => {
    if (!orderId || !(orderState === 'payment_pending' || orderState === 'paid' || orderState === 'generating')) return;
    startedAt.current = Date.now(); setTimedOut(false);
    let stop = false;
    const id = window.setInterval(async () => {
      if (Date.now() - startedAt.current > POLL_MAX_MS) { window.clearInterval(id); setTimedOut(true); return; }
      try { const next = await reportsApi.status(ownerId, orderId); if (!stop) setOrder(next); } catch { /* keep trying */ }
    }, POLL_MS);
    void reportsApi.status(ownerId, orderId).then((n) => { if (!stop) setOrder(n); }).catch(() => undefined);
    return () => { stop = true; window.clearInterval(id); };
  }, [ownerId, orderId, orderState]);
  useEffect(() => { if (order?.state === 'ready') void load(); }, [order?.state, load]);

  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(null); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : t('common.retry')); } finally { setBusy(false); } };
  const start = () => run(async () => { setOrder(await reportsApi.order(ownerId, month, kind)); });
  const checkout = () => run(async () => {
    if (!order) return;
    let p: string | undefined;
    if (order.priceKes > 0) { const c = checkSafaricomPhone(phone); if (!c.ok) throw new Error(t('auth.err.invalid_number')); p = c.local; }
    setOrder(await reportsApi.checkout(ownerId, order.orderId, p));
  });
  const working = order && (order.state === 'payment_pending' || order.state === 'paid' || order.state === 'generating');
  const priceNow = quote ? (quote.priceKes === 0 ? t('rp.price.free') : t('rp.price.paid', { price: kesLabel(quote.priceKes) })) : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-ink">{t('rp.title')}</h1>
        <p className="text-sm text-ink-muted">{t('rp.subtitle')}</p>
      </div>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <MonthPicker months={months} value={month} onChange={(m) => { setMonth(m); setOrder(null); }} label={t('rp.pickMonth')} />
          {priceNow ? <span className={`rounded-full px-3 py-1 text-xs font-semibold ${quote?.priceKes === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{priceNow}</span> : null}
        </div>
        <fieldset className="mt-3 flex flex-wrap gap-3">
          {KINDS.map((k) => (
            <label key={k} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-medium ${kind === k ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line text-ink-soft'}`}>
              <input type="radio" name="rp-kind" checked={kind === k} onChange={() => { setKind(k); setOrder(null); }} />{t(`rp.kind.${k}` as 'rp.kind.mri_monthly')}
            </label>
          ))}
        </fieldset>
        <Button onClick={start} busy={busy && !order} disabled={!!working} className="mt-4 w-full"><FileCheck2 className="h-4 w-4" aria-hidden="true" />{t('rp.start')} · {monthLabel(month, lang)}</Button>
      </Card>
      <InlineError message={error} />

      {order ? (
        <Card>
          <h2 className="text-sm font-semibold text-ink">{t('rp.checkout')}</h2>
          <p className="text-xs text-ink-subtle">{order.title} · {monthLabel(order.month, lang)}</p>
          {order.state === 'payment_required' ? (
            <div className="mt-3 space-y-3">
              <div className="flex items-baseline justify-between rounded-xl bg-surface-sunken p-3"><span className="text-sm text-ink-soft">{t('rp.total')}</span><span className="text-lg font-bold text-ink">{order.priceKes === 0 ? t('rp.free') : kesLabel(order.priceKes)}</span></div>
              {order.priceKes > 0 ? (
                <label className="block text-sm text-ink-soft">{t('rp.phone')}
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="07XX XXX XXX" className="mt-1 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-ink" />
                </label>
              ) : null}
              {order.error ? <p className="text-sm text-red-600">{order.error.message}</p> : null}
              <Button onClick={checkout} busy={busy} className="w-full"><Smartphone className="h-4 w-4" aria-hidden="true" />{order.priceKes === 0 ? t('rp.payFree') : t('rp.pay', { price: kesLabel(order.priceKes) })}</Button>
            </div>
          ) : null}
          {order.state === 'payment_pending' ? <p className="mt-3 flex items-center gap-2 text-sm text-ink"><Spinner />{t('rp.pending')}</p> : null}
          {order.state === 'paid' || order.state === 'generating' ? <p className="mt-3 flex items-center gap-2 text-sm text-ink"><Spinner />{t('rp.making')}</p> : null}
          {timedOut && working ? <p className="mt-2 text-sm text-ink-soft">{t('rp.waiting')} <button className="font-semibold underline" onClick={() => { setTimedOut(false); void reportsApi.status(ownerId, order.orderId).then(setOrder).catch(() => undefined); }}>{t('rp.check')}</button></p> : null}
          {order.state === 'ready' && order.url ? (
            <div className="mt-3 space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-5 w-5" aria-hidden="true" />{t('rp.ready')}</p>
              <Button onClick={() => void openDownload(order.url!)}><Download className="h-4 w-4" aria-hidden="true" />{t('rp.download')}</Button>
            </div>
          ) : null}
          {order.state === 'failed' || order.state === 'expired' ? <p className="mt-3 text-sm text-red-600">{order.error?.message ?? t('rp.expired')}</p> : null}
          <p className="mt-3 text-xs text-ink-subtle">{t('rp.note')}</p>
        </Card>
      ) : null}

      {recent.length ? (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-ink">{t('rp.recent')}</h2>
          <ul className="divide-y divide-line">
            {recent.map((r) => (
              <li key={r.orderId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate text-ink">{r.title} · {monthLabel(r.month, lang)}</span>
                {r.state === 'ready'
                  ? <button className="shrink-0 font-semibold text-brand-700 underline" onClick={() => void reportsApi.status(ownerId, r.orderId).then((o) => { if (o.url) return openDownload(o.url); }).catch((e) => setError(e instanceof Error ? e.message : t('common.retry')))}>{t('rp.download')}</button>
                  : <span className="shrink-0 text-ink-subtle">{r.state === 'expired' ? t('rp.expired') : r.state.replace('_', ' ')}</span>}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
