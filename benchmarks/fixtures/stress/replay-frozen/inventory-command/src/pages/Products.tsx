import { useState } from "react";
import { Product } from "../types";
import { PlusCircle } from "../components/IconStub";

const mockProducts: Product[] = [
  {
    id: "prod_001",
    sku: "HW-CB-01",
    name: "Ceramic Brake Pad Set",
    description: "High-performance ceramic brake pads for sedans.",
    categoryId: "cat_brakes",
    supplierId: "sup_01",
    quantity: 120,
    reorderLevel: 50,
    costPrice: 22.50,
    sellingPrice: 49.99,
    createdAt: "2023-10-01T10:00:00Z",
    updatedAt: "2023-10-28T14:30:00Z",
  },
  {
    id: "prod_002",
    sku: "FIL-OIL-SYN05",
    name: "Synthetic Oil Filter",
    description: "Premium synthetic oil filter, fits most models.",
    categoryId: "cat_filters",
    supplierId: "sup_02",
    quantity: 45,
    reorderLevel: 50,
    costPrice: 5.75,
    sellingPrice: 12.99,
    createdAt: "2023-09-15T09:00:00Z",
    updatedAt: "2023-10-25T11:00:00Z",
  },
  {
    id: "prod_003",
    sku: "BAT-AGM-H7",
    name: "AGM Battery H7/94R",
    description: "Absorbent Glass Mat battery for modern vehicles.",
    categoryId: "cat_electrical",
    supplierId: "sup_01",
    quantity: 0,
    reorderLevel: 10,
    costPrice: 95.00,
    sellingPrice: 189.99,
    createdAt: "2023-08-20T12:00:00Z",
    updatedAt: "2023-10-29T18:00:00Z",
  },
];

const getStockStatus = (quantity: number, reorderLevel: number) => {
  if (quantity === 0) {
    return <span className="inline-flex items-center rounded-md bg-red-800/50 px-2 py-1 text-xs font-medium text-red-300 ring-1 ring-inset ring-red-500/50">Out of Stock</span>;
  }
  if (quantity <= reorderLevel) {
    return <span className="inline-flex items-center rounded-md bg-yellow-800/50 px-2 py-1 text-xs font-medium text-yellow-300 ring-1 ring-inset ring-yellow-500/50">Low Stock</span>;
  }
  return <span className="inline-flex items-center rounded-md bg-green-800/50 px-2 py-1 text-xs font-medium text-green-300 ring-1 ring-inset ring-green-500/50">In Stock</span>;
};

const Products = () => {
  const [products] = useState<Product[]>(mockProducts);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Products</h1>
        <button className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
          <PlusCircle className="h-4 w-4" />
          Add Product
        </button>
      </div>

      <div className="panel-card overflow-x-auto">
        {products.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400">No products found.</p>
            <button className="mt-4 flex mx-auto items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
              <PlusCircle className="h-4 w-4" />
              Add Your First Product
            </button>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-800">
              <tr>
                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-300 sm:pl-6">SKU</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-300">Name</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-300">Status</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-300">Quantity</th>
                <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6"><span className="sr-only">Edit</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 bg-gray-900">
              {products.map((product) => (
                <tr key={product.id}>
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-mono text-gray-400 sm:pl-6">{product.sku}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">{product.name}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm">{getStockStatus(product.quantity, product.reorderLevel)}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">{product.quantity}</td>
                  <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                    <a href="#" className="text-indigo-400 hover:text-indigo-300">Edit</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Products;