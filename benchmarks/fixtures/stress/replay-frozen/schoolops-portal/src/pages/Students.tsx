import { useState } from "react";
import type { Student, StudentStatus } from "../types";

// NOTE: These types are assumed to be in src/types.ts
// export interface Student {
//   id: string;
//   name: string;
//   grade: number;
//   status: StudentStatus;
//   avatarUrl: string;
// }
// export type StudentStatus = 'active' | 'inactive' | 'graduated';

const mockStudents: Student[] = [
  { id: 'S001', name: 'Alice Johnson', grade: 10, status: 'active', avatarUrl: 'https://i.pravatar.cc/150?u=S001' },
  { id: 'S002', name: 'Bob Williams', grade: 11, status: 'active', avatarUrl: 'https://i.pravatar.cc/150?u=S002' },
  { id: 'S003', name: 'Charlie Brown', grade: 12, status: 'graduated', avatarUrl: 'https://i.pravatar.cc/150?u=S003' },
  { id: 'S004', name: 'Diana Miller', grade: 9, status: 'inactive', avatarUrl: 'https://i.pravatar.cc/150?u=S004' },
  { id: 'S005', name: 'Ethan Davis', grade: 10, status: 'active', avatarUrl: 'https://i.pravatar.cc/150?u=S005' },
];

const StudentStatusBadge = ({ status }: { status: StudentStatus }) => {
  const baseClasses = "px-2.5 py-1 text-xs font-medium rounded-full inline-block";
  const statusClasses: Record<string, string> = {
    active: "bg-green-500/20 text-green-400",
    inactive: "bg-gray-500/20 text-gray-400",
    graduated: "bg-blue-500/20 text-blue-400",
  };
  return <span className={`${baseClasses} ${statusClasses[status]}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
};

const Students = () => {
  const [students] = useState<Student[]>(mockStudents);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-white">Students</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg">
          Add Student
        </button>
      </div>

      <div className="panel-card">
        {students.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400 text-sm">
                  <th className="p-4 font-medium">Name</th>
                  <th className="p-4 font-medium">Grade</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id} className="border-b border-gray-800 hover:bg-gray-700/50">
                    <td className="p-4 flex items-center gap-3">
                      <img src={student.avatarUrl} alt={student.name} className="h-9 w-9 rounded-full object-cover" />
                      <span className="font-medium">{student.name}</span>
                    </td>
                    <td className="p-4 text-gray-300">{student.grade}</td>
                    <td className="p-4">
                      <StudentStatusBadge status={student.status} />
                    </td>
                    <td className="p-4 text-right">
                      <button className="text-indigo-400 hover:text-indigo-300 font-medium">Details</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16">
            <h3 className="text-lg font-medium text-white">No Students Found</h3>
            <p className="text-gray-400 mt-2">Get started by adding a new student.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Students;