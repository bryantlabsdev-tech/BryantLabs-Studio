import { Outlet } from "react-router-dom";
import { Sidebar } from './Sidebar';

export const Layout = () => {
  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <aside className="min-w-[200px] flex-shrink-0">
        <Sidebar />
      </aside>

      <div className="flex flex-1 flex-col overflow-y-auto">
        <header className="sticky top-0 z-10 flex h-16 flex-shrink-0 items-center justify-between border-b border-gray-700 bg-gray-800/80 px-4 backdrop-blur-sm">
          {/* Top bar content such as search or user menu can be added here */}
          <div>
            <h1 className="text-xl font-semibold">Dashboard</h1>
          </div>
          <div>{/* User Actions Placeholder */}</div>
        </header>
        
        <main className="flex-1 p-4 md:p-6 lg:p-8 min-h-[60vh]">
          <Outlet />
        </main>
      </div>
    </div>
  );
};