import { useState } from "react";
import { AlertStatus, AlertType } from "../types";

interface Alert {
  id: string;
  type: AlertType;
  title: string;
  details: string;
  timestamp: string;
  status: AlertStatus;
}

const mockAlerts: Alert[] = [
  { id: 'alert-1', type: 'low_stock', title: 'Low Stock Warning', details: 'Product "HW-MNT-01" is below reorder point (15/20).', timestamp: '2024-07-21 10:30 AM', status: 'new' },
  { id: 'alert-2', type: 'expiry_soon', title: 'Expiry Soon', details: 'Batch "B-2023-12" of "MED-SAL-01" expires in 14 days.', timestamp: '2024-07-21 09:00 AM', status: 'new' },
  { id: 'alert-3', type: 'low_stock', title: 'Low Stock Warning', details: 'Product "EL-CAB-05" is below reorder point (45/50).', timestamp: '2024-07-20 04:15 PM', status: 'acknowledged' },
  { id: 'alert-4', type: 'low_stock', title: 'Low Stock Warning', details: 'Product "HW-SCR-25" is out of stock.', timestamp: '2024-07-19 11:00 AM', status: 'resolved' },
];

const statusStyles: Record<AlertStatus, string> = {
  new: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  acknowledged: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  resolved: "bg-green-500/20 text-green-400 border-green-500/30",
};

const AlertCard = ({ alert }: { alert: Alert }) => (
  <div className={`panel-card bg-gray-800 border-l-4 rounded-lg p-4 flex justify-between items-start ${statusStyles[alert.status]}`}>
    <div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-white">{alert.title}</span>
        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-700 text-gray-300">
          {alert.status.charAt(0).toUpperCase() + alert.status.slice(1)}
        </span>
      </div>
      <p className="text-gray-300 mt-1">{alert.details}</p>
      <p className="text-xs text-gray-500 mt-2">{alert.timestamp}</p>
    </div>
    {alert.status !== 'resolved' && (
      <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0 ml-4">
        {alert.status === 'new' && <button className="text-xs bg-gray-700 hover:bg-gray-600 text-white py-1 px-3 rounded">Acknowledge</button>}
        {alert.status === 'acknowledged' && <button className="text-xs bg-green-600 hover:bg-green-700 text-white py-1 px-3 rounded">Resolve</button>}
      </div>
    )}
  </div>
);

export default function Alerts() {
  const [alerts] = useState<Alert[]>(mockAlerts);

  return (
    <main className="flex-1 p-6 overflow-auto">
      <h2 className="text-2xl font-semibold text-white mb-6">Alerts</h2>
      {alerts.length > 0 ? (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      ) : (
        <div className="panel-card bg-gray-800 border border-gray-700 rounded-lg p-4 text-center py-12">
          <h3 className="text-lg font-semibold text-white">All Clear!</h3>
          <p className="text-gray-400 mt-2">There are no active alerts.</p>
        </div>
      )}
    </main>
  );
}