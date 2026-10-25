import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { SnapshotState } from '../useSnapshot.ts';
import type { TenantRow } from '../types.ts';
import { Card, Hidden } from '../components/ui.tsx';
import { NValue } from '../components/StatTile.tsx';
import { UnlockBanner } from '../components/UnlockBanner.tsx';
import { useWatch } from '../useWatch.tsx';
import { dateLabel } from '../format.ts';
import type { Key } from '../i18n.ts';

type Tab = 'all' | 'unpaid' | 'partial' | 'paid';
const TABS: { id: Tab; label: Key }[] = [
  { id: 'all', label: 'ten.all' }, { id: 'unpaid', label: 'ten.unpaid' }, { id: 'partial', label: 'ten.partial' }, { id: 'paid', label: 'ten.paid' },
];
const BADGE: Record<TenantRow['status'], string> = {
  paid: 'bg-emerald-100 text-emerald-800', partial: 'bg-amber-100 text-amber-800', unpaid: 'bg-red-100 text-red-800',
  no_invoice: 'bg-surface-sunken text-ink-muted', masked: 'bg-surface-sunken text-ink-muted',
};

function TenantItem({ r }: { r: TenantRow }) {
  const { t, lang } = useWatch();
  const masked = r.status === 'masked';
  return (
    <li className="rounded-2xl border border-line bg-surface p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Names and phones exactly as the server returned them (masked or open). */}
          <p className="truncate text-sm font-semibold text-ink">{r.name}</p>
          <p className="truncate text-xs text-ink-subtle">{r.unit ? `${t('ten.unit', { unit: r.unit })} · ` : ''}{r.phone}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${BADGE[r.status]}`}>{t(`ten.status.${r.status}`)}</span>
      </div>
      <dl className="mt-3 grid grid-cols-4 gap-2 text-xs">
        {([['ten.rent', r.rent], ['ten.billed', r.billed], ['ten.paidAmt', r.paid], ['ten.balance', r.balance]] as const).map(([k, n]) => (
          <div key={k}><dt className="text-ink-subtle">{t(k)}</dt><dd className="mt-0.5 break-words font-semibold tabular-nums text-ink"><NValue n={n} /></dd></div>
        ))}
      </dl>
      {masked ? <p className="mt-2 text-xs text-ink-subtle"><Hidden text="••••" /></p> : (
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-subtle">
          {r.dueDate ? <span>{t('ten.due', { date: dateLabel(r.dueDate, lang) })}</span> : null}
          {r.paidOn ? <span>{t('ten.paidOn', { date: dateLabel(r.paidOn, lang) })}</span> : null}
          {r.paidOnTime === true ? <span className="font-semibold text-emerald-700">{t('ten.onTime')}</span> : null}
          {r.paidOnTime === false ? <span className="font-semibold text-red-700">{t('ten.late')}</span> : null}
        </p>
      )}
    </li>
  );
}

export default function Tenants({ data }: { data: SnapshotState }) {
  const { t } = useWatch();
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const s = data.snapshot;
  const rows = useMemo(() => s?.tenants ?? [], [s]);
  const counts = useMemo(() => ({
    all: rows.length, unpaid: rows.filter((r) => r.status === 'unpaid').length,
    partial: rows.filter((r) => r.status === 'partial').length, paid: rows.filter((r) => r.status === 'paid').length,
  }), [rows]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => (tab === 'all' || r.status === tab) && (!needle || `${r.name} ${r.unit ?? ''} ${r.phone}`.toLowerCase().includes(needle)));
  }, [rows, tab, q]);
  if (!s) return null;
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-ink">{t('ten.title')}</h1>
      <UnlockBanner mask={s.mask} ownerId={s.ownerId} />
      <div role="tablist" aria-label={t('ten.title')} className="flex gap-1 overflow-x-auto rounded-2xl bg-surface-sunken p-1">
        {TABS.map((x) => (
          <button key={x.id} role="tab" type="button" aria-selected={tab === x.id} onClick={() => setTab(x.id)}
            className={`min-h-10 flex-1 whitespace-nowrap rounded-xl px-3 text-sm font-semibold ${tab === x.id ? 'bg-surface text-brand-700 shadow-sm' : 'text-ink-muted'}`}>
            {t(x.label)} <span className="ml-0.5 text-xs font-medium text-ink-subtle">{s.mask.level === 'full' ? '' : counts[x.id]}</span>
          </button>
        ))}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ten.search')} aria-label={t('ten.search')}
          className="w-full rounded-xl border border-line-strong bg-surface py-2.5 pl-10 pr-3 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
      </div>
      {shown.length === 0 ? <Card><p className="py-4 text-center text-sm text-ink-subtle">{t('ten.empty')}</p></Card> : (
        <ul role="tabpanel" className="grid gap-3 md:grid-cols-2">{shown.map((r) => <TenantItem key={r.ref} r={r} />)}</ul>
      )}
    </div>
  );
}
