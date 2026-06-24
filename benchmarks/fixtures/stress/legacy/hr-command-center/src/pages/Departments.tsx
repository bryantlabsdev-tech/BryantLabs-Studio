import { useState } from "react";

interface Department {
  id: string;
  name: string;
  manager: string;
  employeeCount: number;
}

const mockDepartments: Department[] = [
  { id: '1', name: 'Technology', manager: 'Alice Johnson', employeeCount: 45 },
  { id: '2', name: 'Product', manager: 'Bob Smith', employeeCount: 15 },
  { id: '3', name: 'Design', manager: 'Charlie Brown', employeeCount: 12 },
  { id: '4', name: 'Human Resources', manager: 'Diana Prince', employeeCount: 8 },
  { id: '5', name: 'Sales', manager: 'Eve Adams', employeeCount: 25 },
];

export default function Departments() {
  const [departments, _setDepartments] = useState<Department[]>(mockDepartments);
  
  const addDepartment = () => {
    // In a real app, this would open a form/modal
    console.log("Adding a new department...");
  };

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Departments</h1>
          <p className="text-gray-400">Organize your company into departments.</p>
        </div>
        <button onClick={addDepartment} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Add Department
        </button>
      </div>

      {departments.length === 0 ? (
        <div className="panel-card text-center">
          <h3 className="text-lg font-medium text-white">No Departments Found</h3>
          <p className="mt-1 text-sm text-gray-400">Get started by creating your first department.</p>
          <button onClick={addDepartment} className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            Create Department
          </button>
        </div>
      ) : (
        <div className="panel-card overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-800">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Department Name</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Manager</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Employees</th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">Edit</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700 bg-gray-800">
              {departments.map((dept) => (
                <tr key={dept.id}>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-white">{dept.name}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">{dept.manager}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">{dept.employeeCount}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                    <a href="#" className="text-indigo-400 hover:text-indigo-300">Edit</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}