import { useState } from "react";
import { Plus, Search } from "../components/IconStub";
import type { Patient } from "../types";

const mockPatients: Patient[] = [
  { id: 'p001', firstName: 'Eleanor', lastName: 'Pena', dateOfBirth: '1985-05-22', gender: 'Female',
  contactInfo: "",
  createdAt: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString().slice(0, 10),
},
  { id: 'p002', firstName: 'Cody', lastName: 'Fisher', dateOfBirth: '1992-11-09', gender: 'Male',
  contactInfo: "",
  createdAt: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString().slice(0, 10),
},
  { id: 'p003', firstName: 'Arlene', lastName: 'McCoy', dateOfBirth: '1978-01-15', gender: 'Female',
  contactInfo: "",
  createdAt: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString().slice(0, 10),
},
  { id: 'p004', firstName: 'Dianne', lastName: 'Russell', dateOfBirth: '2001-08-30', gender: 'Female',
  contactInfo: "",
  createdAt: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString().slice(0, 10),
},
  { id: 'p005', firstName: 'Jacob', lastName: 'Jones', dateOfBirth: '1995-03-12', gender: 'Male',
  contactInfo: "",
  createdAt: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString().slice(0, 10),
},
];

const Patients = () => {
  const [patients] = useState<Patient[]>(mockPatients);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredPatients = patients.filter(p =>
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white">Patients</h1>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg">
          <Plus className="h-5 w-5" />
          <span>New Patient</span>
        </button>
      </div>

      <div className="panel-card mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search patients..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="panel-card">
        {filteredPatients.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-700">
                <tr>
                  <th className="p-4">Name</th>
                  <th className="p-4">Date of Birth</th>
                  <th className="p-4">Gender</th>
                  <th className="p-4">Patient ID</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map((patient) => (
                  <tr key={patient.id} className="border-b border-gray-700 last:border-b-0 hover:bg-gray-700/50">
                    <td className="p-4">{patient.firstName} {patient.lastName}</td>
                    <td className="p-4">{patient.dateOfBirth}</td>
                    <td className="p-4">{patient.gender}</td>
                    <td className="p-4 font-mono text-sm text-gray-400">{patient.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-xl font-semibold mb-2">No Patients Found</h3>
            <p className="text-gray-400">Add a new patient or refine your search.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Patients;