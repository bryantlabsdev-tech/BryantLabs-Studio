import { useState } from "react";
import { ReservationStatus } from '../types';

interface Reservation {
  id: number;
  guestName: string;
  partySize: number;
  reservationTime: string;
  status: ReservationStatus;
  notes?: string;
}

const mockReservations: Reservation[] = [
  { id: 1, guestName: 'Alice Johnson', partySize: 4, reservationTime: '2024-07-15T19:00:00Z', status: 'Confirmed' },
  { id: 2, guestName: 'Bob Williams', partySize: 2, reservationTime: '2024-07-15T19:30:00Z', status: 'Confirmed', notes: 'Window seat requested' },
  { id: 3, guestName: 'Charlie Brown', partySize: 5, reservationTime: '2024-07-15T18:45:00Z', status: 'Seated' },
  { id: 4, guestName: 'Diana Prince', partySize: 2, reservationTime: '2024-07-14T20:00:00Z', status: 'Cancelled' },
  { id: 5, guestName: 'Evan Wright', partySize: 3, reservationTime: '2024-07-14T19:00:00Z', status: 'No-show' },
];

const statusColorMap: Record<ReservationStatus, string> = {
  Confirmed: 'bg-blue-500 text-blue-100',
  Seated: 'bg-green-500 text-green-100',
  Cancelled: 'bg-red-500 text-red-100',
  'No-show': 'bg-gray-500 text-gray-100',
};

const Reservations = () => {
  const [reservations] = useState<Reservation[]>(mockReservations);

  return (
    <main className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Reservations</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors">
          Add Reservation
        </button>
      </div>

      <div className="panel-card bg-gray-800 border border-gray-700 rounded-lg p-4 shadow-lg overflow-x-auto">
        {reservations.length > 0 ? (
          <table className="w-full text-left">
            <thead className="border-b border-gray-600">
              <tr>
                <th className="p-3">Guest</th>
                <th className="p-3">Party Size</th>
                <th className="p-3">Time</th>
                <th className="p-3">Status</th>
                <th className="p-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((res) => (
                <tr key={res.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                  <td className="p-3 font-medium">{res.guestName}</td>
                  <td className="p-3">{res.partySize}</td>
                  <td className="p-3">{new Date(res.reservationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColorMap[res.status]}`}>
                      {res.status}
                    </span>
                  </td>
                  <td className="p-3 text-gray-400 italic">{res.notes || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-400">No reservations found.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Reservations;