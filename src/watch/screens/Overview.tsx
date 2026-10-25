import { Building2, CalendarClock, Coins, Percent, RefreshCw, Users } from 'lucide-react';
import type { SnapshotState } from '../useSnapshot.ts';
import { Button, Card, Hidden, SectionTitle } from '../components/ui.tsx';
import { NValue, Row, StatTile } from '../components/StatTile.tsx';
import { TrendBars } from '../components/TrendBars.tsx';
import { MonthPicker } from '../components/MonthPicker.tsx';
import { UnlockBanner } from '../components/UnlockBanner.tsx';
import { useWatch } from '../useWatch.tsx';
import { dateLabel } from '../format.ts';

export default function Overview({ data, month, onMonth }: { data: SnapshotState; month: string | null; onMonth: (m: string) => void }) {
  const { t, lang } = useWatch();
  const s = data.snapshot;
  if (!s) return null;
  const sum = s.summary;
  const rate = sum.collectionRatePct.v;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-bold text-ink">
            <Building2 className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
            <span className="truncate">{s.mask.level === 'full' ? <Hidden text={s.property.name} /> : s.property.name}</span>
          </h1>
          <p className="text-sm text-ink-muted">{s.mask.level === 'full' ? <Hidden text={s.property.address ?? '••••••••'} /> : s.property.address}</p>
          <p className="text-xs text-ink-subtle">{s.ownerId}</p>
        </div>
        <div className="flex items-center gap-2">
          <MonthPicker months={s.months} value={month ?? s.month} onChange={onMonth} />
          <Button variant="secondary" onClick={data.refresh} busy={data.refreshing} ariaLabel={t('common.refresh')} className="min-h-10 px-3"><RefreshCw className="h-4 w-4" aria-hidden="true" /></Button>
        </div>
      </div>

      <UnlockBanner mask={s.mask} ownerId={s.ownerId} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={t('ov.occupied')} n={sum.tenants.occupiedUnits} icon={<Users className="h-4 w-4" aria-hidden="true" />}
          sub={<>{t('common.of')} <NValue n={s.property.maxUnits} /> {t('ov.units').toLowerCase()} · <NValue n={sum.tenants.vacantUnits} /> {t('common.vacant')}</>} />
        <StatTile label={t('ov.occupancy')} n={sum.tenants.occupancyPct} icon={<Percent className="h-4 w-4" aria-hidden="true" />} />
        <StatTile label={t('ov.billed')} n={sum.billed} />
        <StatTile label={t('ov.collected')} n={sum.collected} tone="good" />
        <StatTile label={t('ov.pending')} n={sum.pending} tone="warn" />
        <div className="col-span-2 rounded-2xl border border-line bg-surface p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-xs font-medium text-ink-subtle"><span>{t('ov.rate')}</span><NValue n={sum.collectionRatePct} className="text-sm font-bold text-ink" /></div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-label={t('ov.rate')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={rate ?? undefined} aria-valuetext={sum.collectionRatePct.d}>
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${rate === null ? 0 : Math.min(100, Math.max(0, rate))}%` }} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle hint={t('ov.commissionNote', { rate: sum.commission.ratePct.d })}>
            <span className="inline-flex items-center gap-1.5"><Coins className="h-4 w-4 text-brand-600" aria-hidden="true" />{t('ov.net')}</span>
          </SectionTitle>
          <div className="divide-y divide-line-soft">
            <Row label={t('ov.netReceived')} n={sum.net.payable} strong />
            <Row label={t('ov.netExpected')} n={sum.net.expected} />
            <Row label={t('ov.netStill')} n={sum.net.stillToCollect} />
            <Row label={`${t('ov.commission')} (${sum.commission.ratePct.d})`} n={sum.commission.onCollected} />
          </div>
        </Card>

        <Card>
          <SectionTitle hint={t('ov.remittanceDue', { date: dateLabel(sum.remittance.dueDate, lang) })}>
            <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-4 w-4 text-brand-600" aria-hidden="true" />{t('ov.remittance')}</span>
          </SectionTitle>
          <div className="divide-y divide-line-soft">
            <Row label={t('ov.byDue')} n={sum.remittance.collectedByDue} />
            <Row label={t('ov.netByDue')} n={sum.remittance.netByDue} strong />
            <Row label={t('ov.afterDue')} n={sum.remittance.collectedAfterDue} />
            <Row label={t('ov.netAfterDue')} n={sum.remittance.netAfterDue} />
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle>{t('ov.trend')}</SectionTitle>
        {s.trend.length ? <TrendBars trend={s.trend} /> : <p className="text-sm text-ink-subtle">{t('shell.noData')}</p>}
      </Card>

      <Card>
        <SectionTitle>{t('ov.invoices')}</SectionTitle>
        <dl className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          {([['ov.paidN', sum.invoices.paid], ['ov.partialN', sum.invoices.partial], ['ov.unpaidN', sum.invoices.unpaid], ['ov.noInvoiceN', sum.invoices.noInvoice]] as const).map(([k, n]) => (
            <div key={k} className="rounded-xl bg-surface-muted p-2"><dd className="text-lg font-bold tabular-nums text-ink"><NValue n={n} /></dd><dt className="text-xs text-ink-subtle">{t(k)}</dt></div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
