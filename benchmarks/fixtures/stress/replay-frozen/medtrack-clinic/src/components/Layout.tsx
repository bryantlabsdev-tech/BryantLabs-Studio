import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function Layout() {
  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-gray-800 border-b border-gray-700 p-4">
          <div className="container mx-auto">
            {/* Top bar content can go here, e.g., search, user menu */}
            <h1 className="text-xl font-semibold">MedTrack Clinic</h1>
          </div>
        </header>
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6 min-h-[60vh]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}