import { useState } from "react";
import type { Client } from "../types";

const mockClients: Client[] = [
  { id: 'CL-001', name: 'John Smith', email: 'john.smith@example.com', phone: '555-1234', caseCount: 2,
  dateCreated: new Date().toISOString().slice(0, 10),
},
  { id: 'CL-002', name: 'Jane Doe', email: 'jane.doe@example.com', phone: '555-5678', caseCount: 1,
  dateCreated: new Date().toISOString().slice(0, 10),
},
  { id: 'CL-003', name: 'Acme Corporation', email: 'contact@acme.com', phone: '555-9012', caseCount: 5,
  dateCreated: new Date().toISOString().slice(0, 10),
},
  { id: 'CL-004', name: 'Innovate LLC', email: 'legal@innovate.io', phone: '555-3456', caseCount: 3,
  dateCreated: new Date().toISOString().slice(0, 10),
},
];

const Clients = () => {
  const [clients] = useState<Client[]>(mockClients);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clients</h1>
        <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md">
          Add New Client
        </button>
      </div>

      <div className="panel-card overflow-hidden">
        {clients.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-300">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                <tr>
                  <th scope="col" className="px-6 py-3">Name</th>
                  <th scope="col" className="px-6 py-3">Email</th>
                  <th scope="col" className="px-6 py-3">Phone</th>
                  <th scope="col" className="px-6 py-3 text-center">Active Cases</th>
                  <th scope="col" className="px-6 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id} className="border-b border-gray-700 hover:bg-gray-700/30">
                    <td className="px-6 py-4 font-medium text-white whitespace-nowrap">{client.name}</td>
                    <td className="px-6 py-4">{client.email}</td>
                    <td className="px-6 py-4">{client.phone}</td>
                    <td className="px-6 py-4 text-center">{client.caseCount}</td>
                    <td className="px-6 py-4 text-right">
                      <a href="#" className="font-medium text-blue-500 hover:underline">View</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16">
            <h3 className="text-lg font-semibold">No Clients Found</h3>
            <p className="text-gray-400 mt-2">Get started by adding your first client.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Clients;