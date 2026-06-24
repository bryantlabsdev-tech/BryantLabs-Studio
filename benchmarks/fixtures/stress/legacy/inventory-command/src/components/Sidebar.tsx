import { NavLink } from 'react-router-dom';

const navLinks = [
  { to: '/', label: 'Dashboard' },
  { to: '/products', label: 'Products' },
  { to: '/suppliers', label: 'Suppliers' },
  { to: '/purchase-orders', label: 'Purchase Orders' },
  { to: '/stock-movements', label: 'Stock Movements' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/reports', label: 'Reports' },
  { to: '/settings', label: 'Settings' },
];

export const Sidebar = () => {
  const linkClasses =
    'block w-full rounded-md px-3 py-2 text-left text-gray-300 hover:bg-gray-700 hover:text-white transition-colors';
  const activeLinkClasses = 'bg-blue-600 text-white';

  return (
    <aside className="min-w-[200px] w-[200px] flex-shrink-0 border-r border-gray-700 bg-gray-800 p-4">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">App</h2>
      </div>
      <nav>
        <ul className="space-y-2">
          {navLinks.map(({ to, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `${linkClasses} ${isActive ? activeLinkClasses : ''}`
                }
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
};