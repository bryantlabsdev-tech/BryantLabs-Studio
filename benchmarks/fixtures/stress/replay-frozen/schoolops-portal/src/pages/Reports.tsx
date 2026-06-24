import { BarChart3, Calendar, GraduationCap, Briefcase, Megaphone, Download } from "../components/IconStub";
import type { ReportInfo } from "../types";

const mockReports: ReportInfo[] = [
  {
    id: 'R001',
    title: 'Student Attendance Summary',
    description: 'View attendance records, tardiness, and absence trends for all students.',
    icon: Calendar},
  {
    id: 'R002',
    title: 'Class Grade Distribution',
    description: 'Analyze the distribution of grades for a specific class or subject.',
    icon: GraduationCap},
  {
    id: 'R003',
    title: 'Teacher Schedule Report',
    description: 'Generate a printable weekly schedule for any teacher.',
    icon: Briefcase},
  {
    id: 'R004',
    title: 'Behavior Incident Analysis',
    description: 'Identify patterns and trends in student behavior logs.',
    icon: Megaphone},
  {
    id: 'R005',
    title: 'Full Student Roster',
    description: 'Export a complete list of all active students with their details.',
    icon: BarChart3},
];

const ReportCard = ({ report }: { report: ReportInfo }) => {
  const Icon = report.icon;
  return (
    <div className="panel-card flex flex-col justify-between">
      <div>
        <div className="flex items-center gap-4 mb-3">
          <div className="p-2 bg-gray-700 rounded-md">
            <Icon className="w-6 h-6 text-indigo-400" />
          </div>
          <h3 className="text-lg font-semibold">{report.title}</h3>
        </div>
        <p className="text-sm text-gray-400">{report.description}</p>
      </div>
      <button className="mt-4 flex w-full items-center justify-center gap-2 px-4 py-2 bg-gray-700 rounded-md hover:bg-gray-600 transition-colors">
        <Download className="w-5 h-5" />
        <span>Generate Report</span>
      </button>
    </div>
  );
};

export default function Reports() {
  const reports = mockReports;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold flex items-center">
          <BarChart3 className="w-8 h-8 mr-3" />
          Reports
        </h1>
      </div>
      
      {reports.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reports.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>
      ) : (
        <div className="panel-card text-center py-12 text-gray-500">
          <BarChart3 className="w-12 h-12 mx-auto mb-4" />
          <h3 className="text-xl font-semibold">No Reports Available</h3>
          <p className="mt-2">There are currently no reports configured for generation.</p>
        </div>
      )}
    </div>
  );
}