import { useState } from "react";
import { Plus, Search, FileText } from "../components/IconStub";
import type { VisitNote } from "../types";

const mockVisitNotes: VisitNote[] = [
  { id: "vn001", patientName: "Eleanor Pena", providerName: "Dr. John Carter", visitDate: "2023-10-25", summary: "Follow-up for hypertension. BP is stable." },
  { id: "vn002", patientName: "Cody Fisher", providerName: "Dr. Susan Lewis", visitDate: "2023-10-24", summary: "Annual physical exam. All labs normal." },
  { id: "vn003", patientName: "Arlene McCoy", providerName: "Dr. John Carter", visitDate: "2023-10-22", summary: "Patient complains of seasonal allergies." },
  { id: "vn004", patientName: "Darlene Robertson", providerName: "Dr. Peter Benton", visitDate: "2023-10-21", summary: "Consultation for minor surgical procedure." },
  { id: "vn005", patientName: "Ralph Edwards", providerName: "Dr. Susan Lewis", visitDate: "2023-10-20", summary: "Check-up for diabetes management." },
];

const VisitNotes = () => {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredNotes = mockVisitNotes.filter(
    (note) =>
      (note.patientName ?? 0).toLowerCase().includes(searchTerm.toLowerCase()) ||
      (note.providerName ?? 0).toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FileText className="w-8 h-8" />
          Visit Notes
        </h1>
        <div className="flex gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search notes..."
              className="pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg">
            <Plus className="w-5 h-5" />
            <span>Add Note</span>
          </button>
        </div>
      </div>

      <div className="panel-card bg-gray-800 rounded-lg shadow-lg overflow-hidden">
        {filteredNotes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-700">
                <tr>
                  <th className="p-4 font-semibold">Patient</th>
                  <th className="p-4 font-semibold">Provider</th>
                  <th className="p-4 font-semibold">Visit Date</th>
                  <th className="p-4 font-semibold">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {filteredNotes.map((note) => (
                  <tr key={note.id} className="hover:bg-gray-700/50">
                    <td className="p-4">{note.patientName}</td>
                    <td className="p-4">{note.providerName}</td>
                    <td className="p-4">{note.visitDate}</td>
                    <td className="p-4 text-gray-300">{note.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16">
            <FileText className="w-16 h-16 mx-auto text-gray-500" />
            <h3 className="mt-4 text-xl font-semibold">No Visit Notes Found</h3>
            <p className="mt-1 text-gray-400">
              No notes match your search criteria or none have been added yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default VisitNotes;