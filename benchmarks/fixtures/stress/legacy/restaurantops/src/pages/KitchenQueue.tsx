import { useState } from "react";
import { KitchenQueueStatus } from '../types';

interface KitchenQueueItem {
  id: number;
  orderId: number;
  tableNumber: number;
  menuItemName: string;
  quantity: number;
  status: KitchenQueueStatus;
  notes?: string;
}

const mockKitchenItems: KitchenQueueItem[] = [
  { id: 1, orderId: 102, tableNumber: 5, menuItemName: 'Bruschetta', quantity: 1, status: 'Received' },
  { id: 2, orderId: 105, tableNumber: 8, menuItemName: 'Filet Mignon', quantity: 2, status: 'Received', notes: 'One medium-rare, one medium' },
  { id: 3, orderId: 106, tableNumber: 1, menuItemName: 'Caesar Salad', quantity: 1, status: 'Preparing', notes: 'No anchovies' },
  { id: 4, orderId: 107, tableNumber: 4, menuItemName: 'Tiramisu', quantity: 2, status: 'Ready' },
];

const statusColorMap: Record<KitchenQueueStatus, string> = {
  Received: 'border-red-500',
  Preparing: 'border-yellow-500',
  Ready: 'border-green-500',
};

const KitchenQueue = () => {
  const [queueItems, setQueueItems] = useState<KitchenQueueItem[]>(mockKitchenItems);

  const updateItemStatus = (itemId: number, newStatus: KitchenQueueStatus) => {
    setQueueItems(prevItems =>
      prevItems.map(item =>
        item.id === itemId ? { ...item, status: newStatus } : item
      )
    );
  };

  return (
    <main className="p-4 md:p-6 space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold text-white">Kitchen Queue</h1>
      
      {queueItems.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {queueItems.map((item) => (
            <div key={item.id} className={`panel-card bg-gray-800 rounded-lg p-4 shadow-lg border-l-4 ${statusColorMap[item.status]}`}>
              <div className="flex justify-between items-baseline">
                <h2 className="text-lg font-bold">{item.menuItemName} <span className="text-indigo-400">x{item.quantity}</span></h2>
                <p className="text-sm text-gray-400">Tbl {item.tableNumber}</p>
              </div>
              {item.notes && <p className="text-sm italic text-yellow-300 mt-2">"{item.notes}"</p>}
              <div className="mt-4 flex gap-2">
                {item.status === 'Received' && (
                  <button onClick={() => updateItemStatus(item.id, 'Preparing')} className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white py-1 px-3 rounded-md text-sm">
                    Prepare
                  </button>
                )}
                {item.status === 'Preparing' && (
                  <button onClick={() => updateItemStatus(item.id, 'Ready')} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1 px-3 rounded-md text-sm">
                    Ready
                  </button>
                )}
                {item.status === 'Ready' && (
                  <p className="flex-1 text-center text-green-400 font-bold text-sm">Waiting for Pickup</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel-card bg-gray-800 border border-gray-700 rounded-lg p-12 text-center">
          <h2 className="text-xl font-semibold">The kitchen queue is empty!</h2>
          <p className="text-gray-400 mt-2">All orders are complete.</p>
        </div>
      )}
    </main>
  );
};

export default KitchenQueue;