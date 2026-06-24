import { useState } from "react";
import { Customer } from "../types";

const mockCustomers: Customer[] = [
  { id: "1", name: "John Doe", phone: "555-123-4567", email: "john.d@example.com" },
  { id: "2", name: "Jane Smith", phone: "555-987-6543", email: "jane.s@example.com" },
  { id: "3", name: "Bob Johnson", phone: "555-555-5555" },
  { id: "4", name: "Alice Williams", phone: "555-111-2222", email: "alice.w@example.com" },
];

export default function Customers() {
  const [customers, _setCustomers] = useState<Customer[]>(mockCustomers);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-white">Customers</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg">
          Add Customer
        </button>
      </div>

      <div className="panel-card">
        {customers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-600">
                <tr>
                  <th className="p-3">Name</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Email</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="p-3">{customer.name}</td>
                    <td className="p-3">{customer.phone}</td>
                    <td className="p-3">{customer.email || "N/A"}</td>
                    <td className="p-3 text-right">
                      <button className="text-indigo-400 hover:text-indigo-300">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-xl font-semibold">No Customers Found</h3>
            <p className="text-gray-400 mt-2">Get started by adding a new customer.</p>
          </div>
        )}
      </div>
    </div>
  );
}