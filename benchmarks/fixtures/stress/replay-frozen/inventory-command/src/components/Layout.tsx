import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Menu, Search } from "./IconStub";

export function Layout() {
  return (
    <div className="flex min-h-screen bg-gray-900 text-gray-100">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-gray-700 bg-gray-800/50 px-6 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <button className="rounded-md p-2 md:hidden">
              <Menu className="h-6 w-6" />
              <span className="sr-only">Toggle Sidebar</span>
            </button>
            <h1 className="text-xl font-semibold">Inventory Command Center</h1>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="search"
              placeholder="Search..."
              className="w-64 rounded-md border border-gray-600 bg-gray-700 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </header>
        <main className="flex-1 p-6 lg:p-8 min-h-[60vh]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}