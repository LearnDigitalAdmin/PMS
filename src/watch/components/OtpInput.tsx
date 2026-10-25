import { useEffect, useRef } from 'react';
import { digitsOnly } from '../format.ts';

/** One field for a 6-digit code: autofocus, paste, SMS autofill (one-time-code). Digits only. */
export function OtpInput({ value, onChange, onSubmit, label, disabled, describedBy }: {
  value: string; onChange: (v: string) => void; onSubmit?: () => void; label: string; disabled?: boolean; describedBy?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => onChange(digitsOnly(e.target.value))}
      onPaste={(e) => { e.preventDefault(); onChange(digitsOnly(e.clipboardData.getData('text'))); }}
      onKeyDown={(e) => { if (e.key === 'Enter' && value.length === 6) onSubmit?.(); }}
      inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} disabled={disabled}
      aria-label={label} aria-describedby={describedBy} placeholder="••••••" spellCheck={false}
      className="w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
    />
  );
}
