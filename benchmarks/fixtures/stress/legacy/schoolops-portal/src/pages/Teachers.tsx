import { useState } from "react";
// No Teacher type in shared types, so we define it locally.

interface Teacher {
  id: string;
  name: string;
  subject: string;
  email: string;
  status: "Active" | "On Leave";
}

const mockTeachers: Teacher[] = [
  { id: "T01", name: "David Chen", subject: "Mathematics", email: "d.chen@schoolops.edu", status: "Active" },
  { id: "T02", name: "Maria Garcia", subject: "History", email: "m.garcia@schoolops.edu", status: "Active" },
  { id: "T03", name: "John Smith", subject: "Science", email: "j.smith@schoolops.edu", status: "On Leave" },
  { id: "T04", name: "Emily White", subject: "English", email: "e.white@schoolops.edu", status: "Active" },
];

const getStatusBadgeClass = (status: Teacher["status"]) => {
  switch (status) {
    case "Active":
      return "bg-green-500/20 text-green-400";
    case "On Leave":
      return "bg-yellow-500/20 text-yellow-400";
    default:
      return "bg-gray-500/20 text-gray-400";
  }
};

export default function Teachers() {
  const [teachers] = useState<Teacher[]>(mockTeachers);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-bold tracking-tight text-white">Teachers</h1>
          <p className="mt-2 text-sm text-gray-400">
            A list of all the teachers in the school including their name, subject, and status.
          </p>
        </div>
        <div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
          <button
            type="button"
            className="block rounded-md bg-indigo-500 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-indigo-400"
          >
            Add Teacher
          </button>
        </div>
      </div>
      <div className="mt-8 flow-root">
        <div className="panel-card overflow-x-auto">
          {teachers.length > 0 ? (
            <table className="min-w-full divide-y divide-gray-700">
              <thead>
                <tr>
                  <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-white sm:pl-3">Name</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Subject</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Email</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Status</th>
                  <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-3"><span className="sr-only">Edit</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {teachers.map((teacher) => (
                  <tr key={teacher.id}>
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-white sm:pl-3">{teacher.name}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">{teacher.subject}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">{teacher.email}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${getStatusBadgeClass(teacher.status)}`}>
                        {teacher.status}
                      </span>
                    </td>
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
                <h3 className="text-lg font-semibold text-white">No Teachers Found</h3>
                <p className="mt-1 text-sm text-gray-400">Get started by adding a new teacher.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}