
import { FileText, Building, AlertTriangle, DollarSign } from "../components/IconStub";
type ReportConfig = {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
};

const availableReports: ReportConfig[] = [
  {
    id: 'rent-roll',
    title: 'Rent Roll Report',
    description: 'Detailed list of all units, tenants, lease terms, and rent amounts for a specific period.',
    icon: DollarSign,
  },
  {
    id: 'vacancy',
    title: 'Vacancy Report',
    description: 'Summary of all vacant units, including days on market and market rent analysis.',
    icon: Building,
  },
  {
    id: 'maintenance',
    title: 'Maintenance History',
    description: 'Complete log of all maintenance requests, including costs, time to complete, and status.',
    icon: AlertTriangle,
  },
  {
    id: 'financial-summary',
    title: 'Financial Summary',
    description: 'Overview of income and expenses, including rent collected, late fees, and maintenance costs.',
    icon: FileText,
  },
  {
    id: 'lease-expirations',
    title: 'Lease Expirations',
    description: 'A list of leases that are expiring within a specified timeframe to manage renewals.',
    icon: FileText,
  },
   {
    id: 'tenant-directory',
    title: 'Tenant Directory',
    description: 'Contact information and lease details for all current tenants in your properties.',
    icon: FileText,
  },
];

const Reports = () => {
    // In a real app, this would trigger a report generation flow
    const handleGenerateReport = (reportId: string) => {
        alert(`Generating report: ${reportId}`);
    };

    return (
        <main className="p-4 sm:p-6 lg:p-8 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-white">Reports</h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {availableReports.map((report) => (
                    <div key={report.id} className="panel-card flex flex-col justify-between">
                        <div>
                            <div className="flex items-center gap-4 mb-3">
                                <report.icon className="w-8 h-8 text-indigo-400" />
                                <h2 className="text-lg font-semibold text-white">{report.title}</h2>
                            </div>
                            <p className="text-sm text-gray-400 mb-4">
                                {report.description}
                            </p>
                        </div>
                        <div className="mt-auto">
                           <button 
                                onClick={() => handleGenerateReport(report.id)}
                                className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500"
                            >
                                Generate Report
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </main>
    );
};

export default Reports;