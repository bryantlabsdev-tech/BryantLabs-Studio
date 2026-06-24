import { useState } from "react";

interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  productCount: number;
}

const mockSuppliers: Supplier[] = [
  { id: 'sup-1', name: 'Global Hardware Inc.', contactPerson: 'Jane Doe', email: 'jane.d@ghi.com', phone: '123-456-7890', productCount: 12 },
  { id: 'sup-2', name: 'Electronix Direct', contactPerson: 'John Smith', email: 'j.smith@electronix.com', phone: '234-567-8901', productCount: 45 },
  { id: 'sup-3', name: 'Kitchenware Kings', contactPerson: 'Emily White', email: 'emily@kwk.co', phone: '345-678-9012', productCount: 8 },
  { id: 'sup-4', name: 'Office Outfitters LLC', contactPerson: 'Michael Brown', email: 'mike.b@officeoutfit.com', phone: '456-789-0123', productCount: 21 },
];

const Suppliers = () => {
  const [suppliers] = useState<Supplier[]>(mockSuppliers);
  
  return (
    <main className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Suppliers</h1>
        <button className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700">
          Add Supplier
        </button>
      </div>

      {suppliers.length === 0 ? (
        <div className="panel-card text-center py-12">
          <h3 className="text-lg font-medium text-white">No suppliers found</h3>
          <p className="mt-1 text-sm text-gray-400">Get started by adding your first supplier.</p>
          <button className="mt-4 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700">
            Add Supplier
          </button>
        </div>
      ) : (
        <div className="panel-card overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-800">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Name</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Contact Person</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Email</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Products</th>
              </tr>
            </thead>
            <tbody className="bg-gray-800/50 divide-y divide-gray-700">
              {suppliers.map((supplier) => (
                <tr key={supplier.id} className="hover:bg-gray-700/50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{supplier.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{supplier.contactPerson}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{supplier.email}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{supplier.productCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
};

export default Suppliers;