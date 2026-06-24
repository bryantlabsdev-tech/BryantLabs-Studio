import { createContext, ReactNode } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";

// Page Imports
import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
import Departments from "./pages/Departments";
import Onboarding from "./pages/Onboarding";
import TimeOff from "./pages/TimeOff";
import PerformanceReviews from "./pages/PerformanceReviews";
import PayrollSummary from "./pages/PayrollSummary";
import Documents from "./pages/Documents";
import Reports from "./pages/Reports";

// NOTE: The user requested wiring for a persistent context.
// In a real application, this context and provider would live in a separate file
// (e.g., src/context/DataContext.tsx) and would contain state management logic
// (e.g., useReducer, useEffect) to interact with localStorage.
// For this "wiring-only" step, we define a simple placeholder.
const AppContext = createContext({});

const AppProvider = ({ children }: { children: ReactNode }) => {
  // Placeholder value. A real implementation would hold state (e.g., employees)
  // and functions to update that state, persisting to localStorage.
  const value = {};
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

function App() {
  return (
    <AppProvider>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/departments" element={<Departments />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/time-off" element={<TimeOff />} />
          <Route
            path="/performance-reviews"
            element={<PerformanceReviews />}
          />
          <Route path="/payroll-summary" element={<PayrollSummary />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/reports" element={<Reports />} />
        </Route>
      </Routes>
    </AppProvider>
  );
}

export default App;