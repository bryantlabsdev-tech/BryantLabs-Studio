import { useMemo, useState } from "react";
import { Stethoscope, Mail, Phone, Search, PlusCircle } from "../components/IconStub";
interface Provider {
  id: string;
  name: string;
  specialty: string;
  email: string;
  phone: string;
  avatarUrl: string;
}

const mockProviders: Provider[] = [
  { id: 'P001', name: 'Dr. Alice Smith', specialty: 'Cardiology', email: 'alice.s@medtrack.com', phone: '555-0101', avatarUrl: `https://i.pravatar.cc/150?u=P001` },
  { id: 'P002', name: 'Dr. Bob Jones', specialty: 'Pediatrics', email: 'bob.j@medtrack.com', phone: '555-0102', avatarUrl: `https://i.pravatar.cc/150?u=P002` },
  { id: 'P003', name: 'Dr. Carol Chen', specialty: 'Neurology', email: 'carol.c@medtrack.com', phone: '555-0103', avatarUrl: `https://i.pravatar.cc/150?u=P003` },
  { id: 'P004', name: 'Dr. David Williams', specialty: 'Dermatology', email: 'david.w@medtrack.com', phone: '555-0104', avatarUrl: `https://i.pravatar.cc/150?u=P004` },
  { id: 'P005', name: 'Dr. Emily Brown', specialty: 'Orthopedics', email: 'emily.b@medtrack.com', phone: '555-0105', avatarUrl: `https://i.pravatar.cc/150?u=P005` },
];

export default function Providers() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredProviders = useMemo(() => {
    if (!searchTerm) return mockProviders;
    return mockProviders.filter(p =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.specialty.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Providers</h1>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold">
          <PlusCircle size={18} />
          <span>Add Provider</span>
        </button>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search by name or specialty..."
            className="pl-10 pr-4 py-2 w-full bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {filteredProviders.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProviders.map((provider) => (
            <div key={provider.id} className="panel-card flex flex-col items-center text-center">
              <img src={provider.avatarUrl} alt={provider.name} className="w-24 h-24 rounded-full mb-4 border-2 border-gray-600" />
              <h3 className="text-lg font-bold text-white">{provider.name}</h3>
              <p className="text-blue-400 mb-4">{provider.specialty}</p>
              <div className="w-full text-left space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-300">
                  <Mail size={16} />
                  <span>{provider.email}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Phone size={16} />
                  <span>{provider.phone}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel-card text-center py-16">
          <Stethoscope size={48} className="mx-auto text-gray-500" />
          <h3 className="mt-4 text-xl font-semibold">No Providers Found</h3>
          <p className="mt-2 text-gray-400">There are no providers matching your search criteria.</p>
        </div>
      )}
    </main>
  );
}