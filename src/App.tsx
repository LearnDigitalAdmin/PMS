// App.tsx - Updated with Enhanced User State Management, Sync Integration, and Exit Confirmation
import React, { useState, useEffect, Suspense, useCallback, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { Home, Building, FileText, User as UserIcon, Wifi, WifiOff, Crown, AlertCircle } from 'lucide-react';
import { database } from './services/database/Database';
import { firebaseSyncService } from './services/database/FirebaseSync';
import Dashboard from './pages/Dashboard';
import AuthWrapper, { useAuth, AuthProvider } from './components/auh/AuthWrapper';
import Invoices from './pages/invoices/Invoices';
import Properties from './pages/properties/PropertyList';
import Profile from './pages/Profile';
import type { User } from './services/database/Database';

// Capacitor imports for platform detection and app handling
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

// Loading component with skeleton animation
const LoadingSpinner = () => (
  <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-purple-900">
    <div className="flex items-center justify-center h-screen">
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-4 border-blue-200 dark:border-blue-800"></div>
        <div className="absolute top-0 left-0 w-12 h-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
      </div>
    </div>
  </div>
);

// Exit Confirmation Dialog Component
const ExitConfirmationDialog = ({ isOpen, onConfirm, onCancel }: {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-sm w-full mx-4 animate-in fade-in duration-200">
        <div className="p-6">
          <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 dark:bg-red-900 rounded-full">
            <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white text-center mb-2">
            Exit Application?
          </h3>
          <p className="text-gray-600 dark:text-gray-400 text-center mb-6">
            Are you sure you want to close the application? Any unsaved changes may be lost.
          </p>
          <div className="flex space-x-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-200"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-2 text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors duration-200"
            >
              Exit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Enhanced Status Bar Component
const StatusBar = () => {
  const { user } = useAuth();
  const [syncStatus, setSyncStatus] = useState<{
    lastSync: string;
    isOnline: boolean;
    syncInProgress: boolean;
  }>({
    lastSync: 'Never',
    isOnline: navigator.onLine,
    syncInProgress: false
  });

  useEffect(() => {
    const updateOnlineStatus = () => {
      setSyncStatus(prev => ({ ...prev, isOnline: navigator.onLine }));
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Update sync status periodically
    const interval = setInterval(async () => {
      if (user) {
        try {
          const status = await firebaseSyncService.getSyncStatus(user.id);
          setSyncStatus(prev => ({
            ...prev,
            lastSync: status.lastUploadTime,
            syncInProgress: status.syncInProgress
          }));
        } catch (error) {
          console.error('Failed to get sync status:', error);
        }
      }
    }, 30000); // Update every 30 seconds

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      clearInterval(interval);
    };
  }, [user]);

  if (!user) return null;

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'enterprise': return 'text-purple-600';
      case 'pro': return 'text-blue-600';
      case 'business': return 'text-blue-600';
      case 'low': return 'text-green-600';
      case 'solo': return 'text-indigo-600';
      case 'free': return 'text-gray-600';
      default: return 'text-gray-500';
    }
  };

  const getTierIcon = (tier: string) => {
    return tier !== 'free' ? <Crown className="w-3 h-3" /> : null;
  };

  return (
    <div className="fixed top-0 left-0 right-0 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-1 text-xs flex items-center justify-between z-50">
      <div className="flex items-center space-x-2">
        <span className={`flex items-center space-x-1 ${getTierColor(user.tier)}`}>
          {getTierIcon(user.tier)}
          <span className="text-white font-medium capitalize">{user.tier} Plan</span>
        </span>
        {!user.storage && user.tier !== 'business' && user.tier !== 'solo' && user.tier !== 'pro' && user.tier !== 'enterprise' && (
          <AlertCircle className="w-3 h-3 text-yellow-300" />
        )}
      </div>
      
      <div className="flex items-center space-x-2">
        {user.storage && (
          <>
            {syncStatus.syncInProgress ? (
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-yellow-300 rounded-full animate-pulse"></div>
                <span>Syncing...</span>
              </div>
            ) : (
              <span className="text-xs opacity-75">
                Last sync: {syncStatus.lastSync === 'Never' ? 'Never' : 
                  new Date(syncStatus.lastSync).toLocaleTimeString()}
              </span>
            )}
          </>
        )}
        
        <div className="flex items-center space-x-1">
          {syncStatus.isOnline ? (
            <Wifi className="w-3 h-3 text-green-300" />
          ) : (
            <WifiOff className="w-3 h-3 text-red-300" />
          )}
          <span className="text-xs">
            {syncStatus.isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>
    </div>
  );
};

// Enhanced Navigation with Tier Restrictions
const BottomNavigation = () => {
  const { user } = useAuth();
  
  const navItems = [
    { path: '/', icon: Home, label: 'Dashboard', color: 'blue', restricted: false },
    { path: '/properties', icon: Building, label: 'Properties', color: 'indigo', restricted: false },
    { path: '/invoices', icon: FileText, label: 'Invoices', color: 'purple', restricted: false },
    { path: '/profile', icon: UserIcon, label: 'Profile', color: 'green', restricted: false },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-lg border-t border-gray-200/50 dark:border-gray-700/50 z-50">
      <div className="safe-area-inset-bottom">
        <div className="flex justify-around items-center py-2">
          {navItems.map(({ path, icon: Icon, label, color, restricted }) => {
            const activeColorClasses: { [key: string]: string } = {
              blue: 'text-blue-600 dark:text-blue-400',
              indigo: 'text-indigo-600 dark:text-indigo-400',
              purple: 'text-purple-600 dark:text-purple-400',
              green: 'text-green-600 dark:text-green-400',
            };
            const inactiveColorClasses = 'text-gray-400 dark:text-gray-500';

            // Check if user can access this feature
            const canAccess = !restricted || (user && (
              user.tier === 'business' || 
              user.tier === 'solo' ||
              user.tier === 'pro' || 
              user.tier === 'enterprise' || 
              user.type === 'paid'
            ));

            return (
              <NavLink
                key={path}
                to={path}
                end={path === '/'}
                className={({ isActive }) => {
                  const baseClasses = `flex flex-col items-center space-y-1 px-3 py-2 rounded-xl transition-all duration-200 min-w-[44px] min-h-[44px]`;
                  const stateClasses = isActive ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800';
                  const accessClasses = !canAccess ? 'opacity-50 cursor-not-allowed' : '';
                  return `${baseClasses} ${stateClasses} ${accessClasses}`;
                }}
                onClick={(e) => {
                  if (!canAccess) {
                    e.preventDefault();
                    // Could show upgrade modal here
                  }
                }}
              >
                {({ isActive }) => (
                  <>
                    <Icon 
                      className={`w-6 h-6 transition-all duration-200 ${
                        isActive ? 'scale-110' : ''
                      } ${isActive && canAccess ? activeColorClasses[color] : inactiveColorClasses}`} 
                    />
                    <span 
                      className={`text-xs font-medium transition-all duration-200 ${
                        isActive && canAccess ? activeColorClasses[color] : inactiveColorClasses
                      }`}
                    >
                      {label}
                    </span>
                    {restricted && !canAccess && (
                      <Crown className="w-2 h-2 text-yellow-500 absolute -top-1 -right-1" />
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

// Error Boundary Component
class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900 dark:to-red-800 flex items-center justify-center p-4">
          <div className="text-center bg-white dark:bg-gray-800 rounded-xl shadow-xl p-8 max-w-md">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">⚠️</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Something went wrong</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              The app encountered an unexpected error. Please try refreshing the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg transition-colors duration-200"
            >
              Refresh App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Main Layout Component with Status Bar and Exit Handling
const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [exitMethod, setExitMethod] = useState<'dialog' | 'doubleclick'>('dialog');
  const lastBackPressRef = useRef<number>(0);
  const backPressTimeoutRef = useRef<NodeJS.Timeout>(null);
  const platform = Capacitor.getPlatform();

  // Handle exit confirmation
  const handleExitConfirm = useCallback(() => {
    setShowExitDialog(false);
    if (platform === 'android' || platform === 'ios') {
      CapacitorApp.exitApp();
    } else if (platform === 'electron') {
      // For Electron, we can use window.close() or send a message to the main process
      if ((window as any).electronAPI?.closeApp) {
        (window as any).electronAPI.closeApp();
      } else {
        window.close();
      }
    } else {
      // For web, we can't actually close the tab, but we can navigate away or show a message
      window.location.href = 'about:blank';
    }
  }, [platform]);

  const handleExitCancel = useCallback(() => {
    setShowExitDialog(false);
  }, []);

  // Show toast message for double-click exit
  const showDoubleClickToast = useCallback(() => {
    // Create a temporary toast notification
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-lg z-[9998] text-sm';
    toast.textContent = 'Press back again to exit';
    document.body.appendChild(toast);
    
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 2000);
  }, []);

  // Handle back button press with different strategies
  const handleBackButton = useCallback(() => {
    const now = Date.now();
    
    if (exitMethod === 'dialog') {
      setShowExitDialog(true);
    } else if (exitMethod === 'doubleclick') {
      if (now - lastBackPressRef.current < 2000) {
        // Double click detected within 2 seconds
        if (backPressTimeoutRef.current) {
          clearTimeout(backPressTimeoutRef.current);
        }
        handleExitConfirm();
      } else {
        // First click
        lastBackPressRef.current = now;
        showDoubleClickToast();
        
        // Reset the double-click timer after 2 seconds
        if (backPressTimeoutRef.current) {
          clearTimeout(backPressTimeoutRef.current);
        }
        backPressTimeoutRef.current = setTimeout(() => {
          lastBackPressRef.current = 0;
        }, 2000);
      }
    }
  }, [exitMethod, handleExitConfirm, showDoubleClickToast]);

  // Set up platform-specific exit handling
  useEffect(() => {
    let backButtonListener: any;

    // Determine exit method based on platform and user preference
    const storedMethod = localStorage.getItem('exitMethod') as 'dialog' | 'doubleclick' | null;
    if (storedMethod) {
      setExitMethod(storedMethod);
    } else {
      // Default: dialog for desktop/electron, double-click for mobile
      const defaultMethod = (platform === 'android' || platform === 'ios') ? 'doubleclick' : 'dialog';
      setExitMethod(defaultMethod);
      localStorage.setItem('exitMethod', defaultMethod);
    }

    if (platform === 'android' || platform === 'ios') {
      // Handle hardware back button on mobile
      backButtonListener = CapacitorApp.addListener('backButton', (data) => {
        if (data.canGoBack) {
          // If we can go back in the web history, do that
          window.history.back();
        } else {
          // Otherwise, handle app exit
          handleBackButton();
        }
      });
    } else if (platform === 'electron') {
      // Handle window close attempt on Electron
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        handleBackButton();
        return false;
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      
      // Also listen for custom electron events if available
      if ((window as any).electronAPI?.onAppClose) {
        (window as any).electronAPI.onAppClose(() => {
          handleBackButton();
        });
      }

      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    } else {
      // For web, handle the beforeunload event
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        if (showExitDialog) return; // Don't show browser dialog if our dialog is already showing
        
        e.preventDefault();
        e.returnValue = ''; // This will show the browser's default confirmation dialog
        return '';
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }

    // Cleanup function for mobile listeners
    return () => {
      if (backButtonListener) {
        backButtonListener.remove();
      }
      if (backPressTimeoutRef.current) {
        clearTimeout(backPressTimeoutRef.current);
      }
    };
  }, [platform, handleBackButton, showExitDialog]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-purple-900 transition-colors duration-300">
      {/* Enhanced Status bar */}
      <StatusBar />
      
      {/* Main content with top padding for status bar */}
      <main className="pt-8 pb-20 min-h-screen">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </div>
      </main>

      {/* Bottom Navigation */}
      <BottomNavigation />

      {/* Exit Confirmation Dialog */}
      <ExitConfirmationDialog
        isOpen={showExitDialog}
        onConfirm={handleExitConfirm}
        onCancel={handleExitCancel}
      />
    </div>
  );
};

// Wrapper components for pages with enhanced user checking
const PropertiesWrapper = () => {
  const { user } = useAuth();
  
  const handleNavigateToProperty = (property: any) => {
    console.log('Navigate to property:', property);
  };

  // Check user limits and show appropriate message
  const [limits, setLimits] = useState<{
    properties: { current: number; max: number; exceeded: boolean };
    tenants: { current: number; max: number; exceeded: boolean };
    canSync: boolean;
  } | null>(null);

  useEffect(() => {
    const checkLimits = async () => {
      if (user) {
        try {
          const userLimits = await database.checkUserLimits(user.id);
          setLimits(userLimits);
        } catch (error) {
          console.error('Failed to check user limits:', error);
        }
      }
    };

    checkLimits();
  }, [user]);

  if (limits && limits.properties.exceeded) {
    return (
      <div className="p-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
          <Crown className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-yellow-800 mb-2">Property Limit Reached</h3>
          <p className="text-yellow-700 mb-4">
            You've reached the maximum number of properties for your {user?.tier} plan.
            You can view your existing {limits.properties.max} properties, but to add more, please upgrade your plan.
          </p>
          <button className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded-lg transition-colors duration-200">
            Upgrade Plan
          </button>
        </div>
      </div>
    );
  }

  return (
    <Properties 
      onNavigateToProperty={handleNavigateToProperty}
      currentUserId={user?.id || 1}
      user={user}
    />
  );
};

const InvoicesWrapper = () => {
  const {user} = useAuth();
  const {company} = useAuth();
  
  const handleNavigate = (page: string, params?: any) => {
    console.log('Navigate to:', page, params);
  };

  return <Invoices onNavigate={handleNavigate} user = {user} userCompany = {company} />;
};

const DashboardWrapper = () => {
  const { user } = useAuth();

  return <Dashboard userData = {user} />;
};

// Enhanced Profile Wrapper with Sync Management
const ProfileWrapper = () => {
  const { user } = useAuth();
  const [_syncStatus, setSyncStatus] = useState<any>(null);

  useEffect(() => {
    const loadSyncStatus = async () => {
      if (user) {
        try {
          const status = await firebaseSyncService.getSyncStatus(user.id);
          setSyncStatus(status);
        } catch (error) {
          console.error('Failed to load sync status:', error);
        }
      }
    };

    loadSyncStatus();
  }, [user]);

  return <Profile/>;// syncStatus={syncStatus} 
};

// App Content Component with Enhanced Routing
const AppContent: React.FC = () => {
  return (
    <AuthWrapper>
      <Router>
        <AppLayout>
          <Routes>
            <Route path="/" element={
              <Suspense fallback={<LoadingSpinner />}>
                <DashboardWrapper />
              </Suspense>
            } />
            <Route path="/properties" element={
              <Suspense fallback={<LoadingSpinner />}>
                <PropertiesWrapper />
              </Suspense>
            } />
            <Route path="/invoices" element={
              <Suspense fallback={<LoadingSpinner />}>
                <InvoicesWrapper />
              </Suspense>
            } />
            <Route path="/profile" element={
              <Suspense fallback={<LoadingSpinner />}>
                <ProfileWrapper />
              </Suspense>
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppLayout>
      </Router>
    </AuthWrapper>
  );
};

// Enhanced Main App Component with Sync Initialization
// Enhanced Main App Component with FIXED Sync Initialization
const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const syncInitializedRef = useRef(false);

  useEffect(() => {
    // Initialize app with PROPER SEQUENCE
    const initializeApp = async () => {
      try {
        // STEP 1: Initialize database FIRST and WAIT for completion
        console.log('📊 Step 1/3: Initializing database...');
        await database.initializeDatabase();
        console.log('✅ Database initialized');
        
        // STEP 2: Wait for database to settle
        console.log('⏳ Step 2/3: Waiting for database to settle...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check for dark mode preference
        const darkMode = localStorage.getItem('darkMode') === 'true' || 
          (!localStorage.getItem('darkMode') && window.matchMedia('(prefers-color-scheme: dark)').matches);
        setIsDarkMode(darkMode);

        // STEP 3: Check for saved user and initialize sync
        console.log('👤 Step 3/3: Checking for saved user...');
        const savedUser = localStorage.getItem('currentUser');
        
        if (savedUser) {
          try {
            const userData = JSON.parse(savedUser);
            let dbUser = await database.getUserById(userData.id);
            
            if (dbUser) {
              console.log('Found local user:', {
                email: dbUser.email,
                tier: dbUser.tier,
                type: dbUser.type,
                storage: dbUser.storage
              });
              
              // Check if we're online before trying Firestore
              if (navigator.onLine) {
                console.log('🌐 Online - checking Firestore for user updates...');
                try {
                  // downloadUserUpdates now returns the updated user data
                  const firestoreUpdate = await firebaseSyncService.downloadUserUpdates(dbUser.id);
                  
                  if (firestoreUpdate) {
                    console.log('✅ User data updated from Firestore:', firestoreUpdate);
                    
                    // Refresh user from database (it was already updated by downloadUserUpdates)
                    dbUser = await database.getUserById(dbUser.id);
                    
                    if (dbUser) {
                      console.log('Updated local user:', {
                        email: dbUser.email,
                        tier: dbUser.tier,
                        type: dbUser.type,
                        storage: dbUser.storage
                      });
                      localStorage.setItem('currentUser', JSON.stringify(dbUser));
                    }
                  }
                } catch (firestoreError) {
                  console.warn('⚠️ Could not check Firestore (will use local data):', firestoreError);
                  // Continue with local user data - app should work offline
                }
              } else {
                console.log('📴 Offline - using local user data');
              }
              
              // Set user state
              if (dbUser) {
                setUser(dbUser);
                
                // NOW set up sync if user has permissions
                const canSync = dbUser.tier === 'business' || 
                               dbUser.tier === 'pro' || 
                               dbUser.tier === 'solo' || 
                               dbUser.tier === 'enterprise' || 
                               dbUser.storage === true;
                
                if (canSync && navigator.onLine) {
                  console.log('🔄 User has sync permissions, initializing sync service...');
                  
                  try {
                    // CRITICAL: Only initialize sync ONCE
                    if (!syncInitializedRef.current) {
                      syncInitializedRef.current = true;
                      
                      // Wait a bit more to ensure database is fully ready
                      await new Promise(resolve => setTimeout(resolve, 500));
                      
                      // Initialize sync service (this will handle user listener and scheduling)
                      await firebaseSyncService.initializeForUser(dbUser.id);
                      console.log('✅ Sync service initialized successfully');
                    }
                  } catch (syncError) {
                    console.error('❌ Sync initialization failed:', syncError);
                    syncInitializedRef.current = false; // Allow retry
                    // Continue without sync - app should work offline
                  }
                } else if (!canSync) {
                  console.log('ℹ️ User has no sync permissions:', {
                    email: dbUser.email,
                    tier: dbUser.tier,
                    type: dbUser.type,
                    storage: dbUser.storage
                  });
                } else {
                  console.log('📴 Offline - sync will initialize when online');
                }
              }
            }
          } catch (error) {
            console.error('❌ Failed to initialize saved user:', error);
            localStorage.removeItem('currentUser');
          }
        } else {
          console.log('ℹ️ No saved user found');
        }
        
        // Allow UI to render
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error('❌ Failed to initialize app:', error);
      } finally {
        setIsLoading(false);
        console.log('✅ App initialization complete');
      }
    };

    initializeApp();

    // Cleanup sync listeners on unmount
    return () => {
      if (user) {
        firebaseSyncService.cleanup(user.id);
      }
    };
  }, []); // Empty dependency array - only run once on mount

  useEffect(() => {
    // Apply dark mode class to html element
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', isDarkMode.toString());
  }, [isDarkMode]);

  // Handle app state changes for better sync management
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (!document.hidden && user && navigator.onLine) {
        // App became visible and we're online
        try {
          console.log('👁️ App became visible, checking for updates...');
          
          // Check for user updates
          const firestoreUpdate = await firebaseSyncService.downloadUserUpdates(user.id);
          
          if (firestoreUpdate) {
            // Get fresh user from database
            const updatedUser = await database.getUserById(user.id);
            
            if (updatedUser) {
              const tierChanged = updatedUser.tier !== user.tier;
              const typeChanged = updatedUser.type !== user.type;
              const storageChanged = updatedUser.storage !== user.storage;
              
              if (tierChanged || typeChanged || storageChanged) {
                console.log('🔄 User permissions changed:', {
                  old: { tier: user.tier, type: user.type, storage: user.storage },
                  new: { tier: updatedUser.tier, type: updatedUser.type, storage: updatedUser.storage }
                });
                
                // Update React state
                setUser(updatedUser);
                localStorage.setItem('currentUser', JSON.stringify(updatedUser));
                
                // If user now has sync permissions and wasn't syncing before
                const nowCanSync = updatedUser.tier === 'business' || 
                                  updatedUser.tier === 'pro' || 
                                  updatedUser.tier === 'solo' || 
                                  updatedUser.tier === 'enterprise' || 
                                  updatedUser.storage;
                
                const couldSyncBefore = user.tier === 'business' || 
                                       user.tier === 'pro' || 
                                       user.tier === 'solo' || 
                                       user.tier === 'enterprise' || 
                                       user.storage;
                
                if (nowCanSync && !couldSyncBefore && !syncInitializedRef.current) {
                  console.log('🚀 Setting up sync for newly upgraded user');
                  syncInitializedRef.current = true;
                  
                  try {
                    await firebaseSyncService.initializeForUser(updatedUser.id);
                  } catch (error) {
                    console.error('❌ Failed to initialize sync for upgraded user:', error);
                    syncInitializedRef.current = false;
                  }
                }
              }
            }
          }
          
          // Perform catch-up sync if user has permissions
          const canSync = user.tier === 'business' || 
                         user.tier === 'pro' || 
                         user.tier === 'solo' || 
                         user.tier === 'enterprise' || 
                         user.storage;
          
          if (canSync && syncInitializedRef.current) {
            try {
              const status = await firebaseSyncService.getSyncStatus(user.id);
              const timeSinceLastSync = status.lastUploadTime === 'Never' ? 
                Infinity : Date.now() - new Date(status.lastUploadTime).getTime();
              
              // Sync if more than 12 hours since last upload
              if (timeSinceLastSync > 12 * 60 * 60 * 1000) {
                console.log('⏰ Performing catch-up sync (12+ hours since last sync)...');
                await firebaseSyncService.forceUpload(user.id);
              }
            } catch (error) {
              console.error('❌ Catch-up sync failed:', error);
            }
          }
        } catch (error) {
          console.error('❌ Visibility change handler failed:', error);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user]);

  // Handle online/offline status changes
  useEffect(() => {
    const handleOnline = async () => {
      console.log('🌐 App came online');
      
      if (user && !syncInitializedRef.current) {
        const canSync = user.tier === 'business' || 
                       user.tier === 'pro' || 
                       user.tier === 'solo' || 
                       user.tier === 'enterprise' || 
                       user.storage;
        
        if (canSync) {
          console.log('🚀 Initializing sync now that we\'re online...');
          syncInitializedRef.current = true;
          
          try {
            await firebaseSyncService.initializeForUser(user.id);
          } catch (error) {
            console.error('❌ Failed to initialize sync when coming online:', error);
            syncInitializedRef.current = false;
          }
        }
      }
    };

    const handleOffline = () => {
      console.log('📴 App went offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <AppErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </AppErrorBoundary>
  );
};

//export default App;

// const App: React.FC = () => {
//   const [isLoading, setIsLoading] = useState(true);
//   const [isDarkMode, setIsDarkMode] = useState(false);
//   const [user, setUser] = useState<User | null>(null);

//     useEffect(() => {
//     // Initialize app with FIXED Firestore update checking
//     const initializeApp = async () => {
//       try {
//         await database.initializeDatabase();
        
//         // Check for dark mode preference
//         const darkMode = localStorage.getItem('darkMode') === 'true' || 
//           (!localStorage.getItem('darkMode') && window.matchMedia('(prefers-color-scheme: dark)').matches);
//         setIsDarkMode(darkMode);

//         // Check for saved user
//         const savedUser = localStorage.getItem('currentUser');
//         if (savedUser) {
//           try {
//             const userData = JSON.parse(savedUser);
//             let dbUser = await database.getUserById(userData.id);
            
//             if (dbUser) {
//               // CRITICAL FIX: ALWAYS check Firestore for user updates - UNCOMMENTED!
//               console.log('Checking Firestore for user updates...');
//               try {
//                 const firestoreUser = await firebaseSyncService.downloadUserUpdates(dbUser.id);
//                 if (firestoreUser) {//An expression of type 'void' cannot be tested for truthiness.ts(1345)
//                   // console.log('Found user updates in Firestore:', {
//                   //   email: firestoreUser.email,
//                   //   oldTier: dbUser.tier,
//                   //   newTier: firestoreUser.tier,
//                   //   oldType: dbUser.type, 
//                   //   newType: firestoreUser.type,
//                   //   oldStorage: dbUser.storage,
//                   //   newStorage: firestoreUser.storage
//                   // });

//                   // Update tier, type, and storage from Firestore
//                   await database.updateUserTierAndType(
//                     dbUser.id,
//                     firestoreUser.tier as UserTier,///Property 'tier' does not exist on type 'never'.ts(2339)
//                     firestoreUser.type as UserType,//Property 'type' does not exist on type 'never'.ts(2339)
//                     firestoreUser.storage//Property 'storage' does not exist on type 'never'.ts(2339)
//                   );
                  
//                   // Get the updated user from database
//                   dbUser = await database.getUserById(dbUser.id);
//                   console.log('User updated from Firestore:', {
//                     email: dbUser?.email,
//                     tier: dbUser?.tier, 
//                     type: dbUser?.type, 
//                     storage: dbUser?.storage
//                   });

//                   // Update saved user data
//                   //if (dbUser) {
//                     localStorage.setItem('currentUser', JSON.stringify(firestoreUser));
//                   //}
//                 }
//               } catch (firestoreError) {
//                 console.log('Could not check Firestore (offline mode):', firestoreError);
//                 // Continue with local user data - app should work offline
//               }
              
//               if (dbUser) {
//                 setUser(dbUser);
                
//                 // NOW set up sync based on UPDATED permissions
//                 if (dbUser.tier === 'business' || dbUser.tier === 'pro' || dbUser.tier === 'solo' || dbUser.tier === 'enterprise' || dbUser.storage) {
//                   console.log('Setting up sync for user with updated permissions:', {
//                     email: dbUser.email, 
//                     tier: dbUser.tier,
//                     type: dbUser.type,
//                     storage: dbUser.storage
//                   });
                  
//                   // Set up real-time user listener
//                   firebaseSyncService.setupUserListener(dbUser.id, (updatedUser) => {
//                     console.log('User updated via listener:', {
//                       email: updatedUser.email, 
//                       tier: updatedUser.tier,
//                       type: updatedUser.type,
//                       storage: updatedUser.storage
//                     });
//                     setUser(updatedUser);
//                     localStorage.setItem('currentUser', JSON.stringify(updatedUser));
//                   });

//                   // Start automatic sync
//                   firebaseSyncService.initializeForUser(dbUser.id);

//                   // Perform initial full sync if needed
//                   try {
//                     const status = await firebaseSyncService.getSyncStatus(dbUser.id);
//                     if (status.lastUploadTime === 'Never' || 
//                         (Date.now() - new Date(status.lastUploadTime).getTime()) > 24 * 60 * 60 * 1000) {
//                       console.log('Performing initial sync...');
//                       await firebaseSyncService.initializeForUser(dbUser.id);
//                     }
//                   } catch (syncError) {
//                     console.error('Initial sync failed:', syncError);
//                     // Continue without sync - app should work offline
//                   }
//                 } else {
//                   console.log('User has no sync permissions:', {
//                     email: dbUser.email,
//                     tier: dbUser.tier, 
//                     type: dbUser.type,
//                     storage: dbUser.storage
//                   });
//                 }
//               }
//             }
//           } catch (error) {
//             console.error('Failed to initialize saved user:', error);
//             localStorage.removeItem('currentUser');
//           }
//         }
        
//         // Simulate loading time for smooth UX
//         await new Promise(resolve => setTimeout(resolve, 1000));
//       } catch (error) {
//         console.error('Failed to initialize app:', error);
//       } finally {
//         setIsLoading(false);
//       }
//     };

//     initializeApp();

//     // Cleanup sync listeners on unmount
//     return () => {
//       firebaseSyncService.cleanup();
//     };
//   }, []);

//   useEffect(() => {
//     // Apply dark mode class to html element
//     if (isDarkMode) {
//       document.documentElement.classList.add('dark');
//     } else {
//       document.documentElement.classList.remove('dark');
//     }
//     localStorage.setItem('darkMode', isDarkMode.toString());
//   }, [isDarkMode]);

//   // Handle app state changes for better sync management
//   useEffect(() => {
//     const handleVisibilityChange = async () => {
//   if (!document.hidden && user) {
//     // ALWAYS check for user updates when app becomes visible
//     try {
//       console.log('App became visible, checking for user updates...');
//       await firebaseSyncService.downloadUserUpdates(user.id);
      
//       // if (firestoreUser && (
//       //   firestoreUser.tier !== user.tier || 
//       //   firestoreUser.type !== user.type || 
//       //   firestoreUser.storage !== user.storage
//       // )) {
//       //   console.log('User tier/permissions changed:', {
//       //     old: { tier: user.tier, type: user.type, storage: user.storage },
//       //     new: { tier: firestoreUser.tier, type: firestoreUser.type, storage: firestoreUser.storage }
//       //   });
        
//       //   // Update local database
//       //   await database.updateUserTierAndType(
//       //     user.id,
//       //     firestoreUser.tier,
//       //     firestoreUser.type,
//       //     firestoreUser.storage
//       //   );
        
//         // Update React state
//         const updatedUser = await database.getUserById(user.id);
//         if (updatedUser) {
//           setUser(updatedUser);
//           localStorage.setItem('currentUser', JSON.stringify(updatedUser));
          
//           // If user now has sync permissions, set up listener
//           if ((updatedUser.tier === 'business' || updatedUser.tier === 'pro' || updatedUser.tier === 'solo' || updatedUser.tier === 'enterprise' || updatedUser.storage) &&
//               (user.tier === 'free' || (!user.storage && user.tier === 'low'))) {
//             console.log('Setting up sync for newly upgraded user');
            
//             firebaseSyncService.setupUserListener(updatedUser.id, (newUserData) => {
//               setUser(newUserData);
//               localStorage.setItem('currentUser', JSON.stringify(newUserData));
//             });
            
//             firebaseSyncService.initializeForUser(updatedUser.id);
//           }
//         }
//       //} 
      
//       // Also perform catch-up sync if user has permissions
//       if (user.tier === 'business' || user.tier === 'pro' || user.tier === 'solo' || user.tier === 'enterprise' || user.storage) {
//         const status = await firebaseSyncService.getSyncStatus(user.id);
//         const timeSinceLastSync = status.lastUploadTime === 'Never' ? 
//           Infinity : Date.now() - new Date(status.lastUploadTime).getTime();
        
//         if (timeSinceLastSync > 12 * 60 * 60 * 1000) {
//           console.log('Performing catch-up sync...');
//           await firebaseSyncService.forceUpload(user.id);
//         }
//       }
//     } catch (error) {
//       console.error('Visibility change sync failed:', error);
//     }
//   }
// };

//     document.addEventListener('visibilitychange', handleVisibilityChange);
//     return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
//   }, [user]);

//   if (isLoading) {
//     return <LoadingSpinner />;
//   }

//   return (
//     <AppErrorBoundary>
//       <AuthProvider>
//         <AppContent />
//       </AuthProvider>
//     </AppErrorBoundary>
//   );
// };

export default App;