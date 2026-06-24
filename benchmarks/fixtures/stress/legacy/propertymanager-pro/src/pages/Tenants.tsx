import { useState } from "react";
import type { Tenant } from "../types";

// The Tenant type is incomplete in the prompt. We'll use an extended version.
type FullTenant = Tenant & {
  email: string;
  phone: string;
  unitId: string | null;
  unitAddress?: string; // For display purposes
};

const mockTenants: FullTenant[] = [
  { id: 't1', name: 'Alice Johnson', email: 'alice.j@email.com', phone: '555-0101', unitId: 'u1', unitAddress: '123 Maple St, 4B', createdAt: '2023-01-15T10:00:00Z', updatedAt: '2023-05-20T14:30:00Z' },
  { id: 't2', name: 'Bob Williams', email: 'bob.w@email.com', phone: '555-0102', unitId: 'u4', unitAddress: '456 Pine Ln, A', createdAt: '2023-02-20T11:00:00Z', updatedAt: '2023-06-25T11:00:00Z' },
  { id: 't3', name: 'Charlie Brown', email: 'charlie.b@email.com', phone: '555-0103', unitId: null, createdAt: '2023-03-25T12:00:00Z', updatedAt: '2023-07-02T09:45:00Z' },
  { id: 't4', name: 'Diana Prince', email: 'diana.p@email.com', phone: '555-0104', unitId: 'u1', unitAddress: '123 Maple St, 4B', createdAt: '2023-04-10T16:00:00Z', updatedAt: '2023-06-01T18:20:00Z' },
];

const Tenants = () => {
  const [tenants] = useState<FullTenant[]>(mockTenants);

  return (
    <main className="p-4 sm:p-6 lg:p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Tenants</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md shadow-sm">
          Add Tenant
        </button>
      </div>

      <div className="panel-card overflow-hidden">
        {tenants.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700">
              <thead className="bg-gray-800">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Name</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Contact</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Assigned Unit</th>
                </tr>
              </thead>
              <tbody className="bg-gray-800 divide-y divide-gray-700">
                {tenants.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-gray-700/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{tenant.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      <div>{tenant.email}</div>
                      <div>{tenant.phone}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {tenant.unitAddress ?? <span className="text-gray-500">Unassigned</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-white">No tenants found</h3>
            <p className="mt-1 text-sm text-gray-400">Add your first tenant to get started.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Tenants;