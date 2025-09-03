// components/auth/AuthWrapper.tsx - Enhanced with User State Management and Sync
import React, { useState, useEffect, useContext, useCallback } from 'react';
import { database } from '../../services/database/Database';
import { firebaseSyncService } from '../../services/database/FirebaseSync';
import SignInScreen from './SignInScreen';
import SignUpScreen from './SignUpScreen';
import type { User, Company, AuthResult } from '../../services/database/Database';

// Enhanced Auth Context Interface
interface AuthContextType {
  user: User | null;
  company: Company | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updateUserState: (updatedUser: User) => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  syncStatus: {
    canSync: boolean;
    lastSync: string;
    isOnline: boolean;
  };
}

// Create Enhanced Auth Context
const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

// Custom hook to use Auth Context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// Loading component
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

// Auth Wrapper Screen (handles sign in/sign up switching)
const AuthWrapperScreen = () => {
  const [showSignUp, setShowSignUp] = useState(false);

  return showSignUp ? (
    <SignUpScreen onSwitchToSignIn={() => setShowSignUp(false)} />
  ) : (
    <SignInScreen onSwitchToSignUp={() => setShowSignUp(true)} />
  );
};

// Enhanced Auth Provider Component
interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSync, setLastSync] = useState<string>('Never');

  // Enhanced user state updater
  const updateUserState = useCallback((updatedUser: User) => {
    console.log('Updating user state:', updatedUser.email, updatedUser.tier);
    setUser(updatedUser);
    localStorage.setItem('currentUser', JSON.stringify(updatedUser));
  }, []);

  // Refresh user data from database
  const refreshUser = useCallback(async () => {
    if (!user) return;
    
    try {
      const refreshedUser = await database.getUserById(user.id);
      if (refreshedUser) {
        updateUserState(refreshedUser);
        
        // Refresh company if user is premium
        if (refreshedUser.type === 'paid') {
          const refreshedCompany = await database.getCompanyByUserId(refreshedUser.id);
          setCompany(refreshedCompany || null);
          
          if (refreshedCompany) {
            localStorage.setItem('currentCompany', JSON.stringify(refreshedCompany));
          } else {
            localStorage.removeItem('currentCompany');
          }
        } else {
          // Free users don't have companies
          setCompany(null);
          localStorage.removeItem('currentCompany');
        }
      }
    } catch (error) {
      console.error('Error refreshing user data:', error);
    }
  }, [user, updateUserState]);

  // Initialize auth state on app start
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        console.log('Initializing auth state...');
        
        // Initialize database first
        await database.initializeDatabase();
        
        // Check for saved user data
        const savedUser = localStorage.getItem('currentUser');
        const savedCompany = localStorage.getItem('currentCompany');
        
        if (savedUser) {
          try {
            const userData = JSON.parse(savedUser);
            console.log('Found saved user:', userData.email);
            
            // Get fresh user data from database
            const dbUser = await database.getUserById(userData.id);
            if (dbUser) {
              setUser(dbUser);
              
              // For premium users, load company
              if (dbUser.type === 'paid') {
                let companyData: Company | null = null;
                
                if (savedCompany) {
                  try {
                    companyData = JSON.parse(savedCompany);
                  } catch (error) {
                    console.error('Error parsing saved company:', error);
                  }
                }
                
                // Always refresh company from database for premium users
                const dbCompany = await database.getCompanyByUserId(dbUser.id);
                if (dbCompany) {
                  setCompany(dbCompany);
                  localStorage.setItem('currentCompany', JSON.stringify(dbCompany));
                } else if (companyData) {
                  // Use saved company if database doesn't have one
                  setCompany(companyData);
                } else {
                  localStorage.removeItem('currentCompany');
                }
              }
              
              console.log('User authenticated:', dbUser.email, 'Tier:', dbUser.tier, 'Type:', dbUser.type);
              
              // Set up sync for eligible users
              if (canUserSync(dbUser)) {
                await initializeUserSync(dbUser);
              }
              
              // Update sync status
              await updateSyncStatus(dbUser.id);
            } else {
              // User not found in database, clear saved data
              console.log('Saved user not found in database, clearing auth data');
              localStorage.removeItem('currentUser');
              localStorage.removeItem('currentCompany');
            }
          } catch (error) {
            console.error('Error loading saved user:', error);
            localStorage.removeItem('currentUser');
            localStorage.removeItem('currentCompany');
          }
        }
        
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Online/offline status monitoring
  useEffect(() => {
    const handleOnline = () => {
      console.log('App came online');
      setIsOnline(true);
      
      // Trigger sync if user has sync capabilities
      if (user && canUserSync(user)) {
        setTimeout(async () => {
          try {
            await firebaseSyncService.performFullSync(user.id);
            await updateSyncStatus(user.id);
          } catch (error) {
            console.error('Online sync failed:', error);
          }
        }, 1000);
      }
    };

    const handleOffline = () => {
      console.log('App went offline');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user]);

  // Helper function to check if user can sync
  const canUserSync = (user: User): boolean => {
    return user.tier === 'business' || user.tier === 'pro' || user.tier === 'enterprise' || user.storage === true;
  };

  // Initialize sync for eligible users
  const initializeUserSync = async (user: User) => {
    try {
      console.log('Setting up sync for user:', user.email);
      
      // Set up real-time user listener
      firebaseSyncService.setupUserListener(user.id, async (updatedUser) => {
        console.log('User updated via Firestore listener:', updatedUser.email);
        
        // Update local user state
        updateUserState(updatedUser);
        
        // Refresh company if needed
        if (updatedUser.type === 'paid') {
          const company = await database.getCompanyByUserId(updatedUser.id);
          setCompany(company || null);
          if (company) {
            localStorage.setItem('currentCompany', JSON.stringify(company));
          }
        } else {
          setCompany(null);
          localStorage.removeItem('currentCompany');
        }
      });

      // Start automatic sync
      firebaseSyncService.startAutomaticSync(user.id);
      
    } catch (error) {
      console.error('Failed to initialize user sync:', error);
    }
  };

  // Update sync status
  const updateSyncStatus = async (userId: number) => {
    try {
      const status = await firebaseSyncService.getSyncStatus(userId);
      setLastSync(status.lastSyncTime);
    } catch (error) {
      console.error('Failed to update sync status:', error);
    }
  };

  // Enhanced login function
  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      console.log('Attempting login for:', email);
      
      // Ensure database is initialized
      await database.initializeDatabase();
      
      // Authenticate user
      const result: AuthResult | null = await database.authenticateUser(email, password);
      
      if (result) {
        console.log('Authentication successful for:', result.user.email);
        console.log('User tier:', result.user.tier, 'Type:', result.user.type, 'Storage:', result.user.storage);
        
        // Set user state
        setUser(result.user);
        localStorage.setItem('currentUser', JSON.stringify(result.user));
        
        // Set company state (only for premium users)
        if (result.user.type === 'paid' && result.company) {
          setCompany(result.company);
          localStorage.setItem('currentCompany', JSON.stringify(result.company));
        } else {
          setCompany(null);
          localStorage.removeItem('currentCompany');
        }
        
        // Initialize sync if user is eligible
        if (canUserSync(result.user)) {
          await initializeUserSync(result.user);
          
          // Perform initial sync
          try {
            console.log('Performing post-login sync...');
            await firebaseSyncService.performFullSync(result.user.id);
            await updateSyncStatus(result.user.id);
          } catch (syncError) {
            console.error('Post-login sync failed:', syncError);
            // Don't fail login if sync fails - app works offline
          }
        }
        
        return true;
      } else {
        console.log('Authentication failed for:', email);
        return false;
      }
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  // Enhanced logout function
  const logout = () => {
    console.log('Logging out user');
    
    // Clean up sync listeners
    firebaseSyncService.cleanup();
    
    // Clear state
    setUser(null);
    setCompany(null);
    setLastSync('Never');
    
    // Clear localStorage
    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentCompany');
    localStorage.removeItem('lastSyncTime');
  };

  // Auth context value
  const value = {
    user,
    company,
    login,
    logout,
    refreshUser,
    updateUserState,
    isAuthenticated: !!user,
    isLoading,
    syncStatus: {
      canSync: user ? canUserSync(user) : false,
      lastSync,
      isOnline
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Auth Content Component (handles authenticated vs unauthenticated views)
interface AuthWrapperProps {
  children: React.ReactNode;
}

const AuthWrapper: React.FC<AuthWrapperProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <AuthWrapperScreen />;
  }

  return <>{children}</>;
};

export default AuthWrapper;