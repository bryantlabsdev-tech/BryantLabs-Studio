import { ReactNode, createContext, useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Vehicles from "./pages/Vehicles";
import Drivers from "./pages/Drivers";
import Dispatch from "./pages/Dispatch";
import Maintenance from "./pages/Maintenance";
import FuelLogs from "./pages/FuelLogs";
import Inspections from "./pages/Inspections";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

// Simple context for localStorage-backed state, as requested.
// In a larger app, this would be in its own module (e.g., src/context/AppContext.tsx)
interface AppSettings {
  // Example setting
  theme: 'light' | 'dark';
}

interface AppContextType {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

const AppContext = createContext<AppContextType | null>(null);

const AppProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const storedSettings = window.localStorage.getItem("fleetops-pro-settings");
      return storedSettings ? JSON.parse(storedSettings) : { theme: 'light' };
    } catch (error) {
      console.error("Failed to parse settings from localStorage:", error);
      return { theme: 'light' };
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem("fleetops-pro-settings", JSON.stringify(settings));
    } catch (error) {
      console.error("Failed to save settings to localStorage:", error);
    }
  }, [settings]);

  return (
    <AppContext.Provider value={{ settings, setSettings }}>
      {children}
    </AppContext.Provider>
  );
};

function App() {
  return (
    <AppProvider>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="vehicles" element={<Vehicles />} />
          <Route path="drivers" element={<Drivers />} />
          <Route path="dispatch" element={<Dispatch />} />
          <Route path="maintenance" element={<Maintenance />} />
          <Route path="fuel-logs" element={<FuelLogs />} />
          <Route path="inspections" element={<Inspections />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </AppProvider>
  );
}

export default App;