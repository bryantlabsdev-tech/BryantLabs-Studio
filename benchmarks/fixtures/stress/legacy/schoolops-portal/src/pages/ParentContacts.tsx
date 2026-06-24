import { useState } from "react";
import type { Student } from "../types";

type ContactStatus = "Completed" | "Follow-up Required";
type ContactMethod = "Phone" | "Email" | "In-Person";

interface ParentContactLog {
  id: string;
  studentId: Student['id'];
  studentName: string;
  parentName: string;
  contactDate: string;
  contactMethod: ContactMethod;
  reason: string;
  status: ContactStatus;
}

const mockContacts: ParentContactLog[] = [
  { id: "PC01", studentId: "S001", studentName: "Alice Johnson", parentName: "Sarah Johnson", contactDate: "2023-10-25", contactMethod: "Email", reason: "Positive academic progress", status: "Completed" },
  { id: "PC02", studentId: "S002", studentName: "Bob Williams", parentName: "Mike Williams", contactDate: "2023-10-24", contactMethod: "Phone", reason: "Attendance concern", status: "Follow-up Required" },
  { id: "PC03", studentId: "S005", studentName: "Eve Davis", parentName: "Laura Davis", contactDate: "2023-10-22", contactMethod: "In-Person", reason: "Behavioral issue discussion", status: "Completed" },
];

const getStatusBadge = (status: ContactStatus) => {
  switch (status) {
    case "Completed":
      return "bg-green-600/70 text-green-100";
    case "Follow-up Required":
      return "bg-blue-600/70 text-blue-100";
    default:
      return "bg-gray-600/70 text-gray-100";
  }
};

export default function ParentContacts() {
  const [contacts] = useState<ParentContactLog[]>(mockContacts);

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Parent Contacts</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg">
          Log New Contact
        </button>
      </div>

      <div className="panel-card">
        {contacts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left">
              <thead className="border-b border-gray-700 text-gray-400">
                <tr>
                  <th className="p-3">Student</th>
                  <th className="p-3">Parent</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Method</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="p-3 font-medium">{contact.studentName}</td>
                    <td className="p-3 text-gray-300">{contact.parentName}</td>
                    <td className="p-3 text-gray-400">{contact.contactDate}</td>
                    <td className="p-3 text-gray-400">{contact.contactMethod}</td>
                    <td className="p-3">{contact.reason}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(contact.status)}`}>
                        {contact.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold">No Parent Contacts Logged</h3>
            <p className="text-gray-400 mt-2">Click "Log New Contact" to add the first record.</p>
          </div>
        )}
      </div>
    </main>
  );
}