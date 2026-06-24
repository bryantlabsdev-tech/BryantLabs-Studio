import { useState } from "react";
import type { OnboardingStatus } from '../types';

interface OnboardingTask {
  id: string;
  employeeName: string;
  position: string;
  startDate: string;
  status: OnboardingStatus;
}

const mockOnboardingTasks: OnboardingTask[] = [
  { id: '1', employeeName: 'Grace Hopper', position: 'Backend Developer', startDate: '2023-10-15', status: 'In Progress' },
  { id: '2', employeeName: 'Linus Torvalds', position: 'DevOps Engineer', startDate: '2023-10-20', status: 'Completed' },
  { id: '3', employeeName: 'Ada Lovelace', position: 'Data Scientist', startDate: '2023-11-01', status: 'Not Started' },
];

const StatusBadge = ({ status }: { status: OnboardingStatus }) => {
  const statusClasses: Record<OnboardingStatus, string> = {
    'Not Started': 'bg-gray-600 text-gray-100',
    'In Progress': 'bg-yellow-600 text-yellow-100',
    'Completed': 'bg-green-600 text-green-100',
  };
  return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusClasses[status]}`}>{status}</span>;
};

export default function Onboarding() {
  const [tasks, setTasks] = useState(mockOnboardingTasks);

  const handleRemoveTask = (id: string) => {
    setTasks(currentTasks => currentTasks.filter(task => task.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Onboarding Tracker</h2>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md">
          Start New Onboarding
        </button>
      </div>

      <div className="panel-card bg-gray-800 rounded-lg shadow-md overflow-hidden">
        {tasks.length > 0 ? (
          <table className="w-full text-left">
            <thead className="bg-gray-700/50">
              <tr>
                <th className="p-4 text-sm font-semibold">Employee</th>
                <th className="p-4 text-sm font-semibold">Position</th>
                <th className="p-4 text-sm font-semibold">Start Date</th>
                <th className="p-4 text-sm font-semibold">Status</th>
                <th className="p-4 text-sm font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-gray-700/50">
                  <td className="p-4">{task.employeeName}</td>
                  <td className="p-4">{task.position}</td>
                  <td className="p-4">{task.startDate}</td>
                  <td className="p-4"><StatusBadge status={task.status} /></td>
                  <td className="p-4">
                    <button onClick={() => handleRemoveTask(task.id)} className="text-gray-400 hover:text-white">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center p-12">
            <h3 className="text-lg font-medium">No Onboarding Processes</h3>
            <p className="text-gray-400 mt-2">Start a new onboarding process to see it here.</p>
          </div>
        )}
      </div>
    </div>
  );
}