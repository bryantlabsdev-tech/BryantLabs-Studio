import { NavLink } from "react-router-dom";
import {
  BarChart3,
  Briefcase,
  Clock,
  FileText,
  Gavel,
  Home,
  PenSquare,
  Shield,
  Users,
} from "../components/IconStub";

const navLinks = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/cases", label: "Cases", icon: Briefcase },
  { to: "/evidence", label: "Evidence", icon: Shield },
  { to: "/documents", label: "Documents", icon: FileText },
  { to: "/deadlines", label: "Deadlines", icon: Clock },
  { to: "/hearings", label: "Hearings", icon: Gavel },
  { to: "/notes", label: "Notes", icon: PenSquare },
  { to: "/reports", label: "Reports", icon: BarChart3 },
];

export function Sidebar() {
  const linkClasses = "flex items-center gap-3 rounded-lg px-3 py-2 text-gray-400 transition-all hover:text-gray-50";
  const activeLinkClasses = "bg-gray-800 text-gray-50";

  return (
    <div className="flex h-full max-h-screen flex-col gap-2">
      <div className="flex h-14 items-center border-b border-b-gray-700 px-4 lg:h-[60px] lg:px-6">
        <a href="/" className="flex items-center gap-2 font-semibold text-gray-50">
          <Gavel className="h-6 w-6" />
          <span>LegalCase Vault</span>
        </a>
      </div>
      <div className="flex-1 overflow-auto py-2">
        <nav className="grid items-start px-2 text-sm font-medium lg:px-4">
          {navLinks.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `${linkClasses} ${isActive ? activeLinkClasses : ""}`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}