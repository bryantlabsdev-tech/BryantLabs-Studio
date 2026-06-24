import { Users, Briefcase, BookOpen } from "../components/IconStub";
import type { FC } from 'react';

interface KpiCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
}

const KpiCard: FC<KpiCardProps> = ({ title, value, icon: Icon }) => (
  <div className="panel-card flex flex-col justify-between">
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-medium text-gray-400">{title}</h3>
      <Icon className="h-5 w-5 text-gray-500" />
    </div>
    <p className="mt-2 text-3xl font-semibold">{value}</p>
  </div>
);

const Dashboard = () => {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-bold text-white">Dashboard</h1>
      
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard title="Total Students" value="1,245" icon={Users} />
        <KpiCard title="Total Teachers" value="88" icon={Briefcase} />
        <KpiCard title="Active Classes" value="112" icon={BookOpen} />
      </div>

      <div className="panel-card">
        <h2 className="text-xl font-semibold text-white mb-4">Announcements</h2>
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <span className="text-blue-400 mt-1">&#8226;</span>
            <p className="text-gray-300">Parent-teacher conferences are scheduled for next Friday. Please sign up for a slot.</p>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-yellow-400 mt-1">&#8226;</span>
            <p className="text-gray-300">The annual science fair has been postponed to March 15th due to scheduling conflicts.</p>
          </li>
           <li className="flex items-start gap-3">
            <span className="text-gray-400 mt-1">&#8226;</span>
            <p className="text-gray-300">Reminder: School is closed this Monday for a public holiday.</p>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default Dashboard;