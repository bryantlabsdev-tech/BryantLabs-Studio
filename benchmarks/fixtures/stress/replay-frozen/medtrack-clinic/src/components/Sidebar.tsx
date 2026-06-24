import { NavLink } from "react-router-dom";
import {
  Home,
  FileText,
  Calendar,
  BarChart3,
} from "../components/IconStub"; // Assuming these are sufficient for the links

// For a real app, you'd likely have more specific icons
const Users = FileText;
const Pill = FileText;
const Stethoscope = FileText;
const CreditCard = FileText;

const navLinks = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/patients", label: "Patients", icon: Users },
  { to: "/appointments", label: "Appointments", icon: Calendar },
  { to: "/prescriptions", label: "Prescriptions", icon: Pill },
  { to: "/providers", label: "Providers", icon: Stethoscope },
  { to: "/billing", label: "Billing", icon: CreditCard },
  { to: "/visit-notes", label: "Visit Notes", icon: FileText },
  { to: "/reports", label: "Reports", icon: BarChart3 },
];

export function Sidebar() {
  const linkClasses =
    "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors";
  const activeClasses = "bg-gray-700 text-white";
  const inactiveClasses = "text-gray-300 hover:bg-gray-700 hover:text-white";

  return (
    <aside className="min-w-[200px] w-[200px] bg-gray-800 p-4 border-r border-gray-700 flex-shrink-0">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">MedTrack</h2>
      </div>
      <nav>
        <ul className="space-y-1">
          {navLinks.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `${linkClasses} ${isActive ? activeClasses : inactiveClasses}`
                }
              >
                <Icon className="mr-3 h-5 w-5" />
                <span>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}