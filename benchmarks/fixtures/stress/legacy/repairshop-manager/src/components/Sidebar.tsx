import { NavLink } from "react-router-dom";

const navLinks = [
  { to: "/", label: "Dashboard" },
  { to: "/customers", label: "Customers" },
  { to: "/vehicles", label: "Vehicles" },
  { to: "/work-orders", label: "Work Orders" },
  { to: "/estimates", label: "Estimates" },
  { to: "/invoices", label: "Invoices" },
  { to: "/technicians", label: "Technicians" },
  { to: "/parts-inventory", label: "Parts Inventory" },
  { to: "/service-history", label: "Service History" },
];

export function Sidebar() {
  const linkClasses =
    "block w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors";
  const activeClasses = "bg-gray-900 text-white";
  const inactiveClasses =
    "text-gray-300 hover:bg-gray-700 hover:text-white";

  return (
    <nav className="flex flex-col space-y-2">
      <h2 className="text-lg font-semibold text-white px-3 mb-2">App</h2>
      <ul className="space-y-1">
        {navLinks.map((link) => (
          <li key={link.to}>
            <NavLink
              to={link.to}
              end
              className={({ isActive }) =>
                `${linkClasses} ${isActive ? activeClasses : inactiveClasses}`
              }
            >
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}