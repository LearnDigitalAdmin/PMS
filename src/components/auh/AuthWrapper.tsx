// components/auth/AuthWrapper.tsx - Enhanced with Firebase Auth + Multi-Device Support
import React, { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { database } from '../../services/database/Database';
import { firebaseSyncService, functions } from '../../services/database/FirebaseSync';
import SignInScreen from './SignInScreen';
import SignUpScreen from './SignUpScreen';
import type { User, Company, AuthResult } from '../../services/database/Database';
import { 
  getFirestore, 
  query, 
  collection, 
  where, 
  getDocs, 
  doc,
  updateDoc,
  limit} from 'firebase/firestore';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type Auth,
  type UserCredential
} from 'firebase/auth';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { argon2Verify, argon2id } from 'hash-wasm';
import { httpsCallable } from 'firebase/functions';
import HeroSection from './HeroSection';

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyD1hg7YLv08vyR2kSWi2ymxSu2pYCRwPq8",
  authDomain: "plot-9fd6e.firebaseapp.com",
  projectId: "plot-9fd6e",
  storageBucket: "plot-9fd6e.firebasestorage.app",
  messagingSenderId: "1037620305589",
  appId: "1:1037620305589:web:2672a7dcaeca4c46b068fc",
  measurementId: "G-B90H3GJFPM"
};

// Initialize Firebase
let firebaseApp: FirebaseApp;
let auth: Auth;

