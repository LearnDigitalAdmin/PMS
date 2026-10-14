import { useSyncExternalStore } from 'react';
import { pwaManager } from './pwaManager';

/** React binding for pwaManager. Re-renders only when install/update state actually changes. */
export function usePWA() {
  const state = useSyncExternalStore(pwaManager.subscribe, pwaManager.getSnapshot);
  return {
    ...state,
    /** True when there is *some* way to install from this browser (native prompt or manual steps). */
    canInstallHere: pwaManager.canInstallHere(state),
    requestInstall: pwaManager.requestInstall,
    openSheet: pwaManager.openSheet,
    closeSheet: pwaManager.closeSheet,
    applyUpdate: pwaManager.applyUpdate,
    dismissBanner: pwaManager.dismissBanner,
    isBannerSnoozed: pwaManager.isBannerSnoozed,
  };
}
