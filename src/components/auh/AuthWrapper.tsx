// components/auth/AuthWrapper.tsx - Enhanced with Multi-Device Support and Fixed User Data Handling
import React, { useState, useEffect, useContext, useCallback } from 'react';
import { database } from '../../services/database/Database';
import { firebaseSyncService } from '../../services/database/FirebaseSync';
import SignInScreen from './SignInScreen';
import SignUpScreen from './SignUpScreen';
import type { User, Company, AuthResult } from '../../services/database/Database';
import { 
  getFirestore, 
  query, 
  collection, 
  where, 
  getDocs, 
  limit 
} from 'firebase/firestore';

// Enhanced Auth Context Interface
interface AuthContextType {
  user: User | null;
  company: Company | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
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

  // Password verification helper
  const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(password + 'propertyflow_salt_2024');
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return passwordHash === hash;
    } catch (error) {
      console.error('Error verifying password:', error);
      return false;
    }
  };

  // Multi-device login helper - check Firestore for user account
  const loginFromFirestore = async (email: string, password: string): Promise<{ success: boolean; user?: any; error?: string }> => {
    try {
      console.log('Attempting Firestore login for:', email);
      const db = getFirestore();
      
      // Search for user by email in Firestore
      const usersQuery = query(
        collection(db, 'users'),
        where('email', '==', email.toLowerCase().trim()),
        limit(1)
      );
      
      const querySnapshot = await getDocs(usersQuery);
      
      if (querySnapshot.empty) {
        console.log('User not found in Firestore');
        return { success: false, error: 'Account not found' };
      }

      const userDoc = querySnapshot.docs[0];
      const firestoreUser = userDoc.data();
      
      console.log('Found user in Firestore:', firestoreUser.email);

      // Verify password against Firestore hash
      if (!firestoreUser.passwordHash) {
        return { success: false, error: 'Invalid account data' };
      }

      const isValidPassword = await verifyPassword(password, firestoreUser.passwordHash);
      if (!isValidPassword) {
        console.log('Invalid password for Firestore user');
        return { success: false, error: 'Invalid password' };
      }

      console.log('Password verified for Firestore user');
      return { 
        success: true, 
        user: {
          ...firestoreUser,
          firestoreId: userDoc.id,
          localId: firestoreUser.localId || firestoreUser.id
        }
      };
      
    } catch (error) {
      console.error('Error during Firestore login:', error);
      return { success: false, error: 'Connection error' };
    }
  };

  // Create/Update local user from Firestore data - COMPLETE REPLACEMENT
  const createLocalUserFromFirestore = async (firestoreUser: any): Promise<User | null> => {
    try {
      console.log('Creating/updating local user from Firestore data - COMPLETE REPLACEMENT');
      
      // Check if user already exists locally (by ID or email)
      let existingUser = await database.getUserById(firestoreUser.localId);
      if (!existingUser && firestoreUser.email) {
        existingUser = await database.getUserByEmail(firestoreUser.email);
      }

      if (existingUser) {
        console.log('User exists locally - REPLACING ALL DATA with Firestore data');
        
        // COMPLETE REPLACEMENT: Update ALL user data with Firestore data
        await database.updateUser(existingUser.id, {
          name: firestoreUser.name,
          email: firestoreUser.email,
          phone: firestoreUser.phone?.toString() || '',
          isPremium: firestoreUser.isPremium || false
        });

        // Update tier, type, and storage
        await database.updateUserTierAndType(
          existingUser.id,
          firestoreUser.tier || 'free',
          firestoreUser.type || 'free',
          firestoreUser.storage || false
        );

        // Update password hash to match Firestore
        const updateHashQuery = `
          UPDATE users 
          SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `;
        await database.db!.run(updateHashQuery, [firestoreUser.passwordHash, existingUser.id]);

        // Handle company data for paid users
        if (firestoreUser.company && firestoreUser.type === 'paid') {
          const existingCompany = await database.getCompanyByUserId(existingUser.id);
          if (existingCompany) {
            await database.updateCompany(existingCompany.id, {
              name: firestoreUser.company.name,
              address: firestoreUser.company.address || '',
              phone: firestoreUser.company.phone || '',
              email: firestoreUser.company.email || ''
            });
          } else {
            await database.createCompany(existingUser.id, {
              name: firestoreUser.company.name,
              address: firestoreUser.company.address || '',
              phone: firestoreUser.company.phone || '',
              email: firestoreUser.company.email || ''
            });
          }
        }

        console.log('Local user completely updated with Firestore data');
        return await database.getUserById(existingUser.id);
      }

      // Create new local user
      console.log('Creating new local user from Firestore');
      const userData = {
        user: {
          id: firestoreUser.localId,
          name: firestoreUser.name,
          email: firestoreUser.email,
          phone: firestoreUser.phone || 0,
          password: 'FIRESTORE_SYNCED', // Placeholder - will be overwritten
          type: firestoreUser.type || 'free',
          tier: firestoreUser.tier || 'free'
        },
        company: firestoreUser.company && firestoreUser.type === 'paid' ? {
          name: firestoreUser.company.name,
          address: firestoreUser.company.address || '',
          phone: firestoreUser.company.phone || '',
          email: firestoreUser.company.email || ''
        } : undefined
      };

      const result = await database.createUserWithCompany(userData);
      
      // Update password hash to match Firestore
      const updateHashQuery = `
        UPDATE users 
        SET password_hash = ?, tier = ?, type = ?, storage = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      await database.db!.run(updateHashQuery, [
        firestoreUser.passwordHash,
        firestoreUser.tier || 'free',
        firestoreUser.type || 'free',
        firestoreUser.storage ? 1 : 0,
        firestoreUser.localId
      ]);

      console.log('New local user created from Firestore data');
      return result.user;
      
    } catch (error) {
      console.error('Error creating/updating local user from Firestore:', error);
      return null;
    }
  };

  // Download user's complete data from Firestore - REPLACES ALL DATA
  const downloadCompleteUserData = async (userId: number): Promise<void> => {
    try {
      console.log('Downloading and REPLACING all user data from Firestore...');
      
      const user = await database.getUserById(userId);
      if (!user || !canUserSync(user)) {
        console.log('User cannot sync or user not found');
        return;
      }

      // Clear existing data first to ensure clean replacement
      console.log('Clearing existing local data before Firestore import...');
      
      // Note: We don't delete the user record, but we will replace all related data
      // during the sync process. The new flattened sync structure handles this better.

      // Perform full data sync - this will replace all data
      await firebaseSyncService.performFullSync(userId);
      console.log('Complete user data downloaded and ALL LOCAL DATA REPLACED');
      
    } catch (error) {
      console.error('Error downloading complete user data:', error);
      // Don't throw error - user can still work offline
    }
  };

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

  // Initialize sync for eligible users - UPDATED for new flattened structure
  const initializeUserSync = async (user: User) => {
    try {
      console.log('Setting up sync for user with flattened structure:', user.email);
      
      // Set up real-time user listener with RESTRICTED updates for local users
      firebaseSyncService.setupUserListener(user.id, async (updatedUser) => {
        console.log('User updated via Firestore listener - TIER/TYPE/STORAGE ONLY:', updatedUser.email);
        
        // CRITICAL: Only update tier, type, and storage - never core user data for local users
        const currentUser = await database.getUserById(user.id);
        if (currentUser) {
          // Only update tier, type, and storage
          await database.updateUserTierAndType(
            user.id,
            updatedUser.tier || 'free',
            updatedUser.type || 'free', 
            updatedUser.storage || false
          );
          
          // Get the updated user with new tier info
          const refreshedUser = await database.getUserById(user.id);
          if (refreshedUser) {
            updateUserState(refreshedUser);
          }
          
          // Refresh company if needed
          if (updatedUser.type === 'paid') {
            const company = await database.getCompanyByUserId(user.id);
            setCompany(company || null);
            if (company) {
              localStorage.setItem('currentCompany', JSON.stringify(company));
            }
          } else {
            setCompany(null);
            localStorage.removeItem('currentCompany');
          }
        }
      });

      // Start automatic sync with new flattened structure
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

  // Enhanced login function with proper data handling
  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log('Attempting login for:', email);
      
      // Ensure database is initialized
      await database.initializeDatabase();
      
      // Step 1: Try local authentication first
      console.log('Trying local authentication...');
      const localResult: AuthResult | null = await database.authenticateUser(email, password);
      
      if (localResult) {
        console.log('LOCAL LOGIN SUCCESS - Local user data preserved');
        
        // Set user state
        setUser(localResult.user);
        localStorage.setItem('currentUser', JSON.stringify(localResult.user));
        
        // Set company state (only for premium users)
        if (localResult.user.type === 'paid' && localResult.company) {
          setCompany(localResult.company);
          localStorage.setItem('currentCompany', JSON.stringify(localResult.company));
        } else {
          setCompany(null);
          localStorage.removeItem('currentCompany');
        }
        
        // Initialize sync if user is eligible - LOCAL USER SYNC
        if (canUserSync(localResult.user)) {
          await initializeUserSync(localResult.user);
          
          // Perform GENTLE sync - only updates tier/type/storage, uploads local data
          try {
            console.log('Performing LOCAL USER sync (preserves local data, only syncs tier updates)...');
            await firebaseSyncService.performFullSync(localResult.user.id);
            await updateSyncStatus(localResult.user.id);
          } catch (syncError) {
            console.error('Local user sync failed:', syncError);
            // Don't fail login if sync fails - app works offline
          }
        }
        
        return { success: true };
      }

      // Step 2: Try Firestore authentication - COMPLETE DATA REPLACEMENT
      console.log('Local authentication failed, trying Firestore...');
      const firestoreResult = await loginFromFirestore(email, password);
      
      if (!firestoreResult.success) {
        console.log('Firestore authentication failed:', firestoreResult.error);
        return { success: false, error: firestoreResult.error || 'Authentication failed' };
      }

      console.log('FIRESTORE LOGIN SUCCESS - Will REPLACE all local data');
      
      // Step 3: Create/update local user from Firestore data - COMPLETE REPLACEMENT
      const localUser = await createLocalUserFromFirestore(firestoreResult.user!);
      if (!localUser) {
        return { success: false, error: 'Failed to create local account' };
      }

      // Step 4: Set user state
      setUser(localUser);
      localStorage.setItem('currentUser', JSON.stringify(localUser));

      // Step 5: Set company state (only for premium users)
      if (localUser.type === 'paid') {
        const company = await database.getCompanyByUserId(localUser.id);
        setCompany(company || null);
        if (company) {
          localStorage.setItem('currentCompany', JSON.stringify(company));
        }
      } else {
        setCompany(null);
        localStorage.removeItem('currentCompany');
      }

      // Step 6: Initialize sync and REPLACE all local data with Firestore data
      if (canUserSync(localUser)) {
        await initializeUserSync(localUser);
        
        // Download and REPLACE complete user data
        setTimeout(async () => {
          try {
            console.log('REPLACING all local data with Firestore data...');
            await downloadCompleteUserData(localUser.id);
            await updateSyncStatus(localUser.id);
            console.log('Data replacement completed');
          } catch (error) {
            console.error('Background data replacement failed:', error);
          }
        }, 2000);
      }

      console.log('Firestore login completed - local data will be replaced');
      return { success: true };
      
    } catch (error) {
      console.error('Login error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Authentication failed' 
      };
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