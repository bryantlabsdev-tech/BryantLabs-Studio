import { NavLink } from "react-router-dom";

const navLinks = [
  { to: "/", label: "Dashboard" },
  { to: "/students", label: "Students" },
  { to: "/teachers", label: "Teachers" },
  { to: "/classes", label: "Classes" },
  { to: "/attendance", label: "Attendance" },
  { to: "/grades", label: "Grades" },
  { to: "/behavior-logs", label: "Behavior Logs" },
  { to: "/parent-contacts", label: "Parent Contacts" },
  { to: "/reports", label: "Reports" },
  { to: "/settings", label: "Settings" },
];

const linkBaseClasses =
  "flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors";
const inactiveClasses = "text-gray-300 hover:bg-gray-700 hover:text-white";
const activeClasses = "bg-gray-900 text-white";

export function Sidebar() {
  return (
    <aside className="flex w-full min-w-[200px] max-w-[240px] flex-col border-r border-gray-700 bg-gray-800">
      <div className="flex h-16 shrink-0 items-center border-b border-gray-700 px-6">
        <span className="text-lg font-bold">App</span>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        <ul>
          {navLinks.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                className={({ isActive }) =>
                  `${linkBaseClasses} ${isActive ? activeClasses : inactiveClasses}`
                }
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}