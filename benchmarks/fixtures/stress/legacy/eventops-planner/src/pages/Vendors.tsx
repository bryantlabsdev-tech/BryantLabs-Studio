import { useState } from "react";
import { VendorStatus } from "../types";

type Vendor = {
  id: string;
  name: string;
  service: string;
  contact: string;
  event: string;
  status: VendorStatus;
};

const mockVendors: Vendor[] = [
  { id: '1', name: 'Starlight Catering', service: 'Catering', contact: 'contact@starlight.com', event: 'Annual Tech Conference 2024', status: 'Booked' },
  { id: '2', name: 'ProAV Solutions', service: 'Audio/Visual', contact: 'sales@proav.com', event: 'Annual Tech Conference 2024', status: 'Contacted' },
  { id: '3', name: 'Elegant Decor', service: 'Decorations', contact: 'info@elegantdecor.com', event: 'Charity Gala 2024', status: 'Booked' },
  { id: '4', name: 'City Shuttles', service: 'Transportation', contact: 'bookings@cityshuttles.com', event: 'Summer Music Festival', status: 'Available' },
  { id: '5', name: 'Capture It Photography', service: 'Photography', contact: 'info@captureit.com', event: 'Charity Gala 2024', status: 'Contacted' },
];

const getStatusBadgeClass = (status: VendorStatus) => {
  switch (status) {
    case 'Booked': return 'bg-green-600/30 text-green-300';
    case 'Contacted': return 'bg-yellow-600/30 text-yellow-300';
    case 'Available': return 'bg-blue-600/30 text-blue-300';
    default: return 'bg-gray-600/30 text-gray-300';
  }
};

const Vendors = () => {
  const [vendors] = useState<Vendor[]>(mockVendors);

  return (
    <main className="flex-1 p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white">Vendors</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md transition-colors">
          + Add Vendor
        </button>
      </div>

      <div className="panel-card bg-gray-800 rounded-lg shadow-lg">
        {vendors.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-300">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                <tr>
                  <th scope="col" className="px-6 py-3">Name</th>
                  <th scope="col" className="px-6 py-3">Service</th>
                  <th scope="col" className="px-6 py-3">Contact</th>
                  <th scope="col" className="px-6 py-3">Event</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                  <th scope="col" className="px-6 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((vendor) => (
                  <tr key={vendor.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="px-6 py-4 font-medium text-white whitespace-nowrap">{vendor.name}</td>
                    <td className="px-6 py-4">{vendor.service}</td>
                    <td className="px-6 py-4">{vendor.contact}</td>
                    <td className="px-6 py-4">{vendor.event}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(vendor.status)}`}>
                        {vendor.status}
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
            <h2 className="text-xl font-semibold text-white">No Vendors Found</h2>
            <p className="text-gray-400 mt-2">Get started by adding a new vendor.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Vendors;