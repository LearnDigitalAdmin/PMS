import React, { useState, useEffect, useContext } from 'react';
import { database } from '../../services/database/Database';
import SignInScreen from './SignInScreen';
import SignUpScreen from './SignUpScreen';

// Auth Context Interface
interface AuthContextType {
  user: any | null;
  company: any | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
}

// Create Auth Context
const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

// Custom hook to use Auth Context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

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

// Auth Wrapper Component (handles sign in/sign up switching)
const AuthWrapperScreen = () => {
  const [showSignUp, setShowSignUp] = useState(false);

  return showSignUp ? (
    <SignUpScreen onSwitchToSignIn={() => setShowSignUp(false)} />
  ) : (
    <SignInScreen onSwitchToSignUp={() => setShowSignUp(true)} />
  );
};

// Auth Provider Component
interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing session on app start
    const checkAuthState = async () => {
      try {
        const savedUser = localStorage.getItem('currentUser');
        const savedCompany = localStorage.getItem('currentCompany');
        
        if (savedUser) {
          setUser(JSON.parse(savedUser));
        }
        if (savedCompany) {
          setCompany(JSON.parse(savedCompany));
        }
      } catch (error) {
        console.error('Error checking auth state:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthState();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const result = await database.authenticateUser(email, password);
      if (result) {
        setUser(result.user);
        setCompany(result.company);
        localStorage.setItem('currentUser', JSON.stringify(result.user));
        if (result.company) {
          localStorage.setItem('currentCompany', JSON.stringify(result.company));
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setCompany(null);
    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentCompany');
  };

  const value = {
    user,
    company,
    login,
    logout,
    isAuthenticated: !!user
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
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <AuthWrapperScreen />;
  }

  return <>{children}</>;
};

export default AuthWrapper;