import type { Snapshot } from '../types.ts';
import { monthLabel } from '../format.ts';
import { useWatch } from '../useWatch.tsx';

/** Last 6 months, billed vs collected. Plain CSS bars: no chart dependency. Bar heights use the server's values only to scale. */
export function TrendBars({ trend }: { trend: Snapshot['trend'] }) {
  const { t, lang } = useWatch();
  const max = Math.max(1, ...trend.map((x) => x.billed.v ?? 0));
  const masked = trend.every((x) => x.billed.v === null);
  const short = (m: string) => monthLabel(m, lang).split(' ')[0].slice(0, 3);
  const summary = trend.map((x) => `${monthLabel(x.month, lang)}: ${t('ov.trendBilled')} ${x.billed.d}, ${t('ov.trendCollected')} ${x.collected.d}`).join('. ');
  return (
    <figure aria-label={t('ov.trend')}>
      <div role="img" aria-label={summary} className="flex h-36 items-end gap-2">
        {trend.map((x) => {
          const b = x.billed.v, c = x.collected.v;
          return (
            <div key={x.month} className="flex h-full min-w-0 flex-1 flex-col justify-end">
              <div className="flex h-full items-end justify-center gap-1">
                <div className={`w-3 rounded-t sm:w-4 ${b === null ? 'bg-surface-sunken' : 'bg-brand-200'}`} style={{ height: `${b === null ? 40 : Math.max(2, (b / max) * 100)}%` }} />
                <div className={`w-3 rounded-t sm:w-4 ${c === null ? 'bg-surface-sunken' : 'bg-brand-600'}`} style={{ height: `${c === null ? 28 : Math.max(2, (c / max) * 100)}%` }} />
              </div>
              <div className="mt-1 truncate text-center text-[10px] text-ink-subtle">{short(x.month)}</div>
            </div>
          );
        })}
      </div>
      <figcaption className="mt-2 flex items-center gap-4 text-xs text-ink-subtle">
        <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-200" />{t('ov.trendBilled')}</span>
        <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-600" />{t('ov.trendCollected')}</span>
        {masked ? <span>{t('common.hidden')}</span> : null}
      </figcaption>
    </figure>
  );
}
