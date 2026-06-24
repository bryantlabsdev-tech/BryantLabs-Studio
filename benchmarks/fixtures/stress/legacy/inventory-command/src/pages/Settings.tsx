import { useState } from "react";

const ToggleSwitch = ({
  label,
  enabled,
  setEnabled,
}: {
  label: string;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}) => {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-300">{label}</span>
      <button
        onClick={() => setEnabled(!enabled)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
          enabled ? "bg-indigo-600" : "bg-gray-600"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
};

const Settings = () => {
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);

  return (
    <div className="p-6 space-y-8 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-100">Settings</h2>

      {/* Profile Settings */}
      <div className="panel-card bg-gray-800 p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-white border-b border-gray-700 pb-3 mb-4">
          Profile
        </h3>
        <div className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-400">Name</label>
            <input type="text" id="name" defaultValue="Admin User" className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"/>
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-400">Email Address</label>
            <input type="email" id="email" defaultValue="admin@inventory.app" className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"/>
          </div>
          <div className="pt-2">
            <button className="w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded transition-colors duration-200">
              Update Profile
            </button>
          </div>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="panel-card bg-gray-800 p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-white border-b border-gray-700 pb-3 mb-4">
          Notifications
        </h3>
        <div className="space-y-4">
          <ToggleSwitch label="Email notifications for low stock" enabled={emailNotifications} setEnabled={setEmailNotifications}/>
          <ToggleSwitch label="In-app push notifications" enabled={pushNotifications} setEnabled={setPushNotifications}/>
        </div>
      </div>
    </div>
  );
};

export default Settings;