import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Outlet } from "react-router-dom";

interface LayoutProps {
  children?: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <aside className="hidden md:flex flex-col min-w-[200px] w-[200px] bg-gray-800 border-r border-gray-700">
        <Sidebar />
      </aside>
      <div className="flex flex-col flex-1">
        <header className="flex items-center justify-between h-16 px-6 bg-gray-800 border-b border-gray-700">
          <div className="text-lg font-semibold">FleetOps Pro</div>
          <div>{/* User Menu can go here */}</div>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto min-h-[60vh]">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}