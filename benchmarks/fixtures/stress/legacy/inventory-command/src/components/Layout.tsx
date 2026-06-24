import { Outlet } from "react-router-dom";
import { Sidebar } from './Sidebar';

export const Layout = () => {
  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-gray-700 bg-gray-800 p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Inventory Command Center</h1>
            {/* User profile / actions can go here */}
            <div>User</div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-gray-900 p-6 min-h-[60vh]">
          <Outlet />
        </main>
      </div>
    </div>
  );
};