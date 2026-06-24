import { NavLink } from 'react-router-dom';

const navItems = [
  { path: '/', label: 'Dashboard' },
  { path: '/units', label: 'Units' },
  { path: '/tenants', label: 'Tenants' },
  { path: '/leases', label: 'Leases' },
  { path: '/rent-payments', label: 'Rent Payments' },
  { path: '/maintenance-requests', label: 'Maintenance' },
  { path: '/inspections', label: 'Inspections' },
  { path: '/notices', label: 'Notices' },
  { path: '/reports', label: 'Reports' },
];

export function Sidebar() {
  const baseLinkClass = "block w-full text-left px-4 py-2 text-sm rounded-md transition-colors duration-150";
  const inactiveLinkClass = "text-gray-300 hover:bg-gray-700 hover:text-white";
  const activeLinkClass = "bg-blue-600 text-white font-semibold";

  return (
    <div className="h-full flex flex-col p-4">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-white">App</h2>
      </div>
      <nav className="flex-1">
        <ul className="space-y-2">
          {navItems.map(({ path, label }) => (
            <li key={path}>
              <NavLink
                to={path}
                className={({ isActive }) =>
                  `${baseLinkClass} ${isActive ? activeLinkClass : inactiveLinkClass}`
                }
                end={path === '/'} // Ensure Dashboard is only active on the exact path
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}