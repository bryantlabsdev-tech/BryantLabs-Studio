import { useState } from "react";
import type { Student } from "../types";

// Expanding on the base Student type for this page's context
interface StudentProfile extends Student {
  name: string;
  gradeLevel: number;
  enrollmentStatus: "Active" | "Withdrawn" | "Graduated";
  gpa: number;
}

const mockStudents: StudentProfile[] = [
  { id: "S001", name: "Alice Johnson", gradeLevel: 10, enrollmentStatus: "Active", gpa: 3.8,
  firstName: "",
  lastName: "",
  dateOfBirth: new Date().toISOString().slice(0, 10),
  enrollmentDate: new Date().toISOString().slice(0, 10),
  emergencyContact: "",
},
  { id: "S002", name: "Bob Williams", gradeLevel: 12, enrollmentStatus: "Active", gpa: 3.2,
  firstName: "",
  lastName: "",
  dateOfBirth: new Date().toISOString().slice(0, 10),
  enrollmentDate: new Date().toISOString().slice(0, 10),
  emergencyContact: "",
},
  { id: "S003", name: "Charlie Brown", gradeLevel: 9, enrollmentStatus: "Withdrawn", gpa: 2.5 },
  { id: "S004", name: "Diana Miller", gradeLevel: 11, enrollmentStatus: "Active", gpa: 4.0 },
  { id: "S005", name: "Ethan Davis", gradeLevel: 12, enrollmentStatus: "Graduated", gpa: 3.6 },
];

const getStatusBadgeClass = (status: StudentProfile["enrollmentStatus"]) => {
  switch (status) {
    case "Active":
      return "bg-green-500/20 text-green-400";
    case "Withdrawn":
      return "bg-yellow-500/20 text-yellow-400";
    case "Graduated":
      return "bg-blue-500/20 text-blue-400";
    default:
      return "bg-gray-500/20 text-gray-400";
  }
};

export default function Students() {
  const [students] = useState<StudentProfile[]>(mockStudents);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-bold tracking-tight text-white">Students</h1>
          <p className="mt-2 text-sm text-gray-400">
            A list of all the students in the school including their name, grade, status, and GPA.
          </p>
        </div>
        <div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
          <button
            type="button"
            className="block rounded-md bg-indigo-500 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-indigo-400"
          >
            Add Student
          </button>
        </div>
      </div>
      <div className="mt-8 flow-root">
        <div className="panel-card overflow-x-auto">
          {students.length > 0 ? (
            <table className="min-w-full divide-y divide-gray-700">
              <thead>
                <tr>
                  <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-white sm:pl-3">Name</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Grade</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Status</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">GPA</th>
                  <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-3"><span className="sr-only">Edit</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {students.map((student) => (
                  <tr key={student.id}>
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-white sm:pl-3">{student.name}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">{student.gradeLevel}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${getStatusBadgeClass(student.enrollmentStatus)}`}>
                        {student.enrollmentStatus}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">{student.gpa.toFixed(1)}</td>
                    <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-3">
                      <a href="#" className="text-indigo-400 hover:text-indigo-300">Edit</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <h3 className="text-lg font-semibold text-white">No Students Found</h3>
                <p className="mt-1 text-sm text-gray-400">Get started by adding a new student.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}