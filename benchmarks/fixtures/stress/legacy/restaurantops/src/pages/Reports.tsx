import { useState } from "react";

// Mock data - in a real app, this would come from an API
const mockSalesSummary = {
  today: 7850.50,
  thisWeek: 45210.75,
  thisMonth: 189340.20,
};

const mockTopSellers = [
  { id: 1, name: "Spaghetti Carbonara", unitsSold: 120 },
  { id: 2, name: "Margherita Pizza", unitsSold: 95 },
  { id: 3, name: "Caesar Salad", unitsSold: 88 },
  { id: 4, name: "Tiramisu", unitsSold: 75 },
];

const Reports = () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [salesSummary, _setSalesSummary] = useState(mockSalesSummary);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [topSellers, _setTopSellers] = useState(mockTopSellers);

  return (
    <main className="p-4 md:p-6 space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold text-white">Reports</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Sales Summary */}
        <div className="panel-card space-y-4">
          <h2 className="text-xl font-semibold text-white">Sales Summary</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div className="bg-gray-800 p-4 rounded-lg">
              <p className="text-sm text-gray-400">Today's Revenue</p>
              <p className="text-2xl font-bold text-green-400">${salesSummary.today.toFixed(2)}</p>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg">
              <p className="text-sm text-gray-400">This Week</p>
              <p className="text-2xl font-bold text-white">${salesSummary.thisWeek.toLocaleString()}</p>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg">
              <p className="text-sm text-gray-400">This Month</p>
              <p className="text-2xl font-bold text-white">${salesSummary.thisMonth.toLocaleString()}</p>
            </div>
          </div>
          <div className="h-48 bg-gray-800 rounded-lg flex items-center justify-center text-gray-500">
            Sales Chart Placeholder
          </div>
        </div>

        {/* Top Selling Items */}
        <div className="panel-card space-y-4">
          <h2 className="text-xl font-semibold text-white">Top Selling Items (This Month)</h2>
          {topSellers.length > 0 ? (
            <ul className="space-y-3">
              {topSellers.map((item, index) => (
                <li key={item.id} className="flex justify-between items-center bg-gray-800 p-3 rounded-lg">
                  <span className="font-medium text-gray-200">{index + 1}. {item.name}</span>
                  <span className="text-gray-400 font-semibold">{item.unitsSold} units</span>
                </li>
              ))}
            </ul>
          ) : (
             <div className="text-center py-10 text-gray-500">No sales data available.</div>
          )}
        </div>
        
        {/* Inventory Alerts Placeholder */}
        <div className="panel-card">
           <h2 className="text-xl font-semibold text-white">Inventory Alerts</h2>
           <div className="h-48 flex items-center justify-center text-gray-500">
             Report data coming soon.
           </div>
        </div>
        
        {/* Staff Performance Placeholder */}
        <div className="panel-card">
           <h2 className="text-xl font-semibold text-white">Staff Performance</h2>
           <div className="h-48 flex items-center justify-center text-gray-500">
             Report data coming soon.
           </div>
        </div>
      </div>
    </main>
  );
};

export default Reports;