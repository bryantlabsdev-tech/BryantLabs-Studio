import { useState } from "react";
import type { DocumentType as DocType } from "../types"; // Renaming to avoid conflict
import { FiFile, FiPlus, FiFilter } from "../components/IconStub";
// Assuming a more complete Document type from a full types.ts
type DocumentStatus = "Draft" | "Filed" | "Executed" | "Under Review";

type Document = {
  id: string;
  name: string;
  type: DocType;
  caseName: string;
  status: DocumentStatus;
  uploadedAt: string;
};

const mockDocuments: Document[] = [
  { id: "doc-001", name: "Motion to Compel Discovery", type: "Motion", caseName: "Smith v. Johnson", status: "Filed", uploadedAt: "2023-11-10" },
  { id: "doc-002", name: "Plaintiff's First Set of Interrogatories", type: "Discovery", caseName: "Smith v. Johnson", status: "Executed", uploadedAt: "2023-11-05" },
  { id: "doc-003", name: "Initial Complaint", type: "Pleading", caseName: "Acme Corp v. Stark Inc.", status: "Filed", uploadedAt: "2023-10-20" },
  { id: "doc-004", name: "Draft Settlement Agreement", type: "Agreement", caseName: "Acme Corp v. Stark Inc.", status: "Draft", uploadedAt: "2023-11-15" },
  { id: "doc-005", name: "Exhibit List for Hearing", type: "Exhibit", caseName: "Smith v. Johnson", status: "Under Review", uploadedAt: "2023-11-18" },
];

const statusColors: Record<DocumentStatus, string> = {
  "Draft": "bg-gray-500 text-gray-100",
  "Filed": "bg-blue-600 text-blue-100",
  "Executed": "bg-green-600 text-green-100",
  "Under Review": "bg-yellow-600 text-yellow-100",
};

const Documents = () => {
  const [documents, _setDocuments] = useState<Document[]>(mockDocuments);

  return (
    <main className="p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-100">Documents</h1>
        <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-md transition-colors duration-200">
                <FiFilter className="h-4 w-4"/>
                <span>Filter</span>
            </button>
            <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-md transition-colors duration-200">
                <FiPlus />
                <span>Upload Document</span>
            </button>
        </div>
      </div>
      
      <div className="panel-card overflow-x-auto">
        {documents.length === 0 ? (
           <div className="text-center py-12">
            <FiFile className="mx-auto h-12 w-12 text-gray-500" />
            <h3 className="mt-2 text-lg font-medium text-gray-200">No Documents Found</h3>
            <p className="mt-1 text-sm text-gray-400">Upload your first document to get started.</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="border-b border-gray-700 text-sm text-gray-400">
              <tr>
                <th className="p-4">Name</th>
                <th className="p-4">Case</th>
                <th className="p-4">Type</th>
                <th className="p-4">Status</th>
                <th className="p-4">Uploaded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="p-4 font-medium text-gray-100">{doc.name}</td>
                  <td className="p-4 text-gray-300">{doc.caseName}</td>
                  <td className="p-4 text-gray-300">{doc.type}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColors[doc.status]}`}>
                      {doc.status}
                    </span>
                  </td>
                  <td className="p-4 text-gray-300">{doc.uploadedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
};

export default Documents;