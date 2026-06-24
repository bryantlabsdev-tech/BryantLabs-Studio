import { createContext } from 'react';
import { Route, Routes } from "react-router-dom";
import { Layout } from './components/Layout';
import Dashboard from './pages/Dashboard';
import Events from './pages/Events';
import Venues from './pages/Venues';
import Vendors from './pages/Vendors';
import Budgets from './pages/Budgets';
import Tasks from './pages/Tasks';
import Guests from './pages/Guests';
import Schedules from './pages/Schedules';
import Reports from './pages/Reports';

// A simple placeholder context for application state, as requested.
// In a real app, this would be more fleshed out in its own file
// and would manage state with reducers, interact with localStorage, etc.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface IAppContext {}
export const AppContext = createContext<IAppContext>({});

function App() {
  // Placeholder value for the context provider.
  // This is where state management logic (e.g., useReducer, useState)
  // and persistence logic (e.g., useEffect with localStorage) would go.
  const appContextValue = {};

  return (
    <AppContext.Provider value={appContextValue}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="events" element={<Events />} />
          <Route path="venues" element={<Venues />} />
          <Route path="vendors" element={<Vendors />} />
          <Route path="budgets" element={<Budgets />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="guests" element={<Guests />} />
          <Route path="schedules" element={<Schedules />} />
          <Route path="reports" element={<Reports />} />
        </Route>
      </Routes>
    </AppContext.Provider>
  );
}

export default App;