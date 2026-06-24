import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Menu, Search } from "../components/IconStub";

export function Layout() {
  return (
    <div className="grid min-h-screen w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]">
      <aside className="hidden border-r border-r-gray-700 bg-gray-950 md:block min-w-[200px]">
        <Sidebar />
      </aside>
      <div className="flex flex-col">
        <header className="flex h-14 items-center gap-4 border-b border-b-gray-700 bg-gray-950 px-4 lg:h-[60px] lg:px-6 sticky top-0 z-10">
          <button
            className="inline-flex md:hidden items-center justify-center rounded-md text-sm font-medium text-gray-400 hover:text-gray-50 h-10 w-10"
            aria-label="Toggle navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="w-full flex-1">
            <form>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="search"
                  placeholder="Search..."
                  className="w-full appearance-none bg-gray-800 border-gray-700 border rounded-md shadow-sm pl-8 h-9 text-sm text-gray-50"
                />
              </div>
            </form>
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6 min-h-[60vh]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}