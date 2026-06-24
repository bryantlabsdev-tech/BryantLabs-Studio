import { useState } from "react";
import { BookOpen, Plus, Search } from "../components/IconStub";
import type { Teacher } from "../types"; // Assuming Teacher type exists

// NOTE: This type is assumed to be in src/types.ts
export interface Class {
  id: string;
  name: string;
  subject: string;
  teacher: Pick<Teacher, 'name'>;
  studentCount: number;
  schedule: string; // e.g., "MWF 10:00 - 11:30"
}

const mockClasses: Class[] = [
  { id: 'C101', name: 'Algebra II', subject: 'Mathematics', teacher: { name: 'Mr. David Chen' }, studentCount: 28, schedule: 'MWF 9:00 - 9:50' },
  { id: 'C203', name: 'World History', subject: 'Social Studies', teacher: { name: 'Ms. Emily Carter' }, studentCount: 32, schedule: 'TTh 10:30 - 11:45' },
  { id: 'C305', name: 'English Literature', subject: 'Language Arts', teacher: { name: 'Mrs. Sarah Jones' }, studentCount: 25, schedule: 'MWF 11:00 - 11:50' },
  { id: 'C410', name: 'Biology', subject: 'Science', teacher: { name: 'Mr. Robert Brown' }, studentCount: 30, schedule: 'TTh 1:00 - 2:15' },
  { id: 'C502', name: 'Introduction to Art', subject: 'Arts', teacher: { name: 'Ms. Maria Garcia' }, studentCount: 22, schedule: 'W 2:00 - 4:00' },
];

export default function Classes() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredClasses = mockClasses.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.teacher.name ?? 0).toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <BookOpen className="h-6 w-6 text-gray-400" />
          <h1 className="text-2xl font-semibold">Classes</h1>
        </div>
        <button className="flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
          <Plus className="h-4 w-4" />
          <span>New Class</span>
        </button>
      </header>

      <div className="panel-card">
        <div className="p-4 border-b border-gray-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search classes, subjects, or teachers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-md border-gray-600 bg-gray-900 pl-10 pr-4 py-2 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
        </div>
        
        {filteredClasses.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-400">
              <thead className="text-xs text-gray-400 uppercase bg-gray-800">
                <tr>
                  <th scope="col" className="px-6 py-3">Class Name</th>
                  <th scope="col" className="px-6 py-3">Subject</th>
                  <th scope="col" className="px-6 py-3">Teacher</th>
                  <th scope="col" className="px-6 py-3 text-center">Students</th>
                  <th scope="col" className="px-6 py-3">Schedule</th>
                </tr>
              </thead>
              <tbody>
                {filteredClasses.map((cls) => (
                  <tr key={cls.id} className="border-b border-gray-700 bg-gray-800/50 hover:bg-gray-700/50">
                    <td className="px-6 py-4 font-medium text-white">{cls.name}</td>
                    <td className="px-6 py-4">{cls.subject}</td>
                    <td className="px-6 py-4">{cls.teacher.name}</td>
                    <td className="px-6 py-4 text-center">{cls.studentCount}</td>
                    <td className="px-6 py-4">{cls.schedule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <BookOpen className="mx-auto h-12 w-12 text-gray-500" />
            <h3 className="mt-2 text-sm font-medium text-white">No classes found</h3>
            <p className="mt-1 text-sm text-gray-400">
              {searchTerm ? 'Try adjusting your search.' : 'Get started by creating a new class.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}