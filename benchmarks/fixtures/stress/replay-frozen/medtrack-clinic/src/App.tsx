import { createContext, ReactNode } from "react";
import { Route, Routes } from "react-router-dom";
// Component Imports
import { Layout } from "./components/Layout";

// Page Imports
import Dashboard from "./pages/Dashboard";
import Patients from "./pages/Patients";
import Appointments from "./pages/Appointments";
import Prescriptions from "./pages/Prescriptions";
import Providers from "./pages/Providers";
import Billing from "./pages/Billing";
import VisitNotes from "./pages/VisitNotes";
import Reports from "./pages/Reports";

/**
 * A placeholder context for application state, as requested for persistence wiring.
 * In a real app, this would be in its own file (e.g., src/context/AppContext.tsx)
 * and would hold shared state, updaters, and logic for localStorage.
 * Exported to be available to other components and to satisfy 'no-unused-vars'.
 */
export const AppContext = createContext<object | null>(null);

const AppProvider = ({ children }: { children: ReactNode }) => {
  // This is where state management (e.g., useReducer, useState) and
  // effects for localStorage synchronization would be implemented.
  const contextValue = {};

  return (
    <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>
  );
};

function App() {
  return (
    <AppProvider>
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
    </AppProvider>
  );
}

export default App;