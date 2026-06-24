import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export const Layout = () => {
  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <aside className="min-w-[200px] w-[200px] flex-shrink-0 bg-gray-800 border-r border-gray-700">
        <Sidebar />
      </aside>

      <div className="flex flex-col flex-grow">
        <header className="h-16 flex-shrink-0 border-b border-gray-700 flex items-center px-6">
          {/* Top bar area: User menu, search, etc. can go here */}
          <h1 className="text-xl font-semibold">FleetOps Pro</h1>
        </header>

        <main className="flex-grow p-6 overflow-y-auto min-h-[60vh]">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;