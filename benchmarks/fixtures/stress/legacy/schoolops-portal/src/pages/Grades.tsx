import { useState } from "react";
import type { GradeLetter } from "../types";

interface GradeRecord {
  id: string;
  studentName: string;
  className: string;
  assignment: string;
  grade: GradeLetter;
  date: string;
}

const mockGrades: GradeRecord[] = [
  { id: "G001", studentName: "Alice Johnson", className: "Algebra II", assignment: "Midterm Exam", grade: "A", date: "2023-10-20" },
  { id: "G002", studentName: "Bob Williams", className: "World History", assignment: "Essay on Rome", grade: "B", date: "2023-10-18" },
  { id: "G003", studentName: "Charlie Brown", className: "English Literature", assignment: "Poetry Analysis", grade: "C", date: "2023-10-22" },
  { id: "G004", studentName: "Alice Johnson", className: "Biology", assignment: "Lab Report", grade: "A", date: "2023-10-24" },
  { id: "G005", studentName: "Diana Prince", className: "Algebra II", assignment: "Homework 5", grade: "F", date: "2023-10-25" },
];

const gradeColors: Record<GradeLetter, string> = {
  A: "bg-green-600/80 text-green-100",
  B: "bg-green-600/60 text-green-200",
  C: "bg-yellow-600/80 text-yellow-100",
  D: "bg-orange-600/80 text-orange-100",
  F: "bg-red-600/80 text-red-100",
};

const GradeBadge = ({ grade }: { grade: GradeLetter }) => (
  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${gradeColors[grade]}`}>
    {grade}
  </span>
);

export default function Grades() {
  const [grades, _setGrades] = useState<GradeRecord[]>(mockGrades);
  const displayedGrades = grades;

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Grades</h1>
        <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500">
          Enter Grades
        </button>
      </div>

      <div className="panel-card mt-6">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-800">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300">Student</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300">Class</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300">Assignment</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300">Date</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300">Grade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700 bg-gray-900">
              {displayedGrades.length > 0 ? (
                displayedGrades.map((record) => (
                  <tr key={record.id}>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-white">{record.studentName}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">{record.className}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">{record.assignment}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">{record.date}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300"><GradeBadge grade={record.grade} /></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400">
                    No grades found.
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