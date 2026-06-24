import type { StressPromptDefinition } from "./types";

function saasPrompt(opts: {
  appName: string;
  tagline: string;
  pages: readonly string[];
  features?: readonly string[];
}): string {
  const featureLines = (opts.features ?? [
    "React Router",
    "Tailwind CSS",
    "localStorage persistence",
    "CRUD flows",
    "filters and search",
    "validation",
    "responsive layout",
    "dashboard KPIs and charts",
  ]).map((f) => `* ${f}`);
  const pageLines = opts.pages.map((p) => `* ${p}`);
  return `
Build ${opts.appName} — ${opts.tagline}

Features:
${featureLines.join("\n")}

Pages:
${pageLines.join("\n")}
`.trim();
}

export const STRESS_PROMPTS: readonly StressPromptDefinition[] = [
  {
    id: "fleetops-pro",
    name: "FleetOps Pro",
    appName: "FleetOps",
    minPages: 8,
    expectedKeywords: ["vehicle", "driver", "dispatch", "maintenance", "fuel"],
    prompt: saasPrompt({
      appName: "FleetOps Pro",
      tagline:
        "fleet management SaaS with vehicles, drivers, dispatch, maintenance, fuel logs, inspections, reports, and settings",
      pages: [
        "Dashboard",
        "Vehicles",
        "Drivers",
        "Dispatch",
        "Maintenance",
        "Fuel Logs",
        "Inspections",
        "Reports",
        "Settings",
      ],
    }),
  },
  {
    id: "medtrack-clinic",
    name: "MedTrack Clinic",
    appName: "MedTrack",
    minPages: 7,
    expectedKeywords: ["patient", "appointment", "prescription", "provider", "billing"],
    prompt: saasPrompt({
      appName: "MedTrack Clinic",
      tagline:
        "clinic management app with patients, appointments, prescriptions, providers, billing, visit notes, and dashboard workflows",
      pages: [
        "Dashboard",
        "Patients",
        "Appointments",
        "Prescriptions",
        "Providers",
        "Billing",
        "Visit Notes",
        "Reports",
      ],
    }),
  },
  {
    id: "legalcase-vault",
    name: "LegalCase Vault",
    appName: "LegalCase",
    minPages: 7,
    expectedKeywords: ["client", "case", "evidence", "deadline", "hearing"],
    prompt: saasPrompt({
      appName: "LegalCase Vault",
      tagline:
        "legal case management app with clients, cases, evidence, documents, deadlines, hearings, notes, and timeline view",
      pages: [
        "Dashboard",
        "Clients",
        "Cases",
        "Evidence",
        "Documents",
        "Deadlines",
        "Hearings",
        "Notes",
        "Reports",
      ],
      features: [
        "React Router",
        "Tailwind CSS",
        "localStorage persistence",
        "CRUD flows",
        "validation",
        "timeline view",
        "role-style sections",
      ],
    }),
  },
  {
    id: "inventory-command",
    name: "Inventory Command Center",
    appName: "Inventory",
    minPages: 7,
    expectedKeywords: ["product", "supplier", "purchase", "stock", "warehouse"],
    prompt: saasPrompt({
      appName: "Inventory Command Center",
      tagline:
        "inventory and warehouse SaaS with products, suppliers, purchase orders, stock movements, low-stock alerts, and reports",
      pages: [
        "Dashboard",
        "Products",
        "Suppliers",
        "Purchase Orders",
        "Stock Movements",
        "Alerts",
        "Reports",
        "Settings",
      ],
      features: [
        "React Router",
        "Tailwind CSS",
        "localStorage persistence",
        "CRUD flows",
        "filters",
        "barcode-style fields",
        "dashboard KPIs",
      ],
    }),
  },
  {
    id: "schoolops-portal",
    name: "SchoolOps Portal",
    appName: "SchoolOps",
    minPages: 7,
    expectedKeywords: ["student", "teacher", "class", "attendance", "grade"],
    prompt: saasPrompt({
      appName: "SchoolOps Portal",
      tagline:
        "school admin portal with students, teachers, classes, attendance, grades, behavior logs, and parent contacts",
      pages: [
        "Dashboard",
        "Students",
        "Teachers",
        "Classes",
        "Attendance",
        "Grades",
        "Behavior Logs",
        "Parent Contacts",
        "Reports",
        "Settings",
      ],
    }),
  },
  {
    id: "repairshop-manager",
    name: "RepairShop Manager",
    appName: "RepairShop",
    minPages: 7,
    expectedKeywords: ["customer", "vehicle", "work order", "estimate", "invoice"],
    prompt: saasPrompt({
      appName: "RepairShop Manager",
      tagline:
        "auto repair shop app with customers, vehicles, work orders, estimates, invoices, technicians, and parts inventory",
      pages: [
        "Dashboard",
        "Customers",
        "Vehicles",
        "Work Orders",
        "Estimates",
        "Invoices",
        "Technicians",
        "Parts Inventory",
        "Service History",
      ],
    }),
  },
  {
    id: "propertymanager-pro",
    name: "PropertyManager Pro",
    appName: "PropertyManager",
    minPages: 7,
    expectedKeywords: ["unit", "tenant", "lease", "rent", "maintenance"],
    prompt: saasPrompt({
      appName: "PropertyManager Pro",
      tagline:
        "property management app with units, tenants, leases, rent payments, maintenance requests, inspections, and notices",
      pages: [
        "Dashboard",
        "Units",
        "Tenants",
        "Leases",
        "Rent Payments",
        "Maintenance Requests",
        "Inspections",
        "Notices",
        "Reports",
      ],
    }),
  },
  {
    id: "eventops-planner",
    name: "EventOps Planner",
    appName: "EventOps",
    minPages: 7,
    expectedKeywords: ["event", "venue", "vendor", "budget", "guest"],
    prompt: saasPrompt({
      appName: "EventOps Planner",
      tagline:
        "event planning SaaS with events, venues, vendors, budgets, tasks, guests, schedules, and reports",
      pages: [
        "Dashboard",
        "Events",
        "Venues",
        "Vendors",
        "Budgets",
        "Tasks",
        "Guests",
        "Schedules",
        "Reports",
      ],
      features: [
        "React Router",
        "Tailwind CSS",
        "localStorage persistence",
        "CRUD flows",
        "status workflows",
        "filters",
        "dashboard KPIs",
      ],
    }),
  },
  {
    id: "hr-command-center",
    name: "HR Command Center",
    appName: "HR Command",
    minPages: 7,
    expectedKeywords: ["employee", "department", "onboarding", "payroll", "performance"],
    prompt: saasPrompt({
      appName: "HR Command Center",
      tagline:
        "HR app with employees, departments, onboarding, time off, performance reviews, payroll summary, and documents",
      pages: [
        "Dashboard",
        "Employees",
        "Departments",
        "Onboarding",
        "Time Off",
        "Performance Reviews",
        "Payroll Summary",
        "Documents",
        "Reports",
      ],
    }),
  },
  {
    id: "restaurantops",
    name: "RestaurantOps",
    appName: "RestaurantOps",
    minPages: 7,
    expectedKeywords: ["menu", "table", "reservation", "order", "kitchen"],
    prompt: saasPrompt({
      appName: "RestaurantOps",
      tagline:
        "restaurant management app with menu items, tables, reservations, orders, kitchen queue, staff, and inventory",
      pages: [
        "Dashboard",
        "Menu Items",
        "Tables",
        "Reservations",
        "Orders",
        "Kitchen Queue",
        "Staff",
        "Inventory",
        "Reports",
      ],
    }),
  },
];

export function stressPromptById(id: string): StressPromptDefinition | undefined {
  return STRESS_PROMPTS.find((p) => p.id === id);
}
