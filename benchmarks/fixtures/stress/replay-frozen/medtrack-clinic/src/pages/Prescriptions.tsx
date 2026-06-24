import { useState } from "react";
import { Pill, Plus, Search } from "../components/IconStub";
import type { PrescriptionStatus } from "../types";

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
  { id: "rx001", patientName: "Eleanor Pena", medication: "Lisinopril", dosage: "10mg Daily", providerName: "Dr. John Carter", datePrescribed: "2023-10-15", status: "Active" },
  { id: "rx002", patientName: "Cody Fisher", medication: "Metformin", dosage: "500mg Twice Daily", providerName: "Dr. Susan Lewis", datePrescribed: "2023-09-20", status: "Active" },
  { id: "rx003", patientName: "Arlene McCoy", medication: "Amoxicillin", dosage: "250mg Every 8 Hours", providerName: "Dr. Peter Benton", datePrescribed: "2023-11-01", status: "Inactive" },
  { id: "rx004", patientName: "Darlene Robertson", medication: "Atorvastatin", dosage: "20mg Daily", providerName: "Dr. John Carter", datePrescribed: "2023-05-12", status: "Active" },
  { id: "rx005", patientName: "Ralph Edwards", medication: "Ibuprofen", dosage: "600mg as needed", providerName: "Dr. Kerry Weaver", datePrescribed: "2022-12-30", status: "Discontinued" },
];

const statusClasses: Record<PrescriptionStatus, string> = {
  Active: "bg-green-500/20 text-green-400",
  Inactive: "bg-yellow-500/20 text-yellow-400",
  Discontinued: "bg-red-500/20 text-red-400",
};

const Prescriptions = () => {
  const [prescriptions, _setPrescriptions] = useState<Prescription[]>(mockPrescriptions);

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white">Prescriptions</h1>
        <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          <Plus className="h-5 w-5" />
          <span>New Prescription</span>
        </button>
      </div>

      <div className="panel-card bg-gray-800 p-6 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">All Prescriptions</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search prescriptions..."
              className="pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>

        {prescriptions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                <tr>
                  <th className="px-6 py-3">Patient</th>
                  <th className="px-6 py-3">Medication</th>
                  <th className="px-6 py-3">Provider</th>
                  <th className="px-6 py-3">Date Prescribed</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {prescriptions.map((rx) => (
                  <tr key={rx.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="px-6 py-4 font-medium text-white">{rx.patientName}</td>
                    <td className="px-6 py-4">{rx.medication} - {rx.dosage}</td>
                    <td className="px-6 py-4">{rx.providerName}</td>
                    <td className="px-6 py-4">{rx.datePrescribed}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusClasses[rx.status]}`}>
                        {rx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <Pill className="mx-auto h-12 w-12 text-gray-500" />
            <h3 className="mt-2 text-lg font-medium text-white">No prescriptions found</h3>
            <p className="mt-1 text-sm text-gray-400">Get started by creating a new prescription.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Prescriptions;