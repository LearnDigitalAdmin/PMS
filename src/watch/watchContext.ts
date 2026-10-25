import { createContext } from 'react';
import type { Key, Vars } from './i18n.ts';
import type { AuthState, Connection, Lang, LwError } from './types.ts';

export interface WatchCtx {
  auth: AuthState;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: Key, vars?: Vars) => string;
  connections: Connection[];
  connectionsLoaded: boolean;
  connectionsError: LwError | null;
  activeId: string | null;
  setActiveId: (id: string) => void;
  reloadConnections: () => Promise<void>;
  addConnection: (c: Connection) => void;
  disconnect: (ownerId: string) => Promise<void>;
  /** Called after an OTP unlock: re-read connections and mark every connected property stale so it revalidates. */
  afterUnlock: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Bumped when cached data was invalidated, so views refetch. */
  epoch: number;
}

export const Ctx = createContext<WatchCtx | null>(null);
