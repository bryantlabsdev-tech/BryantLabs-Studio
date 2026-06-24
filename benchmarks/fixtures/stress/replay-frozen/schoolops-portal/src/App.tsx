import { Route, Routes } from "react-router-dom";
import { createContext, ReactNode } from "react";

import { Layout } from "./components/Layout";

// Page imports
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

// NOTE: In a larger application, this context would be in its own file (e.g., src/context/AppContext.tsx).
// This is a placeholder to demonstrate provider wiring for state management and persistence as requested.
// A real implementation would manage shared application state and interact with localStorage.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface AppContextType {}

export const AppContext = createContext<AppContextType | undefined>(undefined);

const AppProvider = ({ children }: { children: ReactNode }) => {
  // In a real app, this would hold state (e.g., with useState/useReducer) and
  // effects (e.g., useEffect) to interact with localStorage.
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