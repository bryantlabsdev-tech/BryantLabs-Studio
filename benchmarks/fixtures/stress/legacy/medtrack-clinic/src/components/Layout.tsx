import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function Layout() {
  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <aside className="min-w-[200px] bg-gray-800 p-4 border-r border-gray-700 flex-shrink-0">
        <div className="text-white text-2xl font-bold mb-6">App</div>
        <Sidebar />
      </aside>

      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700 h-16 flex-shrink-0">
          <h1 className="text-xl font-bold">MedTrack Clinic</h1>
          <div>{/* User profile / actions can go here */}</div>
        </header>

        <main className="flex-1 p-6 overflow-y-auto min-h-[60vh]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}