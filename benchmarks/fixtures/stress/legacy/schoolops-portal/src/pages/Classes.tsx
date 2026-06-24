import { useState } from "react";

// Local type for this page's data
interface ClassInfo {
  id: string;
  name: string;
  subject: string;
  teacherName: string;
  studentCount: number;
}

const mockClasses: ClassInfo[] = [
  { id: "C101", name: "Algebra II", subject: "Mathematics", teacherName: "David Chen", studentCount: 28 },
  { id: "C203", name: "World History", subject: "History", teacherName: "Maria Garcia", studentCount: 32 },
  { id: "C305", name: "English Literature", subject: "English", teacherName: "Sarah Jenkins", studentCount: 25 },
  { id: "C410", name: "Biology", subject: "Science", teacherName: "Brian Miller", studentCount: 30 },
  { id: "C501", name: "Introduction to CS", subject: "Technology", teacherName: "David Chen", studentCount: 22 },
];

export default function Classes() {
  const [searchTerm, setSearchTerm] = useState("");
  const [classes, _setClasses] = useState<ClassInfo[]>(mockClasses);

  const filteredClasses = classes.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.teacherName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Classes</h1>
        <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500">
          Add New Class
        </button>
      </div>

      <div className="panel-card mt-6">
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by name, subject, or teacher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-sm rounded-md border-gray-600 bg-gray-700 px-3 py-2 text-white placeholder-gray-400 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-800">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300">Class Name</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300">Subject</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300">Teacher</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300">Students</th>
                <th scope="col" className="relative px-6 py-3"><span className="sr-only">Edit</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700 bg-gray-900">
              {filteredClasses.length > 0 ? (
                filteredClasses.map((classInfo) => (
                  <tr key={classInfo.id}>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-white">{classInfo.name}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">{classInfo.subject}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">{classInfo.teacherName}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">{classInfo.studentCount}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                      <a href="#" className="text-blue-400 hover:text-blue-300">Edit</a>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400">
                    No classes found.
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