import { NavLink } from 'react-router-dom';

const navLinks = [
  { to: '/', label: 'Dashboard' },
  { to: '/clients', label: 'Clients' },
  { to: '/cases', label: 'Cases' },
  { to: '/evidence', label: 'Evidence' },
  { to: '/documents', label: 'Documents' },
  { to: '/deadlines', label: 'Deadlines' },
  { to: '/hearings', label: 'Hearings' },
  { to: '/notes', label: 'Notes' },
  { to: '/reports', label: 'Reports' },
];

export const Sidebar = () => {
  const activeLinkClass = 'bg-gray-700 text-white';
  const inactiveLinkClass = 'text-gray-400 hover:bg-gray-700/50 hover:text-white';

  return (
    <div className="flex h-full flex-col bg-gray-800">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-2xl font-bold text-white text-center">App</h1>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {navLinks.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? activeLinkClass : inactiveLinkClass
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};