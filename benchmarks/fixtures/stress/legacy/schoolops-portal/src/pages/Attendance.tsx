import { useState } from "react";
import type { AttendanceStatus } from "../types";

interface AttendanceRecord {
  id: string;
  studentName: string;
  date: string;
  status: AttendanceStatus;
  notes?: string;
}

const mockAttendance: AttendanceRecord[] = [
  { id: "A001", studentName: "Alice Johnson", date: "2023-10-26", status: "Present" },
  { id: "A002", studentName: "Bob Williams", date: "2023-10-26", status: "Absent", notes: "Family emergency" },
  { id: "A003", studentName: "Charlie Brown", date: "2023-10-26", status: "Tardy", notes: "Arrived at 9:15 AM" },
  { id: "A004", studentName: "Diana Prince", date: "2023-10-26", status: "Excused", notes: "Doctor's appointment" },
  { id: "A005", studentName: "Ethan Hunt", date: "2023-10-25", status: "Present" },
];

const statusColors: Record<AttendanceStatus, string> = {
  Present: "bg-green-600/80 text-green-100",
  Absent: "bg-red-600/80 text-red-100",
  Tardy: "bg-yellow-600/80 text-yellow-100",
  Excused: "bg-blue-600/80 text-blue-100",
};

const AttendanceStatusBadge = ({ status }: { status: AttendanceStatus }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[status]}`}>
    {status}
  </span>
);

export default function Attendance() {
  const [records, _setRecords] = useState<AttendanceRecord[]>(mockAttendance);
  // In a real app, you'd have more complex filtering state
  const displayedRecords = records;

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Attendance</h1>
        <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500">
          Take Attendance
        </button>
      </div>

      <div className="panel-card mt-6">
        {/* Filtering UI would go here */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-800">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300">Student</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300">Date</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300">Status</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700 bg-gray-900">
              {displayedRecords.length > 0 ? (
                displayedRecords.map((record) => (
                  <tr key={record.id}>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-white">{record.studentName}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">{record.date}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300"><AttendanceStatusBadge status={record.status} /></td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-400">{record.notes || '—'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-gray-400">
                    No attendance records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}