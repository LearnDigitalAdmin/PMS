import type { ElementType, ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  icon?: ElementType;
  actions?: ReactNode;
}

/** Sticky section header that sits under the status bar: title on the left, actions on the right. */
export default function PageHeader({ title, subtitle, icon: Icon, actions }: PageHeaderProps) {
  return (
    <header className="ui-page-header">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold leading-tight tracking-tight text-ink sm:text-xl lg:text-2xl">{title}</h1>
          {subtitle && <p className="truncate text-xs text-ink-subtle sm:text-sm">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

interface HeaderActionProps {
  icon: ElementType;
  label: string;
  onClick?: () => void;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
  spin?: boolean;
  /** Show the text label from `sm` up (icon-only on phones). */
  showLabel?: boolean;
}

/** 40px+ touch target; icon-only on phones, icon + label from sm up. */
export function HeaderAction({ icon: Icon, label, onClick, variant = 'ghost', disabled, spin, showLabel }: HeaderActionProps) {
  const tone =
    variant === 'primary'
      ? 'bg-brand-600 text-white shadow-sm hover:bg-brand-700'
      : 'border border-line bg-surface text-ink-muted hover:bg-surface-sunken';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-xl px-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${showLabel ? 'sm:px-3.5' : ''} ${tone}`}
    >
      <Icon className={`h-5 w-5 ${spin ? 'animate-spin' : ''}`} />
      {showLabel && <span className="hidden sm:inline">{label}</span>}
    </button>
  );
}
