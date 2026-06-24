import { BarChart3, Users, CalendarClock, DollarSign, Pill, Stethoscope } from "../components/IconStub";

import type { ForwardRefExoticComponent, RefAttributes } from "react";

// Local type for this page's data
interface Report {
  id: string;
  title: string;
  description: string;
  Icon: ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>>;
}

const availableReports: Report[] = [
  {
    id: 'patient-demographics',
    title: 'Patient Demographics',
    description: 'Analyze patient population by age, gender, and location.',
    Icon: Users,
  $$typeof: "",
},
  {
    id: 'appointment-volume',
    title: 'Appointment Volume',
    description: 'Track appointment trends over time, by provider or status.',
    Icon: CalendarClock,
  $$typeof: "",
},
  {
    id: 'billing-summary',
    title: 'Billing & Revenue',
    description: 'View a summary of invoices, payments, and outstanding balances.',
    Icon: DollarSign,
  $$typeof: "",
},
  {
    id: 'prescription-analytics',
    title: 'Prescription Analytics',
    description: 'Analyze prescribing patterns and most common medications.',
    Icon: Pill,
  $$typeof: "",
},
  {
    id: 'provider-performance',
    title: 'Provider Performance',
    description: 'Review provider workload, patient encounters, and appointment statistics.',
    Icon: Stethoscope,
  $$typeof: "",
},
  {
    id: 'clinic-overview',
    title: 'Clinic Health Overview',
    description: 'A comprehensive dashboard of key performance indicators for the clinic.',
    Icon: BarChart3,
  $$typeof: "",
},
];

export default function Reports() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reports & Analytics</h1>
        <p className="text-gray-400 mt-1">Generate and view detailed reports to gain insights into clinic operations.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {availableReports.map((report) => (
          <div key={report.id} className="panel-card p-6 flex flex-col items-start gap-4 hover:border-indigo-500 transition-colors">
            <div className="p-3 bg-gray-700 rounded-lg">
              <report.Icon className="h-8 w-8 text-indigo-400" />
            </div>
            
            <div className="flex-grow">
              <h2 className="text-xl font-semibold text-white">{report.title}</h2>
              <p className="text-gray-400 mt-1 text-sm">{report.description}</p>
            </div>
            
            <button className="mt-auto w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-colors">
              Generate Report
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}