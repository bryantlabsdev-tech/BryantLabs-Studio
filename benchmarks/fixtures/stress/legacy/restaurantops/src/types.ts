// Status Unions for various domain entities
export type TableStatus = 'Available' | 'Occupied' | 'Reserved';
export type ReservationStatus = 'Confirmed' | 'Seated' | 'Cancelled' | 'No-show';
export type OrderStatus = 'Pending' | 'Preparing' | 'Served' | 'Paid';
export type KitchenQueueStatus = 'Received' | 'Preparing' | 'Ready';
export type StaffRole = 'Manager' | 'Chef' | 'Waiter' | 'Host';
export type StaffStatus = 'Active' | 'Inactive';
export type MenuItemCategory = 'Appetizer' | 'Main Course' | 'Dessert' | 'Beverage';
export type InventoryUnit = 'kg' | 'g' | 'L' | 'ml' | 'units';

// --- Domain Entity Interfaces ---

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: MenuItemCategory;
  imageUrl?: string;
  ingredients: { inventoryItemId: string; quantity: number }[];
}

export interface Table {
  id: string;
  tableNumber: number;
  capacity: number;
  status: TableStatus;
}

export interface Reservation {
  id: string;
  customerName: string;
  customerPhone: string;
  tableId: string;
  reservationTime: string; // ISO 8601 string
  partySize: number;
  status: ReservationStatus;
  notes?: string;
}

export interface OrderItem {
  menuItemId: string;
  quantity: number;
  specialInstructions?: string;
}

export interface Order {
  id: string;
  tableId: string;
  items: OrderItem[];
  status: OrderStatus;
  createdAt: string; // ISO 8601 string
  notes?: string;
}

export interface KitchenQueueItem {
  id: string;
  orderId: string;
  menuItem: Pick<MenuItem, 'id' | 'name'>;
  quantity: number;
  status: KitchenQueueStatus;
  createdAt: string; // ISO 8601 string
}

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  status: StaffStatus;
  phone?: string;
  email?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: InventoryUnit;
  lowStockThreshold: number;
  supplier?: string;
}

// Reports can have various shapes. Here is an example for a sales report.
export interface SalesReport {
  startDate: string; // ISO 8601 string
  endDate: string; // ISO 8601 string
  totalRevenue: number;
  totalOrders: number;
  topSellingItems: {
    menuItemId: string;
    name: string;
    quantitySold: number;
  }[];
}