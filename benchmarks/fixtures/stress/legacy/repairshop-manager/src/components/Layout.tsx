import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function Layout() {
  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <aside className="min-w-[200px] flex-shrink-0 bg-gray-800 p-4 border-r border-gray-700">
        <Sidebar />
      </aside>
      <div className="flex-1 flex flex-col overflow-auto">
        <header className="flex-shrink-0 bg-gray-800/50 p-4 border-b border-gray-700">
          {/* Top bar area for user menu, search, etc. */}
          <h1 className="text-xl font-bold">RepairShop Manager</h1>
        </header>
        <main className="flex-1 p-6">
          <div className="min-h-[60vh]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}