import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function Layout() {
  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <aside className="min-w-[200px] flex-shrink-0 bg-gray-800 border-r border-gray-700">
        <Sidebar />
      </aside>

      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="bg-gray-800 border-b border-gray-700 p-4 shadow-md flex-shrink-0">
          <h1 className="text-xl font-bold">RestaurantOps</h1>
        </header>

        <main className="flex-1 p-6 overflow-y-auto">
          <div className="min-h-[60vh]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}