import { useState } from "react";
import { FiPlus, FiFileText, FiTag } from "../components/IconStub";

const mockNotes: Array<Record<string, unknown>> = [
  {
    id: "note-001",
    title: "Initial Client Meeting: John Doe",
    contentSnippet: "Discussed case background, key events, and potential witnesses. Client provided initial set of documents...",
    caseName: "State v. Doe",
    author: "Alice Johnson",
    createdAt: "2024-07-10",
    tags: ["client-meeting", "intake"],
  updatedAt: new Date().toISOString().slice(0, 10),
  caseId: ""},
  {
    id: "note-002",
    title: "Research on Precedent for Motion to Dismiss",
    contentSnippet: "Analyzed cases similar to Smith v. Johnson. Found three strong precedents from the 9th Circuit...",
    caseName: "Smith v. Johnson",
    author: "Bob Williams",
    createdAt: "2024-07-08",
    tags: ["research", "motion"],
  updatedAt: new Date().toISOString().slice(0, 10),
  caseId: ""},
  {
    id: "note-003",
    title: "Witness Interview: Jane Smith",
    contentSnippet: "Interviewed key witness Jane Smith. Her testimony corroborates our client's timeline...",
    caseName: "MegaCorp v. Innovate LLC",
    author: "Alice Johnson",
    createdAt: "2024-07-05",
    tags: ["witness", "interview"],
  },
];

const Notes = () => {
  const [notes] = useState<Array<Record<string, unknown>>>(mockNotes);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Case Notes</h1>
        <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500">
          <FiPlus />
          Add Note
        </button>
      </div>

      {notes.length === 0 ? (
        <div className="text-center panel-card py-20">
          <FiFileText className="mx-auto text-5xl text-gray-500" />
          <h3 className="mt-2 text-lg font-medium text-white">No notes found</h3>
          <p className="mt-1 text-sm text-gray-400">Add your first note to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => (
            <div key={note.id} className="panel-card flex flex-col justify-between p-5">
              <div>
                <p className="text-sm text-indigo-400">{note.caseName}</p>
                <h3 className="mt-1 text-lg font-semibold text-white truncate">{note.title}</h3>
                <p className="mt-2 text-sm text-gray-300 line-clamp-3">{note.contentSnippet}</p>
              </div>
              <div className="mt-4">
                {note.tags && note.tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    {note.tags.map((tag) => (
                      <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-cyan-200 bg-cyan-900/50 rounded-md">
                        <FiTag className="w-3 h-3" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>by {note.author}</span>
                  <span>{note.createdAt}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Notes;