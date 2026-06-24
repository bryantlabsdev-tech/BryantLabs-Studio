import { useState } from "react";
import { Plus, Calendar } from "../components/IconStub";
import type { AppointmentStatus } from "../types";

// Using a local interface as the full Appointment type is not in the provided `types.ts` snippet.
// It uses the imported `AppointmentStatus` for type consistency.
interface Appointment {
  id: string;
  patientName: string;
  providerName: string;
  date: string;
  time: string;
  status: AppointmentStatus;
}

const mockAppointments: Appointment[] = [
  { id: 'apt001', patientName: 'Eleanor Pena', providerName: 'Dr. John Smith', date: '2023-10-26', time: '10:00 AM', status: 'Completed' },
  { id: 'apt002', patientName: 'Cody Fisher', providerName: 'Dr. Susan Jones', date: '2023-10-27', time: '02:30 PM', status: 'Scheduled' },
  { id: 'apt003', patientName: 'Arlene McCoy', providerName: 'Dr. John Smith', date: '2023-10-25', time: '11:00 AM', status: 'Cancelled' },
  { id: 'apt004', patientName: 'Dianne Russell', providerName: 'Dr. Emily White', date: '2023-10-24', time: '09:00 AM', status: 'No Show' },
  { id: 'apt005', patientName: 'Jacob Jones', providerName: 'Dr. Susan Jones', date: '2023-10-28', time: '04:00 PM', status: 'Scheduled' },
];

const getStatusBadgeClass = (status: AppointmentStatus) => {
  switch (status) {
    case 'Scheduled': return 'bg-blue-500/20 text-blue-300';
    case 'Completed': return 'bg-green-500/20 text-green-300';
    case 'Cancelled': return 'bg-yellow-500/20 text-yellow-300';
    case 'No Show': return 'bg-red-500/20 text-red-300';
    default: return 'bg-gray-500/20 text-gray-300';
  }
};

const Appointments = () => {
  const [appointments] = useState<Appointment[]>(mockAppointments);

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white">Appointments</h1>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg">
          <Plus className="h-5 w-5" />
          <span>New Appointment</span>
        </button>
      </div>

      <div className="panel-card">
        {appointments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-700">
                <tr>
                  <th className="p-4">Patient</th>
                  <th className="p-4">Provider</th>
                  <th className="p-4">Date & Time</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((apt) => (
                  <tr key={apt.id} className="border-b border-gray-700 last:border-b-0 hover:bg-gray-700/50">
                    <td className="p-4">{apt.patientName}</td>
                    <td className="p-4">{apt.providerName}</td>
                    <td className="p-4">{apt.date} at {apt.time}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(apt.status)}`}>
                        {apt.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <Calendar className="mx-auto h-12 w-12 text-gray-500" />
            <h3 className="mt-2 text-xl font-semibold">No Appointments</h3>
            <p className="mt-1 text-sm text-gray-400">Get started by scheduling a new appointment.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Appointments;