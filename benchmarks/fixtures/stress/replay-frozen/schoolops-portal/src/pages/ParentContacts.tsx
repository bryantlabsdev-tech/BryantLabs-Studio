import { useState } from "react";
import { Phone, Search, UserPlus } from "../components/IconStub";
import type { ParentContact } from "../types";

const mockParentContacts: ParentContact[] = [
  { id: 'PC001', studentId: 'S001', studentName: 'Alice Johnson', parentName: 'Sarah Johnson', relationship: 'Mother', phone: '555-0101', email: 's.johnson@example.com', isPrimary: true,
  contactedByTeacherId: "",
  contactType: "General",
  date: new Date().toISOString().slice(0, 10)},
  { id: 'PC002', studentId: 'S002', studentName: 'Ben Carter', parentName: 'David Carter', relationship: 'Father', phone: '555-0102', email: 'd.carter@example.com', isPrimary: true,
  contactedByTeacherId: "",
  contactType: "General",
  date: new Date().toISOString().slice(0, 10)},
  { id: 'PC003', studentId: 'S003', studentName: 'Charlie Brown', parentName: 'Harold Brown', relationship: 'Father', phone: '555-0103', email: 'h.brown@example.com', isPrimary: true,
  contactedByTeacherId: "",
  contactType: "General",
  date: new Date().toISOString().slice(0, 10)},
  { id: 'PC004', studentId: 'S003', studentName: 'Charlie Brown', parentName: 'Silvia Brown', relationship: 'Mother', phone: '555-0104', email: 's.brown@example.com', isPrimary: false,
  contactedByTeacherId: "",
  contactType: "General",
  date: new Date().toISOString().slice(0, 10)},
  { id: 'PC005', studentId: 'S004', studentName: 'Diana Prince', parentName: 'Hippolyta Prince', relationship: 'Guardian', phone: '555-0105', email: 'h.prince@example.com', isPrimary: true,
  contactedByTeacherId: "",
  contactType: "General",
  date: new Date().toISOString().slice(0, 10)},
];

export default function ParentContacts() {
  const [contacts] = useState<ParentContact[]>(mockParentContacts);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredContacts = contacts.filter(contact =>
    (contact.studentName ?? 0).toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.parentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (contact.email ?? 0).toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold flex items-center">
          <Phone className="w-8 h-8 mr-3" />
          Parent Contacts
        </h1>
        <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 rounded-md hover:bg-indigo-500">
          <UserPlus className="w-5 h-5" />
          <span>Add Contact</span>
        </button>
      </div>

      <div className="panel-card">
        <div className="p-4 border-b border-gray-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by student, parent, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-gray-900 border border-gray-700 rounded-md w-full md:w-1/3 pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {filteredContacts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-700 text-sm text-gray-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Parent/Guardian</th>
                  <th className="px-4 py-3 font-medium">Relationship</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium text-center">Primary</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((contact) => (
                  <tr key={contact.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="px-4 py-3">{contact.studentName}</td>
                    <td className="px-4 py-3">{contact.parentName}</td>
                    <td className="px-4 py-3">{contact.relationship}</td>
                    <td className="px-4 py-3">{contact.phone}</td>
                    <td className="px-4 py-3">{contact.email}</td>
                    <td className="px-4 py-3 text-center">
                      {contact.isPrimary && (
                        <span className="inline-block px-2 py-1 text-xs font-semibold rounded-full bg-blue-600/30 text-blue-300">
                          Yes
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <Phone className="w-12 h-12 mx-auto mb-4" />
            <h3 className="text-xl font-semibold">No Contacts Found</h3>
            <p className="mt-2">There are no parent contacts matching your search.</p>
          </div>
        )}
      </div>
    </div>
  );
}