// Watch app state: auth, connections, active property, language. One provider, no SQLite.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from './api.ts';
import { snapshotCache } from './cache.ts';
import { getStoredLang, storeLang } from './session.ts';
import { translate } from './i18n.ts';
import type { Key, Vars } from './i18n.ts';
import type { LwError } from './types.ts';
import type { AuthState, Connection, Lang } from './types.ts';
import { toLwError } from './errors.ts';
import { Ctx } from './watchContext.ts';
import type { WatchCtx } from './watchContext.ts';

const ACTIVE_KEY = 'lw.active';

export function WatchProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  const [lang, setLangState] = useState<Lang>(getStoredLang());
  const [connections, setConnections] = useState<Connection[]>(() => snapshotCache.getConnections() ?? []);
  const [connectionsLoaded, setLoaded] = useState(false);
  const [connectionsError, setConnErr] = useState<LwError | null>(null);
  const [activeId, setActive] = useState<string | null>(() => { try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; } });
  const [epoch, setEpoch] = useState(0);
  const authRef = useRef(auth);
  authRef.current = auth;

  useEffect(() => api.auth.onChange(setAuth), []);

  const reloadConnections = useCallback(async () => {
    try {
      const list = await api.listConnections();
      setConnections(list); snapshotCache.putConnections(list); setConnErr(null);
    } catch (e) { setConnErr(toLwError(e)); }
    finally { setLoaded(true); }
  }, []);

  // Refresh connections on app start (after sign-in); the cached list shows meanwhile.
  useEffect(() => {
    if (auth.status === 'signedIn') void reloadConnections();
    if (auth.status === 'signedOut') { setConnections([]); setLoaded(false); }
  }, [auth.status, reloadConnections]);

  // Keep the active property valid.
  useEffect(() => {
    if (!connections.length) return;
    if (!activeId || !connections.some((c) => c.ownerId === activeId)) {
      const next = connections[0].ownerId;
      setActive(next); try { localStorage.setItem(ACTIVE_KEY, next); } catch { /* ignore */ }
    }
  }, [connections, activeId]);

  const setActiveId = useCallback((id: string) => { setActive(id); try { localStorage.setItem(ACTIVE_KEY, id); } catch { /* ignore */ } }, []);
  const setLang = useCallback((l: Lang) => { setLangState(l); storeLang(l); document.documentElement.lang = l; }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const addConnection = useCallback((c: Connection) => {
    setConnections((prev) => {
      const next = [...prev.filter((x) => x.ownerId !== c.ownerId), c];
      snapshotCache.putConnections(next);
      return next;
    });
    setActiveId(c.ownerId);
  }, [setActiveId]);

  const disconnect = useCallback(async (ownerId: string) => {
    await api.disconnect(ownerId);
    snapshotCache.clearProperty(ownerId);
    setConnections((prev) => { const next = prev.filter((x) => x.ownerId !== ownerId); snapshotCache.putConnections(next); return next; });
  }, []);

  const afterUnlock = useCallback(async () => {
    // One OTP unlocks every property that shares the owner phone: refresh them all.
    let list = connections;
    try { list = await api.listConnections(); setConnections(list); snapshotCache.putConnections(list); } catch { /* keep the old list */ }
    snapshotCache.markStale(list.map((c) => c.ownerId));
    setEpoch((n) => n + 1);
  }, [connections]);

  const signOut = useCallback(async () => {
    try { await api.auth.signOut(); } finally {
      snapshotCache.clearAll();
      try { localStorage.removeItem(ACTIVE_KEY); } catch { /* ignore */ }
      setConnections([]); setActive(null); setLoaded(false);
    }
  }, []);

  const t = useCallback((key: Key, vars?: Vars) => translate(lang, key, vars), [lang]);

  const value = useMemo<WatchCtx>(() => ({
    auth, lang, setLang, t, connections, connectionsLoaded, connectionsError, activeId, setActiveId,
    reloadConnections, addConnection, disconnect, afterUnlock, signOut, epoch,
  }), [auth, lang, setLang, t, connections, connectionsLoaded, connectionsError, activeId, setActiveId, reloadConnections, addConnection, disconnect, afterUnlock, signOut, epoch]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
