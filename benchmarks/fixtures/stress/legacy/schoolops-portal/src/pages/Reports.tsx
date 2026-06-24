interface ReportInfo {
  id: string;
  title: string;
  description: string;
}

const academicReports: ReportInfo[] = [
  { id: "AR01", title: "Grade Distribution", description: "Analyze grade distributions by class, subject, or teacher." },
  { id: "AR02", title: "Student Performance", description: "View detailed performance metrics for individual students." },
  { id: "AR03", title: "Honor Roll", description: "Generate a list of students who meet honor roll criteria." },
];

const attendanceReports: ReportInfo[] = [
  { id: "AT01", title: "Daily Attendance Summary", description: "Get a summary of attendance for any given day." },
  { id: "AT02", title: "Chronic Absenteeism", description: "Identify students at risk due to high absence rates." },
  { id: "AT03", title: "Tardiness Report", description: "Track student tardiness patterns across classes." },
];

const enrollmentReports: ReportInfo[] = [
  { id: "EN01", title: "Class Rosters", description: "Print or export official class rosters for teachers." },
  { id: "EN02", title: "Enrollment Trends", description: "Visualize student enrollment numbers over time." },
];

const ReportCategory = ({ title, reports }: { title: string; reports: ReportInfo[] }) => (
  <section className="mb-8">
    <h2 className="text-2xl font-semibold mb-4 border-b border-gray-700 pb-2">{title}</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {reports.map((report) => (
        <div key={report.id} className="panel-card flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-100">{report.title}</h3>
            <p className="text-gray-400 mt-2 text-sm">{report.description}</p>
          </div>
          <button className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg self-end">
            Generate Report
          </button>
        </div>
      ))}
    </div>
  </section>
);

export default function Reports() {
  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Reports</h1>
        <p className="text-gray-400 mt-1">Generate and view school-wide reports.</p>
      </div>

      <ReportCategory title="Academic Reports" reports={academicReports} />
      <ReportCategory title="Attendance Reports" reports={attendanceReports} />
      <ReportCategory title="Enrollment Reports" reports={enrollmentReports} />
    </main>
  );
}