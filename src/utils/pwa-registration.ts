// src/utils/pwa-registration.ts

/**
 * PWA and Service Worker Registration
 * Handles service worker lifecycle, updates, and persistent storage
 */

interface PWAInstallPrompt {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Add SyncManager interface for TypeScript
interface SyncManager {
  register(tag: string): Promise<void>;
}

class PWAManager {
  private deferredPrompt: PWAInstallPrompt | null = null;
  private registration: ServiceWorkerRegistration | null = null;

  /**
   * Register service worker for PWA functionality
   */
  async registerServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      console.log('Service Worker not supported');
      return;
    }

    try {
      // Register service worker
      this.registration = await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/'
      });

      console.log('✅ Service Worker registered:', this.registration.scope);

      // Handle updates
      this.registration.addEventListener('updatefound', () => {
        const newWorker = this.registration!.installing;
        console.log('🔄 Service Worker update found');

        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker available
              console.log('✨ New version available!');
              this.notifyUserOfUpdate();
            }
          });
        }
      });

      // Check for updates periodically (every hour)
      setInterval(() => {
        this.registration?.update();
      }, 60 * 60 * 1000);

      // Listen for service worker messages
      navigator.serviceWorker.addEventListener('message', (event) => {
        this.handleServiceWorkerMessage(event.data);
      });

    } catch (error) {
      console.error('❌ Service Worker registration failed:', error);
    }
  }

  /**
   * Request persistent storage permission
   */
  async requestPersistentStorage(): Promise<boolean> {
    if (!('storage' in navigator) || !('persist' in navigator.storage)) {
      console.log('Persistent Storage API not supported');
      return false;
    }

    try {
      // Check if already persisted
      const isPersisted = await navigator.storage.persisted();
      
      if (isPersisted) {
        console.log('✅ Storage already persistent');
        return true;
      }

      // Request persistent storage
      const granted = await navigator.storage.persist();
      
      if (granted) {
        console.log('✅ Persistent storage granted');
      } else {
        console.log('⚠️ Persistent storage denied');
      }
      
      return granted;
    } catch (error) {
      console.error('❌ Failed to request persistent storage:', error);
      return false;
    }
  }

  /**
   * Check storage quota and usage
   */
  async checkStorageQuota(): Promise<{
    usage: number;
    quota: number;
    percentUsed: number;
    available: number;
  }> {
    if (!('storage' in navigator) || !('estimate' in navigator.storage)) {
      return { usage: 0, quota: 0, percentUsed: 0, available: 0 };
    }

    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percentUsed = quota > 0 ? (usage / quota) * 100 : 0;
      const available = quota - usage;

      console.log('📊 Storage:', {
        usage: `${(usage / 1024 / 1024).toFixed(2)} MB`,
        quota: `${(quota / 1024 / 1024).toFixed(2)} MB`,
        percentUsed: `${percentUsed.toFixed(2)}%`,
        available: `${(available / 1024 / 1024).toFixed(2)} MB`
      });

      return { usage, quota, percentUsed, available };
    } catch (error) {
      console.error('❌ Failed to check storage quota:', error);
      return { usage: 0, quota: 0, percentUsed: 0, available: 0 };
    }
  }

  /**
   * Detect if running in private/incognito mode
   */
  async isPrivateMode(): Promise<boolean> {
    try {
      const { quota } = await navigator.storage.estimate();
      // Private mode typically has very small quota (< 120MB)
      return (quota || 0) < 120000000;
    } catch {
      return false;
    }
  }

  /**
   * Setup PWA install prompt
   */
  setupInstallPrompt(): void {
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent automatic prompt
      e.preventDefault();
      
      // Store the event for later use
      this.deferredPrompt = e as any;
      
      console.log('💾 PWA install prompt available');
      
      // Notify app that install is available
      window.dispatchEvent(new CustomEvent('pwa-install-available'));
    });

    // Detect when PWA is installed
    window.addEventListener('appinstalled', () => {
      console.log('✅ PWA installed successfully');
      this.deferredPrompt = null;
      
      // Notify app
      window.dispatchEvent(new CustomEvent('pwa-installed'));
    });
  }

  /**
   * Show PWA install prompt
   */
  async showInstallPrompt(): Promise<boolean> {
    if (!this.deferredPrompt) {
      console.log('⚠️ Install prompt not available');
      return false;
    }

    try {
      // Show the install prompt
      await this.deferredPrompt.prompt();
      
      // Wait for user response
      const { outcome } = await this.deferredPrompt.userChoice;
      
      console.log(`User ${outcome} the install prompt`);
      
      // Clear the prompt
      this.deferredPrompt = null;
      
      return outcome === 'accepted';
    } catch (error) {
      console.error('❌ Failed to show install prompt:', error);
      return false;
    }
  }

  /**
   * Check if app is installed as PWA
   */
  isInstalled(): boolean {
    // Check display mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isFullscreen = window.matchMedia('(display-mode: fullscreen)').matches;
    const isMinimalUI = window.matchMedia('(display-mode: minimal-ui)').matches;
    
    // Check iOS
    const isIOSStandalone = (window.navigator as any).standalone === true;
    
    return isStandalone || isFullscreen || isMinimalUI || isIOSStandalone;
  }

  /**
   * Register background sync
   */
  async registerBackgroundSync(tag: string = 'sync-all'): Promise<boolean> {
    if (!this.registration) {
      console.log('⚠️ Service Worker not registered');
      return false;
    }

    if (!('sync' in this.registration)) {
      console.log('⚠️ Background Sync not supported');
      return false;
    }

    try {
      await (this.registration.sync as SyncManager).register(tag);
      console.log(`✅ Background sync registered: ${tag}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to register background sync:', error);
      return false;
    }
  }

  /**
   * Handle service worker messages
   */
  private handleServiceWorkerMessage(data: any): void {
    console.log('📨 Service Worker message:', data);

    switch (data.type) {
      case 'SYNC_PROPERTIES':
        window.dispatchEvent(new CustomEvent('sync-properties'));
        break;
      case 'SYNC_INVOICES':
        window.dispatchEvent(new CustomEvent('sync-invoices'));
        break;
      case 'SYNC_ALL':
        window.dispatchEvent(new CustomEvent('sync-all'));
        break;
    }
  }

  /**
   * Notify user of available update
   */
  private notifyUserOfUpdate(): void {
    // Dispatch custom event for app to handle
    window.dispatchEvent(new CustomEvent('pwa-update-available', {
      detail: {
        message: 'A new version is available!',
        action: () => this.applyUpdate()
      }
    }));
  }

  /**
   * Apply service worker update
   */
  async applyUpdate(): Promise<void> {
    if (!this.registration || !this.registration.waiting) {
      return;
    }

    // Tell the service worker to skip waiting
    this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });

    // Reload the page when the new service worker takes control
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }

  /**
   * Clear all caches (for troubleshooting)
   */
  async clearAllCaches(): Promise<void> {
    if (!('caches' in window)) {
      return;
    }

    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      console.log('✅ All caches cleared');
    } catch (error) {
      console.error('❌ Failed to clear caches:', error);
    }
  }

  /**
   * Full initialization
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing PWA Manager...');

    // Register service worker
    await this.registerServiceWorker();

    // Request persistent storage
    await this.requestPersistentStorage();

    // Check storage quota
    await this.checkStorageQuota();

    // Setup install prompt
    this.setupInstallPrompt();

    // Check if in private mode and warn user
    const isPrivate = await this.isPrivateMode();
    if (isPrivate) {
      console.warn('⚠️ Running in private/incognito mode - data may not persist');
      window.dispatchEvent(new CustomEvent('pwa-private-mode-detected'));
    }

    // Check if already installed
    if (this.isInstalled()) {
      console.log('✅ App is installed as PWA');
      window.dispatchEvent(new CustomEvent('pwa-is-installed'));
    }

    console.log('✅ PWA Manager initialized');
  }
}

// Export singleton instance
export const pwaManager = new PWAManager();

// Auto-initialize on import (but don't block)
if (typeof window !== 'undefined') {
  pwaManager.initialize().catch(console.error);
}

/**
 * React hook for PWA functionality
 */
export function usePWA() {
  return {
    showInstallPrompt: () => pwaManager.showInstallPrompt(),
    isInstalled: () => pwaManager.isInstalled(),
    checkStorageQuota: () => pwaManager.checkStorageQuota(),
    registerBackgroundSync: (tag?: string) => pwaManager.registerBackgroundSync(tag),
    clearAllCaches: () => pwaManager.clearAllCaches()
  };
}