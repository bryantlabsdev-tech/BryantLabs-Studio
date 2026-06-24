import { useState } from "react";
import { MenuItemCategory } from "../types";

type MenuItemStatus = 'Available' | 'Sold Out';

interface MenuItem {
  id: number;
  name: string;
  category: MenuItemCategory;
  price: number;
  status: MenuItemStatus;
}

const mockMenuItems: MenuItem[] = [
  { id: 1, name: "Bruschetta", category: "Appetizer", price: 8.99, status: "Available" },
  { id: 2, name: "Spaghetti Carbonara", category: "Main Course", price: 15.50, status: "Available" },
  { id: 3, name: "Tiramisu", category: "Dessert", price: 7.00, status: "Sold Out" },
  { id: 4, name: "Margherita Pizza", category: "Main Course", price: 12.00, status: "Available" },
  { id: 5, name: "Caesar Salad", category: "Appetizer", price: 9.50, status: "Available" },
];

const statusColors: { [key in MenuItemStatus]: string } = {
  Available: "bg-green-500/20 text-green-300",
  "Sold Out": "bg-red-500/20 text-red-300",
};

const MenuItems = () => {
  const [menuItems, setMenuItems] = useState<MenuItem[]>(mockMenuItems);

  const handleDelete = (id: number) => {
    setMenuItems(currentItems => currentItems.filter(item => item.id !== id));
  };

  return (
    <main className="p-4 md:p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-100">Menu Items</h1>
        <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
          Add New Item
        </button>
      </div>
      <div className="panel-card overflow-x-auto">
        {menuItems.length > 0 ? (
          <table className="w-full text-left">
            <thead className="border-b border-gray-700">
              <tr>
                <th className="p-4 text-sm font-semibold text-gray-400">Name</th>
                <th className="p-4 text-sm font-semibold text-gray-400">Category</th>
                <th className="p-4 text-sm font-semibold text-gray-400">Price</th>
                <th className="p-4 text-sm font-semibold text-gray-400">Status</th>
                <th className="p-4 text-sm font-semibold text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {menuItems.map((item) => (
                <tr key={item.id} className="border-b border-gray-700 last:border-b-0 hover:bg-gray-700/50">
                  <td className="p-4 font-medium">{item.name}</td>
                  <td className="p-4 text-gray-300">{item.category}</td>
                  <td className="p-4 text-gray-300">${item.price.toFixed(2)}</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${statusColors[item.status]}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="p-4 space-x-4">
                    <button className="text-blue-400 hover:text-blue-300 font-semibold">Edit</button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-300 font-semibold">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-16 text-gray-500">
            <h3 className="text-xl font-semibold">No Menu Items Found</h3>
            <p className="mt-2">Click "Add New Item" to get started.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default MenuItems;