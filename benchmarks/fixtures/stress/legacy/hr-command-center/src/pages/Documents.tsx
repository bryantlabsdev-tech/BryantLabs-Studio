import { useState } from "react";
import type { Document } from '../types';

const mockDocuments: Document[] = [
  { id: 'doc-1', name: 'Employee Handbook 2023', type: 'Handbook', uploadDate: '2023-01-15', fileSize: '2.5 MB',
  url: ""},
  { id: 'doc-2', name: 'Remote Work Policy', type: 'Policy', uploadDate: '2023-05-20', fileSize: '512 KB',
  url: "",
},

  { id: 'doc-3', name: 'Health Insurance Plan Details', type: 'Handbook', uploadDate: '2023-09-01', fileSize: '1.2 MB',
  url: "",
},

  { id: 'doc-4', name: 'Standard Employment Contract', type: 'Contract', uploadDate: '2022-11-10', fileSize: '780 KB',
  url: "",
},

];

export default function Documents() {
  const [documents] = useState<Document[]>(mockDocuments);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredDocuments = documents.filter(doc =>
    doc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">
        <h2 className="text-2xl font-semibold text-white">Documents</h2>
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Search documents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-64 px-3 py-2 text-sm text-gray-100 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button className="flex-shrink-0 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900">
            Upload
          </button>
        </div>
      </div>

      <div className="panel-card bg-gray-800 p-4 rounded-lg">
        {filteredDocuments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left text-gray-300">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                <tr>
                  <th scope="col" className="px-6 py-3">Document Name</th>
                  <th scope="col" className="px-6 py-3">Type</th>
                  <th scope="col" className="px-6 py-3">Upload Date</th>
                  <th scope="col" className="px-6 py-3">File Size</th>
                  <th scope="col" className="px-6 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredDocuments.map((doc) => (
                  <tr key={doc.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="px-6 py-4 font-medium text-white">{doc.name}</td>
                    <td className="px-6 py-4">{doc.type}</td>
                    <td className="px-6 py-4">{doc.uploadDate}</td>
                    <td className="px-6 py-4">{doc.fileSize}</td>
                    <td className="px-6 py-4 text-right">
                      <a href="#" className="font-medium text-indigo-500 hover:underline">Download</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold text-gray-300">No Documents Found</h3>
            <p className="mt-1 text-sm text-gray-500">Upload a new document to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}