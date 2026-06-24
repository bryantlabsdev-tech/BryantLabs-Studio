import { useState } from "react";
import { TableStatus } from "../types";

interface Table {
  id: number;
  name: string;
  capacity: number;
  status: TableStatus;
}

const mockTables: Table[] = [
  { id: 1, name: "Table 1", capacity: 4, status: "Available" },
  { id: 2, name: "Table 2", capacity: 2, status: "Occupied" },
  { id: 3, name: "Table 3", capacity: 6, status: "Reserved" },
  { id: 4, name: "Table 4", capacity: 4, status: "Available" },
  { id: 5, name: "Bar Seat 1", capacity: 1, status: "Occupied" },
  { id: 6, name: "Patio 1", capacity: 8, status: "Available" },
  { id: 7, name: "Table 5", capacity: 2, status: "Available" },
  { id: 8, name: "Table 6", capacity: 4, status: "Occupied" },
];

const statusStyles: { [key in TableStatus]: { border: string; text: string; dot: string } } = {
  Available: { border: "border-green-500/50", text: "text-green-400", dot: "bg-green-400" },
  Occupied: { border: "border-red-500/50", text: "text-red-400", dot: "bg-red-400" },
  Reserved: { border: "border-yellow-500/50", text: "text-yellow-400", dot: "bg-yellow-400" },
};

const Tables = () => {
  const [tables, setTables] = useState<Table[]>(mockTables);
  
  const handleTableStatusChange = (id: number) => {
    const statuses: TableStatus[] = ['Available', 'Occupied', 'Reserved'];
    setTables(currentTables => 
      currentTables.map(table => {
        if (table.id === id) {
          const currentIndex = statuses.indexOf(table.status);
          const nextIndex = (currentIndex + 1) % statuses.length;
          return { ...table, status: statuses[nextIndex] };
        }
        return table;
      })
    );
  };

  return (
    <main className="p-4 md:p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-100">Tables</h1>
        <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
          Add Table
        </button>
      </div>
      
      {tables.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
          {tables.map((table) => (
            <div 
              key={table.id} 
              onClick={() => handleTableStatusChange(table.id)}
              className={`panel-card flex flex-col justify-between border-l-4 cursor-pointer transition-all hover:bg-gray-700/60 ${statusStyles[table.status].border}`}>
              <div>
                <h3 className="text-lg font-bold text-white">{table.name}</h3>
                <p className="text-sm text-gray-400">Capacity: {table.capacity}</p>
              </div>
              <div className="flex items-center mt-4">
                <span className={`w-2.5 h-2.5 rounded-full mr-2 ${statusStyles[table.status].dot}`}></span>
                <span className={`text-sm font-semibold ${statusStyles[table.status].text}`}>{table.status}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel-card text-center py-16 text-gray-500">
          <h3 className="text-xl font-semibold">No Tables Found</h3>
          <p className="mt-2">Click "Add Table" to configure your restaurant layout.</p>
        </div>
      )}
    </main>
  );
};

export default Tables;