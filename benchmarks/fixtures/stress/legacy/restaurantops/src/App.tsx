import { createContext, useState, useEffect, useMemo } from 'react';
import { Route, Routes } from "react-router-dom";
import { Layout } from './components/Layout';

// Import all page components
import Dashboard from "./pages/Dashboard";
import MenuItems from "./pages/MenuItems";
import Tables from "./pages/Tables";
import Reservations from "./pages/Reservations";
import Orders from "./pages/Orders";
import KitchenQueue from "./pages/KitchenQueue";
import Staff from "./pages/Staff";
import Inventory from "./pages/Inventory";
import Reports from "./pages/Reports";

// Simple localStorage-backed context as requested for persistence.
// Here, we manage a theme preference as an example of wiring.
type Theme = 'light' | 'dark';

interface AppContextType {
  theme: Theme;
  toggleTheme: () => void;
}

export const AppContext = createContext<AppContextType>({
  theme: 'light',
  toggleTheme: () => {},
});

function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    const storedTheme = localStorage.getItem('restaurantOpsTheme');
    // Ensure the value from localStorage is a valid theme
    return (storedTheme === 'light' || storedTheme === 'dark') ? storedTheme : 'light';
  });

  useEffect(() => {
    // Persist theme to localStorage
    localStorage.setItem('restaurantOpsTheme', theme);
    // Apply class to root element for Tailwind CSS dark mode
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  // Memoize context value to prevent unnecessary re-renders of consumers
  const contextValue = useMemo(() => ({ theme, toggleTheme }), [theme]);

  return (
    <AppContext.Provider value={contextValue}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="menu-items" element={<MenuItems />} />
          <Route path="tables" element={<Tables />} />
          <Route path="reservations" element={<Reservations />} />
          <Route path="orders" element={<Orders />} />
          <Route path="kitchen-queue" element={<KitchenQueue />} />
          <Route path="staff" element={<Staff />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="reports" element={<Reports />} />
        </Route>
      </Routes>
    </AppContext.Provider>
  );
}

export default App;