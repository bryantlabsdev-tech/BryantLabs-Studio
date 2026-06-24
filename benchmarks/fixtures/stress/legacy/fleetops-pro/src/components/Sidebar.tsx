import { NavLink } from "react-router-dom";

const navLinks = [
  { to: "/", label: "Dashboard" },
  { to: "/vehicles", label: "Vehicles" },
  { to: "/drivers", label: "Drivers" },
  { to: "/dispatch", label: "Dispatch" },
  { to: "/maintenance", label: "Maintenance" },
  { to: "/fuel-logs", label: "Fuel Logs" },
  { to: "/inspections", label: "Inspections" },
  { to: "/reports", label: "Reports" },
  { to: "/settings", label: "Settings" },
];

export const Sidebar = () => {
  const linkClasses =
    "block px-4 py-2.5 rounded-md text-sm font-medium transition-colors";
  const activeClasses = "bg-gray-700 text-white";
  const inactiveClasses = "text-gray-300 hover:bg-gray-700/50 hover:text-white";

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-2xl font-bold text-white">Build</h2>
      </div>
      <nav className="flex-grow p-4">
        <ul className="space-y-1">
          {navLinks.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                className={({ isActive }) =>
                  `${linkClasses} ${isActive ? activeClasses : inactiveClasses}`
                }
                end={link.to === "/"} // Match root route exactly
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="p-4 border-t border-gray-700">
        {/* Can add user info or logout button here */}
        <p className="text-xs text-gray-400">© 2024 FleetOps Pro</p>
      </div>
    </div>
  );
};

export default Sidebar;