import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, FileCheck2, Loader2, Smartphone } from 'lucide-react';
import { useAuth } from '../../components/auh/AuthWrapper';
import PageHeader from '../../components/ui/PageHeader';
import { database } from '../../services/database/Database';
import { checkSafaricomPhone } from '../../utils/safaricom';
import { openDownload } from '../../watch/download';
import { complianceApi, type OrderView, type Quote } from '../../compliance/api';
import { buildReportInput } from '../../compliance/buildInput';
import { defaultReportMonth, recentMonths, type ReportKind } from '../../compliance/mapRows';

const KINDS: { id: ReportKind; title: string; blurb: string }[] = [
  { id: 'mri_monthly', title: 'MRI working paper', blurb: 'The month’s rent received, agent commission, final rental income, the 7.5% MRI and the 288,000 band test. Ready to file on iTax by the 20th.' },
  { id: 'annual_summary', title: 'Annual rental income summary', blurb: 'Month by month for the year to date, with the annual band test and totals.' },
];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const kes = (n: number) => `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const POLL_MS = 3000, POLL_MAX_MS = 120_000;
const field = 'w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-ink';

interface Prop { id: number; name: string }

const ComplianceReports: React.FC = () => {
  const { user } = useAuth();
  const [props, setProps] = useState<Prop[]>([]);
  const [propertyId, setPropertyId] = useState<number | null>(null);
  const [month, setMonth] = useState(defaultReportMonth());
  const [kind, setKind] = useState<ReportKind>('mri_monthly');
  const [residential, setResidential] = useState(true);
  const [kraPin, setKraPin] = useState(() => (user ? localStorage.getItem(`plotyangu.kraPin.${user.id}`) ?? '' : ''));
  const [quote, setQuote] = useState<Quote | null>(null);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [phone, setPhone] = useState(() => { const c = checkSafaricomPhone(user?.phone); return c.ok ? c.local : ''; });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<OrderView[]>([]);
  const [online, setOnline] = useState(navigator.onLine);
  const [timedOut, setTimedOut] = useState(false);
  const startedAt = useRef(0);
  const months = useMemo(() => recentMonths(24), []);

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  useEffect(() => {
    if (!user) return;
    void database.getProperties(Number(user.id)).then((list) => { setProps(list.map((p) => ({ id: p.id, name: p.name }))); setPropertyId((cur) => cur ?? list[0]?.id ?? null); });
  }, [user]);

  const loadQuote = useCallback(async () => {
    if (propertyId === null || !online) { setQuote(null); return; }
    try { setQuote(await complianceApi.quote(String(propertyId))); } catch { setQuote(null); }
  }, [propertyId, online]);
  const loadRecent = useCallback(async () => {
    if (propertyId === null || !online) return;
    try { setRecent((await complianceApi.list(String(propertyId))).items); } catch { /* the list is a convenience */ }
  }, [propertyId, online]);
  useEffect(() => { setOrder(null); setError(null); void loadQuote(); void loadRecent(); }, [propertyId, loadQuote, loadRecent]);

  // poll while a payment is pending or the PDF is being made
  const orderId = order?.orderId, orderState = order?.state;
  useEffect(() => {
    if (!orderId || !(orderState === 'payment_pending' || orderState === 'paid' || orderState === 'generating')) return;
    startedAt.current = Date.now(); setTimedOut(false);
    let stop = false;
    const id = window.setInterval(async () => {
      if (Date.now() - startedAt.current > POLL_MAX_MS) { window.clearInterval(id); setTimedOut(true); return; }
      try { const next = await complianceApi.status(orderId); if (!stop) setOrder(next); } catch { /* keep trying */ }
    }, POLL_MS);
    void complianceApi.status(orderId).then((n) => { if (!stop) setOrder(n); }).catch(() => undefined);
    return () => { stop = true; window.clearInterval(id); };
  }, [orderId, orderState]);
  useEffect(() => { if (order?.state === 'ready') { void loadQuote(); void loadRecent(); } }, [order?.state, loadQuote, loadRecent]);

  const start = async () => {
    if (!user || propertyId === null) return;
    setBusy(true); setError(null); setOrder(null);
    try {
      const pin = kraPin.trim().toUpperCase();
      if (pin) localStorage.setItem(`plotyangu.kraPin.${user.id}`, pin);
      const input = await buildReportInput(Number(user.id), propertyId, { kind, month, landlordName: user.name, kraPin: pin || null, residential });
      setOrder(await complianceApi.order({ propertyId: String(propertyId), month, kind, input }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not prepare the report.'); }
    finally { setBusy(false); }
  };
  const checkout = async () => {
    if (!order) return;
    setBusy(true); setError(null);
    try {
      let p: string | undefined;
      if (order.priceKes > 0) { const c = checkSafaricomPhone(phone); if (!c.ok) { setError(c.message); setBusy(false); return; } p = c.local; }
      setOrder(await complianceApi.checkout(order.orderId, p));
    } catch (e) { setError(e instanceof Error ? e.message : 'Checkout failed.'); }
    finally { setBusy(false); }
  };
  const refresh = async () => { if (!order) return; try { setOrder(await complianceApi.status(order.orderId)); setTimedOut(false); startedAt.current = Date.now(); } catch (e) { setError(e instanceof Error ? e.message : 'Try again.'); } };

  const price = order ? order.priceKes : quote?.priceKes ?? null;
  const working = order && (order.state === 'payment_pending' || order.state === 'paid' || order.state === 'generating');

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 pb-28">
      <PageHeader title="Compliance reports" icon={FileCheck2} subtitle="MRI working paper and annual rental income summary, one property at a time" />

      {!online && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">You are offline. Reports are made on our server, so connect to the internet to check out.</p>}
      {props.length === 0 && <p className="rounded-xl border border-dashed border-line p-6 text-center text-ink-muted">Add a property first. Reports are made from its tenants, invoices and payments.</p>}

      {props.length > 0 && (
        <section className="space-y-4 rounded-2xl border border-line bg-surface p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-ink-soft">Property
              <select value={propertyId ?? ''} onChange={(e) => setPropertyId(Number(e.target.value))} className={`${field} mt-1`}>{props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </label>
            <label className="block text-sm text-ink-soft">{kind === 'annual_summary' ? 'Year to month' : 'Month the rent was received'}
              <select value={month} onChange={(e) => setMonth(e.target.value)} className={`${field} mt-1`}>{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>
            </label>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm text-ink-soft">Report</legend>
            {KINDS.map((k) => (
              <label key={k.id} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${kind === k.id ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'border-line'}`}>
                <input type="radio" name="kind" checked={kind === k.id} onChange={() => { setKind(k.id); setOrder(null); }} className="mt-1" />
                <span><span className="block font-semibold text-ink">{k.title}</span><span className="block text-sm text-ink-muted">{k.blurb}</span></span>
              </label>
            ))}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-ink-soft">Your KRA PIN (optional, printed on the report)
              <input value={kraPin} onChange={(e) => setKraPin(e.target.value)} maxLength={20} placeholder="A001234567Z" className={`${field} mt-1`} />
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink-soft"><input type="checkbox" checked={residential} onChange={(e) => setResidential(e.target.checked)} /> This is residential property (MRI covers residential rent only)</label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <p className="text-sm text-ink-soft">
              {price === null ? 'Price shown at checkout.' : price === 0 ? <>Included: <b>1 free report per property each month</b> on your plan.</> : <>Price: <b>{kes(price)}</b> per report{quote && !quote.freeIncluded ? ' (one free report a month comes with Business and above).' : quote?.freeIncluded ? ' (this month’s free report is used).' : '.'}</>}
            </p>
            <button type="button" onClick={start} disabled={busy || !online || propertyId === null || !!working} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Continue to checkout
            </button>
          </div>
        </section>
      )}

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{error}</p>}

      {order && (
        <section className="space-y-3 rounded-2xl border border-line bg-surface p-4" aria-live="polite">
          <h2 className="text-lg font-semibold text-ink">Checkout</h2>
          <p className="text-sm text-ink-soft">{order.title} · {monthLabel(order.month)}</p>
          {order.state === 'payment_required' && (
            <>
              <div className="flex items-baseline justify-between rounded-xl bg-surface-sunken p-3"><span className="text-ink-soft">Total</span><span className="text-xl font-bold text-ink">{order.priceKes === 0 ? 'KES 0 (free)' : kes(order.priceKes)}</span></div>
              {order.priceKes > 0 && (
                <label className="block text-sm text-ink-soft">M-Pesa number to pay from
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="07XX XXX XXX" className={`${field} mt-1`} />
                </label>
              )}
              {order.error && <p className="text-sm text-red-600 dark:text-red-400">{order.error.message}</p>}
              <button type="button" onClick={checkout} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700 disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}{order.priceKes === 0 ? 'Get my free report' : `Pay ${kes(order.priceKes)} with M-Pesa`}
              </button>
              <p className="text-xs text-ink-muted">The report downloads only after checkout is confirmed.</p>
            </>
          )}
          {order.state === 'payment_pending' && <p className="flex items-center gap-2 text-ink"><Loader2 className="h-4 w-4 animate-spin" /> {order.message ?? 'Check your phone and enter your M-Pesa PIN.'}</p>}
          {(order.state === 'paid' || order.state === 'generating') && <p className="flex items-center gap-2 text-ink"><Loader2 className="h-4 w-4 animate-spin" /> Making your report…</p>}
          {timedOut && working && <p className="text-sm text-ink-soft">Still waiting. <button className="font-semibold underline" onClick={() => void refresh()}>Check again</button></p>}
          {order.state === 'ready' && order.url && (
            <div className="space-y-2">
              <p className="flex items-center gap-2 font-medium text-green-700 dark:text-green-400"><CheckCircle2 className="h-5 w-5" /> Your report is ready.</p>
              <button type="button" onClick={() => void openDownload(order.url!)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"><Download className="h-4 w-4" /> Download PDF</button>
              <p className="text-xs text-ink-muted">You can fetch it again for 7 days without paying. Plot Yangu does not file with KRA: use the report to file on iTax.</p>
            </div>
          )}
          {(order.state === 'failed' || order.state === 'expired') && <p className="text-sm text-red-600 dark:text-red-400">{order.error?.message ?? 'This report is no longer available. Start again.'}</p>}
        </section>
      )}

      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-ink">Recent reports for this property</h2>
          {recent.map((r) => (
            <div key={r.orderId} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 text-sm">
              <span className="min-w-0 truncate text-ink">{r.title} · {monthLabel(r.month)}</span>
              {r.state === 'ready' ? <button className="shrink-0 font-semibold text-blue-700 underline dark:text-blue-300" onClick={() => void complianceApi.status(r.orderId).then((o) => { if (o.url) return openDownload(o.url); }).catch((e) => setError(e instanceof Error ? e.message : 'Try again.'))}>Download</button>
                : <span className="shrink-0 text-ink-muted">{r.state === 'expired' ? 'Expired' : r.state.replace('_', ' ')}</span>}
            </div>
          ))}
        </section>
      )}
    </div>
  );
};
export default ComplianceReports;
