import { useState } from "react";
import { InspectionStatus } from "../types";

interface Inspection {
  id: string;
  vehicle: string;
  inspector: string;
  date: string;
  status: InspectionStatus;
}

const mockInspections: Inspection[] = [
  { id: "I001", vehicle: "Truck 101", inspector: "John Doe", date: "2023-10-25", status: "Passed" },
  { id: "I002", vehicle: "Van 04", inspector: "Jane Smith", date: "2023-10-22", status: "Failed" },
  { id: "I003", vehicle: "Truck 102", inspector: "John Doe", date: "2023-10-28", status: "Pending" },
  { id:...