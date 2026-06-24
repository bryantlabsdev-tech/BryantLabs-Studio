import { ReactNode, createContext, useEffect, useMemo, useState } from "react";
import { Route, Routes } from "react-router-dom";
// Layout Component
import { Layout } from './components/Layout';

// Page Components
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import Cases from './pages/Cases';
import Evidence from './pages/Evidence';
import Documents from './pages/Documents';
import Deadlines from './pages/Deadlines';
import Hearings from './pages/Hearings';
import Notes from './pages/Notes';
import Reports from './pages/Reports';

// --- Context for Persistence ---
// A simple context to demonstrate provider wiring with localStorage persistence,
// as requested. This can be expanded to manage global application state.

type Theme = 'light' | 'dark';

interface AppContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

// Exported for use in other components via useContext hook
export const AppContext = createContext<AppContextType | undefined>(undefined);

const AppProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    // Get initial theme from localStorage or default to 'light'
    const savedTheme = localStorage.getItem('app-theme') as Theme;
    return savedTheme || 'light';
  });

  // Effect to update localStorage and document class when theme changes
  useEffect(() => {
    localStorage.setItem('app-theme', theme);
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
  }, [theme]);

  // Memoize the context value to prevent unnecessary re-renders of consumers
  const contextValue = useMemo(() => ({
    theme,
    setTheme,
  }), [theme]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

// --- Main Application Router ---

function App() {
  return (
    <AppProvider>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="clients" element={<Clients />} />
          <Route path="cases" element={<Cases />} />
          <Route path="evidence" element={<Evidence />} />
          <Route path="documents" element={<Documents />} />
          <Route path="deadlines" element={<Deadlines />} />
          <Route path="hearings" element={<Hearings />} />
          <Route path="notes" element={<Notes />} />
          <Route path="reports" element={<Reports />} />
        </Route>
      </Routes>
    </AppProvider>
  );
}

export default App;