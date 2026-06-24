import { NavLink } from "react-router-dom";
import {
  BarChart3,
  ClipboardList,
  Fuel,
  Home,
  MapPin,
  Package,
  Settings,
  Truck,
  UserCircle,
  Wrench,
} from './IconStub';

const navLinks = [
  { to: '/', text: 'Dashboard', icon: Home },
  { to: '/vehicles', text: 'Vehicles', icon: Truck },
  { to: '/drivers', text: 'Drivers', icon: UserCircle },
  { to: '/dispatch', text: 'Dispatch', icon: MapPin },
  { to: '/maintenance', text: 'Maintenance', icon: Wrench },
  { to: '/fuel-logs', text: 'Fuel Logs', icon: Fuel },
  { to: '/inspections', text: 'Inspections', icon: ClipboardList },
  { to: '/reports', text: 'Reports', icon: BarChart3 },
  { to: '/settings', text: 'Settings', icon: Settings },
];

export function Sidebar() {
  const linkClasses =
    'flex items-center px-4 py-2.5 text-sm font-medium text-gray-300 rounded-lg hover:bg-gray-700 hover:text-white transition-colors duration-200';
  const activeLinkClasses = 'bg-gray-700 text-white';

  return (
    <div className="flex flex-col h-full p-3">
      <div className="flex items-center mb-6 px-4 h-10">
        <Package className="h-8 w-8 text-indigo-400 mr-2" />
        <h1 className="text-xl font-bold text-white">Build</h1>
      </div>
      <nav className="flex flex-col space-y-1">
        {navLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) =>
              `${linkClasses} ${isActive ? activeLinkClasses : ''}`
            }
          >
            <link.icon className="w-5 h-5 mr-3 shrink-0" aria-hidden="true" />
            <span>{link.text}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}