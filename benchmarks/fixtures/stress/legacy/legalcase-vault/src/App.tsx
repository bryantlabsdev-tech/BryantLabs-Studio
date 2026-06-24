import { Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";

import { Layout } from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import Cases from "./pages/Cases";
import Evidence from "./pages/Evidence";
import Documents from "./pages/Documents";
import Deadlines from "./pages/Deadlines";
import Hearings from "./pages/Hearings";
import Notes from "./pages/Notes";
import Reports from "./pages/Reports";

// Per the request to wire a persistence-backed context, a provider is needed.
// In a larger app, this would be in its own file (e.g., src/context/AppContext.tsx)
// and would handle data fetching, state management, and localStorage persistence.
// For this generation task, it's included here as a placeholder to demonstrate
// the wiring structure without referencing unlisted files.
const AppProvider = ({ children }: { children: ReactNode }) => {
  return <>{children}</>;
};

function App() {
  return (
    <AppProvider>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="clients" element={<Clients />} />
          <Route path="cases" element={<Cases />} />
          <Route path="evidence" element={<Evidence />} />
          <Route path="documents" element={<Documents />} />
          <Route path="deadlines" element={<Deadlines />} />
          <Route path="hearings" element={<Hearings />} />
          <Route path="notes" element={<Notes />} />
          <Route path="reports" element={<Reports />} />
        </Route>
      </Routes>
    </AppProvider>
  );
}

export default App;