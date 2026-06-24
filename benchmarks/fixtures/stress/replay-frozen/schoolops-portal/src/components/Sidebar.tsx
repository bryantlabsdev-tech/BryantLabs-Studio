import { NavLink } from "react-router-dom";
import {
  Home,
  Users,
  Briefcase,
  BookOpen,
  Calendar,
  GraduationCap,
  Megaphone,
  Phone,
  BarChart3,
  Settings,
} from "./IconStub";

const navLinks = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/students", label: "Students", icon: Users },
  { href: "/teachers", label: "Teachers", icon: Briefcase },
  { href: "/classes", label: "Classes", icon: BookOpen },
  { href: "/attendance", label: "Attendance", icon: Calendar },
  { href: "/grades", label: "Grades", icon: GraduationCap },
  { href: "/behavior-logs", label: "Behavior Logs", icon: Megaphone },
  { href: "/parent-contacts", label: "Parent Contacts", icon: Phone },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const linkClasses =
    "flex items-center gap-3 rounded-md px-3 py-2 text-gray-300 transition-colors hover:bg-gray-700 hover:text-white";
  const activeLinkClasses = "bg-gray-800 text-white";

  return (
    <aside className="hidden min-w-[200px] flex-col border-r border-gray-800 bg-gray-900 p-4 md:flex lg:min-w-[240px]">
      <div className="flex h-16 items-center px-2">
        <h1 className="text-xl font-bold">SchoolOps</h1>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {navLinks.map(({ href, label, icon: Icon }) => (
          <NavLink
            key={href}
            to={href}
            end={href === "/"}
            className={({ isActive }) =>
              `${linkClasses} ${isActive ? activeLinkClasses : ""}`
            }
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}