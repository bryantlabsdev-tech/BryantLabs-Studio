import { type FormEvent, useState } from "react";
import {SettingsIcon, User, Bell, Globe } from "../components/IconStub";

interface UserSettings {
  profile: {
    name: string;
    email: string;
  };
  notifications: {
    maintenance: boolean;
    dispatch: boolean;
  };
  application: {
    units: "Metric" | "Imperial";
  };
}

const initialSettings: UserSettings = {
  profile: { name: "Fleet Manager", email: "manager@fleetops.pro" },
  notifications: { maintenance: true, dispatch: false },
  application: { units: "Imperial" },
};

export default function Settings() {
  const [settings, setSettings] = useState<UserSettings>(initialSettings);

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    console.log("Settings saved:", settings);
    // Here you would typically call an API to save the settings
  };

  return (
    <main className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center mb-6">
        <h1 className="text-3xl font-bold text-white flex items-center">
          <SettingsIcon className="w-8 h-8 mr-3" />
          Settings
        </h1>
      </div>

      <form onSubmit={handleSave} className="space-y-8 max-w-4xl mx-auto">
        <section className="panel-card bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold flex items-center mb-4"><User className="mr-2" />Profile</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">Name</label>
              <input type="text" id="name" value={settings.profile.name} onChange={(e) => setSettings(s => ({...s, profile: {...s.profile, name: e.target.value}}))} className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">Email</label>
              <input type="email" id="email" value={settings.profile.email} onChange={(e) => setSettings(s => ({...s, profile: {...s.profile, email: e.target.value}}))} className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:ring-blue-500 focus:border-blue-500" />
            </div>
          </div>
        </section>

        <section className="panel-card bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold flex items-center mb-4"><Bell className="mr-2" />Notifications</h2>
          <div className="space-y-2">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input type="checkbox" checked={settings.notifications.maintenance} onChange={(e) => setSettings(s => ({...s, notifications: {...s.notifications, maintenance: e.target.checked}}))} className="form-checkbox h-5 w-5 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500" />
              <span className="text-gray-300">Maintenance Alerts</span>
            </label>
            <label className="flex items-center space-x-3 cursor-pointer">
              <input type="checkbox" checked={settings.notifications.dispatch} onChange={(e) => setSettings(s => ({...s, notifications: {...s.notifications, dispatch: e.target.checked}}))} className="form-checkbox h-5 w-5 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500" />
              <span className="text-gray-300">Dispatch Updates</span>
            </label>
          </div>
        </section>

        <section className="panel-card bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold flex items-center mb-4"><Globe className="mr-2" />Application</h2>
          <div>
            <span className="block text-sm font-medium text-gray-300 mb-2">Measurement Units</span>
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input type="radio" name="units" value="Imperial" checked={settings.application.units === 'Imperial'} onChange={() => setSettings(s => ({...s, application: {...s.application, units: 'Imperial'}}))} className="form-radio h-4 w-4 bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500" />
                <span>Imperial (miles, gallons)</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input type="radio" name="units" value="Metric" checked={settings.application.units === 'Metric'} onChange={() => setSettings(s => ({...s, application: {...s.application, units: 'Metric'}}))} className="form-radio h-4 w-4 bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500" />
                <span>Metric (km, liters)</span>
              </label>
            </div>
          </div>
        </section>

        <div className="flex justify-end pt-4">
          <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors">
            Save Changes
          </button>
        </div>
      </form>
    </main>
  );
}