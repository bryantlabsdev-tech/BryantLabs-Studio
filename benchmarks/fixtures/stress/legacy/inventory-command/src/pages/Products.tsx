import { useState } from "react";
import { Product as BaseProduct } from '../types';

// Assuming a more complete Product type for display purposes
interface Product extends BaseProduct {
  name: string;
  stock: number;
  reorderPoint: number;
  supplierId: string;
}

type StockStatus = 'In Stock' | 'Low Stock' | 'Out of Stock';

const mockProducts: Product[] = [
  { id: 'prod-001', sku: 'HW-MNT-01', name: 'Heavy Duty Mounting Bracket', stock: 150, reorderPoint: 50, supplierId: 'sup-1',
  quantity: 0,
  unitPrice: 0,
  createdAt: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString().slice(0, 10),
},
  { id: 'prod-002', sku: 'EL-CBL-10', name: '10ft Braided USB-C Cable', stock: 45, reorderPoint: 50, supplierId: 'sup-2',
  quantity: 0,
  unitPrice: 0,
  createdAt: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString().slice(0, 10),
},
  { id: 'prod-003', sku: 'SF-CHR-03', name: 'Ergonomic Office Chair', stock: 25, reorderPoint: 10, supplierId: 'sup-1',
  quantity: 0,
  unitPrice: 0,
  createdAt: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString().slice(0, 10),
},
  { id: 'prod-004', sku: 'KT-MUG-01', name: 'Insulated Coffee Mug', stock: 0, reorderPoint: 20, supplierId: 'sup-3',
  quantity: 0,
  unitPrice: 0,
  createdAt: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString().slice(0, 10),
},
  { id: 'prod-005', sku: 'AU-HDP-02', name: 'Noise-Cancelling Headphones', stock: 75, reorderPoint: 25, supplierId: 'sup-2',
  quantity: 0,
  unitPrice: 0,
  createdAt: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString().slice(0, 10),
},
];

const getStatus = (stock: number, reorderPoint: number): StockStatus => {
  if (stock === 0) return 'Out of Stock';
  if (stock <= reorderPoint) return 'Low Stock';
  return 'In Stock';
};

const statusColors: Record<string, string> = {
  'In Stock': 'bg-green-500/20 text-green-400',
  'Low Stock': 'bg-yellow-500/20 text-yellow-400',
  'Out of Stock': 'bg-red-500/20 text-red-400',
};

const Products = () => {
  const [products] = useState<Product[]>(mockProducts);

  return (
    <main className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Products</h1>
        <button className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700">
          Add Product
        </button>
      </div>
      
      {products.length === 0 ? (
        <div className="panel-card text-center py-12">
          <h3 className="text-lg font-medium text-white">No products found</h3>
          <p className="mt-1 text-sm text-gray-400">Get started by adding your first product.</p>
          <button className="mt-4 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700">
            Add Product
          </button>
        </div>
      ) : (
        <div className="panel-card overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-800">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Name</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">SKU</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Stock</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-gray-800/50 divide-y divide-gray-700">
              {products.map((product) => {
                const status = getStatus(product.stock, product.reorderPoint);
                return (
                  <tr key={product.id} className="hover:bg-gray-700/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{product.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-mono">{product.sku}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{product.stock} / {product.reorderPoint}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColors[status]}`}>
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
};

export default Products;