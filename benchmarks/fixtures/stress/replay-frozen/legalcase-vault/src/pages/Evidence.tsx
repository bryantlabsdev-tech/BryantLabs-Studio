import { useState } from "react";
import { Shield, PlusCircle, Trash2, Edit } from "../components/IconStub";
import type { EvidenceType } from "../types";

// Mock type, as it's not in the shared types.ts
type Evidence = {
  id: string;
  name: string;
  type: EvidenceType;
  caseName: string;
  dateCollected: string;
  collectedBy: string;
};

const mockEvidence: Evidence[] = [
  { id: 'EV-001', name: 'Security Camera Footage', type: 'Video', caseName: 'Smith v. Acme Corp', dateCollected: '2023-03-10', collectedBy: 'Det. Miller' },
  { id: 'EV-002', name: 'Signed Contract', type: 'Document', caseName: 'Acme Corp v. Innovate LLC', dateCollected: '2023-01-05', collectedBy: 'Paralegal Jones' },
  { id: 'EV-003', name: 'Voicemail Recording', type: 'Audio', caseName: 'Doe Real Estate', dateCollected: '2023-05-20', collectedBy: 'Client' },
  { id: 'EV-004', name: 'Crash Scene Photos (Set A)', type: 'Photo', caseName: 'Smith v. Acme Corp', dateCollected: '2023-03-09', collectedBy: 'CSI Unit' },
  { id: 'EV-005', name: 'Damaged Product Sample', type: 'Physical', caseName: 'Acme Corp v. Innovate LLC', dateCollected: '2023-02-15', collectedBy: 'Forensics Lab' },
];

const Evidence = () => {
  const [evidenceList] = useState<Evidence[]>(mockEvidence);

  const getBadgeClass = (type: EvidenceType) => {
    switch (type) {
      case 'Document': return 'bg-blue-500/20 text-blue-300';
      case 'Photo': return 'bg-green-500/20 text-green-300';
      case 'Video': return 'bg-purple-500/20 text-purple-300';
      case 'Audio': return 'bg-yellow-500/20 text-yellow-300';
      case 'Physical': return 'bg-red-500/20 text-red-300';
      default: return 'bg-gray-500/20 text-gray-300';
    }
  };

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold md:text-2xl flex items-center gap-2"><Shield /> Evidence Log</h1>
        <button className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium h-10 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white">
          <PlusCircle className="w-4 h-4 mr-2" />
          Log New Evidence
        </button>
      </div>

      <div className="panel-card p-0">
        <div className="overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <thead className="[&_tr]:border-b border-gray-700">
              <tr className="border-b border-gray-700">
                <th className="h-12 px-4 text-left align-middle font-medium text-gray-400">Name</th>
                <th className="h-12 px-4 text-left align-middle font-medium text-gray-400">Type</th>
                <th className="h-12 px-4 text-left align-middle font-medium text-gray-400 hidden md:table-cell">Case</th>
                <th className="h-12 px-4 text-left align-middle font-medium text-gray-400 hidden lg:table-cell">Date Collected</th>
                <th className="h-12 px-4 text-left align-middle font-medium text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {evidenceList.length > 0 ? (
                evidenceList.map((item) => (
                  <tr key={item.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="p-4 align-middle font-medium">{item.name}</td>
                    <td className="p-4 align-middle">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getBadgeClass(item.type)}`}>
                        {item.type}
                      </span>
                    </td>
                    <td className="p-4 align-middle hidden md:table-cell text-gray-300">{item.caseName}</td>
                    <td className="p-4 align-middle hidden lg:table-cell text-gray-300">{item.dateCollected}</td>
                    <td className="p-4 align-middle">
                      <div className="flex gap-2 text-gray-400">
                         <button className="p-1 hover:text-indigo-400"><Edit className="w-4 h-4" /></button>
                         <button className="p-1 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400">
                    No evidence has been logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
};

export default Evidence;