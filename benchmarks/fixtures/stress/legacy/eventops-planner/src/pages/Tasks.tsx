import { useMemo, useState } from "react";
import { TaskStatus } from "../types";

type Task = {
  id: string;
  description: string;
  event: string;
  assignee: string;
  dueDate: string;
  status: TaskStatus;
};

const mockTasks: Task[] = [
  { id: '1', description: 'Book keynote speaker', event: 'Annual Tech Conference 2024', assignee: 'Alice', dueDate: '2024-07-15', status: 'In Progress' },
  { id: '2', description: 'Finalize catering menu', event: 'Charity Gala 2024', assignee: 'Bob', dueDate: '2024-08-01', status: 'To Do' },
  { id: '3', description: 'Send out invitations', event: 'Charity Gala 2024', assignee: 'Charlie', dueDate: '2024-07-20', status: 'Completed' },
  { id: '4', description: 'Secure stage permits', event: 'Summer Music Festival', assignee: 'David', dueDate: '2024-06-30', status: 'Blocked' },
  { id: '5', description: 'Arrange A/V equipment', event: 'Annual Tech Conference 2024', assignee: 'Alice', dueDate: '2024-09-01', status: 'To Do' },
];

const getStatusBadgeClass = (status: TaskStatus) => {
  switch (status) {
    case 'Completed': return 'bg-green-600/30 text-green-300';
    case 'In Progress': return 'bg-blue-600/30 text-blue-300';
    case 'To Do': return 'bg-yellow-600/30 text-yellow-300';
    case 'Blocked': return 'bg-red-600/30 text-red-300';
    default: return 'bg-gray-600/30 text-gray-300';
  }
};

const Tasks = () => {
  const [tasks] = useState<Task[]>(mockTasks);
  const [filter, setFilter] = useState<TaskStatus | 'All'>('All');

  const filteredTasks = useMemo(() => {
    if (filter === 'All') return tasks;
    return tasks.filter(task => task.status === filter);
  }, [tasks, filter]);
  
  const filterButtons: (TaskStatus | 'All')[] = ['All', 'To Do', 'In Progress', 'Completed', 'Blocked'];

  return (
    <main className="flex-1 p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white">Tasks</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md transition-colors">
          + Add Task
        </button>
      </div>
      
      <div className="mb-4 flex flex-wrap gap-2">
        {filterButtons.map(f => (
          <button 
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${filter === f ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="panel-card bg-gray-800 rounded-lg shadow-lg">
        {filteredTasks.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-300">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                <tr>
                  <th scope="col" className="px-6 py-3">Task</th>
                  <th scope="col" className="px-6 py-3">Event</th>
                  <th scope="col" className="px-6 py-3">Assignee</th>
                  <th scope="col" className="px-6 py-3">Due Date</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                  <th scope="col" className="px-6 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => (
                  <tr key={task.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="px-6 py-4 font-medium text-white whitespace-nowrap">{task.description}</td>
                    <td className="px-6 py-4">{task.event}</td>
                    <td className="px-6 py-4">{task.assignee}</td>
                    <td className="px-6 py-4">{task.dueDate}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(task.status)}`}>
                        {task.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <a href="#" className="font-medium text-indigo-400 hover:underline">Edit</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center p-12">
            <h2 className="text-xl font-semibold text-white">No Tasks Found</h2>
            <p className="text-gray-400 mt-2">No tasks match the current filter, or you haven't added any tasks yet.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Tasks;