import { ArrowDown, Info } from 'lucide-react';
import type { SnapshotState } from '../useSnapshot.ts';
import { Card, Hidden, SectionTitle } from '../components/ui.tsx';
import { NValue, Row } from '../components/StatTile.tsx';
import { MonthPicker } from '../components/MonthPicker.tsx';
import { UnlockBanner } from '../components/UnlockBanner.tsx';
import { useWatch } from '../useWatch.tsx';
import { dateLabel } from '../format.ts';

/** Every number is the server's. No money is added up or subtracted here. */
export default function Money({ data, month, onMonth }: { data: SnapshotState; month: string | null; onMonth: (m: string) => void }) {
  const { t, lang } = useWatch();
  const s = data.snapshot;
  if (!s) return null;
  const sum = s.summary;
  const st = sum.statement;
  const rate = sum.commission.ratePct.d;
  const income = st.items.filter((i) => i.kind === 'income');
  const deductions = st.items.filter((i) => i.kind === 'deduction');
  const Line = ({ label, n }: { label: string; n: (typeof st.items)[number]['amount'] }) => (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="min-w-0 text-ink-soft">{s.mask.level === 'full' ? <Hidden text={label} /> : label}</span>
      <span className="shrink-0 font-medium tabular-nums text-ink"><NValue n={n} /></span>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-ink">{t('mon.title')}</h1>
        <MonthPicker months={s.months} value={month ?? s.month} onChange={onMonth} />
      </div>
      <UnlockBanner mask={s.mask} ownerId={s.ownerId} />

      <Card>
        <SectionTitle hint={t('mon.flowHelp')}>{t('mon.flow')}</SectionTitle>
        <div className="space-y-1">
          <Row label={t('ov.billed')} n={sum.billed} strong />
          <div className="flex justify-center text-ink-faint"><ArrowDown className="h-4 w-4" aria-hidden="true" /></div>
          <Row label={t('ov.collected')} n={sum.collected} strong />
          <div className="flex justify-center text-ink-faint"><ArrowDown className="h-4 w-4" aria-hidden="true" /></div>
          <Row label={t('ov.pending')} n={sum.pending} strong />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle hint={t('mon.baseRentHelp')}>{t('mon.baseRent')}</SectionTitle>
          <div className="divide-y divide-line-soft">
            <Row label={t('mon.baseBilled')} n={sum.baseRent.billed} />
            <Row label={t('mon.baseCollected')} n={sum.baseRent.collected} />
          </div>
        </Card>
        <Card>
          <SectionTitle hint={t('mon.commissionHelp', { rate })}>{t('mon.commissionTitle')} ({rate})</SectionTitle>
          <div className="divide-y divide-line-soft">
            <Row label={t('mon.comCollected')} n={sum.commission.onCollected} strong />
            <Row label={t('mon.comExpected')} n={sum.commission.onExpected} />
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle>{t('mon.netTitle')}</SectionTitle>
        <div className="divide-y divide-line-soft">
          <Row label={t('mon.netPayable')} help={t('mon.netPayableHelp')} n={sum.net.payable} strong />
          <Row label={t('mon.netExpected')} n={sum.net.expected} />
          <Row label={t('mon.netStill')} n={sum.net.stillToCollect} />
        </div>
      </Card>

      <Card>
        <SectionTitle hint={t('mon.statementHelp')}>
          {t('mon.statement')}
          {st.source === 'agent' && st.status ? <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{t(`mon.status.${st.status}`)}</span> : null}
        </SectionTitle>
        {st.source === 'estimate' ? (
          <div role="note" className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{t('mon.estimate')}
          </div>
        ) : null}
        {st.items.length === 0 ? <p className="text-sm text-ink-subtle">{t('mon.noItems')}</p> : (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{t('mon.income')}</h3>
              <div className="divide-y divide-line-soft">{income.map((i, k) => <Line key={`i${k}`} label={i.label} n={i.amount} />)}</div>
              <div className="mt-1 flex justify-between border-t border-line pt-2 text-sm font-semibold text-ink"><span>{t('mon.income')}</span><NValue n={st.income} /></div>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-red-700">{t('mon.deductions')}</h3>
              <div className="divide-y divide-line-soft">{deductions.map((i, k) => <Line key={`d${k}`} label={i.label} n={i.amount} />)}</div>
              <div className="mt-1 flex justify-between border-t border-line pt-2 text-sm font-semibold text-ink"><span>{t('mon.deductions')}</span><NValue n={st.deductions} /></div>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-brand-50 px-3 py-3 text-base font-bold text-brand-900">
              <span>{t('mon.netPayableLine')}</span><span className="tabular-nums"><NValue n={st.netPayable} /></span>
            </div>
          </div>
        )}
        {st.notes ? <p className="mt-3 rounded-xl bg-surface-muted p-3 text-sm text-ink-soft"><span className="font-semibold">{t('mon.notes')}: </span>{st.notes}</p> : null}
      </Card>

      <Card>
        <SectionTitle hint={t('ov.remittanceDue', { date: dateLabel(sum.remittance.dueDate, lang) })}>{t('mon.remit')}</SectionTitle>
        <div className="divide-y divide-line-soft">
          <Row label={t('ov.byDue')} n={sum.remittance.collectedByDue} />
          <Row label={t('ov.netByDue')} n={sum.remittance.netByDue} strong />
          <Row label={t('ov.afterDue')} n={sum.remittance.collectedAfterDue} />
          <Row label={t('ov.netAfterDue')} n={sum.remittance.netAfterDue} />
        </div>
      </Card>
    </div>
  );
}
