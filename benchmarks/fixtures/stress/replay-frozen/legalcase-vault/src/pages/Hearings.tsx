import { useState } from "react";
import { Gavel, PlusCircle, Search, MoreHorizontal } from "../components/IconStub";
import type { Hearing, HearingStatus } from "../types";

const mockHearings: Hearing[] = [
  {
    id: "H-001",
    caseName: "Smith v. Acme Corp",
    date: "2024-08-15",
    time: "10:00 AM",
    location: "Courtroom 3B",
    hearingType: "Motion Hearing",
    status: "Scheduled",
  caseId: ""},
  {
    id: "H-002",
    caseName: "Doe Real Estate",
    date: "2024-07-22",
    time: "02:30 PM",
    location: "Virtual (Zoom)",
    hearingType: "Pre-trial Conference",
    status: "Completed",
  caseId: ""},
  {
    id: "H-003",
    caseName: "Innovate LLC Patent",
    date: "2024-09-01",
    time: "09:00 AM",
    location: "Judge Miller's Chambers",
    hearingType: "Deposition",
    status: "Scheduled",
  caseId: ""},
  {
    id: "H-004",
    caseName: "State v. Johnson",
    date: "2024-07-18",
    time: "11:00 AM",
    location: "Courtroom 1A",
    hearingType: "Trial",
    status: "Postponed",
  caseId: ""},
];

const getStatusBadge = (status: HearingStatus) => {
  switch (status) {
    case "Scheduled":
      return "bg-blue-500/20 text-blue-400";
    case "Completed":
      return "bg-green-500/20 text-green-400";
    case "Postponed":
      return "bg-yellow-500/20 text-yellow-400";
    case "Cancelled":
      return "bg-red-500/20 text-red-400";
  }
};

const Hearings = () => {
  const [hearings] = useState<Hearing[]>(mockHearings);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold md:text-2xl flex items-center gap-2">
          <Gavel className="w-6 h-6" />
          Hearings
        </h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="search"
              placeholder="Search hearings..."
              className="pl-8 pr-2 py-2 text-sm bg-gray-950 border border-gray-800 rounded-lg"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            <PlusCircle className="h-4 w-4" />
            <span>Add Hearing</span>
          </button>
        </div>
      </div>
      <div className="panel-card p-0 overflow-hidden">
        {hearings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-900/50">
                <tr>
                  <th className="p-4 font-medium">Case</th>
                  <th className="p-4 font-medium">Date & Time</th>
                  <th className="p-4 font-medium">Location</th>
                  <th className="p-4 font-medium">Type</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {hearings.map((hearing) => (
                  <tr key={hearing.id} className="hover:bg-gray-900/50">
                    <td className="p-4">
                      <div>{hearing.caseName}</div>
                      <div className="text-xs text-gray-400">{hearing.caseName}</div>
                    </td>
                    <td className="p-4">{hearing.date} at {hearing.time}</td>
                    <td className="p-4">{hearing.location}</td>
                    <td className="p-4">{hearing.hearingType}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge((hearing.status ?? "Processed") as PayrollRunStatus)}`}>
                        {hearing.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button className="text-gray-400 hover:text-white">
                        <MoreHorizontal className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16">
            <Gavel className="mx-auto h-12 w-12 text-gray-500" />
            <h3 className="mt-2 text-lg font-semibold">No Hearings Scheduled</h3>
            <p className="mt-1 text-sm text-gray-400">Get started by adding a new hearing.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Hearings;