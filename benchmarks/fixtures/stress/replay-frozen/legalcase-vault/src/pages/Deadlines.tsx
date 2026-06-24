import { useState } from "react";
import { Clock, PlusCircle, CheckCircle, Trash2 } from "../components/IconStub";
import type { DeadlineStatus } from "../types";

// Mock type, as it's not in the shared types.ts
type Deadline = {
  id: string;
  task: string;
  caseName: string;
  dueDate: string;
  status: DeadlineStatus;
};

const mockDeadlines: Deadline[] = [
  { id: 'DL-001', task: 'File response to Motion to Dismiss', caseName: 'Smith v. Acme Corp', dueDate: '2024-07-15', status: 'Pending' },
  { id: 'DL-002', task: 'Initial disclosures due', caseName: 'Acme Corp v. Innovate LLC', dueDate: '2024-06-30', status: 'Pending' },
  { id: 'DL-003', task: 'Submit expert witness list', caseName: 'Smith v. Acme Corp', dueDate: '2024-05-20', status: 'Completed' },
  { id: 'DL-004', task: 'Statute of limitations for new claim', caseName: 'Doe Real Estate', dueDate: '2024-04-01', status: 'Missed' },
  { id: 'DL-005', task: 'Respond to discovery requests', caseName: 'Acme Corp v. Innovate LLC', dueDate: '2024-08-01', status: 'Pending' },
];

const Deadlines = () => {
  const [deadlines] = useState<Deadline[]>(mockDeadlines);

  const getStatusBadgeClass = (status: DeadlineStatus) => {
    switch (status) {
      case 'Pending': return 'bg-yellow-500/20 text-yellow-300';
      case 'Completed': return 'bg-green-500/20 text-green-300';
      case 'Missed': return 'bg-red-500/20 text-red-300';
      default: return 'bg-gray-500/20 text-gray-300';
    }
  };
  
  return (
    <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold md:text-2xl flex items-center gap-2"><Clock /> Deadlines</h1>
        <button className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium h-10 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white">
          <PlusCircle className="w-4 h-4 mr-2" />
          Add Deadline
        </button>
      </div>

      <div className="panel-card p-0">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="[&_tr]:border-b border-gray-700">
              <tr className="border-b border-gray-700">
                <th className="h-12 px-4 text-left font-medium text-gray-400">Task</th>
                <th className="h-12 px-4 text-left font-medium text-gray-400 hidden md:table-cell">Case</th>
                <th className="h-12 px-4 text-left font-medium text-gray-400">Due Date</th>
                <th className="h-12 px-4 text-left font-medium text-gray-400">Status</th>
                <th className="h-12 px-4 text-left font-medium text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {deadlines.length > 0 ? (
                deadlines.map((deadline) => (
                  <tr key={deadline.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="p-4 font-medium">{deadline.task}</td>
                    <td className="p-4 hidden md:table-cell text-gray-300">{deadline.caseName}</td>
                    <td className="p-4 text-gray-300">{deadline.dueDate}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(deadline.status)}`}>
                        {deadline.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2 text-gray-400">
                        {deadline.status === 'Pending' && (
                          <button className="p-1 hover:text-green-400" title="Mark as Completed"><CheckCircle className="w-4 h-4" /></button>
                        )}
                        <button className="p-1 hover:text-red-400" title="Delete Deadline"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400">
                    No deadlines to display.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
};

export default Deadlines;