import { useState } from "react";
import type { Employee, EmployeeStatus } from '../types';

const mockEmployees: Employee[] = [
  { id: '1', firstName: 'Alice', lastName: 'Johnson', email: 'alice.j@example.com', position: 'Software Engineer', departmentId: 'Technology', status: 'Active',
  hireDate: new Date().toISOString().slice(0, 10),
},
  { id: '2', firstName: 'Bob', lastName: 'Smith', email: 'bob.s@example.com', position: 'Product Manager', departmentId: 'Product', status: 'Active',
  hireDate: new Date().toISOString().slice(0, 10),
},
  { id: '3', firstName: 'Charlie', lastName: 'Brown', email: 'charlie.b@example.com', position: 'UX Designer', departmentId: 'Design', status: 'On Leave',
  hireDate: new Date().toISOString().slice(0, 10),
},
  { id: '4', firstName: 'Diana', lastName: 'Prince', email: 'diana.p@example.com', position: 'HR Generalist', departmentId: 'Human Resources', status: 'Terminated',
  hireDate: new Date().toISOString().slice(0, 10),
},
];

const getStatusBadgeClasses = (status: EmployeeStatus): string => {
  switch (status) {
    case 'Active': return 'bg-green-500/20 text-green-400';
    case 'On Leave': return 'bg-yellow-500/20 text-yellow-400';
    case 'Terminated': return 'bg-red-500/20 text-red-400';
    default: return 'bg-gray-500/20 text-gray-400';
  }
};

export default function Employees() {
  const [employees, _setEmployees] = useState<Employee[]>(mockEmployees);
  
  const addEmployee = () => {
    // In a real app, this would open a form/modal
    console.log("Adding a new employee...");
  };

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Employees</h1>
          <p className="text-gray-400">Manage all employees in your organization.</p>
        </div>
        <button onClick={addEmployee} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Add Employee
        </button>
      </div>

      {employees.length === 0 ? (
        <div className="panel-card text-center">
          <h3 className="text-lg font-medium text-white">No Employees Found</h3>
          <p className="mt-1 text-sm text-gray-400">Get started by adding your first employee.</p>
          <button onClick={addEmployee} className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            Add Employee
          </button>
        </div>
      ) : (
        <div className="panel-card overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-800">
              <tr>
                {['Name', 'Email', 'Position', 'Department', 'Status', ''].map((header) => (
                  <th key={header} scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700 bg-gray-800">
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-white">{`${employee.firstName} ${employee.lastName}`}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">{employee.email}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">{employee.position}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">{employee.departmentId}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusBadgeClasses(employee.status)}`}>
                      {employee.status}
                    </span>
                  </td>
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