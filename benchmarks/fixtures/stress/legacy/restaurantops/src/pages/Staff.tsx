import { useState } from "react";
// In a real app, these types would likely live in ../types.ts
type StaffRole = 'Manager' | 'Chef' | 'Server' | 'Host' | 'Busser';
type StaffStatus = 'On Shift' | 'Off Duty' | 'On Break';

interface StaffMember {
  id: number;
  name: string;
  role: StaffRole;
  status: StaffStatus;
  phone: string;
}

const mockStaff: StaffMember[] = [
  { id: 1, name: "Alice Johnson", role: "Manager", status: "On Shift", phone: "555-0101" },
  { id: 2, name: "Bob Williams", role: "Chef", status: "On Shift", phone: "555-0102" },
  { id: 3, name: "Charlie Brown", role: "Server", status: "On Break", phone: "555-0103" },
  { id: 4, name: "Diana Prince", role: "Server", status: "Off Duty", phone: "555-0104" },
  { id: 5, name: "Ethan Hunt", role: "Host", status: "On Shift", phone: "555-0105" },
];

const statusColors: Record<StaffStatus, string> = {
  'On Shift': 'bg-green-500/20 text-green-400',
  'Off Duty': 'bg-gray-500/20 text-gray-400',
  'On Break': 'bg-yellow-500/20 text-yellow-400',
};

const Staff = () => {
  const [staffMembers, _setStaffMembers] = useState<StaffMember[]>(mockStaff);

  return (
    <main className="p-4 md:p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Staff Management</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
          Add Staff Member
        </button>
      </div>

      <div className="panel-card">
        {staffMembers.length === 0 ? (
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold text-gray-300">No Staff Members Found</h3>
            <p className="text-gray-400 mt-1">Click "Add Staff Member" to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left text-gray-300">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                <tr>
                  <th scope="col" className="px-6 py-3">Name</th>
                  <th scope="col" className="px-6 py-3">Role</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                  <th scope="col" className="px-6 py-3">Phone</th>
                  <th scope="col" className="px-6 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {staffMembers.map((member) => (
                  <tr key={member.id} className="border-b border-gray-700 hover:bg-gray-700/40">
                    <td className="px-6 py-4 font-medium text-white whitespace-nowrap">{member.name}</td>
                    <td className="px-6 py-4">{member.role}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[member.status]}`}>
                        {member.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">{member.phone}</td>
                    <td className="px-6 py-4 text-right">
                      <button className="font-medium text-indigo-400 hover:underline">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
};

export default Staff;