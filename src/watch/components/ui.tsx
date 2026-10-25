import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { AlertCircle, Loader2, Lock, WifiOff, X } from 'lucide-react';
import { useWatch } from '../useWatch.tsx';

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin`} aria-hidden="true" />;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-sunken ${className}`} aria-hidden="true" />;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-surface p-4 shadow-sm ${className}`}>{children}</section>;
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold text-ink">{children}</h2>
      {hint ? <p className="mt-0.5 text-xs text-ink-subtle">{hint}</p> : null}
    </div>
  );
}

type BtnProps = {
  children: ReactNode; onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean; busy?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; className?: string; ariaLabel?: string;
};
export function Button({ children, onClick, type = 'button', disabled, busy, variant = 'primary', className = '', ariaLabel }: BtnProps) {
  const base = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
  const v = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700',
    secondary: 'border border-line-strong bg-surface text-ink-soft hover:bg-surface-sunken',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-brand-700 hover:bg-brand-50',
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled || busy} aria-label={ariaLabel} aria-busy={busy || undefined} className={`${base} ${v} ${className}`}>
      {busy ? <Spinner /> : null}{children}
    </button>
  );
}

export function ErrorBox({ message, onRetry, retryLabel }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p>{message}</p>
        {onRetry ? <button type="button" onClick={onRetry} className="mt-1 font-semibold underline">{retryLabel}</button> : null}
      </div>
    </div>
  );
}

export function InlineError({ message }: { message: string | null }) {
  return <p role="alert" aria-live="assertive" className={message ? 'mt-2 text-sm text-red-600' : 'sr-only'}>{message ?? ''}</p>;
}

export function OfflineBar({ text }: { text: string }) {
  return (
    <div role="status" className="flex items-center gap-2 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900">
      <WifiOff className="h-4 w-4" aria-hidden="true" />{text}
    </div>
  );
}

/** A masked value: the server's bullet string plus a lock, so it is clearly "hidden", never "zero". */
export function Hidden({ text }: { text: string }) {
  const { t } = useWatch();
  return (
    <span className="inline-flex items-center gap-1 text-ink-subtle" title={t('common.hidden')}>
      <Lock className="h-3 w-3" aria-hidden="true" /><span aria-label={t('common.hidden')}>{text}</span>
    </span>
  );
}

/** Dialog / bottom sheet with focus handling and Escape to close. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useWatch();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id} className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-pop focus:outline-none sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id={id} className="text-base font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="flex h-9 w-9 items-center justify-center rounded-full text-ink-subtle hover:bg-surface-sunken"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
