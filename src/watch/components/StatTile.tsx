import type { ReactNode } from 'react';
import type { N } from '../types.ts';
import { Hidden } from './ui.tsx';

/** Renders the server's display string. A null value means masked: show the bullets with a lock. */
export function NValue({ n, className = '' }: { n: N; className?: string }) {
  return n.v === null ? <Hidden text={n.d} /> : <span className={className}>{n.d}</span>;
}

export function StatTile({ label, n, sub, tone = 'default', icon }: {
  label: string; n: N; sub?: ReactNode; tone?: 'default' | 'good' | 'warn' | 'brand'; icon?: ReactNode;
}) {
  const tones = {
    default: 'text-ink', good: 'text-emerald-700', warn: 'text-amber-700', brand: 'text-brand-700',
  };
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-sm">
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-ink-subtle">
        <span>{label}</span>{icon}
      </div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${tones[tone]}`}><NValue n={n} /></div>
      {sub ? <div className="mt-0.5 text-xs text-ink-subtle">{sub}</div> : null}
    </div>
  );
}

export function Row({ label, n, strong, help }: { label: string; n: N; strong?: boolean; help?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className={`text-sm ${strong ? 'font-semibold text-ink' : 'text-ink-soft'}`}>{label}</div>
        {help ? <div className="text-xs text-ink-subtle">{help}</div> : null}
      </div>
      <div className={`shrink-0 text-right text-sm tabular-nums ${strong ? 'font-bold text-ink' : 'font-medium text-ink'}`}><NValue n={n} /></div>
    </div>
  );
}
