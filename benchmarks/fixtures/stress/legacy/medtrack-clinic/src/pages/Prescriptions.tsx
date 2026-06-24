import { useMemo, useState } from "react";
import { PrescriptionStatus } from "../types";
import { Search, Pill, PlusCircle } from "../components/IconStub";
interface Prescription {
  id: string;
  patientName: string;
  medication: string;
  dosage: string;
  providerName: string;
  datePrescribed: string;
  status: PrescriptionStatus;
}

const mockPrescriptions: Prescription[] = [
  { id: 'PR001', patientName: 'John Doe', medication: 'Lisinopril', dosage: '10mg', providerName: 'Dr. Smith', datePrescribed: '2023-10-15', status: 'Active' },
  { id: 'PR002', patientName: 'Jane Smith', medication: 'Metformin', dosage: '500mg', providerName: 'Dr. Jones', datePrescribed: '2023-09-20', status: 'Filled' },
  { id: 'PR003', patientName: 'Jim Brown', medication: 'Amoxicillin', dosage: '250mg', providerName: 'Dr. Smith', datePrescribed: '2023-05-01', status: 'Expired' },
  { id: 'PR004', patientName: 'Emily White', medication: 'Atorvastatin', dosage: '20mg', providerName: 'Dr. Chen', datePrescribed: '2023-11-01', status: 'Active' },
  { id: 'PR005', patientName: 'Michael Green', medication: 'Albuterol', dosage: '90mcg', providerName: 'Dr. Jones', datePrescribed: '2023-10-28', status: 'Active' },
];

const getStatusBadgeClass = (status: PrescriptionStatus) => {
  switch (status) {
    case "Active": return "bg-green-500/20 text-green-300";
    case "Filled": return "bg-blue-500/20 text-blue-300";
    case "Expired": return "bg-red-500/20 text-red-300";
    default: return "bg-gray-500/20 text-gray-300";
  }
};

export default function Prescriptions() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredPrescriptions = useMemo(() => {
    if (!searchTerm) return mockPrescriptions;
    return mockPrescriptions.filter(p =>
      p.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.medication.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Prescriptions</h1>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold">
          <PlusCircle size={18} />
          <span>New Prescription</span>
        </button>
      </div>

      <div className="panel-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">All Prescriptions</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search prescriptions..."
              className="pl-10 pr-4 py-2 w-64 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        {filteredPrescriptions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-600">
                <tr>
                  <th className="p-3">Patient</th>
                  <th className="p-3">Medication</th>
                  <th className="p-3">Prescriber</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredPrescriptions.map((p) => (
                  <tr key={p.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="p-3 font-medium">{p.patientName}</td>
                    <td className="p-3">{p.medication} <span className="text-gray-400 text-sm">{p.dosage}</span></td>
                    <td className="p-3">{p.providerName}</td>
                    <td className="p-3">{p.datePrescribed}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(p.status)}`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16">
            <Pill size={48} className="mx-auto text-gray-500" />
            <h3 className="mt-4 text-xl font-semibold">No Prescriptions Found</h3>
            <p className="mt-2 text-gray-400">There are no prescriptions matching your search.</p>
          </div>
        )}
      </div>
    </main>
  );
}