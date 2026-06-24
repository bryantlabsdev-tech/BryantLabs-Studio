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

export default function App() {
  return (
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
  );
}
