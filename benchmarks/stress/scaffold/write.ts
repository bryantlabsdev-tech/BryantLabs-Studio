import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { StressPromptDefinition } from "../types";
import {
  buildScaffoldManifest,
  generateAllStressScaffoldProjects,
  type ScaffoldProject,
} from "./generate";
import { resolveScaffoldOutputPath, ScaffoldOutputError } from "./outputGuard";

export const SCAFFOLD_MANIFEST_NAME = "scaffold-manifest.json";

export interface WriteScaffoldOptions {
  readonly output: string;
  readonly overwrite?: boolean;
  readonly allowCorpusOutput?: boolean;
  readonly operator: string;
  readonly tool: string;
  readonly model: string;
  readonly generatedAt?: string;
  readonly prompts?: readonly StressPromptDefinition[];
}

export interface WriteScaffoldResult {
  readonly outputRoot: string;
  readonly projects: readonly ScaffoldProject[];
  readonly manifestPath: string;
  readonly manifest: string;
}

export async function writeDeterministicStressScaffolds(
  options: WriteScaffoldOptions,
): Promise<WriteScaffoldResult> {
  const outputRoot = resolveScaffoldOutputPath({
    output: options.output,
    overwrite: options.overwrite,
    allowCorpusOutput: options.allowCorpusOutput,
  });
  const confirmed = resolveScaffoldOutputPath({
    output: outputRoot,
    overwrite: options.overwrite,
    allowCorpusOutput: options.allowCorpusOutput,
  });
  if (confirmed !== outputRoot) {
    throw new ScaffoldOutputError(
      "Output path changed after validation; refusing to write or overwrite.",
    );
  }
  const projects = generateAllStressScaffoldProjects(options.prompts);
  if (options.overwrite && existsSync(outputRoot)) {
    await rm(outputRoot, { recursive: true, force: true });
  }
  await mkdir(outputRoot, { recursive: true });
  for (const project of projects) {
    const projectRoot = join(outputRoot, project.id);
    await mkdir(projectRoot, { recursive: true });
    for (const relativePath of Object.keys(project.files).sort()) {
      const abs = join(projectRoot, relativePath);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, project.files[relativePath]!, "utf8");
    }
  }
  const manifest = buildScaffoldManifest({
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    operator: options.operator,
    tool: options.tool,
    model: options.model,
    outputRoot,
    projects,
  });
  const manifestPath = join(outputRoot, SCAFFOLD_MANIFEST_NAME);
  await writeFile(manifestPath, manifest, "utf8");
  return { outputRoot, projects, manifestPath, manifest };
}
