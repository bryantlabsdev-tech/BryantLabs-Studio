import { BarChart3, Calendar } from "../components/IconStub";
import { FileText as Users } from "../components/IconStub";

const Dashboard = () => {
  const kpiData = {
    upcomingAppointments: 12,
    totalPatients: 256,
    billsOverdue: 8,
  };

  const recentAppointments: {
    id: string;
    patientName: string;
    time: string;
    status: "Scheduled" | "Completed";
  }[] = [
    {
      id: "appt_1",
      patientName: "Alice Johnson",
      time: "10:00 AM",
      status: "Scheduled",
    },
    {
      id: "appt_2",
      patientName: "Bob Williams",
      time: "11:30 AM",
      status: "Completed",
    },
    {
      id: "appt_3",
      patientName: "Charlie Brown",
      time: "01:00 PM",
      status: "Scheduled",
    },
  ];

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <h1 className="text-3xl font-bold text-white mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        <div className="panel-card flex items-center space-x-4">
          <Calendar className="h-8 w-8 text-blue-400" />
          <div>
            <p className="text-sm text-gray-400">Upcoming Appointments Today</p>
            <p className="text-3xl font-bold">{kpiData.upcomingAppointments}</p>
          </div>
        </div>
        <div className="panel-card flex items-center space-x-4">
          <Users className="h-8 w-8 text-green-400" />
          <div>
            <p className="text-sm text-gray-400">Active Patients</p>
            <p className="text-3xl font-bold">{kpiData.totalPatients}</p>
          </div>
        </div>
        <div className="panel-card flex items-center space-x-4">
          <BarChart3 className="h-8 w-8 text-red-400" />
          <div>
            <p className="text-sm text-gray-400">Overdue Bills</p>
            <p className="text-3xl font-bold">{kpiData.billsOverdue}</p>
          </div>
        </div>
      </div>

      <div className="panel-card">
        <h2 className="text-xl font-semibold mb-4">Today's Schedule</h2>
        {recentAppointments.length > 0 ? (
          <div className="space-y-3">
            {recentAppointments.map((apt) => (
              <div
                key={apt.id}
                className="flex justify-between items-center bg-gray-700/50 p-3 rounded-lg"
              >
                <div>
                  <p className="font-semibold">{apt.patientName}</p>
                  <p className="text-sm text-gray-400">{apt.time}</p>
                </div>
                <span
                  className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                    apt.status === "Scheduled"
                      ? "bg-blue-500/20 text-blue-300"
                      : "bg-green-500/20 text-green-300"
                  }`}
                >
                  {apt.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-center py-4">
            No appointments scheduled for today.
          </p>
        )}
      </div>
    </main>
  );
};

export default Dashboard;