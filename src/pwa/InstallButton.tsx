import { Download } from 'lucide-react';
import { usePWA } from './usePWA';

const LOOKS = {
  // Compact chip for the signed-in status bar. Phone bar is a brand gradient (translucent chip);
  // md+ bar is a light/dark surface (tinted chip).
  bar: 'h-6 px-2 text-[11px] sm:px-3 md:h-7 md:text-xs bg-white/15 text-white hover:bg-white/25 md:bg-brand-50 md:text-brand-700 md:hover:bg-brand-100 dark:md:bg-brand-500/15 dark:md:text-brand-300 dark:md:hover:bg-brand-500/25',
  onDark: 'h-9 px-2.5 text-sm sm:px-3.5 border border-white/25 bg-white/10 text-white hover:bg-white/20',
  light: 'h-9 px-2.5 text-sm sm:px-3.5 border border-line text-ink hover:bg-surface-sunken',
} as const;

/**
 * Persistent "Install app" pill. Renders nothing once installed, inside a native shell, or when the
 * browser offers no way to install, so it is safe to drop into any header.
 * Icon-only on phones, icon + label from `sm` up.
 */
export default function InstallButton({ className = '', tone = 'light' }: { className?: string; tone?: keyof typeof LOOKS }) {
  const { installed, canInstallHere, requestInstall } = usePWA();
  if (installed || !canInstallHere) return null;
  return (
    <button
      type="button"
      onClick={() => void requestInstall()}
      aria-label="Install the Plot Yangu app"
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold transition-colors ${LOOKS[tone]} ${className}`}
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">Install app</span>
    </button>
  );
}
