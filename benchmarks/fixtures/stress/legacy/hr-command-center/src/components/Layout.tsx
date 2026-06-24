import { Outlet } from "react-router-dom";
import { Sidebar } from './Sidebar';

export function Layout() {
  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <aside className="min-w-[200px] flex-shrink-0 border-r border-gray-700 bg-gray-800">
        <Sidebar />
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center border-b border-gray-700 px-6">
          <h1 className="text-xl font-semibold">HR Command Center</h1>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <div className="min-h-[60vh]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}