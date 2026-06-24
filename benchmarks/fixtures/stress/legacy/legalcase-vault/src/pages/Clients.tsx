import { useState } from "react";

// Mock Client type if not defined yet
// export interface Client { id: string; name: string; email: string; phone: string; caseCount: number; }

const mockClients: Array<Record<string, unknown>> = [
  {
    id: "cl-001",
    name: "John Doe",
    email: "john.doe@example.com",
    phone: "555-1234",
    caseCount: 2,
  createdAt: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString().slice(0, 10)},
  {
    id: "cl-002",
    name: "Jane Smith",
    email: "jane.smith@example.com",
    phone: "555-5678",
    caseCount: 1,
  createdAt: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString().slice(0, 10)},
  {
    id: "cl-003",
    name: "Innovate Inc.",
    email: "contact@innovate.com",
    phone: "555-9012",
    caseCount: 5,
  },
];

const Clients = () => {
  const [clients] = useState<Array<Record<string, unknown>>>(mockClients);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
        <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
          New Client
        </button>
      </div>

      <div className="panel-card mt-6 overflow-x-auto">
        {clients.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-800">
              <tr>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold">Name</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold">Contact</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold">Cases</th>
                <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6"><span className="sr-only">Edit</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700 bg-gray-900">
              {clients.map((client) => (
                <tr key={client.id}>
                  <td className="whitespace-nowrap px-3 py-4 text-sm font-medium">{client.name}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                    <div>{client.email}</div>
                    <div>{client.phone}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">{client.caseCount}</td>
                  <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                    <a href="#" className="text-indigo-400 hover:text-indigo-300">Edit</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-12 text-center">
            <h3 className="text-lg font-semibold">No Clients Found</h3>
            <p className="mt-1 text-sm text-gray-400">Get started by adding a new client.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Clients;