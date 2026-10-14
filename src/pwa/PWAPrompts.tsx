import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, RefreshCw, X } from 'lucide-react';
import { useAuth } from '../components/auh/AuthWrapper';
import { usePWA } from './usePWA';
import { installSteps } from './installSteps';

const INSTALL_BENEFITS = [
  'Opens full-screen from your home screen',
  'Your records stay on your device and work offline',
  'Loads faster and keeps itself up to date',
];

const BrandMark = ({ size = 44 }: { size?: number }) => (
  <img src="/icons/apple-icon-180.png" alt="" width={size} height={size} className="shrink-0 rounded-xl" style={{ width: size, height: size }} />
);

const rise = {
  initial: { opacity: 0, y: 16, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 12, scale: 0.98 },
  transition: { duration: 0.22, ease: 'easeOut' as const },
};

function UpdateToast() {
  const { updateReady, applyUpdate } = usePWA();
  return (
    <AnimatePresence>
      {updateReady && (
        <motion.div
          key="update"
          role="status"
          {...rise}
          className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 pl-4 shadow-2xl"
        >
          <RefreshCw className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm font-medium text-ink">A new version of Plot Yangu is ready.</p>
          <button
            type="button"
            onClick={applyUpdate}
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Update
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function InstallBanner() {
  const { installed, canPrompt, canInstallHere, requestInstall, openSheet, dismissBanner, isBannerSnoozed } = usePWA();
  const [ready, setReady] = useState(false);

  // Give the page a moment to settle before asking for anything.
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 2500);
    return () => window.clearTimeout(t);
  }, []);

  const show = ready && !installed && canInstallHere && !isBannerSnoozed();

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="install"
          role="dialog"
          aria-label="Install Plot Yangu"
          {...rise}
          className="rounded-2xl border border-line bg-surface p-4 shadow-2xl"
        >
          <div className="flex items-start gap-3">
            <BrandMark />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">Install Plot Yangu on your device</p>
              <ul className="mt-1 space-y-0.5 text-xs text-ink-soft">
                {INSTALL_BENEFITS.map((b) => (
                  <li key={b} className="flex gap-1.5">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" aria-hidden="true" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={dismissBanner}
              aria-label="Dismiss"
              className="-mr-1 -mt-1 flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunken"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => (canPrompt ? void requestInstall() : openSheet())}
              className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              {canPrompt ? 'Install app' : 'How to install'}
            </button>
            <button
              type="button"
              onClick={dismissBanner}
              className="rounded-xl px-4 text-sm font-semibold text-ink-soft hover:bg-surface-sunken"
            >
              Not now
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function InstallSheet() {
  const { sheetOpen, closeSheet, platform, browser, inAppBrowser } = usePWA();
  const { title, steps, note } = installSteps({ platform, browser, inAppBrowser });
  return (
    <AnimatePresence>
      {sheetOpen && (
        <motion.div
          key="sheet"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 md:items-center"
          onClick={closeSheet}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="w-full rounded-t-2xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] text-ink shadow-2xl md:max-w-md md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <BrandMark />
              <h2 className="flex-1 text-lg font-semibold">{title}</h2>
              <button
                type="button"
                onClick={closeSheet}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunken"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ol className="mt-4 space-y-3">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm text-ink-soft">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                    {i + 1}
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            {note && <p className="mt-4 text-xs text-ink-muted">{note}</p>}
            <button
              type="button"
              onClick={closeSheet}
              className="mt-5 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              Got it
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Mount once, inside AuthProvider. Update toast and install banner share one stack so they never overlap.
 * Signed in on a phone, the stack sits above the bottom navigation bar; everywhere else it hugs the screen edge.
 */
export default function PWAPrompts() {
  const { user } = useAuth();
  const bottom = user
    ? 'bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-6'
    : 'bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] md:bottom-6';
  return (
    <>
      <div className={`pointer-events-none fixed inset-x-3 z-[60] flex flex-col gap-2 md:inset-x-auto md:right-6 md:w-96 ${bottom}`}>
        <div className="pointer-events-auto flex flex-col gap-2">
          <UpdateToast />
          <InstallBanner />
        </div>
      </div>
      <InstallSheet />
    </>
  );
}
