import { createContext, useState, useEffect, ReactNode, Dispatch, SetStateAction } from 'react';
import { Route, Routes } from "react-router-dom";
// Import Layout and Page components
import { Layout } from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Vehicles from "./pages/Vehicles";
import WorkOrders from "./pages/WorkOrders";
import Estimates from "./pages/Estimates";
import Invoices from "./pages/Invoices";
import Technicians from "./pages/Technicians";
import PartsInventory from "./pages/PartsInventory";
import ServiceHistory from "./pages/ServiceHistory";

// --- App Context for localStorage persistence ---
// This is a simple example context for managing a global state (e.g., theme)
// and persisting it to localStorage, as requested.

type Theme = 'light' | 'dark';

interface AppContextType {
  theme: Theme;
  setTheme: Dispatch<SetStateAction<Theme>>;
}

// Export the context so other components can consume it with `useContext`
export const AppContext = createContext<AppContextType | undefined>(undefined);

const AppProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const savedTheme = localStorage.getItem('repair-shop-theme');
      return savedTheme === 'dark' ? 'dark' : 'light';
    } catch {
      // If localStorage is disabled or unavailable, default to 'light'
      return 'light';
    }
  });

  // Effect to persist the theme to localStorage and update the document class
  useEffect(() => {
    try {
      localStorage.setItem('repair-shop-theme', theme);
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch (error) {
      console.warn('Failed to persist theme to localStorage:', error);
    }
  }, [theme]);

  const value = { theme, setTheme };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

// --- Application Router ---

export default function App() {
  return (
    <AppProvider>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="customers" element={<Customers />} />
          <Route path="vehicles" element={<Vehicles />} />
          <Route path="work-orders" element={<WorkOrders />} />
          <Route path="estimates" element={<Estimates />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="technicians" element={<Technicians />} />
          <Route path="parts-inventory" element={<PartsInventory />} />
          <Route path="service-history" element={<ServiceHistory />} />
        </Route>
      </Routes>
    </AppProvider>
  );
}