import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { DataProvider } from "./contexts/DataProvider";

import Dashboard from "./pages/Dashboard";
import Inspections from "./pages/Inspections";
import Leases from "./pages/Leases";
import MaintenanceRequests from "./pages/MaintenanceRequests";
import Notices from "./pages/Notices";
import RentPayments from "./pages/RentPayments";
import Reports from "./pages/Reports";
import Tenants from "./pages/Tenants";
import Units from "./pages/Units";

function App() {
  return (
    <DataProvider>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="units" element={<Units />} />
          <Route path="tenants" element={<Tenants />} />
          <Route path="leases" element={<Leases />} />
          <Route path="rent-payments" element={<RentPayments />} />
          <Route
            path="maintenance-requests"
            element={<MaintenanceRequests />}
          />
          <Route path="inspections" element={<Inspections />} />
          <Route path="notices" element={<Notices />} />
          <Route path="reports" element={<Reports />} />
        </Route>
      </Routes>
    </DataProvider>
  );
}

export default App;