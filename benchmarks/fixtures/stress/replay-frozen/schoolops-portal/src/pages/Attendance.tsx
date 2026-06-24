import { useState } from "react";
import type { AttendanceStatus } from "../types";
import { Calendar, Filter } from "../components/IconStub";

// NOTE: This type is assumed to be in src/types.ts
export interface AttendanceRecord {
  id: string;
  studentName: string;
  date: string;
  status: AttendanceStatus;
  className: string;
}

const mockAttendance: AttendanceRecord[] = [
  { id: 'ATT001', studentName: 'Alice Johnson', date: '2023-10-26', status: 'present', className: 'Algebra II' },
  { id: 'ATT002', studentName: 'Bob Williams', date: '2023-10-26', status: 'absent', className: 'Algebra II' },
  { id: 'ATT003', studentName: 'Charlie Brown', date: '2023-10-26', status: 'tardy', className: 'World History' },
  { id: 'ATT004', studentName: 'Diana Miller', date: '2023-10-26', status: 'present', className: 'World History' },
  { id: 'ATT005', studentName: 'Ethan Davis', date: '2023-10-26', status: 'excused', className: 'Biology' },
  { id: 'ATT006', studentName: 'Fiona Garcia', date: '2023-10-25', status: 'present', className: 'English Literature' },
  { id: 'ATT007', studentName: 'George Harris', date: '2023-10-25', status: 'absent', className: 'Biology' },
];

const getStatusBadge = (status: AttendanceStatus) => {
  const baseClasses = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium";
  switch (status) {
    case 'present': return `${baseClasses} bg-green-900 text-green-300`;
    case 'absent': return `${baseClasses} bg-red-900 text-red-300`;
    case 'tardy': return `${baseClasses} bg-yellow-900 text-yellow-300`;
    case 'excused': return `${baseClasses} bg-blue-900 text-blue-300`;
    default: return `${baseClasses} bg-gray-700 text-gray-300`;
  }
};

export default function Attendance() {
  const [dateFilter, setDateFilter] = useState('2023-10-26');

  const filteredRecords = mockAttendance.filter(record => record.date === dateFilter);

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Calendar className="h-6 w-6 text-gray-400" />
          <h1 className="text-2xl font-semibold">Attendance</h1>
        </div>
      </header>
      
      <div className="panel-card">
        <div className="p-4 border-b border-gray-700 flex items-center gap-4">
            <Filter className="h-5 w-5 text-gray-400" />
            <label htmlFor="date-filter" className="text-sm font-medium">Date:</label>
            <input
              id="date-filter"
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="rounded-md border-gray-600 bg-gray-900 px-3 py-1.5 focus:border-indigo-500 focus:ring-indigo-500"
            />
        </div>
        
        {filteredRecords.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-400">
              <thead className="text-xs text-gray-400 uppercase bg-gray-800">
                <tr>
                  <th scope="col" className="px-6 py-3">Student</th>
                  <th scope="col" className="px-6 py-3">Class</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => (
                  <tr key={record.id} className="border-b border-gray-700 bg-gray-800/50 hover:bg-gray-700/50">
                    <td className="px-6 py-4 font-medium text-white">{record.studentName}</td>
                    <td className="px-6 py-4">{record.className}</td>
                    <td className="px-6 py-4">
                      <span className={getStatusBadge(record.status)}>
                        {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <Calendar className="mx-auto h-12 w-12 text-gray-500" />
            <h3 className="mt-2 text-sm font-medium text-white">No attendance records found</h3>
            <p className="mt-1 text-sm text-gray-400">
              No records match the selected date.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}