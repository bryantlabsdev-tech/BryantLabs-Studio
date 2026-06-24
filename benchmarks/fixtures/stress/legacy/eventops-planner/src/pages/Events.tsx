import { EventStatus } from "../types";

type Event = {
  id: string;
  name: string;
  date: string;
  venue: string;
  status: EventStatus;
  budget: number;
};

const mockEvents: Event[] = [
  { id: '1', name: "Annual Tech Conference 2024", date: "2024-10-26", venue: "Metro Convention Center", status: "Planned", budget: 50000 },
  { id: '2', name: "Summer Music Festival", date: "2024-08-15", venue: "City Park Amphitheater", status: "Confirmed", budget: 120000 },
  { id: '3', name: "Charity Gala Dinner", date: "2024-11-05", venue: "The Grand Ballroom", status: "Planned", budget: 75000 },
  { id: '4', name: "Product Launch Event", date: "2024-05-20", venue: "Innovation Hub", status: "Completed", budget: 30000 },
  { id: '5', name: "Corporate Offsite", date: "2024-09-10", venue: "Lakeside Resort", status: "Cancelled", budget: 40000 },
];

const statusColors: Record<EventStatus, string> = {
  Planned: "bg-blue-500/20 text-blue-300",
  Confirmed: "bg-green-500/20 text-green-300",
  Completed: "bg-gray-500/20 text-gray-300",
  Cancelled: "bg-red-500/20 text-red-300",
};

const Events = () => {
  const events: Event[] = mockEvents;

  return (
    <main className="p-6 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Events</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg">
          New Event
        </button>
      </div>

      <div className="panel-card overflow-x-auto">
        {events.length > 0 ? (
          <table className="w-full min-w-[600px] text-left">
            <thead>
              <tr className="text-gray-400 text-sm border-b border-gray-700">
                <th className="p-4 font-medium">Event Name</th>
                <th className="p-4 font-medium">Date</th>
                <th className="p-4 font-medium">Venue</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium text-right">Budget</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {events.map((event) => (
                <tr key={event.id} className="hover:bg-gray-700/50">
                  <td className="p-4 text-white font-medium">{event.name}</td>
                  <td className="p-4 text-gray-300">{event.date}</td>
                  <td className="p-4 text-gray-300">{event.venue}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColors[event.status]}`}>
                      {event.status}
                    </span>
                  </td>
                  <td className="p-4 text-right text-gray-300">
                    {event.budget.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold">No Events Found</h3>
            <p className="text-gray-400 mt-1">Get started by creating a new event.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Events;