import React, { useState, useEffect, Suspense } from 'react';
// CHANGED: Added NavLink to the import
import { BrowserRouter as Router, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { Home, Building, FileText, User } from 'lucide-react';
import { database } from './services/database/Database';
import Dashboard from './pages/Dashboard';
import AuthWrapper, { useAuth, AuthProvider } from './components/auh/AuthWrapper';
import Invoices from './pages/invoices/Invoices';
import Properties from './pages/properties/PropertyList';
// CHANGED: Import Profile from separate file
import Profile from './pages/Profile';

// Loading component with skeleton animation (No changes needed)
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

// Error Boundary Component (No changes needed)
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

// ==================================================================
// FIXED Navigation Component with React Router integration
// ==================================================================
const BottomNavigation = () => {
  // REMOVED: State management for path is no longer needed, NavLink handles it.
  // const [currentPath, setCurrentPath] = useState(window.location.pathname);
  // const navigate = (path: string) => { ... };

  const navItems = [
    { path: '/', icon: Home, label: 'Dashboard', color: 'blue' },
    { path: '/properties', icon: Building, label: 'Properties', color: 'indigo' },
    { path: '/invoices', icon: FileText, label: 'Invoices', color: 'purple' },
    { path: '/profile', icon: User, label: 'Profile', color: 'green' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-lg border-t border-gray-200/50 dark:border-gray-700/50 z-50">
      <div className="safe-area-inset-bottom">
        <div className="flex justify-around items-center py-2">
          {navItems.map(({ path, icon: Icon, label, color }) => {
            const activeColorClasses: { [key: string]: string } = {
              blue: 'text-blue-600 dark:text-blue-400',
              indigo: 'text-indigo-600 dark:text-indigo-400',
              purple: 'text-purple-600 dark:text-purple-400',
              green: 'text-green-600 dark:text-green-400',
            };
            const inactiveColorClasses = 'text-gray-400 dark:text-gray-500';

            return (
              // CHANGED: Replaced <button> with <NavLink>
              <NavLink
                key={path}
                to={path}
                // The 'end' prop ensures the root '/' link is only active on the exact path
                end={path === '/'} 
                // CHANGED: Use the `isActive` property from NavLink to determine classes
                className={({ isActive }) =>
                  `flex flex-col items-center space-y-1 px-3 py-2 rounded-xl transition-all duration-200 min-w-[44px] min-h-[44px] ${
                    isActive ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon 
                      className={`w-6 h-6 transition-all duration-200 ${
                        isActive ? 'scale-110' : ''
                      } ${isActive ? activeColorClasses[color] : inactiveColorClasses}`} 
                    />
                    <span 
                      className={`text-xs font-medium transition-all duration-200 ${
                        isActive ? activeColorClasses[color] : inactiveColorClasses
                      }`}
                    >
                      {label}
                    </span>
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

// Main Layout Component (No changes needed)
const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-purple-900 transition-colors duration-300">
      {/* Status bar background */}
      <div className="safe-area-inset-top bg-gradient-to-r from-blue-600 to-purple-600"></div>
      
      {/* Main content */}
      <main className="pb-20 min-h-screen">
        <div className="container mx-auto px-4 py-6 max-w-md">
          {children}
        </div>
      </main>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
};

// Wrapper components for the actual pages (No changes needed)
const PropertiesWrapper = () => {
  const { user } = useAuth();
  
  const handleNavigateToProperty = (property: any) => {
    // Handle property navigation - you can implement this based on your needs
    console.log('Navigate to property:', property);
  };

  return (
    <Properties 
      onNavigateToProperty={handleNavigateToProperty}
      currentUserId={user?.id || 1}
      userPlan="free"
    />
  );
};

const InvoicesWrapper = () => {
  const handleNavigate = (page: string, params?: any) => {
    // Handle navigation - you can implement this based on your needs
    console.log('Navigate to:', page, params);
  };

  return <Invoices onNavigate={handleNavigate} />;
};

// App Content Component (No changes needed)
const AppContent: React.FC = () => {
  return (
    <AuthWrapper>
      <Router>
        <AppLayout>
          <Routes>
            <Route path="/" element={
              <Suspense fallback={<LoadingSpinner />}>
                <Dashboard />
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
                <Profile />
              </Suspense>
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppLayout>
      </Router>
    </AuthWrapper>
  );
};

// Main App Component (No changes needed)
const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    // Initialize database and app
    const initializeApp = async () => {
      try {
        await database.initializeDatabase();
        
        // Check for dark mode preference
        const darkMode = localStorage.getItem('darkMode') === 'true' || 
          (!localStorage.getItem('darkMode') && window.matchMedia('(prefers-color-scheme: dark)').matches);
        setIsDarkMode(darkMode);
        
        // Simulate loading time for smooth UX
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error('Failed to initialize app:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeApp();
  }, []);

  useEffect(() => {
    // Apply dark mode class to html element
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', isDarkMode.toString());
  }, [isDarkMode]);

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

export default App;