try {
  firebaseApp = initializeApp(firebaseConfig);
  auth = getAuth(firebaseApp);
  console.log('✅ Firebase initialized successfully');
} catch (error) {
  console.error('❌ Firebase initialization error:', error);
}

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
  const authSectionRef = useRef<HTMLDivElement>(null);

  const goToAuth = (signUp: boolean) => {
    setShowSignUp(signUp);
    // wait a tick so the section is on screen before scrolling to it
    requestAnimationFrame(() => {
      authSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  };

  return (
    <div className="bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-800">
      <HeroSection
        onGetStarted={() => goToAuth(true)}
        onSignIn={() => goToAuth(false)}
      />

      <div ref={authSectionRef}>
        {showSignUp ? (
          <SignUpScreen onSwitchToSignIn={() => setShowSignUp(false)} />
        ) : (
          <SignInScreen onSwitchToSignUp={() => setShowSignUp(true)} />
        )}
      </div>
    </div>
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
  const [, setFirebaseAuthReady] = useState(false);

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

  // Password hashing helper - mints a fresh argon2 hash from a password that
  // Firebase Auth has just verified as correct. Used to resync the Firestore
  // `passwordHash` field (and, via createLocalUserFromFirestore, the local
  // `password_hash` column) after a successful Firebase Auth login - this is
  // what keeps offline auth valid after the user resets their password via
  // Firebase's forgot-password flow, which only updates Firebase Auth itself.
  const hashPassword = async (password: string): Promise<string> => {
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const result = await argon2id({
        password: password,
        salt: salt,
        hashLength: 32,
        iterations: 3,
        memorySize: 65536, // 64 MB in KB
        parallelism: 1,
        outputType: 'encoded'
      });
      return result;
    } catch (error) {
      console.error('Error hashing password:', error);
      throw error;
    }
  };

  // Password verification helper
  const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
    try {
          const result = await argon2Verify({
            password: password,
            hash: hash
          });
    
          return result === true;
        } catch (error) {
          console.error('Error verifying password:', error);
          return false;
        }
  };



  // NEW: Create Firebase Auth user and Firestore document
  // const createFirebaseAuthUser = async (
  //   email: string, 
  //   password: string, 
  //   userData: any
  // ): Promise<{ success: boolean; uid?: string; error?: string }> => {
  //   try {
  //     // Check if online
  //     if (!navigator.onLine) {
  //       alert('⚠️ Internet connection required to create a new account. Please check your connection and try again.');
  //       return { success: false, error: 'No internet connection' };
  //     }

  //     console.log('🔐 Creating Firebase Auth user for:', email);
      
  //     // Create Firebase Auth user
  //     const userCredential: UserCredential = await createUserWithEmailAndPassword(
  //       auth, 
  //       email.toLowerCase().trim(), 
  //       password
  //     );
      
  //     const uid = userCredential.user.uid;
  //     console.log('✅ Firebase Auth user created with UID:', uid);

  //     // Hash password for storage
  //     const passwordHash = await hashPassword(password);

  //     // Create Firestore document with UID field
  //     const db = getFirestore();
  //     const userDocRef = doc(db, 'users', userData.localId.toString());
      
  //     const firestoreData = {
  //       uid: uid, // Firebase Auth UID
  //       localId: userData.localId,
  //       name: userData.name,
  //       email: email.toLowerCase().trim(),
  //       phone: userData.phone || '',
  //       passwordHash: passwordHash,
  //       tier: userData.tier || 'free',
  //       type: userData.type || 'free',
  //       storage: userData.storage || false,
  //       isPremium: userData.isPremium || false,
  //       createdAt: new Date().toISOString(),
  //       updatedAt: new Date().toISOString(),
  //       company: userData.company || null
  //     };

  //     await setDoc(userDocRef, firestoreData);
  //     console.log('✅ Firestore user document created');

  //     alert('✅ Account created successfully! You can now sign in on any device.');
      
  //     return { success: true, uid };
      
  //   } catch (error: any) {
  //     console.error('❌ Firebase Auth creation error:', error);
      
  //     let errorMessage = 'Failed to create account';
      
  //     if (error.code === 'auth/email-already-in-use') {
  //       errorMessage = 'This email is already registered. Please sign in instead.';
  //       alert('⚠️ This email is already registered. Please sign in instead.');
  //     } else if (error.code === 'auth/weak-password') {
  //       errorMessage = 'Password is too weak. Please use a stronger password.';
  //       alert('⚠️ Password is too weak. Please use at least 6 characters.');
  //     } else if (error.code === 'auth/invalid-email') {
  //       errorMessage = 'Invalid email address.';
  //       alert('⚠️ Invalid email address. Please check and try again.');
  //     } else if (error.code === 'auth/network-request-failed') {
  //       errorMessage = 'Network error. Please check your connection.';
  //       alert('⚠️ Network error. Please check your internet connection.');
  //     } else {
  //       alert('⚠️ Failed to create account. Please try again.');
  //     }
      
  //     return { success: false, error: errorMessage };
  //   }
  // };

  // NEW: Sign in with Firebase Auth
  const signInWithFirebaseAuth = async (
    email: string, 
    password: string
  ): Promise<{ success: boolean; uid?: string; error?: string }> => {
    try {
      console.log('🔐 Signing in with Firebase Auth:', email);
      
      const userCredential: UserCredential = await signInWithEmailAndPassword(
        auth,
        email.toLowerCase().trim(),
        password
      );
      
      const uid = userCredential.user.uid;
      console.log('✅ Firebase Auth sign in successful, UID:', uid);
      
      return { success: true, uid };
      
    } catch (error: any) {
      console.error('❌ Firebase Auth sign in error:', error);
      
      let errorMessage = 'Authentication failed';
      
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        errorMessage = 'Invalid email or password';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please try again later.';
        alert('⚠️ Too many failed login attempts. Please try again later.');
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Trying offline login...';
        console.log('Network error, will try offline authentication');
      }
      
      return { success: false, error: errorMessage };
    }
  };

  // Multi-device login helper - check Firestore for user account
  const loginFromFirestore = async (email: string, password: string): Promise<{ success: boolean; user?: any; error?: string }> => {
    try {
      console.log('Attempting Firestore login for:', email);
      
      // First, try Firebase Auth if online
      let firebaseAuthVerified = false;
      if (navigator.onLine) {
        const authResult = await signInWithFirebaseAuth(email, password);
        if (!authResult.success && authResult.error !== 'Network error. Trying offline login...') {
          return { success: false, error: authResult.error };
        }
        
        if (authResult.success) {
          console.log('✅ Firebase Auth successful');
          firebaseAuthVerified = true;
        }
      }
      
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

      if (!firestoreUser.passwordHash) {
        return { success: false, error: 'Invalid account data' };
      }

      // Decide how to trust this password:
      // - If Firebase Auth just signed in successfully, that IS the
      //   authoritative password check - a stale Firestore hash (e.g. from
      //   before a "forgot password" reset, which only updates Firebase Auth)
      //   must not be allowed to override that. Instead of re-verifying
      //   against it, mint a fresh hash from the password we know is correct.
      // - If Firebase Auth couldn't be reached (network hiccup while
      //   navigator.onLine was true), we have no external proof, so fall
      //   back to verifying against the last-known stored hash.
      let isValidPassword: boolean;
      let refreshedHash: string | undefined;

      if (firebaseAuthVerified) {
        isValidPassword = true;
        refreshedHash = await hashPassword(password);
      } else {
        isValidPassword = await verifyPassword(password, firestoreUser.passwordHash);
      }

      if (!isValidPassword) {
        console.log('Invalid password for Firestore user');
        return { success: false, error: 'Invalid password' };
      }

      // Persist the refreshed hash so Firestore (and, downstream, the local
      // DB via createLocalUserFromFirestore) stop relying on the stale one.
      if (refreshedHash) {
        try {
          await updateDoc(doc(db, 'users', userDoc.id), {
            passwordHash: refreshedHash,
            updatedAt: new Date().toISOString()
          });
          firestoreUser.passwordHash = refreshedHash;
          console.log('✅ Refreshed Firestore passwordHash after Firebase Auth login');
        } catch (hashSyncError) {
          // Non-fatal: the user already authenticated via Firebase Auth.
          // Worst case, this resync is retried on their next online login.
          console.error('Failed to refresh Firestore passwordHash:', hashSyncError);
        }
      }

      console.log('Password verified for Firestore user');
      alert('✅ Signed in successfully! Syncing your data...');
      
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
  const createLocalUserFromFirestore = async (firestoreUser: any, password: string): Promise<User | null> => {
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
          password: password, 
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

      // Perform full data sync - this will replace all data
      await firebaseSyncService.forceDownload(userId);
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

  // Firebase Auth state listener
  useEffect(() => {
    if (!auth) return;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        console.log('🔐 Firebase Auth state: User signed in', firebaseUser.email);
        setFirebaseAuthReady(true);
      } else {
        console.log('🔐 Firebase Auth state: No user signed in');
        setFirebaseAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  // Online/offline status monitoring
  useEffect(() => {
    const handleOnline = () => {
      console.log('✅ App came online');
      setIsOnline(true);
      alert('✅ You are back online! Data will sync automatically.');
      
      // Trigger sync if user has sync capabilities
      if (user && canUserSync(user)) {
        setTimeout(async () => {
          try {
            await firebaseSyncService.startUploadScheduling(user.id);
            await updateSyncStatus(user.id);
          } catch (error) {
            console.error('Online sync failed:', error);
          }
        }, 1000);
      }
    };

    const handleOffline = () => {
      console.log('⚠️ App went offline');
      setIsOnline(false);
      alert('⚠️ You are offline. Changes will be saved locally and synced when you reconnect.');
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
    return user.tier === 'business' || user.tier === 'pro' || user.tier === 'solo' || user.tier === 'enterprise' || user.storage === true;
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
      firebaseSyncService.initializeForUser(user.id);
      
    } catch (error) {
      console.error('Failed to initialize user sync:', error);
    }
  };

  // Update sync status
  const updateSyncStatus = async (userId: number) => {
    try {
      const status = await firebaseSyncService.getSyncStatus(userId);
      setLastSync(status.lastUploadTime);
    } catch (error) {
      console.error('Failed to update sync status:', error);
    }
  };

  // Enhanced login function with Firebase Auth integration
  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log('Attempting login for:', email);
      
      // Ensure database is initialized
      await database.initializeDatabase();
      
      // Step 1: Try local authentication first (for existing offline users)
      console.log('Trying local authentication...');
      const localResult: AuthResult | null = await database.authenticateUser(email, password);
      
      if (localResult) {
        console.log('✅ LOCAL LOGIN SUCCESS - Local user data preserved');
        
        // Try Firebase Auth sign in if online (non-blocking)
        if (navigator.onLine) {
          try {
            await signInWithFirebaseAuth(email, password);
            console.log('✅ Firebase Auth session established');
          } catch (error) {
            console.log('Firebase Auth failed, continuing with local auth');
          }
        }
        
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
          if (navigator.onLine) {
            try {
              console.log('Performing LOCAL USER sync (preserves local data, only syncs tier updates)...');
              await firebaseSyncService.forceDownload(localResult.user.id);
              await updateSyncStatus(localResult.user.id);
              alert('✅ Signed in successfully! Your data is synced.');
            } catch (syncError) {
              console.error('Local user sync failed:', syncError);
              alert('✅ Signed in successfully! (Working offline - changes will sync later)');
            }
          } else {
            alert('✅ Signed in successfully! (Working offline - changes will sync when online)');
          }
        } else {
          alert('✅ Signed in successfully!');
        }
        
        return { success: true };
      }

      // Step 2: Try Firestore authentication if online - COMPLETE DATA REPLACEMENT
      if (!navigator.onLine) {
        console.log('⚠️ Offline and no local account found');
        alert('⚠️ No internet connection. Please connect to the internet to sign in.');
        return { success: false, error: 'No internet connection and no local account found' };
      }

      console.log('Local authentication failed, trying Firestore...');
      const firestoreResult = await loginFromFirestore(email, password);
      
      if (!firestoreResult.success) {
        console.log('Firestore authentication failed:', firestoreResult.error);
        alert('⚠️ ' + (firestoreResult.error || 'Authentication failed'));
        return { success: false, error: firestoreResult.error || 'Authentication failed' };
      }

      console.log('✅ FIRESTORE LOGIN SUCCESS - Will REPLACE all local data');
      
      // Step 3: Create/update local user from Firestore data - COMPLETE REPLACEMENT
      const localUser = await createLocalUserFromFirestore(firestoreResult.user!, password);
      if (!localUser) {
        alert('⚠️ Failed to create local account. Please try again.');
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
      alert('⚠️ Login failed. Please try again.');
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Authentication failed' 
      };
    }
  };

  // Enhanced logout function with Firebase Auth
  const logout = async () => {
    console.log('Logging out user');
    
    try {
      // Sign out from Firebase Auth if online
      if (navigator.onLine && auth) {
        await firebaseSignOut(auth);
        console.log('✅ Firebase Auth sign out successful');
      }
    } catch (error) {
      console.error('Firebase Auth sign out error:', error);
    }
    
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
    
    alert('✅ Signed out successfully!');
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

// Export helper function for SignUpScreen to use
export const createUserWithFirebaseAuth = async (
  email: string,
  password: string,
  userData: {
    localId: number;
    name: string;
    phone: string;
    tier: string;
    type: string;
    storage: boolean;
    isPremium: boolean;
    company?: any;
  }
): Promise<{ success: boolean; uid?: string; error?: string }> => {
  try {
    // Check if online
    if (!navigator.onLine) {
      alert('⚠️ Internet connection required to create a new account. Please check your connection and try again.');
      return { success: false, error: 'No internet connection' };
    }

    console.log('🔐 Calling Cloud Function to create user for:', email);
    
    // Call the Cloud Function
    const createUserFunction = httpsCallable(functions, 'createUserWithFirebaseAuth');
    
    const result = await createUserFunction({
      email: email,
      password: password,
      userData: {
        localId: userData.localId,
        name: userData.name,
        phone: userData.phone,
        tier: userData.tier,
        type: userData.type,
        storage: userData.storage,
        isPremium: userData.isPremium,
        company: userData.company
      },
      creationType: 'self' // Identifies this as self sign-up
    });

    const data = result.data as any;

    if (data.success) {
      console.log('✅ Cloud Function succeeded:', data.data);
      alert('✅ Account created successfully! You can now sign in on any device.');
      
      return { 
        success: true, 
        uid: data.data.uid 
      };
    } else {
      throw new Error(data.message || 'Failed to create account');
    }
    
  } catch (error: any) {
    console.error('❌ Cloud Function error:', error);
    
    let errorMessage = 'Failed to create account';
    
    // Handle Firebase Functions errors
    if (error.code === 'functions/already-exists') {
      errorMessage = 'This email or phone number is already registered. Please sign in instead.';
      alert('⚠️ This email is already registered. Please sign in instead.');
    } else if (error.code === 'functions/invalid-argument') {
      errorMessage = error.message || 'Invalid input. Please check your information.';
      alert('⚠️ ' + errorMessage);
    } else if (error.code === 'functions/unauthenticated') {
      errorMessage = 'Authentication error. Please try again.';
      alert('⚠️ Authentication error. Please try again.');
    } else if (error.code === 'functions/unavailable') {
      errorMessage = 'Service temporarily unavailable. Please try again.';
      alert('⚠️ Service temporarily unavailable. Please check your connection.');
    } else if (error.message) {
      errorMessage = error.message;
      alert('⚠️ ' + errorMessage);
    } else {
      alert('⚠️ Failed to create account. Please try again.');
    }
    
    return { success: false, error: errorMessage };
  }
};

export default AuthWrapper;