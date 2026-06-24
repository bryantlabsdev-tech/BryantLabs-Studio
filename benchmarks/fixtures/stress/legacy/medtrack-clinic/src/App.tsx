import { Route, Routes } from "react-router-dom";
// Layout
import { Layout } from "./components/Layout";

// Pages
import Dashboard from "./pages/Dashboard";
import Patients from "./pages/Patients";
import Appointments from "./pages/Appointments";
import Prescriptions from "./pages/Prescriptions";
import Providers from "./pages/Providers";
import Billing from "./pages/Billing";
import VisitNotes from "./pages/VisitNotes";
import Reports from "./pages/Reports";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="patients" element={<Patients />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="prescriptions" element={<Prescriptions />} />
        <Route path="providers" element={<Providers />} />
        <Route path="billing" element={<Billing />} />
        <Route path="visit-notes" element={<VisitNotes />} />
        <Route path="reports" element={<Reports />} />
      </Route>
    </Routes>
  );
}

export default App;