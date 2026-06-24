import * as path from "node:path";
import { promises as fs } from "node:fs";
import { writeBryantlabsJson } from "./safeFs.cjs";
import { isActiveProjectRoot } from "./projectWriteCoordinator.cjs";

const FEATURES_FILE = "features.json";

export interface FeatureInventoryItem {
  id: string;
  label: string;
  present: boolean;
  evidence: string[];
}

export interface FeatureInventoryRecord {
  version: 1;
  projectPath: string;
  updatedAt: number;
  features: FeatureInventoryItem[];
}

function featuresPath(projectRoot: string): string {
  return path.join(projectRoot, ".bryantlabs", FEATURES_FILE);
}

export function emptyFeatureInventory(projectPath: string): FeatureInventoryRecord {
  return {
    version: 1,
    projectPath,
    updatedAt: Date.now(),
    features: [],
  };
}

export function normalizeFeatureInventory(
  raw: unknown,
  projectPath: string,
): FeatureInventoryRecord {
  const base = emptyFeatureInventory(projectPath);
  if (!raw || typeof raw !== "object") return base;
  const data = raw as Partial<FeatureInventoryRecord>;
  const features = Array.isArray(data.features)
    ? data.features.filter(
        (f): f is FeatureInventoryItem =>
          f != null &&
          typeof f === "object" &&
          typeof (f as FeatureInventoryItem).id === "string" &&
          typeof (f as FeatureInventoryItem).label === "string" &&
          typeof (f as FeatureInventoryItem).present === "boolean",
      )
    : [];
  return {
    version: 1,
    projectPath,
    updatedAt:
      typeof data.updatedAt === "number" && data.updatedAt > 0 ? data.updatedAt : Date.now(),
    features,
  };
}

export async function readFeatureInventory(
  projectRoot: string,
): Promise<FeatureInventoryRecord> {
  const file = featuresPath(projectRoot);
  try {
    const raw = await fs.readFile(file, "utf8");
    return normalizeFeatureInventory(JSON.parse(raw), projectRoot);
  } catch {
    return emptyFeatureInventory(projectRoot);
  }
}

export async function writeFeatureInventory(
  projectRoot: string,
  inventory: FeatureInventoryRecord,
): Promise<{ ok: boolean; reason?: string }> {
  if (!isActiveProjectRoot(projectRoot)) {
    return { ok: false, reason: "Project is no longer active." };
  }
  const payload: FeatureInventoryRecord = {
    ...inventory,
    version: 1,
    projectPath: projectRoot,
    updatedAt: Date.now(),
  };
  return writeBryantlabsJson(projectRoot, FEATURES_FILE, payload, "filesystem");
}
