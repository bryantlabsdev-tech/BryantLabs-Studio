// Domain types for RepairShop Manager App

// --- Base ---
export type EntityId = string;

// --- Status Unions ---
export type WorkOrderStatus = 'Pending' | 'In Progress' | 'Awaiting Parts' | 'Completed' | 'Cancelled';
export type EstimateStatus = 'Draft' | 'Sent' | 'Approved' | 'Declined';
export type InvoiceStatus = 'Draft' | 'Sent' | 'Paid' | 'Overdue' | 'Void';

// --- Entities ---

export interface Customer {
  id: EntityId;
  name: string;
  phone: string;
  email?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
}

export interface Vehicle {
  id: EntityId;
  customerId: EntityId;
  make: string;
  model: string;
  year: number;
  vin: string;
  licensePlate: string;
}

export interface Technician {
  id: EntityId;
  name: string;
  specialization: string;
  status?: string;
}

export interface Part {
  id: EntityId;
  name: string;
  sku: string;
  quantity: number;
  price: number;
  supplier?: string;
}

export interface ServiceItem {
  description: string;
  hours: number;
  rate: number;
}

export interface PartItem {
  partId: EntityId;
  quantity: number;
  unitPrice: number;
}

export interface WorkOrder {
  id: EntityId;
  customerId: EntityId;
  vehicleId: EntityId;
  technicianIds: EntityId[];
  status: WorkOrderStatus;
  services: ServiceItem[];
  parts: PartItem[];
  notes?: string;
  createdDate: string; // ISO 8601 format
  completedDate?: string; // ISO 8601 format
}

export interface Estimate {
  id: EntityId;
  customerId: EntityId;
  vehicleId: EntityId;
  status: EstimateStatus;
  items: (ServiceItem | PartItem)[];
  total: number;
  notes?: string;
  createdDate: string; // ISO 8601 format
  expiryDate: string; // ISO 8601 format
}

export interface Invoice {
  id: EntityId;
  workOrderId: EntityId;
  customerId: EntityId;
  status: InvoiceStatus;
  amount: number;
  issueDate: string; // ISO 8601 format
  dueDate: string; // ISO 8601 format
  paidDate?: string; // ISO 8601 format
}

export interface ServiceHistory {
  id: EntityId;
  vehicleId: EntityId;
  workOrderId: EntityId;
  date: string; // ISO 8601 format
  description: string;
  notes: string;
  mileage: number;
}

// Auto-patched missing exports
export type TechnicianStatus = "Active" | "Inactive" | "Pending" | "Completed" | "Scheduled" | "Cancelled" | "Postponed" | "Draft" | "Open" | "Closed" | "Approved" | "Rejected" | "Paid" | "Overdue" | "General" | "Other";

export interface InventoryPart {
  id: string;
  name: string;
  partNumber?: string;
  supplier?: string;
  quantity?: number;
  price?: number;
}

export interface ServiceRecord {
  id: string;
  notes: string;
  createdAt: string;
  vehicle?: string;
  customerName?: string;
  serviceDate?: string;
  servicesPerformed?: string;
  total?: number;
}
