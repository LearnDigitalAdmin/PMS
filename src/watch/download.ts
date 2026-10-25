// Open a signed transcript URL without ever rendering it as text. Native app: system browser; web: new tab.
import { Capacitor } from '@capacitor/core';

export async function openDownload(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
    return;
  }
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.download = '';
  document.body.appendChild(a); a.click(); a.remove();
}
