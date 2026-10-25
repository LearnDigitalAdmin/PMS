// Landlord Watch shell: property switcher, bottom navigation on phones, side rail on large screens.
import { useEffect, useMemo, useState } from 'react';
import { Building2, Check, ChevronDown, Eye, LayoutDashboard, Plus, Receipt, Settings as SettingsIcon, Users, Wallet } from 'lucide-react';
import { useWatch } from './useWatch.tsx';
import { useSnapshot } from './useSnapshot.ts';
import { Button, ErrorBox, OfflineBar, Sheet, Skeleton } from './components/ui.tsx';
import { LangToggle } from './components/LangToggle.tsx';
import Overview from './screens/Overview.tsx';
import Tenants from './screens/Tenants.tsx';
import Money from './screens/Money.tsx';
import Transcripts from './screens/Transcripts.tsx';
import Settings from './screens/Settings.tsx';
import FindProperty from './screens/FindProperty.tsx';
import { dateTimeLabel } from './format.ts';
import type { Key } from './i18n.ts';

type View = 'overview' | 'tenants' | 'money' | 'transcripts' | 'settings';
const NAV: { id: View; label: Key; icon: typeof Eye }[] = [
  { id: 'overview', label: 'nav.overview', icon: LayoutDashboard },
  { id: 'tenants', label: 'nav.tenants', icon: Users },
  { id: 'money', label: 'nav.money', icon: Wallet },
  { id: 'transcripts', label: 'nav.transcripts', icon: Receipt },
  { id: 'settings', label: 'nav.settings', icon: SettingsIcon },
];

function Loading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-8 w-2/3" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-20" />)}</div>
      <Skeleton className="h-40" /><Skeleton className="h-40" />
    </div>
  );
}

export default function WatchApp() {
  const { t, lang, connections, activeId, setActiveId, epoch, auth } = useWatch();
  const [view, setView] = useState<View>('overview');
  const [adding, setAdding] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const [month, setMonth] = useState<string | null>(null);

  const active = useMemo(() => connections.find((c) => c.ownerId === activeId) ?? connections[0] ?? null, [connections, activeId]);
  const data = useSnapshot(active?.ownerId ?? null, month, lang, epoch);
  useEffect(() => { setMonth(null); }, [active?.ownerId]);

  const [, setNow] = useState(0);
  useEffect(() => { const id = window.setInterval(() => setNow((n) => n + 1), 30000); return () => window.clearInterval(id); }, []);

  if (adding) return <div className="app-canvas min-h-screen"><FindProperty onDone={() => { setAdding(false); setView('overview'); }} onCancel={() => setAdding(false)} /></div>;

  const header = (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
        <button type="button" onClick={() => setSwitcher(true)} aria-haspopup="dialog" aria-label={t('shell.switchProperty')}
          className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl px-2 text-left hover:bg-surface-sunken">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white"><Building2 className="h-4 w-4" aria-hidden="true" /></span>
          <span className="min-w-0"><span className="block truncate text-sm font-semibold text-ink">{active?.propertyName ?? t('app.name')}</span><span className="block truncate text-xs text-ink-subtle">{active?.ownerId}</span></span>
          <ChevronDown className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />
        </button>
        <div className="hidden sm:block"><LangToggle /></div>
      </div>
      {data.offline ? <OfflineBar text={`${t('shell.offline')}${data.lastUpdated ? ` ${t('shell.lastUpdated', { time: dateTimeLabel(new Date(data.lastUpdated).toISOString(), lang) })}` : ''}`} /> : null}
    </header>
  );

  let body;
  if (data.loading && !data.snapshot) body = <Loading />;
  else if (data.error && !data.snapshot) body = <ErrorBox message={t(`err.${data.error.lw}` as Key)} onRetry={data.refresh} retryLabel={t('common.retry')} />;
  else if (!data.snapshot && view !== 'settings') body = <ErrorBox message={t('shell.noData')} onRetry={data.refresh} retryLabel={t('common.retry')} />;
  else if (view === 'overview') body = <Overview data={data} month={month} onMonth={setMonth} />;
  else if (view === 'tenants') body = <Tenants data={data} />;
  else if (view === 'money') body = <Money data={data} month={month} onMonth={setMonth} />;
  else if (view === 'transcripts' && active) body = <Transcripts key={active.ownerId} data={data} ownerId={active.ownerId} signedPhone={auth.status === 'signedIn' ? auth.phone : null} />;
  else body = <Settings data={data} onAdd={() => setAdding(true)} />;
  if (view === 'settings' && data.snapshot) body = <Settings data={data} onAdd={() => setAdding(true)} />;

  const footer = data.snapshot && view !== 'settings' && view !== 'transcripts' ? (
    <p className="mt-6 text-center text-xs text-ink-subtle" aria-live="polite">
      {data.refreshing ? t('shell.updating') : data.lastUpdated ? t('shell.lastUpdated', { time: dateTimeLabel(new Date(data.lastUpdated).toISOString(), lang) }) : ''}
    </p>
  ) : null;

  return (
    <div className="app-canvas min-h-screen">
      {header}
      <div className="mx-auto flex max-w-5xl gap-6 px-4 pb-28 pt-4 lg:pb-8">
        <nav aria-label={t('app.name')} className="sticky top-20 hidden h-fit w-52 shrink-0 flex-col gap-1 lg:flex">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setView(id)} aria-current={view === id ? 'page' : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold ${view === id ? 'bg-brand-600 text-white' : 'text-ink-soft hover:bg-surface-sunken'}`}>
              <Icon className="h-5 w-5" aria-hidden="true" />{t(label)}
            </button>
          ))}
        </nav>
        <main className="min-w-0 flex-1">{body}{footer}</main>
      </div>

      <nav aria-label={t('app.name')} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="mx-auto flex max-w-lg">
          {NAV.map(({ id, label, icon: Icon }) => (
            <li key={id} className="flex-1">
              <button type="button" onClick={() => setView(id)} aria-current={view === id ? 'page' : undefined}
                className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${view === id ? 'text-brand-700' : 'text-ink-subtle'}`}>
                <Icon className="h-5 w-5" aria-hidden="true" /><span className="max-w-full truncate px-1">{t(label)}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {switcher ? (
        <Sheet title={t('shell.switchProperty')} onClose={() => setSwitcher(false)}>
          <ul className="divide-y divide-line-soft">
            {connections.map((c) => (
              <li key={c.ownerId}>
                <button type="button" onClick={() => { setActiveId(c.ownerId); setSwitcher(false); }} aria-current={c.ownerId === active?.ownerId}
                  className="flex min-h-14 w-full items-center justify-between gap-3 py-2 text-left">
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold text-ink">{c.propertyName}</span><span className="block truncate text-xs text-ink-subtle">{c.ownerId}</span></span>
                  {c.ownerId === active?.ownerId ? <Check className="h-4 w-4 text-brand-600" aria-hidden="true" /> : null}
                </button>
              </li>
            ))}
          </ul>
          <Button variant="secondary" onClick={() => { setSwitcher(false); setAdding(true); }} className="mt-3 w-full"><Plus className="h-4 w-4" aria-hidden="true" />{t('shell.addProperty')}</Button>
          <div className="mt-4 sm:hidden"><LangToggle /></div>
        </Sheet>
      ) : null}
    </div>
  );
}
