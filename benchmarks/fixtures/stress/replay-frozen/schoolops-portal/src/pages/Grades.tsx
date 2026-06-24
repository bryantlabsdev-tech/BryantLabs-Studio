import { useState } from "react";
import { GraduationCap, Filter } from "../components/IconStub";

// NOTE: This type is assumed to be in src/types.ts
export interface GradeRecord {
  id: string;
  studentName: string;
  className: string;
  subject: string;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  score: number;
}

const mockGrades: GradeRecord[] = [
  { id: 'GRD01', studentName: 'Alice Johnson', className: 'Algebra II', subject: 'Mathematics', grade: 'A', score: 94 },
  { id: 'GRD02', studentName: 'Bob Williams', className: 'Algebra II', subject: 'Mathematics', grade: 'C', score: 75 },
  { id: 'GRD03', studentName: 'Charlie Brown', className: 'World History', subject: 'Social Studies', grade: 'B', score: 88 },
  { id: 'GRD04', studentName: 'Diana Miller', className: 'World History', subject: 'Social Studies', grade: 'A', score: 91 },
  { id: 'GRD05', studentName: 'Ethan Davis', className: 'Biology', subject: 'Science', grade: 'B', score: 82 },
  { id: 'GRD06', studentName: 'Fiona Garcia', className: 'English Literature', subject: 'Language Arts', grade: 'A', score: 98 },
  { id: 'GRD07', studentName: 'George Harris', className: 'Biology', subject: 'Science', grade: 'D', score: 65 },
];

const getGradeColor = (grade: GradeRecord['grade']) => {
  switch (grade) {
    case 'A': return 'text-green-400';
    case 'B': return 'text-blue-400';
    case 'C': return 'text-yellow-400';
    case 'D': return 'text-orange-400';
    case 'F': return 'text-red-400';
    default: return 'text-gray-400';
  }
};

export default function Grades() {
  const [classFilter, setClassFilter] = useState('All');
  const uniqueClasses = ['All', ...new Set(mockGrades.map(g => g.className))];

  const filteredGrades = mockGrades.filter(grade =>
    classFilter === 'All' || grade.className === classFilter
  );

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <GraduationCap className="h-6 w-6 text-gray-400" />
          <h1 className="text-2xl font-semibold">Grades</h1>
        </div>
      </header>

      <div className="panel-card">
        <div className="p-4 border-b border-gray-700 flex items-center gap-4">
            <Filter className="h-5 w-5 text-gray-400" />
            <label htmlFor="class-filter" className="text-sm font-medium">Filter by Class:</label>
            <select
                id="class-filter"
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="rounded-md border-gray-600 bg-gray-900 pl-3 pr-8 py-1.5 focus:border-indigo-500 focus:ring-indigo-500"
            >
                {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
        </div>

        {filteredGrades.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-400">
              <thead className="text-xs text-gray-400 uppercase bg-gray-800">
                <tr>
                  <th scope="col" className="px-6 py-3">Student</th>
                  <th scope="col" className="px-6 py-3">Class</th>
                  <th scope="col" className="px-6 py-3 text-center">Grade</th>
                  <th scope="col" className="px-6 py-3 text-center">Score (%)</th>
                </tr>
              </thead>
              <tbody>
                {filteredGrades.map((grade) => (
                  <tr key={grade.id} className="border-b border-gray-700 bg-gray-800/50 hover:bg-gray-700/50">
                    <td className="px-6 py-4 font-medium text-white">{grade.studentName}</td>
                    <td className="px-6 py-4">{grade.className}</td>
                    <td className={`px-6 py-4 text-center font-bold ${getGradeColor(grade.grade)}`}>{grade.grade}</td>
                    <td className="px-6 py-4 text-center">{grade.score.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <GraduationCap className="mx-auto h-12 w-12 text-gray-500" />
            <h3 className="mt-2 text-sm font-medium text-white">No grades found</h3>
            <p className="mt-1 text-sm text-gray-400">
              No grades match the selected filter.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}