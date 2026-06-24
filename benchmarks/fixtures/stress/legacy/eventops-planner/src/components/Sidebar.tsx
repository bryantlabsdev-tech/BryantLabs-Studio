import { NavLink } from "react-router-dom";

const navLinks = [
  { to: "/", label: "Dashboard" },
  { to: "/events", label: "Events" },
  { to: "/venues", label: "Venues" },
  { to: "/vendors", label: "Vendors" },
  { to: "/budgets", label: "Budgets" },
  { to: "/tasks", label: "Tasks" },
  { to: "/guests", label: "Guests" },
  { to: "/schedules", label: "Schedules" },
  { to: "/reports", label: "Reports" },
];

export const Sidebar = () => {
  const linkClasses =
    "flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors";
  const inactiveClasses = "text-gray-300 hover:bg-gray-700 hover:text-white";
  const activeClasses = "bg-gray-900 text-white";

  return (
    <div className="flex flex-col h-full p-4">
      <div className="mb-6 px-2">
        <h2 className="text-2xl font-bold text-white">App</h2>
      </div>
      <nav className="flex flex-col space-y-1">
        {navLinks.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `${linkClasses} ${isActive ? activeClasses : inactiveClasses}`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};