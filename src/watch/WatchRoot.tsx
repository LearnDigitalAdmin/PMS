// Entry point for Watch mode. Rendered by main.tsx INSTEAD of <App /> when the Watch flag is set, so the PMS
// app (and with it the SQLite layer) is never loaded or initialised in this mode.
import { StrictMode } from 'react';
import { WatchProvider } from './WatchProvider.tsx';
import { useWatch } from './useWatch.tsx';
import WatchAuth from './screens/WatchAuth.tsx';
import FindProperty from './screens/FindProperty.tsx';
import WatchApp from './WatchApp.tsx';
import { ErrorBox, Skeleton } from './components/ui.tsx';
import { OfflineBar } from './components/ui.tsx';
import type { Key } from './i18n.ts';

function Splash() {
  return (
    <div className="app-canvas flex min-h-screen items-center justify-center p-6" aria-busy="true">
      <div className="w-full max-w-md space-y-3"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
    </div>
  );
}

function Gate() {
  const { auth, connections, connectionsLoaded, connectionsError, reloadConnections, t } = useWatch();
  if (auth.status === 'loading') return <Splash />;
  if (auth.status === 'signedOut') return <WatchAuth />;

  if (connections.length > 0) return <WatchApp />;
  if (!connectionsLoaded) return <Splash />;
  if (connectionsError) {
    return (
      <div className="app-canvas min-h-screen">
        {connectionsError.lw === 'LW_NETWORK' ? <OfflineBar text={t('shell.offline')} /> : null}
        <div className="mx-auto max-w-md p-4"><ErrorBox message={t(`err.${connectionsError.lw}` as Key)} onRetry={() => void reloadConnections()} retryLabel={t('common.retry')} /></div>
      </div>
    );
  }
  return <div className="app-canvas min-h-screen"><FindProperty first onDone={() => undefined} /></div>;
}

export default function WatchRoot() {
  return (
    <StrictMode>
      <WatchProvider><Gate /></WatchProvider>
    </StrictMode>
  );
}
