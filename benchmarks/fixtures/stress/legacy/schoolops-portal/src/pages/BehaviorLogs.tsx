import { useState } from "react";
import type { Student } from "../types";

type BehaviorStatus = "Open" | "Resolved" | "Escalated";

interface BehaviorLog {
  id: string;
  studentId: Student['id'];
  studentName: string;
  date: string;
  incident: string;
  actionTaken: string;
  reportedBy: string;
  status: BehaviorStatus;
}

const mockLogs: BehaviorLog[] = [
  { id: "BL001", studentId: "S004", studentName: "Daniel Brown", date: "2023-10-25", incident: "Disruption in class", actionTaken: "Verbal warning", reportedBy: "David Chen", status: "Resolved" },
  { id: "BL002", studentId: "S007", studentName: "Grace Davis", date: "2023-10-24", incident: "Incomplete homework", actionTaken: "After-school study", reportedBy: "John Smith", status: "Open" },
  { id: "BL003", studentId: "S002", studentName: "Bob Williams", date: "2023-10-23", incident: "Argument with a peer", actionTaken: "Mediation with counselor", reportedBy: "Maria Garcia", status: "Resolved" },
  { id: "BL004", studentId: "S010", studentName: "Kevin Wilson", date: "2023-10-22", incident: "Bullying", actionTaken: "Parent meeting scheduled", reportedBy: "Emily White", status: "Escalated" },
];

const getStatusBadge = (status: BehaviorStatus) => {
  switch (status) {
    case "Resolved":
      return "bg-green-600/70 text-green-100";
    case "Open":
      return "bg-yellow-600/70 text-yellow-100";
    case "Escalated":
      return "bg-red-600/70 text-red-100";
    default:
      return "bg-gray-600/70 text-gray-100";
  }
};

export default function BehaviorLogs() {
  const [logs] = useState<BehaviorLog[]>(mockLogs);

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Behavior Logs</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg">
          Log New Incident
        </button>
      </div>

      <div className="panel-card">
        {logs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left">
              <thead className="border-b border-gray-700 text-gray-400">
                <tr>
                  <th className="p-3">Student</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Incident</th>
                  <th className="p-3">Action Taken</th>
                  <th className="p-3">Reported By</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="p-3 font-medium">{log.studentName}</td>
                    <td className="p-3 text-gray-400">{log.date}</td>
                    <td className="p-3">{log.incident}</td>
                    <td className="p-3">{log.actionTaken}</td>
                    <td className="p-3 text-gray-400">{log.reportedBy}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(log.status)}`}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold">No Behavior Logs Found</h3>
            <p className="text-gray-400 mt-2">Click "Log New Incident" to add the first record.</p>
          </div>
        )}
      </div>
    </main>
  );
}