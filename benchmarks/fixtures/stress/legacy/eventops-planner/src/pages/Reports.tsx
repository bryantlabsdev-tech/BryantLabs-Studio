import { FC, ReactNode } from "react";

const ReportCard: FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
    <div className="panel-card bg-gray-800 rounded-lg p-6">
        <h3 className="text-xl font-semibold text-white mb-4">{title}</h3>
        <div>{children}</div>
    </div>
);

const Reports = () => {
    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-white">Reports & Analytics</h1>
                <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md text-white font-semibold">
                  Export All
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <ReportCard title="Guest Attendance Overview">
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400">Total Invited</span>
                            <span className="font-bold text-lg">1,240</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400">Attending</span>
                            <span className="font-bold text-lg text-green-400">890 (72%)</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400">Declined</span>
                            <span className="font-bold text-lg text-red-400">150 (12%)</span>
                        </div>
                         <div className="flex justify-between items-center">
                            <span className="text-gray-400">No Response</span>
                            <span className="font-bold text-lg text-yellow-400">200 (16%)</span>
                        </div>
                    </div>
                </ReportCard>

                <ReportCard title="Budget vs. Actual">
                    <div className="space-y-3">
                         <div className="flex justify-between items-center">
                            <span className="text-gray-400">Total Budget</span>
                            <span className="font-bold text-lg">$250,000</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400">Total Spent</span>
                            <span className="font-bold text-lg">$215,750</span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2.5 my-2">
                            <div className="bg-blue-500 h-2.5 rounded-full" style={{ width: '86%' }}></div>
                        </div>
                        <div className="text-right font-bold text-green-400">
                           $34,250 Under Budget
                        </div>
                    </div>
                </ReportCard>
                
                <ReportCard title="Vendor Engagement">
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400">Total Vendors</span>
                            <span className="font-bold text-lg">45</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400">Booked</span>
                            <span className="font-bold text-lg">38</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400">Pending</span>
                            <span className="font-bold text-lg">7</span>
                        </div>
                        <div className="text-sm text-gray-500 mt-2">Highest rated: Starlight Catering</div>
                    </div>
                </ReportCard>
            </div>
        </div>
    );
};

export default Reports;