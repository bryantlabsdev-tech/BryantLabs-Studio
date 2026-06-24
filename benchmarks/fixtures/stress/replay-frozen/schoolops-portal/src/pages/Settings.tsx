import { useState } from "react";
import { User, Bell, CreditCard, Lock } from "../components/IconStub";

type Tab = 'profile' | 'notifications' | 'billing' | 'security';

const Settings = () => {
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  const renderContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="panel-card">
            <h3 className="text-xl font-semibold mb-4">Profile Settings</h3>
            <form className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">Full Name</label>
                <input type="text" id="name" defaultValue="Admin User" className="mt-1 block w-full input" />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email Address</label>
                <input type="email" id="email" defaultValue="admin@schoolops.com" className="mt-1 block w-full input" />
              </div>
              <div className="pt-2">
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        );
      case 'notifications':
        return (
          <div className="panel-card">
            <h3 className="text-xl font-semibold mb-4">Notification Settings</h3>
            <div className="space-y-6">
              <div>
                <h4 className="font-semibold text-gray-800">Email Notifications</h4>
                <p className="text-sm text-gray-500 mb-2">Receive updates and alerts via your email.</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="email-enrollments">New Student Enrollments</label>
                    <input type="checkbox" id="email-enrollments" className="toggle toggle-primary" defaultChecked={true} />
                  </div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="email-attendance">Low Attendance Warnings</label>
                    <input type="checkbox" id="email-attendance" className="toggle toggle-primary" defaultChecked={false} />
                  </div>
                </div>
              </div>
              <div className="pt-2">
                <button type="submit" className="btn btn-primary">Save Preferences</button>
              </div>
            </div>
          </div>
        );
      case 'billing':
        return (
          <div className="panel-card">
            <h3 className="text-xl font-semibold mb-4">Billing & Plan</h3>
            <div className="space-y-2">
              <p>Your current plan: <span className="font-semibold text-blue-600">Pro Plan</span></p>
              <p className="text-gray-600">Next billing date: November 30, 2024</p>
            </div>
            <div className="mt-4">
                <button className="btn btn-secondary">Manage Subscription</button>
            </div>
          </div>
        );
      case 'security':
        return (
          <div className="panel-card">
            <h3 className="text-xl font-semibold mb-4">Security</h3>
            <div className="space-y-4 divide-y">
              <div className="flex items-center justify-between pt-2">
                <div>
                  <h4 className="font-semibold">Change Password</h4>
                  <p className="text-sm text-gray-500">It's a good idea to use a strong password.</p>
                </div>
                <button className="btn btn-secondary">Change Password</button>
              </div>
              <div className="pt-4 flex items-center justify-between">
                 <div>
                  <h4 className="font-semibold">Two-Factor Authentication (2FA)</h4>
                  <p className="text-sm text-gray-500">Add an extra layer of security to your account.</p>
                </div>
                <input type="checkbox" className="toggle toggle-primary" />
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile', label: 'Profile', icon: <User /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell /> },
    { id: 'billing', label: 'Billing', icon: <CreditCard /> },
    { id: 'security', label: 'Security', icon: <Lock /> },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Settings</h1>
      <div className="flex flex-col md:flex-row gap-8">
        <aside className="md:w-1/4 lg:w-1/5">
          <nav className="flex flex-row overflow-x-auto md:flex-col md:overflow-x-visible -mx-4 px-4 md:mx-0 md:px-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors shrink-0 ${
                  activeTab === tab.id
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                {tab.icon}
                <span className="md:inline">{tab.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default Settings;