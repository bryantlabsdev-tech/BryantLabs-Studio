import { useState } from "react";
import { Plus, Search, Stethoscope } from "../components/IconStub";

interface Provider {
  id: string;
  firstName: string;
  lastName: string;
  specialty: string;
  email: string;
  phone: string;
}

const mockProviders: Provider[] = [
  { id: "prov001", firstName: "John", lastName: "Carter", specialty: "General Practice", email: "j.carter@medtrack.clinic", phone: "555-0101" },
  { id: "prov002", firstName: "Susan", lastName: "Lewis", specialty: "Pediatrics", email: "s.lewis@medtrack.clinic", phone: "555-0102" },
  { id: "prov003", firstName: "Peter", lastName: "Benton", specialty: "Cardiology", email: "p.benton@medtrack.clinic", phone: "555-0103" },
  { id: "prov004", firstName: "Kerry", lastName: "Weaver", specialty: "Emergency Medicine", email: "k.weaver@medtrack.clinic", phone: "555-0104" },
  { id: "prov005", firstName: "Abby", lastName: "Lockhart", specialty: "Nursing", email: "a.lockhart@medtrack.clinic", phone: "555-0105" },
];

const Providers = () => {
  const [providers, _setProviders] = useState<Provider[]>(mockProviders);

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white">Providers</h1>
        <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          <Plus className="h-5 w-5" />
          <span>Add Provider</span>
        </button>
      </div>

      <div className="panel-card bg-gray-800 p-6 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Clinic Staff</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search providers..."
              className="pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>

        {providers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                <tr>
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Specialty</th>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Phone</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((provider) => (
                  <tr key={provider.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="px-6 py-4 font-medium text-white">{provider.firstName} {provider.lastName}</td>
                    <td className="px-6 py-4">{provider.specialty}</td>
                    <td className="px-6 py-4">{provider.email}</td>
                    <td className="px-6 py-4">{provider.phone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <Stethoscope className="mx-auto h-12 w-12 text-gray-500" />
            <h3 className="mt-2 text-lg font-medium text-white">No providers found</h3>
            <p className="mt-1 text-sm text-gray-400">Get started by adding a new provider.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Providers;