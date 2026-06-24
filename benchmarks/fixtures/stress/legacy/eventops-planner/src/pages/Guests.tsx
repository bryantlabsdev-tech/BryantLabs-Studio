import { useState } from "react";
import { Guest, GuestRsvpStatus } from "../types";

const mockGuests: Guest[] = [
  { id: 'g1', name: 'Alice Johnson', email: 'alice.j@example.com', eventId: 'Annual Tech Conference 2024', rsvpStatus: 'Attending',
  createdAt: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString().slice(0, 10),
},
  { id: 'g2', name: 'Bob Williams', email: 'bob.w@example.com', eventId: 'Annual Tech Conference 2024', rsvpStatus: 'Invited',
  createdAt: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString().slice(0, 10),
},
  { id: 'g3', name: 'Charlie Brown', email: 'charlie.b@example.com', eventId: 'Summer Music Festival', rsvpStatus: 'Declined',
  createdAt: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString().slice(0, 10),
},
  { id: 'g4', name: 'Diana Prince', email: 'diana.p@example.com', eventId: 'Charity Gala 2024', rsvpStatus: 'Attending',
  createdAt: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString().slice(0, 10),
},
  { id: 'g5', name: 'Ethan Hunt', email: 'ethan.h@example.com', eventId: 'Annual Tech Conference 2024', rsvpStatus: 'Maybe',
  createdAt: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString().slice(0, 10),
},
];

const RsvpStatusBadge = ({ status }: { status: GuestRsvpStatus }) => {
  const baseClasses = "inline-block px-2 py-1 text-xs font-semibold rounded-full";
  const statusClasses: Record<GuestRsvpStatus, string> = {
    Attending: "bg-green-500 text-green-900 bg-opacity-30",
    Invited: "bg-blue-500 text-blue-100 bg-opacity-30",
    Declined: "bg-red-500 text-red-100 bg-opacity-30",
    Maybe: "bg-yellow-500 text-yellow-100 bg-opacity-30",
  };
  return <span className={`${baseClasses} ${statusClasses[status]}`}>{status}</span>;
};

const Guests = () => {
  const [guests] = useState<Guest[]>(mockGuests);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white">Guests</h1>
        <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-md text-white font-semibold">
          Invite Guest
        </button>
      </div>

      <div className="panel-card bg-gray-800 rounded-lg overflow-hidden">
        {guests.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-700 bg-gray-800">
                <tr>
                  <th className="p-4 font-semibold">Name</th>
                  <th className="p-4 font-semibold">Email</th>
                  <th className="p-4 font-semibold">Event</th>
                  <th className="p-4 font-semibold">RSVP Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {guests.map((guest) => (
                  <tr key={guest.id} className="hover:bg-gray-700/50">
                    <td className="p-4">{guest.name}</td>
                    <td className="p-4 text-gray-400">{guest.email}</td>
                    <td className="p-4 text-gray-400">{guest.eventId}</td>
                    <td className="p-4"><RsvpStatusBadge status={guest.rsvpStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16">
            <h3 className="text-xl font-semibold">No Guests Found</h3>
            <p className="text-gray-400 mt-2">Start by inviting guests to your events.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Guests;