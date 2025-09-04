import React from "react";

// Enhanced Auth Context Interface
interface AuthContextType {
  user: any | null;
  company: any | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updateUserState: (updatedUser: any) => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  syncStatus: {
    canSync: boolean;
    lastSync: string;
    isOnline: boolean;
  };
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};