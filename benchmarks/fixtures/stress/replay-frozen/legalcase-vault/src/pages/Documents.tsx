import { useState } from "react";
import { FileText, PlusCircle, Trash2, Download } from "../components/IconStub";
import type { DocumentType } from "../types";

// Mock type, as it's not in the shared types.ts
type Document = {
  id: string;
  title: string;
  type: DocumentType;
  caseName: string;
  dateFiled: string;
};

const mockDocuments: Document[] = [
  { id: 'DOC-001', title: 'Initial Complaint', type: 'Pleading', caseName: 'Smith v. Acme Corp', dateFiled: '2023-01-15' },
  { id: 'DOC-002', title: 'Motion to Dismiss', type: 'Motion', caseName: 'Acme Corp v. Innovate LLC', dateFiled: '2023-02-01' },
  { id: 'DOC-003', title: 'Interrogatories Set 1', type: 'Discovery', caseName: 'Smith v. Acme Corp', dateFiled: '2023-03-22' },
  { id: 'DOC-004', title: 'Scheduling Order', type: 'Order', caseName: 'Doe Real Estate', dateFiled: '2023-04-10' },
  { id: 'DOC-005', title: 'Client Engagement Letter', type: 'Correspondence', caseName: 'Doe Real Estate', dateFiled: '2023-02-18' },
];

const Documents = () => {
  const [documents] = useState<Document[]>(mockDocuments);

  const getBadgeClass = (type: DocumentType) => {
    const colors: { [key in DocumentType]: string } = {
      'Pleading': 'bg-sky-500/20 text-sky-300',
      'Motion': 'bg-amber-500/20 text-amber-300',
      'Discovery': 'bg-lime-500/20 text-lime-300',
      'Order': 'bg-rose-500/20 text-rose-300',
      'Correspondence': 'bg-fuchsia-500/20 text-fuchsia-300',
    };
    return colors[type] || 'bg-gray-500/20 text-gray-300';
  };

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold md:text-2xl flex items-center gap-2"><FileText /> Documents</h1>
        <button className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium h-10 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white">
          <PlusCircle className="w-4 h-4 mr-2" />
          Upload Document
        </button>
      </div>

      <div className="panel-card p-0">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="[&_tr]:border-b border-gray-700">
              <tr className="border-b border-gray-700">
                <th className="h-12 px-4 text-left font-medium text-gray-400">Title</th>
                <th className="h-12 px-4 text-left font-medium text-gray-400">Type</th>
                <th className="h-12 px-4 text-left font-medium text-gray-400 hidden md:table-cell">Case</th>
                <th className="h-12 px-4 text-left font-medium text-gray-400 hidden lg:table-cell">Date Filed</th>
                <th className="h-12 px-4 text-left font-medium text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {documents.length > 0 ? (
                documents.map((doc) => (
                  <tr key={doc.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="p-4 font-medium">{doc.title}</td>
                    <td className="p-4">
                       <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getBadgeClass(doc.type)}`}>
                        {doc.type}
                      </span>
                    </td>
                    <td className="p-4 hidden md:table-cell text-gray-300">{doc.caseName}</td>
                    <td className="p-4 hidden lg:table-cell text-gray-300">{doc.dateFiled}</td>
                    <td className="p-4">
                       <div className="flex gap-2 text-gray-400">
                         <button className="p-1 hover:text-indigo-400"><Download className="w-4 h-4" /></button>
                         <button className="p-1 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400">
                    No documents found.
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

export default Documents;