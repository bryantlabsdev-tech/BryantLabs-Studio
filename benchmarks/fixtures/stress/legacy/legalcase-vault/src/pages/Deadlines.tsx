import { useState } from "react";
import type { DeadlineStatus } from "../types";
import { FiCalendar, FiPlus } from "../components/IconStub";
// Assuming a Deadline type from a full types.ts
type Deadline = {
  id: string;
  title: string;
  caseName: string;
  dueDate: string;
  status: DeadlineStatus;
};

const mockDeadlines: Deadline[] = [
  { id: "dl-001", title: "File response to Motion to Dismiss", caseName: "Acme Corp v. Stark Inc.", dueDate: "2023-12-15", status: "Pending" },
  { id: "dl-002", title: "Serve discovery requests", caseName: "Smith v. Johnson", dueDate: "2023-12-01", status: "Pending" },
  { id: "dl-003", title: "Initial disclosures deadline", caseName: "Smith v. Johnson", dueDate: "2023-11-20", status: "Completed" },
  { id: "dl-004", title: "Statute of limitations", caseName: "Doe v. City of Metropolis", dueDate: "2023-10-31", status: "Completed" },
  { id: "dl-005", title: "Expert witness disclosure", caseName: "Acme Corp v. Stark Inc.", dueDate: "2023-11-05", status: "Missed" },
];

const statusColors: Record<DeadlineStatus, string> = {
  "Pending": "bg-yellow-600 text-yellow-100",
  "Completed": "bg-green-600 text-green-100",
  "Missed": "bg-red-600 text-red-100",
};

const Deadlines = () => {
  const [deadlines, _setDeadlines] = useState<Deadline[]>(mockDeadlines);

  return (
    <main className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Deadlines</h1>
        <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-md transition-colors duration-200">
          <FiPlus />
          <span>Add Deadline</span>
        </button>
      </div>

      <div className="panel-card overflow-x-auto">
        {deadlines.length === 0 ? (
          <div className="text-center py-12">
            <FiCalendar className="mx-auto h-12 w-12 text-gray-500" />
            <h3 className="mt-2 text-lg font-medium text-gray-200">No Deadlines</h3>
            <p className="mt-1 text-sm text-gray-400">All caught up! Add a new deadline to track it here.</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="border-b border-gray-700 text-sm text-gray-400">
              <tr>
                <th className="p-4">Task</th>
                <th className="p-4">Case</th>
                <th className="p-4">Due Date</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {deadlines.map((deadline) => (
                <tr key={deadline.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="p-4 font-medium text-gray-100">{deadline.title}</td>
                  <td className="p-4 text-gray-300">{deadline.caseName}</td>
                  <td className="p-4 text-gray-300">{deadline.dueDate}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColors[deadline.status]}`}>
                      {deadline.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
};

export default Deadlines;