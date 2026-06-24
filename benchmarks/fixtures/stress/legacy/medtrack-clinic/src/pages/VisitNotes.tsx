import { useMemo, useState } from "react";
import { Search, PlusCircle, FileText, User, Stethoscope } from "../components/IconStub";
// Local type for this page's data
interface VisitNote {
  id: string;
  patientName: string;
  providerName: string;
  appointmentDate: string; // ISO format "YYYY-MM-DD"
  title: string;
  summary: string;
}

const mockVisitNotes: VisitNote[] = [
  {
    id: 'VN001',
    patientName: 'John Doe',
    providerName: 'Dr. Alice Smith',
    appointmentDate: '2023-10-25',
    title: 'Annual Physical Checkup',
    summary: 'Patient is in good health. Advised on diet and exercise. All vitals are normal. No new concerns raised.'
  },
  {
    id: 'VN002',
    patientName: 'Jane Roe',
    providerName: 'Dr. Bob Jones',
    appointmentDate: '2023-10-24',
    title: 'Follow-up for Hypertension',
    summary: 'Blood pressure is well-controlled on current medication. Continue with Lisinopril 10mg daily. Follow-up in 3 months.'
  },
  {
    id: 'VN003',
    patientName: 'Peter Pan',
    providerName: 'Dr. Carol White',
    appointmentDate: '2023-10-22',
    title: 'Consultation for Flu Symptoms',
    summary: 'Patient presents with fever, cough, and body aches. Diagnosed with influenza. Prescribed Tamiflu and advised rest.'
  },
];


export default function VisitNotes() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredNotes = useMemo(() => {
    if (!searchTerm) return mockVisitNotes;
    return mockVisitNotes.filter(note =>
      note.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.providerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Visit Notes</h1>
        <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-colors">
          <PlusCircle size={20} />
          New Note
        </button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-grow">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search by patient, provider, or title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>

      {filteredNotes.length > 0 ? (
        <div className="space-y-4">
          {filteredNotes.map((note) => (
            <div key={note.id} className="panel-card p-4 space-y-3 hover:bg-gray-700/50 transition-colors">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-semibold text-white">{note.title}</h2>
                  <p className="text-sm text-gray-400">
                    {new Date(note.appointmentDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="flex items-center gap-2 justify-end"><User size={14} /> {note.patientName}</p>
                  <p className="flex items-center gap-2 justify-end text-gray-300"><Stethoscope size={14} /> {note.providerName}</p>
                </div>
              </div>
              <p className="text-gray-300">{note.summary}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel-card text-center py-12">
          <FileText size={48} className="mx-auto text-gray-500 mb-4" />
          <h3 className="text-xl font-semibold">No Visit Notes Found</h3>
          <p className="text-gray-400 mt-2">
            {searchTerm ? `No notes match your search for "${searchTerm}".` : "There are no visit notes to display."}
          </p>
        </div>
      )}
    </div>
  );
}