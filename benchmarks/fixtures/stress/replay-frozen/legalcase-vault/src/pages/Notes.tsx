import { useState } from "react";
import { PenSquare, PlusCircle, Search } from "../components/IconStub";
import type { Note } from "../types";

const mockNotes: Note[] = [
  {
    id: "N-001",
    title: "Client Intake Interview Notes",
    snippet: "John Smith detailed the timeline of events leading up to the incident with Acme Corp. Key points include...",
    caseName: "Smith v. Acme Corp",
    author: "Alice Johnson",
    createdAt: "2024-07-20",
  caseId: "",
  content: "",
  dateCreated: new Date().toISOString().slice(0, 10),
},
  {
    id: "N-002",
    title: "Deposition Strategy for Dr. Evans",
    snippet: "Outline questions for expert witness Dr. Evans. Focus on the methodology used in her analysis of the...",
    caseName: "State v. Johnson",
    author: "Bob Williams",
    createdAt: "2024-07-18",
  caseId: "",
  content: "",
  dateCreated: new Date().toISOString().slice(0, 10),
},
  {
    id: "N-003",
    title: "Real Estate Closing Checklist",
    snippet: "Final checks before closing on the Doe property. Confirmed title is clear, financing is in place, and all...",
    caseName: "Doe Real Estate",
    author: "Alice Johnson",
    createdAt: "2024-07-15",
  caseId: "",
  content: "",
  dateCreated: new Date().toISOString().slice(0, 10),
},
];

const Notes = () => {
  const [notes] = useState<Note[]>(mockNotes);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold md:text-2xl flex items-center gap-2">
          <PenSquare className="w-6 h-6" />
          Notes
        </h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="search"
              placeholder="Search notes..."
              className="pl-8 pr-2 py-2 text-sm bg-gray-950 border border-gray-800 rounded-lg"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            <PlusCircle className="h-4 w-4" />
            <span>Add Note</span>
          </button>
        </div>
      </div>

      {notes.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => (
            <div key={note.id} className="panel-card flex flex-col justify-between">
              <div>
                <h3 className="font-semibold text-lg mb-1">{note.title}</h3>
                <p className="text-sm text-gray-400 mb-4 line-clamp-3">{note.snippet}</p>
              </div>
              <div className="text-xs text-gray-500 border-t border-gray-800 pt-3 mt-3">
                <div className="flex justify-between items-center">
                  <span>Case: <span className="font-medium text-gray-300">{note.caseName}</span></span>
                  <span>{note.createdAt}</span>
                </div>
                <div className="mt-1">
                  <span>Author: <span className="font-medium text-gray-300">{note.author}</span></span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center panel-card py-16 px-8">
            <PenSquare className="mx-auto h-12 w-12 text-gray-500" />
            <h3 className="mt-2 text-lg font-semibold">No Notes Found</h3>
            <p className="mt-1 text-sm text-gray-400">Create your first note to get started.</p>
            <button className="mt-6 flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 mx-auto">
              <PlusCircle className="h-4 w-4" />
              <span>Add Note</span>
            </button>
          </div>
        </div>
      )}
    </main>
  );
};

export default Notes;