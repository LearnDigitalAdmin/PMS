import { useId } from 'react';
import { monthLabel } from '../format.ts';
import { useWatch } from '../useWatch.tsx';

export function MonthPicker({ months, value, onChange, label }: { months: string[]; value: string; onChange: (m: string) => void; label?: string }) {
  const { t, lang } = useWatch();
  const id = useId();
  return (
    <div className="inline-flex items-center gap-2">
      <label htmlFor={id} className="text-xs font-medium text-ink-subtle">{label ?? t('common.month')}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}
        className="min-h-10 rounded-xl border border-line-strong bg-surface px-3 text-sm font-medium text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30">
        {(months.includes(value) ? months : [value, ...months]).map((m) => <option key={m} value={m}>{monthLabel(m, lang)}</option>)}
      </select>
    </div>
  );
}
