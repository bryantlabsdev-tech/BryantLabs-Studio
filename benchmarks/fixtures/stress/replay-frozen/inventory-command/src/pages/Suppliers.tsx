import { useState } from "react";
import { PlusCircle } from "../components/IconStub";

// NOTE: In a real app, this type would live in src/types.ts
export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  status: "Active" | "Inactive";
  createdAt: string;
}

const mockSuppliers: Supplier[] = [
  {
    id: "sup_01",
    name: "AutoParts Global",
    contactPerson: "Jane Doe",
    email: "jane.d@autopartsglobal.com",
    phone: "1-800-555-0101",
    status: "Active",
    createdAt: "2023-01-15T09:30:00Z",
  },
  {
    id: "sup_02",
    name: "FilterMasters Inc.",
    contactPerson: "John Smith",
    email: "jsmith@filtermasters.com",
    phone: "1-888-555-0102",
    status: "Active",
    createdAt: "2023-02-20T11:00:00Z",
  },
  {
    id: "sup_03",
    name: "Vintage Components Ltd.",
    contactPerson: "Emily White",
    email: "emily.w@vintagecomp.co.uk",
    phone: "1-877-555-0103",
    status: "Inactive",
    createdAt: "2022-11-10T14:00:00Z",
  },
];

const StatusBadge = ({ status }: { status: "Active" | "Inactive" }) => {
  const baseClasses = "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset";
  if (status === "Active") {
    return <span className={`${baseClasses} bg-green-800/50 text-green-300 ring-green-500/50`}>Active</span>;
  }
  return <span className={`${baseClasses} bg-gray-700/80 text-gray-400 ring-gray-600/50`}>Inactive</span>;
};

const Suppliers = () => {
  const [suppliers] = useState<Supplier[]>(mockSuppliers);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Suppliers</h1>
        <button className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
          <PlusCircle className="h-4 w-4" />
          Add Supplier
        </button>
      </div>

      <div className="panel-card overflow-x-auto">
        {suppliers.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400">No suppliers found.</p>
            <button className="mt-4 flex mx-auto items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
              <PlusCircle className="h-4 w-4" />
              Add Your First Supplier
            </button>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-800">
              <tr>
                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-300 sm:pl-6">Supplier Name</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-300">Contact Person</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-300">Email</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-300">Status</th>
                <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6"><span className="sr-only">Edit</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 bg-gray-900">
              {suppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-100 sm:pl-6">{supplier.name}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">{supplier.contactPerson}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">{supplier.email}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300"><StatusBadge status={supplier.status} /></td>
                  <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                    <a href="#" className="text-indigo-400 hover:text-indigo-300">Edit</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Suppliers;