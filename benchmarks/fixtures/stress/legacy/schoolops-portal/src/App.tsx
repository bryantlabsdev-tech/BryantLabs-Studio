import { Route, Routes } from "react-router-dom";
import { createContext, ReactNode } from "react";

// Import Layout
import { Layout } from "./components/Layout";

// Import Page Components
import Dashboard from "./pages/Dashboard";
import Students from "./pages/Students";
import Teachers from "./pages/Teachers";
import Classes from "./pages/Classes";
import Attendance from "./pages/Attendance";
import Grades from "./pages/Grades";
import BehaviorLogs from "./pages/BehaviorLogs";
import ParentContacts from "./pages/ParentContacts";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

// A simple, in-memory context to satisfy the provider wiring requirement.
// In a real application, this would be expanded to manage shared state
// and interact with localStorage for persistence.
const AppContext = createContext({});

const AppProvider = ({ children }: { children: ReactNode }) => {
  // Placeholder for future state management (e.g., user settings, data)
  const contextValue = {};

  return (
    <AppContext.Provider value={contextValue}>
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
          <Route path="students" element={<Students />} />
          <Route path="teachers" element={<Teachers />} />
          <Route path="classes" element={<Classes />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="grades" element={<Grades />} />
          <Route path="behavior-logs" element={<BehaviorLogs />} />
          <Route path="parent-contacts" element={<ParentContacts />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </AppProvider>
  );
}

export default App;