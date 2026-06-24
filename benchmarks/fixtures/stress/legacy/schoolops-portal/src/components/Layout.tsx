import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function Layout() {
  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-700 bg-gray-800 px-6">
          {/* Top bar content, e.g., User menu, search */}
          <div className="text-xl font-semibold">SchoolOps Portal</div>
          <div>{/* User profile / actions can go here */}</div>
        </header>
        <main className="flex-1 overflow-y-auto bg-gray-900 p-6 min-h-[60vh]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}