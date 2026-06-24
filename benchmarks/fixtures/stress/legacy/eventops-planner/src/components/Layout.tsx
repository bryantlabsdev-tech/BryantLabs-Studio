import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export const Layout = () => {
  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <aside className="min-w-[200px] w-[200px] flex-shrink-0 bg-gray-800 border-r border-gray-700">
        <Sidebar />
      </aside>
      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="flex items-center justify-between h-14 px-6 bg-gray-800 border-b border-gray-700 flex-shrink-0">
          <h1 className="text-xl font-semibold">EventOps Planner</h1>
          <div>{/* Top bar content like user menu can go here */}</div>
        </header>
        <main className="flex-1 overflow-y-auto p-6 min-h-[60vh]">
          <Outlet />
        </main>
      </div>
    </div>
  );
};