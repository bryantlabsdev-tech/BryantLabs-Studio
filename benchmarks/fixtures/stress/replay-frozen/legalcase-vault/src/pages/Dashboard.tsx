import { useState } from "react";
import { Briefcase, Users, Clock, FileText } from "../components/IconStub";

const Dashboard = () => {
  const [stats] = useState({
    activeCases: 14,
    totalClients: 32,
    upcomingDeadlines: 5,
  });

  const [recentCases] = useState<
    { id: string; title: string; clientName: string; status: 'Open' | 'Pending' }[]
  >([
    { id: 'C-001', title: 'Smith v. Acme Corp', clientName: 'John Smith', status: 'Open' },
    { id: 'C-002', title: 'Doe Real Estate', clientName: 'Jane Doe', status: 'Pending' },
    { id: 'C-003', title: 'Innovate LLC Patent', clientName: 'Innovate LLC', status: 'Open' },
  ]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="panel-card">
          <div className="flex items-center gap-4">
            <Briefcase className="h-8 w-8 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-400">Active Cases</p>
              <p className="text-2xl font-bold">{stats.activeCases}</p>
            </div>
          </div>
        </div>
        <div className="panel-card">
          <div className="flex items-center gap-4">
            <Users className="h-8 w-8 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-400">Total Clients</p>
              <p className="text-2xl font-bold">{stats.totalClients}</p>
            </div>
          </div>
        </div>
        <div className="panel-card">
          <div className="flex items-center gap-4">
            <Clock className="h-8 w-8 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-400">Upcoming Deadlines</p>
              <p className="text-2xl font-bold">{stats.upcomingDeadlines}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="panel-card">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Recent Activity
        </h2>
        {recentCases.length > 0 ? (
          <ul className="space-y-2">
            {recentCases.map((c) => (
              <li key={c.id} className="flex justify-between items-center p-2 rounded-md hover:bg-gray-700/50">
                <div>
                  <p className="font-medium">{c.title}</p>
                  <p className="text-sm text-gray-400">{c.clientName}</p>
                </div>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  c.status === 'Open' ? 'bg-blue-500/20 text-blue-300' : 'bg-yellow-500/20 text-yellow-300'
                }`}>{c.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-center text-gray-400 py-8">
            <p>No recent activity to display.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Dashboard;