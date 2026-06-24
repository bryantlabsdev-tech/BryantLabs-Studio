import { useState } from "react";
import type { Teacher, TeacherStatus } from "../types";

// NOTE: These types are assumed to be in src/types.ts
// export interface Teacher {
//   id:string;
//   name: string;
//   subject: string;
//   status: TeacherStatus;
//   avatarUrl: string;
// }
// export type TeacherStatus = 'active' | 'on_leave' | 'inactive';

const mockTeachers: Teacher[] = [
  { id: 'T01', name: 'Mr. David Chen', subject: 'Mathematics', status: 'active', avatarUrl: 'https://i.pravatar.cc/150?u=T01' },
  { id: 'T02', name: 'Ms. Sarah Lee', subject: 'English', status: 'active', avatarUrl: 'https://i.pravatar.cc/150?u=T02' },
  { id: 'T03', name: 'Dr. Emily Carter', subject: 'Science', status: 'on_leave', avatarUrl: 'https://i.pravatar.cc/150?u=T03' },
  { id: 'T04', name: 'Mr. Robert Green', subject: 'History', status: 'inactive', avatarUrl: 'https://i.pravatar.cc/150?u=T04' },
];

const TeacherStatusBadge = ({ status }: { status: TeacherStatus }) => {
  const baseClasses = "px-2.5 py-1 text-xs font-medium rounded-full inline-block";
  const statusClasses: Record<string, string> = {
    active: "bg-green-500/20 text-green-400",
    on_leave: "bg-yellow-500/20 text-yellow-400",
    inactive: "bg-gray-500/20 text-gray-400",
  };
  const label = status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  return <span className={`${baseClasses} ${statusClasses[status]}`}>{label}</span>;
};

const Teachers = () => {
  const [teachers] = useState<Teacher[]>(mockTeachers);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-white">Teachers</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg">
          Add Teacher
        </button>
      </div>

      <div className="panel-card">
        {teachers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400 text-sm">
                  <th className="p-4 font-medium">Name</th>
                  <th className="p-4 font-medium">Subject</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((teacher) => (
                  <tr key={teacher.id} className="border-b border-gray-800 hover:bg-gray-700/50">
                    <td className="p-4 flex items-center gap-3">
                      <img src={teacher.avatarUrl} alt={teacher.name} className="h-9 w-9 rounded-full object-cover" />
                      <span className="font-medium">{teacher.name}</span>
                    </td>
                    <td className="p-4 text-gray-300">{teacher.subject}</td>
                    <td className="p-4">
                      <TeacherStatusBadge status={teacher.status} />
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
            <h3 className="text-lg font-medium text-white">No Teachers Found</h3>
            <p className="text-gray-400 mt-2">Get started by adding a new teacher.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Teachers;