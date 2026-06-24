import { createContext, useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { Layout } from './components/Layout';

// Import Page Components
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Suppliers from './pages/Suppliers';
import PurchaseOrders from './pages/PurchaseOrders';
import StockMovements from './pages/StockMovements';
import Alerts from './pages/Alerts';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

// A simple settings context to demonstrate provider wiring with localStorage persistence.
// In a larger application, this would be in its own file (e.g., src/context/SettingsContext.tsx).

interface AppSettings {
  theme: 'light' | 'dark';
}

interface AppSettingsContextType {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

// The context is created but not exported, as only the Provider is needed in this file.
const AppSettingsContext = createContext<AppSettingsContextType | undefined>(undefined);

const AppSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const storedSettings = window.localStorage.getItem('app-settings');
      return storedSettings ? JSON.parse(storedSettings) : { theme: 'light' };
    } catch (error) {
      console.error('Failed to parse settings from localStorage:', error);
      return { theme: 'light' };
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('app-settings', JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings to localStorage:', error);
    }
  }, [settings]);

  return (
    <AppSettingsContext.Provider value={{ settings, setSettings }}>
      {children}
    </AppSettingsContext.Provider>
  );
};


function App() {
  return (
    <AppSettingsProvider>
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
    </AppSettingsProvider>
  );
}

export default App;