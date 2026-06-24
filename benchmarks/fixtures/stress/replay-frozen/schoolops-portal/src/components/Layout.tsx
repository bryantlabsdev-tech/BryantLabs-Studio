import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Menu, Search } from "./IconStub";

export function Layout() {
  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-700 bg-gray-800 px-6">
          <button className="rounded-md p-2 md:hidden">
            <Menu className="h-6 w-6" />
            <span className="sr-only">Toggle sidebar</span>
          </button>
          <div className="hidden flex-1 md:block">
            {/* Placeholder for breadcrumbs or page title */}
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="search"
                placeholder="Search..."
                className="w-full rounded-md border-gray-600 bg-gray-700 py-2 pl-10 pr-4 text-sm text-white focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
             {/* Placeholder for user menu */}
            <div className="h-8 w-8 rounded-full bg-gray-600" />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-gray-900 p-6 md:p-8">
            <div className="min-h-[60vh]">
                <Outlet />
            </div>
        </main>
      </div>
    </div>
  );
}