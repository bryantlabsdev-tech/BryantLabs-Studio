// Domain types for Inventory Command Center

// =================================
// Product Entity
// =================================
export interface Product {
  id: string;
  sku: string; // Stock Keeping Unit, barcode-style
  name: string;
  description?: string;
  categoryId: string;
  supplierId: string;
  quantity: number;
  reorderLevel: number;
  costPrice: number;
  sellingPrice: number;
  createdAt: string;
  updatedAt: string;
}

// =================================
// Supplier Entity
// =================================
export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  createdAt: string;
}

// =================================
// Purchase Order Entity
// =================================
export type PurchaseOrderStatus =
  | "Pending"
  | "Ordered"
  | "Shipped"
  | "Received"
  | "Cancelled";

export interface PurchaseOrderItem {
  productId: string;
  quantity: number;
  unitCost: number;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string; // e.g., "PO-2024-001"
  supplierId: string;
  items: PurchaseOrderItem[];
  status: PurchaseOrderStatus;
  orderDate: string;
  expectedDeliveryDate?: string;
  receivedDate?: string;
  totalAmount: number;
  createdAt: string;
}

// =================================
// Stock Movement Entity
// =================================
export type StockMovementType = "Inbound" | "Outbound" | "Adjustment";

export interface StockMovement {
  id: string;
  productId: string;
  type: StockMovementType;
  quantity: number; // Can be negative for outbound/adjustments
  reason?: string; // e.g., "Sale", "Stock Count Correction", "Receiving PO-2024-001"
  relatedOrderId?: string; // Link to PurchaseOrder or SalesOrder
  timestamp: string;
}

// =================================
// Alert Entity
// =================================
export type AlertType = "Low Stock" | "Expiry Date" | "Overstock";
export type AlertStatus = "New" | "Acknowledged" | "Resolved";

export interface Alert {
  id: string;
  type: AlertType;
  productId: string;
  message: string;
  status: AlertStatus;
  createdAt: string;
  resolvedAt?: string;
}

// =================================
// Report Entity (conceptual)
// =================================
export interface Report {
  id: string;
  title: string;
  type: "Inventory Valuation" | "Sales Summary" | "Stock Movement History";
  generatedAt: string;
  data: unknown; // The actual report data structure would vary
}

// =================================
// Settings
// =================================
export interface AppSettings {
  general: {
    appName: string;
    dateFormat: "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
  };
  notifications: {
    emailOnLowStock: boolean;
    pushOnNewOrder: boolean;
  };
}