import { NavLink } from 'react-router-dom';

const navLinks = [
  { to: '/', label: 'Dashboard' },
  { to: '/employees', label: 'Employees' },
  { to: '/departments', label: 'Departments' },
  { to: '/onboarding', label: 'Onboarding' },
  { to: '/time-off', label: 'Time Off' },
  { to: '/performance-reviews', label: 'Performance Reviews' },
  { to: '/payroll-summary', label: 'Payroll Summary' },
  { to: '/documents', label: 'Documents' },
  { to: '/reports', label: 'Reports' },
];

export function Sidebar() {
  const linkClasses = "block w-full px-4 py-2 text-left text-gray-300 rounded-md hover:bg-gray-700 hover:text-white transition-colors duration-150";
  const activeLinkClasses = "bg-blue-600 text-white";

  return (
    <nav className="p-4">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-white">App</h2>
      </div>
      <ul className="space-y-2">
        {navLinks.map(({ to, label }) => (
          <li key={to}>
            <NavLink
              to={to}
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
  );
}