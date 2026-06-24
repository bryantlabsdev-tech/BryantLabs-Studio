import { useState } from "react";
import { AlertTriangle, Bell } from "../components/IconStub";

// NOTE: In a real app, this type would live in src/types.ts
export interface Alert {
  id: string;
  type: "Low Stock" | "Expiry Soon" | "Overstock";
  productName: string;
  productSku: string;
  message: string;
  priority: "High" | "Medium" | "Low";
  timestamp: string;
}

const mockAlerts: Alert[] = [
  {
    id: "alert_001",
    type: "Low Stock",
    productName: "Cabin Air Filter",
    productSku: "HW-CAF-03",
    message: "Quantity (18) is below reorder level (20)",
    priority: "High",
    timestamp: "2024-07-26T09:00:00Z",
  },
  {
    id: "alert_002",
    type: "Low Stock",
    productName: "Wiper Blade Set",
    productSku: "HW-WB-02",
    message: "Quantity (45) is below reorder level (50)",
    priority: "Medium",
    timestamp: "2024-07-26T08:30:00Z",
  },
  {
    id: "alert_003",
    type: "Expiry Soon",
    productName: "DOT 4 Brake Fluid",
    productSku: "HW-BF-02",
    message: "Batch #BF7891 expires in 14 days",
    priority: "High",
    timestamp: "2024-07-25T14:00:00Z",
  },
  {
    id: "alert_004",
    type: "Overstock",
    productName: "Standard Headlight Bulb",
    productSku: "HW-HB-01",
    message: "Quantity (550) exceeds maximum level (500)",
    priority: "Low",
    timestamp: "2024-07-24T11:20:00Z",
  },
];

const priorityColors: Record<Alert["priority"], { icon: string; badge: string }> = {
  High: { icon: "text-red-400", badge: "bg-red-500/20 text-red-400" },
  Medium: { icon: "text-yellow-400", badge: "bg-yellow-500/20 text-yellow-400" },
  Low: { icon: "text-blue-400", badge: "bg-blue-500/20 text-blue-400" },
};

export default function Alerts() {
  const [alerts] = useState<Alert[]>(mockAlerts);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
      <div className="flex items-center">
        <h1 className="font-semibold text-lg md:text-2xl">Alerts</h1>
      </div>
      <div className="panel-card">
        {alerts.length > 0 ? (
          <div className="space-y-4">
            {alerts.map((alert) => (
              <div key={alert.id} className="flex items-start gap-4 p-4 rounded-lg bg-gray-800 border border-gray-700">
                <AlertTriangle className={`h-6 w-6 flex-shrink-0 ${priorityColors[alert.priority].icon}`} />
                <div className="flex-1">
                  <div className="flex justify-between items-center">
                    <p className="font-semibold text-white">{alert.type}: {alert.productName}</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityColors[alert.priority].badge}`}>
                      {alert.priority} Priority
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 mt-1">{alert.message}</p>
                  <p className="text-xs text-gray-500 mt-2">SKU: {alert.productSku} &middot; {new Date(alert.timestamp).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <Bell className="mx-auto h-12 w-12 text-gray-500" />
            <h3 className="mt-2 text-sm font-medium text-white">All clear!</h3>
            <p className="mt-1 text-sm text-gray-400">You have no active alerts.</p>
          </div>
        )}
      </div>
    </main>
  );
}