import { useState } from "react";

// Mock data for KPIs, in a real app this would come from an API
const mockKpiData = {
  revenueToday: 7850.50,
  ordersToday: 125,
  openReservations: 15,
  availableTables: 8,
};

const Dashboard = () => {
  // In a real app, you'd fetch this data and use the setter.
  // For this mock, we'll just use the initial state.
  const [kpiData] = useState(mockKpiData);

  return (
    <main className="p-4 md:p-6">
      <h1 className="text-2xl md:text-3xl font-bold mb-6 text-gray-100">Dashboard Overview</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
        
        <div className="panel-card">
          <h3 className="text-sm font-medium text-gray-400">Revenue Today</h3>
          <p className="text-3xl font-bold text-green-400 mt-2">
            ${kpiData.revenueToday.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        
        <div className="panel-card">
          <h3 className="text-sm font-medium text-gray-400">Orders Today</h3>
          <p className="text-3xl font-bold text-blue-400 mt-2">{kpiData.ordersToday}</p>
        </div>
        
        <div className="panel-card">
          <h3 className="text-sm font-medium text-gray-400">Open Reservations</h3>
          <p className="text-3xl font-bold text-yellow-400 mt-2">{kpiData.openReservations}</p>
        </div>
        
        <div className="panel-card">
          <h3 className="text-sm font-medium text-gray-400">Available Tables</h3>
          <p className="text-3xl font-bold text-indigo-400 mt-2">{kpiData.availableTables}</p>
        </div>

      </div>
      
      <div className="mt-8">
        {/* Placeholder for future charts or more detailed panels */}
        <div className="panel-card h-64 flex items-center justify-center">
          <p className="text-gray-500">Analytics charts will be displayed here.</p>
        </div>
      </div>

    </main>
  );
};

export default Dashboard;