import { useState } from "react";
import { UserCircleIcon, BellIcon, CalendarDaysIcon, CheckCircleIcon } from "../components/IconStub";
// Mock data representing current user settings
const initialSettings = {
  profile: {
    name: "Admin User",
    email: "admin@schoolops.edu",
    role: "Administrator",
  },
  notifications: {
    behaviorLogs: true,
    attendanceAlerts: false,
    gradeUpdates: true,
  },
  school: {
    academicYear: "2023-2024",
  },
};

type SettingsData = typeof initialSettings;

export default function Settings() {
  const [settings, setSettings] = useState<SettingsData>(initialSettings);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real app, this would send a request to the server.
    console.log("Saving settings:", settings);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, profile: { ...prev.profile, [name]: value } }));
  };

  const handleNotificationToggle = (key: keyof SettingsData['notifications']) => {
    setSettings(prev => ({
      ...prev,
      notifications: { ...prev.notifications, [key]: !prev.notifications[key] },
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <button
          onClick={handleSave}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          Save Changes
        </button>
      </div>

      {showSuccess && (
        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 rounded-md flex items-center" role="alert">
          <CheckCircleIcon className="h-5 w-5 mr-3"/>
          <p className="font-bold">Settings saved successfully!</p>
        </div>
      )}

      {/* Profile Settings */}
      <div className="panel-card">
        <div className="flex items-center mb-4">
          <UserCircleIcon className="h-6 w-6 mr-3 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-800">User Profile</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">Full Name</label>
            <input type="text" id="name" name="name" value={settings.profile.name} onChange={handleProfileChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email Address</label>
            <input type="email" id="email" name="email" value={settings.profile.email} onChange={handleProfileChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
          </div>
        </div>
        <div className="mt-4">
          <button className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">Change Password</button>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="panel-card">
        <div className="flex items-center mb-4">
          <BellIcon className="h-6 w-6 mr-3 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-800">Notifications</h2>
        </div>
        <div className="space-y-3">
          {Object.keys(settings.notifications).map((key) => {
            const typedKey = key as keyof SettingsData['notifications'];
            const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            return (
              <div key={key} className="flex items-center justify-between">
                <span className="text-gray-700">{label}</span>
                <button
                  onClick={() => handleNotificationToggle(typedKey)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.notifications[typedKey] ? 'bg-indigo-600' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.notifications[typedKey] ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* School Configuration */}
      <div className="panel-card">
        <div className="flex items-center mb-4">
          <CalendarDaysIcon className="h-6 w-6 mr-3 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-800">School Configuration</h2>
        </div>
        <div>
          <label htmlFor="academicYear" className="block text-sm font-medium text-gray-700">Current Academic Year</label>
          <input
            type="text"
            id="academicYear"
            name="academicYear"
            value={settings.school.academicYear}
            onChange={(e) => setSettings(prev => ({...prev, school: { ...prev.school, academicYear: e.target.value }}))}
            className="mt-1 block w-full md:w-1/2 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="e.g., 2024-2025"
          />
        </div>
      </div>
    </div>
  );
}