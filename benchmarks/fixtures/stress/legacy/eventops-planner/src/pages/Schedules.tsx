import { useState } from "react";
import { ScheduleItem, ScheduleItemStatus } from "../types";

const mockScheduleItems: ScheduleItem[] = [
  { id: 's1', eventName: 'Annual Tech Conference 2024', time: '09:00 AM', activity: 'Registration & Coffee', location: 'Lobby', status: 'Completed',
  startTime: "",
  endTime: ""
},
  { id: 's2', eventName: 'Annual Tech Conference 2024', time: '10:00 AM', activity: 'Keynote Address', location: 'Main Hall', status: 'In Progress',
  startTime: "",
  endTime: ""
},
  { id: 's3', eventName: 'Annual Tech Conference 2024', time: '11:00 AM', activity: 'Panel: Future of AI', location: 'Main Hall', status: 'Planned',
  startTime: "",
  endTime: ""
},
  { id: 's4', eventName: 'Summer Music Festival', time: '02:00 PM', activity: 'Gates Open', location: 'Main Entrance', status: 'Completed',
  startTime: "",
  endTime: ""
},
  { id: 's5', eventName: 'Summer Music Festival', time: '03:00 PM', activity: 'Opening Act: The Starters', location: 'Main Stage', status: 'Delayed',
  startTime: "",
  endTime: ""
},
];

const ScheduleStatusBadge = ({ status }: { status: ScheduleItemStatus }) => {
  const baseClasses = "inline-block px-2 py-1 text-xs font-semibold rounded-full";
  const statusClasses: Record<string, string> = {
    Planned: "bg-gray-500 text-gray-100 bg-opacity-30",
    'In Progress': "bg-blue-500 text-blue-100 bg-opacity-30",
    Completed: "bg-green-500 text-green-100 bg-opacity-30",
    Delayed: "bg-yellow-500 text-yellow-100 bg-opacity-30",
  };
  return <span className={`${baseClasses} ${statusClasses[status]}`}>{status}</span>;
};

const Schedules = () => {
  const [scheduleItems] = useState<ScheduleItem[]>(mockScheduleItems);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white">Schedules</h1>
        <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-md text-white font-semibold">
          Add Schedule Item
        </button>
      </div>

      <div className="panel-card bg-gray-800 rounded-lg overflow-hidden">
        {scheduleItems.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-700 bg-gray-800">
                <tr>
                  <th className="p-4 font-semibold">Event</th>
                  <th className="p-4 font-semibold">Time</th>
                  <th className="p-4 font-semibold">Activity</th>
                  <th className="p-4 font-semibold">Location</th>
                  <th className="p-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {scheduleItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-700/50">
                    <td className="p-4 font-semibold">{item.eventName}</td>
                    <td className="p-4 text-gray-400">{item.time}</td>
                    <td className="p-4">{item.activity}</td>
                    <td className="p-4 text-gray-400">{item.location}</td>
                    <td className="p-4"><ScheduleStatusBadge status={(item.status ?? "Planned") as ScheduleItemStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16">
            <h3 className="text-xl font-semibold">No Schedule Items</h3>
            <p className="text-gray-400 mt-2">Create a schedule for an event to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Schedules;