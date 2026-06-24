import React, { createContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { Route, Routes } from "react-router-dom";
import { Layout } from './components/Layout';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Suppliers from './pages/Suppliers';
import PurchaseOrders from './pages/PurchaseOrders';
import StockMovements from './pages/StockMovements';
import Alerts from './pages/Alerts';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

// --- Context for Application State and Persistence ---

// This simple context demonstrates wiring a provider for settings persistence via localStorage.
// A more complex app might move this to its own file (e.g., src/contexts/AppContext.tsx).

interface AppSettings {
  theme: 'dark' | 'light';
  // Other user-specific settings can be added here
}

interface AppContextType {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

// The context is not exported as it's only used for wiring within this file.
// Pages would typically use a custom hook (e.g., `useAppSettings`) to consume this.
const AppContext = createContext<AppContextType | null>(null);

const AppProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const storedSettings = window.localStorage.getItem('app-settings');
      return storedSettings ? JSON.parse(storedSettings) : { theme: 'dark' };
    } catch (error) {
      console.error('Failed to parse settings from localStorage:', error);
      return { theme: 'dark' };
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('app-settings', JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings to localStorage:', error);
    }
  }, [settings]);

  const contextValue = useMemo(() => ({ settings, setSettings }), [settings]);

  return (
    <AppContext.Provider value={contextValue}>
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
          <Route path="products" element={<Products />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="purchase-orders" element={<PurchaseOrders />} />
          <Route path="stock-movements" element={<StockMovements />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </AppProvider>
  );
}