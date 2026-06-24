import { useState } from "react";
// In a real app, these types would likely live in ../types.ts
type InventoryCategory = 'Produce' | 'Meat' | 'Dairy' | 'Dry Goods' | 'Beverages' | 'Supplies';

interface InventoryItem {
  id: number;
  name: string;
  category: InventoryCategory;
  quantity: number;
  unit: string;
  lowStockThreshold: number;
}

const mockInventory: InventoryItem[] = [
  { id: 1, name: "Tomatoes", category: "Produce", quantity: 25, unit: "kg", lowStockThreshold: 10 },
  { id: 2, name: "Chicken Breast", category: "Meat", quantity: 8, unit: "kg", lowStockThreshold: 10 },
  { id: 3, name: "Pasta", category: "Dry Goods", quantity: 50, unit: "box", lowStockThreshold: 20 },
  { id: 4, name: "Milk", category: "Dairy", quantity: 0, unit: "gallon", lowStockThreshold: 5 },
  { id: 5, name: "Napkins", category: "Supplies", quantity: 100, unit: "pack", lowStockThreshold: 50 },
];

const Inventory = () => {
  const [inventoryItems, _setInventoryItems] = useState<InventoryItem[]>(mockInventory);

  const getStatus = (item: InventoryItem): { text: string; className: string } => {
    if (item.quantity === 0) {
      return { text: 'Out of Stock', className: 'bg-red-500/20 text-red-400' };
    }
    if (item.quantity <= item.lowStockThreshold) {
      return { text: 'Low Stock', className: 'bg-yellow-500/20 text-yellow-400' };
    }
    return { text: 'In Stock', className: 'bg-green-500/20 text-green-400' };
  };

  return (
    <main className="p-4 md:p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Inventory</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
          Add New Item
        </button>
      </div>

      <div className="panel-card">
        {inventoryItems.length === 0 ? (
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold text-gray-300">No Inventory Items</h3>
            <p className="text-gray-400 mt-1">Click "Add New Item" to start tracking inventory.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left text-gray-300">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                <tr>
                  <th scope="col" className="px-6 py-3">Item Name</th>
                  <th scope="col" className="px-6 py-3">Category</th>
                  <th scope="col" className="px-6 py-3 text-right">Quantity</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                  <th scope="col" className="px-6 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {inventoryItems.map((item) => {
                  const status = getStatus(item);
                  return (
                    <tr key={item.id} className="border-b border-gray-700 hover:bg-gray-700/40">
                      <td className="px-6 py-4 font-medium text-white whitespace-nowrap">{item.name}</td>
                      <td className="px-6 py-4">{item.category}</td>
                      <td className="px-6 py-4 text-right">{`${item.quantity} ${item.unit}`}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${status.className}`}>
                          {status.text}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right space-x-4">
                        <button className="font-medium text-indigo-400 hover:underline">Restock</button>
                        <button className="font-medium text-indigo-400 hover:underline">Edit</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
};

export default Inventory;