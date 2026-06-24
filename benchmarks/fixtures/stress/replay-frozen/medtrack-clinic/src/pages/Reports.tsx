import { BarChart3, Users, CreditCard, Pill } from "../components/IconStub";

const Reports = () => {
  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <BarChart3 className="w-8 h-8" />
          Reports
        </h1>
        {/* Date range picker could go here */}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        {/* Appointments Report */}
        <div className="panel-card bg-gray-800 rounded-lg shadow-lg p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-blue-600/20 p-3 rounded-full">
              <BarChart3 className="w-6 h-6 text-blue-400" />
            </div>
            <h2 className="text-xl font-semibold">Appointments Overview</h2>
          </div>
          <div className="space-y-3 text-lg">
            <div className="flex justify-between"><span>Total This Month:</span><span className="font-mono font-bold">142</span></div>
            <div className="flex justify-between"><span>Completed:</span><span className="font-mono font-bold">128</span></div>
            <div className="flex justify-between"><span>Cancellations:</span><span className="font-mono font-bold">10</span></div>
            <div className="flex justify-between"><span>No-Shows:</span><span className="font-mono font-bold">4</span></div>
          </div>
        </div>

        {/* Financial Report */}
        <div className="panel-card bg-gray-800 rounded-lg shadow-lg p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-green-600/20 p-3 rounded-full">
              <CreditCard className="w-6 h-6 text-green-400" />
            </div>
            <h2 className="text-xl font-semibold">Financial Summary</h2>
          </div>
          <div className="space-y-3 text-lg">
            <div className="flex justify-between"><span>Revenue This Month:</span><span className="font-mono font-bold">$45,800</span></div>
            <div className="flex justify-between"><span>Collected:</span><span className="font-mono font-bold">$39,200</span></div>
            <div className="flex justify-between"><span>Outstanding:</span><span className="font-mono font-bold">$6,600</span></div>
            <div className="flex justify-between"><span>Overdue Invoices:</span><span className="font-mono font-bold">8</span></div>
          </div>
        </div>

        {/* Patient Demographics */}
        <div className="panel-card bg-gray-800 rounded-lg shadow-lg p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-purple-600/20 p-3 rounded-full">
              <Users className="w-6 h-6 text-purple-400" />
            </div>
            <h2 className="text-xl font-semibold">Patient Growth</h2>
          </div>
          <div className="space-y-3 text-lg">
            <div className="flex justify-between"><span>Total Patients:</span><span className="font-mono font-bold">256</span></div>
            <div className="flex justify-between"><span>New This Month:</span><span className="font-mono font-bold">14</span></div>
            <div className="flex justify-between"><span>Avg. Age:</span><span className="font-mono font-bold">42</span></div>
            <div className="flex justify-between"><span>Returning Patients:</span><span className="font-mono font-bold">94%</span></div>
          </div>
        </div>

        {/* Prescription Trends */}
        <div className="panel-card bg-gray-800 rounded-lg shadow-lg p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-yellow-600/20 p-3 rounded-full">
              <Pill className="w-6 h-6 text-yellow-400" />
            </div>
            <h2 className="text-xl font-semibold">Prescription Trends</h2>
          </div>
          <div className="space-y-3 text-lg">
            <div className="flex justify-between"><span>Total Prescribed:</span><span className="font-mono font-bold">215</span></div>
            <div className="flex justify-between"><span>Most Common:</span><span className="font-mono font-bold">Lisinopril</span></div>
            <div className="flex justify-between"><span>Refills Processed:</span><span className="font-mono font-bold">88</span></div>
            <div className="flex justify-between"><span>Avg. Scripts/Patient:</span><span className="font-mono font-bold">1.8</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;