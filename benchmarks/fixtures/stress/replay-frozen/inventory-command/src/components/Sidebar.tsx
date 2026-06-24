import { NavLink } from "react-router-dom";
import {
  Home,
  Package,
  Truck,
  ShoppingCart,
  ArrowRightLeft,
  Bell,
  BarChart3,
  Settings,
} from "./IconStub";

const navLinks = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/products", label: "Products", icon: Package },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/purchase-orders", label: "Purchase Orders", icon: ShoppingCart },
  { href: "/stock-movements", label: "Stock Movements", icon: ArrowRightLeft },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="hidden md:flex md:flex-col md:w-[240px] border-r border-gray-700 bg-gray-800">
      <div className="flex h-16 items-center border-b border-gray-700 px-6">
        <span className="text-lg font-bold">App</span>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navLinks.map(({ href, label, icon: Icon }) => (
          <NavLink
            key={href}
            to={href}
            end={href === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-gray-700 text-white"
                  : "text-gray-400 hover:bg-gray-700/50 hover:text-white"
              }`
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}