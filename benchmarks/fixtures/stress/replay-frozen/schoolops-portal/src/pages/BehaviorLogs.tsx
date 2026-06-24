import { useState } from "react";
import { Megaphone, Search, Filter } from "../components/IconStub";
import type { BehaviorLog, BehaviorIncidentType } from "../types";

const mockBehaviorLogs: BehaviorLog[] = [
  { id: 'BL001', studentName: 'Charlie Brown', date: '2023-10-25', incidentType: 'Positive', description: 'Helped a new student find their class.', reportedBy: 'Ms. Davis',
  studentId: "",
  reportedByTeacherId: "",
  incidentDescription: "",
  actionTaken: ""},
  { id: 'BL002', studentName: 'Lucy van Pelt', date: '2023-10-24', incidentType: 'Negative', description: 'Disruptive during library time.', reportedBy: 'Mr. Smith',
  studentId: "",
  reportedByTeacherId: "",
  incidentDescription: "",
  actionTaken: ""},
  { id: 'BL003', studentName: 'Linus van Pelt', date: '2023-10-23', incidentType: 'Neutral', description: 'Forgot homework assignment.', reportedBy: 'Ms. Davis',
  studentId: "",
  reportedByTeacherId: "",
  incidentDescription: "",
  actionTaken: ""},
  { id: 'BL004', studentName: 'Sally Brown', date: '2023-10-22', incidentType: 'Positive', description: 'Excellent participation in class discussion.', reportedBy: 'Mr. Chen',
  studentId: "",
  reportedByTeacherId: "",
  incidentDescription: "",
  actionTaken: ""},
  { id: 'BL005', studentName: 'Peppermint Patty', date: '2023-10-21', incidentType: 'Negative', description: 'Skipped last period.', reportedBy: 'Principal Office',
  studentId: "",
  reportedByTeacherId: "",
  incidentDescription: "",
  actionTaken: ""},
];

const getStatusBadge = (status: BehaviorIncidentType) => {
  switch (status) {
    case 'Positive':
      return 'bg-green-600/20 text-green-400';
    case 'Negative':
      return 'bg-red-600/20 text-red-400';
    case 'Neutral':
      return 'bg-gray-600/20 text-gray-400';
    default:
      return 'bg-gray-700 text-gray-300';
  }
};

export default function BehaviorLogs() {
  const [logs] = useState<BehaviorLog[]>(mockBehaviorLogs);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredLogs = logs.filter(log =>
    (log.studentName ?? 0).toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.description ?? 0).toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.reportedBy ?? 0).toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold flex items-center">
          <Megaphone className="w-8 h-8 mr-3" />
          Behavior Logs
        </h1>
      </div>
      
      <div className="panel-card">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-gray-900 border border-gray-700 rounded-md pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 border border-gray-600 rounded-md hover:bg-gray-700">
            <Filter className="w-5 h-5" />
            <span>Filter</span>
          </button>
        </div>

        {filteredLogs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-700 text-sm text-gray-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Reported By</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="px-4 py-3">{log.studentName}</td>
                    <td className="px-4 py-3">{log.date}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(log.incidentType)}`}>
                        {log.incidentType}
                      </span>
                    </td>
                    <td className="px-4 py-3">{log.description}</td>
                    <td className="px-4 py-3">{log.reportedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <Megaphone className="w-12 h-12 mx-auto mb-4" />
            <h3 className="text-xl font-semibold">No Behavior Logs Found</h3>
            <p className="mt-2">There are no behavior logs matching your search.</p>
          </div>
        )}
      </div>
    </div>
  );
}