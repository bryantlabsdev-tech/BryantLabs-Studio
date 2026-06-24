import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyMissingPropertyFix,
  defaultValueForProperty,
  parseMissingPropertyError,
  parseTypeProperties,
  patchObjectLiteralMissingProperties,
} from "@/core/typescript/missingPropertyRepair";
import type { TypeScriptDiagnostic } from "@/core/greenfield/tscDiagnostics";

const DRIVER_TYPES = `export interface Driver {
  id: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  email: string;
  phone: string;
  status: "Active" | "Inactive";
}
`;

const DASHBOARD_SOURCE = `import type { Driver } from '../types';

const MOCK_DRIVERS: Driver[] = [
  {
    id: "1",
    firstName: "John",
    lastName: "Doe",
    licenseNumber: "ABC123",
    status: "Active",
  },
];

export default function Dashboard() {
  return <div>{MOCK_DRIVERS.length}</div>;
}
`;

function diag(
  code: string,
  message: string,
  line = 12,
  column = 5,
  file = "src/pages/Dashboard.tsx",
): TypeScriptDiagnostic {
  return {
    file,
    line,
    column,
    code,
    message,
    category: "error",
    raw: message,
  };
}

describe("missingPropertyRepair (A25 FleetOps)", () => {
  it("parses TS2739 missing Driver properties", () => {
    const parsed = parseMissingPropertyError(
      "TS2739",
      "Type '{ id: string; firstName: string; lastName: string; licenseNumber: string; status: \"Active\"; }' is missing the following properties from type 'Driver': email, phone",
    );
    assert.deepEqual(parsed, {
      typeName: "Driver",
      missingProps: ["email", "phone"],
    });
  });

  it("parses TS2741 single missing property", () => {
    const parsed = parseMissingPropertyError(
      "TS2741",
      "Property 'email' is missing in type '{ id: string; }' but required in type 'Driver'.",
    );
    assert.deepEqual(parsed, {
      typeName: "Driver",
      missingProps: ["email"],
    });
  });

  it("patches Dashboard object literal with email and phone defaults", async () => {
    const readFile = async (path: string) =>
      path === "src/types.ts" ? DRIVER_TYPES : null;

    const repaired = await applyMissingPropertyFix(
      "src/pages/Dashboard.tsx",
      DASHBOARD_SOURCE,
      diag(
        "TS2739",
        "Type '{ id: string; firstName: string; lastName: string; licenseNumber: string; status: \"Active\"; }' is missing the following properties from type 'Driver': email, phone",
        4,
        3,
      ),
      readFile,
    );

    assert.ok(repaired);
    assert.match(repaired!.content, /email: ""/);
    assert.match(repaired!.content, /phone: ""/);
    assert.match(repaired!.content, /status: "Active"/);
    assert.doesNotMatch(repaired!.content, /email: undefined/);
  });

  it("uses union literal default for status-like fields from type definition", () => {
    const props = parseTypeProperties(`status: "Active" | "Inactive";`);
    assert.equal(defaultValueForProperty("status", props.get("status")!), '"Active"');
  });

  it("patches without type file using string defaults", () => {
    const patched = patchObjectLiteralMissingProperties(
      DASHBOARD_SOURCE,
      diag("TS2739", "missing the following properties from type 'Driver': email, phone", 4, 3),
      { typeName: "Driver", missingProps: ["email", "phone"] },
      null,
    );
    assert.ok(patched);
    assert.match(patched!, /email: ""/);
    assert.match(patched!, /phone: ""/);
  });

  it("patches Patient nested contact and address objects", async () => {
    const patientTypes = `export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: "Male" | "Female" | "Other";
  contact: { phone: string; email: string; };
  address: { street: string; city: string; state: string; zipCode: string; };
  createdAt: string;
  updatedAt: string;
}
`;
    const source = `import { Patient } from "../types";
const rows: Patient[] = [
  { id: "1", firstName: "Jane", lastName: "Doe", dateOfBirth: "1990-01-01", gender: "Female" },
];
export default function Patients() { return <div>{rows.length}</div>; }
`;
    const readFile = async (path: string) =>
      path === "src/types.ts" ? patientTypes : null;

    const repaired = await applyMissingPropertyFix(
      "src/pages/Patients.tsx",
      source,
      diag(
        "TS2739",
        "Type '{ id: string; firstName: string; lastName: string; dateOfBirth: string; gender: \"Female\"; }' is missing the following properties from type 'Patient': contact, address, createdAt, updatedAt",
        3,
        3,
      ),
      readFile,
    );

    assert.ok(repaired);
    assert.match(repaired!.content, /contact: \{ phone: "", email: "" \}/);
    assert.match(repaired!.content, /address: \{ street: "", city: "", state: "", zipCode: "" \}/);
    assert.match(repaired!.content, /createdAt:/);
    assert.match(repaired!.content, /updatedAt:/);
  });
});
