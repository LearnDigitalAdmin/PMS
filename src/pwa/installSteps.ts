import type { InstallBrowser, InstallPlatform } from './pwaManager';

/** Browser-specific manual install instructions (used when there is no native prompt). */
export function installSteps(env: { platform: InstallPlatform; browser: InstallBrowser; inAppBrowser: boolean }): {
  title: string; steps: string[]; note?: string;
} {
  const { platform, browser, inAppBrowser } = env;

  if (inAppBrowser) {
    return {
      title: 'Open in your browser first',
      steps: [
        'Tap the ⋯ or share menu at the top or bottom of this screen.',
        platform === 'ios' ? 'Choose "Open in Safari".' : 'Choose "Open in Chrome" (or "Open in browser").',
        'Then install Plot Yangu from there.',
      ],
      note: 'Apps like Facebook, Instagram and WhatsApp use a built-in browser that cannot install apps.',
    };
  }
  if (platform === 'ios') {
    return {
      title: 'Add Plot Yangu to your Home Screen',
      steps: [
        browser === 'safari' ? 'Tap the Share button (the square with an arrow) in Safari’s toolbar.' : 'Tap the Share button (the square with an arrow) in your browser.',
        'Scroll down and tap "Add to Home Screen".',
        'Tap "Add". Plot Yangu now opens full-screen like any other app.',
      ],
      note: browser === 'safari' ? undefined : 'Don’t see "Add to Home Screen"? Open this page in Safari and try again.',
    };
  }
  if (browser === 'safari') {
    return {
      title: 'Add Plot Yangu to your Dock',
      steps: ['In Safari’s menu bar choose File → Add to Dock.', 'Click "Add". Plot Yangu opens in its own window.'],
      note: 'Requires Safari 17 or newer.',
    };
  }
  if (browser === 'firefox' && platform === 'android') {
    return {
      title: 'Install Plot Yangu',
      steps: ['Tap the ⋮ menu in Firefox.', 'Tap "Install" (or "Add to Home screen").', 'Confirm. Plot Yangu appears with your other apps.'],
    };
  }
  return {
    title: 'Install Plot Yangu',
    steps: platform === 'android'
      ? ['Tap the ⋮ menu in your browser.', 'Tap "Install app" (or "Add to Home screen").', 'Confirm to add Plot Yangu to your apps.']
      : ['Click the install icon at the right of the address bar (or ⋮ → "Install Plot Yangu").', 'Click "Install". Plot Yangu opens in its own window.'],
  };
}
