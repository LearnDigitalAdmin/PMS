// Watch-mode flag and language preference. Boot gate helper. Never touches SQLite.
import type { Lang } from './types.ts';

const MODE_KEY = 'lw.mode';
const LANG_KEY = 'lw.lang';

function ls(): Storage | null { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } }

export function isWatchMode(): boolean { return ls()?.getItem(MODE_KEY) === '1'; }

/** Switch to Landlord Watch. A reload guarantees a clean boot that never loads the PMS database layer. */
export function enterWatchMode(): void {
  try { ls()?.setItem(MODE_KEY, '1'); } catch { /* ignore */ }
  window.location.reload();
}

/** Back to the normal PMS sign-in. */
export function leaveWatchMode(): void {
  try { ls()?.removeItem(MODE_KEY); } catch { /* ignore */ }
  window.location.reload();
}

export function getStoredLang(): Lang {
  const v = ls()?.getItem(LANG_KEY);
  return v === 'sw' ? 'sw' : 'en';
}
export function storeLang(lang: Lang): void { try { ls()?.setItem(LANG_KEY, lang); } catch { /* ignore */ } }
