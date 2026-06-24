// Domain types for the Inventory Command Center application

// --- Status & Union Types ---

export type PurchaseOrderStatus = 'pending' | 'ordered' | 'shipped' | 'received' | 'cancelled';
export type StockMovementType = 'inbound' | 'outbound' | 'adjustment';
export type AlertStatus = 'new' | 'acknowledged' | 'resolved';
export type AlertType = 'low_stock' | 'expiry_soon';

// --- Entity Types ---

export interface Product {
  id: string;
  sku: string; // Stock Keeping Unit, can be used for barcodes
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  supplierId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderLineItem {
  productId: string;
  quantity: number;
  unitPrice: number; // Price at the time of order
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  status: PurchaseOrderStatus;
  lineItems: PurchaseOrderLineItem[];
  createdAt: string;
  expectedAt?: string;
  receivedAt?: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  type: StockMovementType;
  quantityChange: number; // Can be positive or negative
  reason?: string;
  relatedPurchaseOrderId?: string;
  timestamp: string;
}

export interface Alert {
  id: string;
  type: AlertType;
  message: string;
  status: AlertStatus;
  productId: string;
  createdAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
}

export interface Report {
  id: string;
  name: string;
  type: 'inventory_summary' | 'sales_velocity' | 'stock_aging';
  generatedAt: string;
  data: unknown; // The structure depends on the report type
}

export interface Settings {
  userProfile: {
    name: string;
    email: string;
  };
  notifications: {
    lowStockThreshold: number;
    emailAlerts: boolean;
  };
}