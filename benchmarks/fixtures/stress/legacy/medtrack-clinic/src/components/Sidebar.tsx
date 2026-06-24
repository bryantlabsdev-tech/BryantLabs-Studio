import { NavLink } from "react-router-dom";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/patients", label: "Patients" },
  { href: "/appointments", label: "Appointments" },
  { href: "/prescriptions", label: "Prescriptions" },
  { href: "/providers", label: "Providers" },
  { href: "/billing", label: "Billing" },
  { href: "/visit-notes", label: "Visit Notes" },
  { href: "/reports", label: "Reports" },
];

export function Sidebar() {
  const navLinkClasses = "block w-full text-left px-4 py-2 rounded-md text-sm font-medium transition-colors duration-150";
  const activeClasses = "bg-gray-700 text-white";
  const inactiveClasses = "text-gray-300 hover:bg-gray-700 hover:text-white";

  return (
    <nav className="flex flex-col space-y-1">
      {links.map((link) => (
        <NavLink
          key={link.href}
          to={link.href}
          end={link.href === "/"}
          className={({ isActive }) =>
            `${navLinkClasses} ${isActive ? activeClasses : inactiveClasses}`
          }
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}