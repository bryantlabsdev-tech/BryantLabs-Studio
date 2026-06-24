import { NavLink } from 'react-router-dom';

const navLinks = [
  { to: '/', text: 'Dashboard' },
  { to: '/menu-items', text: 'Menu Items' },
  { to: '/tables', text: 'Tables' },
  { to: '/reservations', text: 'Reservations' },
  { to: '/orders', text: 'Orders' },
  { to: '/kitchen-queue', text: 'Kitchen Queue' },
  { to: '/staff', text: 'Staff' },
  { to: '/inventory', text: 'Inventory' },
  { to: '/reports', text: 'Reports' },
];

export function Sidebar() {
  const linkClasses = "block px-4 py-2 text-sm text-gray-300 rounded-md hover:bg-gray-700 hover:text-white transition-colors duration-200";
  const activeLinkClasses = "bg-gray-900 text-white";

  return (
    <div className="flex flex-col h-full p-4">
      <div className="mb-6 px-2">
        <h2 className="text-2xl font-bold text-white">RestaurantOps</h2>
      </div>
      <nav className="flex flex-col space-y-2">
        {navLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) =>
              `${linkClasses} ${isActive ? activeLinkClasses : ''}`
            }
          >
            {link.text}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}