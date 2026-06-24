import { useState } from "react";
import { User, Bell, Building } from "../components/IconStub";

interface UserSettings {
  name: string;
  email: string;
  companyName: string;
  notifications: {
    lowStockAlerts: boolean;
    poStatusUpdates: boolean;
  };
  lowStockThreshold: number;
}

export default function Settings() {
  const [settings, setSettings] = useState<UserSettings>({
    name: "Alex Johnson",
    email: "alex.j@inventorycommand.com",
    companyName: "AutoParts Pro Inc.",
    notifications: {
      lowStockAlerts: true,
      poStatusUpdates: false,
    },
    lowStockThreshold: 20,
  });

  const handleToggle = (key: 'lowStockAlerts' | 'poStatusUpdates') => {
    setSettings(prev => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        [key]: !prev.notifications[key],
      }
    }));
  };

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 mt-1">Manage your account and application settings.</p>
      </div>

      <div className="panel-card">
        <div className="flex items-center gap-4 border-b border-gray-700 pb-4 mb-6">
          <User className="h-6 w-6 text-blue-400" />
          <h2 className="text-xl font-semibold">User Profile</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">Name</label>
            <input type="text" id="name" value={settings.name} disabled className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-gray-200 cursor-not-allowed" />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">Email Address</label>
            <input type="email" id="email" value={settings.email} disabled className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-gray-200 cursor-not-allowed" />
          </div>
        </div>
      </div>

      <div className="panel-card">
        <div className="flex items-center gap-4 border-b border-gray-700 pb-4 mb-6">
          <Building className="h-6 w-6 text-blue-400" />
          <h2 className="text-xl font-semibold">Company</h2>
        </div>
        <div>
          <label htmlFor="companyName" className="block text-sm font-medium text-gray-300 mb-1">Company Name</label>
          <input type="text" id="companyName" defaultValue={settings.companyName} className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500" />
        </div>
      </div>

      <div className="panel-card">
        <div className="flex items-center gap-4 border-b border-gray-700 pb-4 mb-6">
          <Bell className="h-6 w-6 text-blue-400" />
          <h2 className="text-xl font-semibold">Notifications</h2>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-200">Low Stock Alerts</span>
            <button onClick={() => handleToggle('lowStockAlerts')} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.notifications.lowStockAlerts ? 'bg-blue-600' : 'bg-gray-600'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.notifications.lowStockAlerts ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-200">Purchase Order Status Updates</span>
            <button onClick={() => handleToggle('poStatusUpdates')} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.notifications.poStatusUpdates ? 'bg-blue-600' : 'bg-gray-600'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.notifications.poStatusUpdates ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          <div>
            <label htmlFor="lowStockThreshold" className="block text-sm font-medium text-gray-300 mb-1">Low Stock Threshold</label>
            <input type="number" id="lowStockThreshold" defaultValue={settings.lowStockThreshold} className="w-full md:w-1/3 bg-gray-800 border border-gray-700 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500" />
             <p className="text-xs text-gray-500 mt-1">Receive an alert when stock quantity for a product falls below this number.</p>
          </div>
        </div>
      </div>
      
      <div className="flex justify-end">
        <button className="bg-blue-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors">
          Save Changes
        </button>
      </div>
    </div>
  );
}