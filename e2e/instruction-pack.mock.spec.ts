import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import {
  closeStudioApp,
  dismissBlockingDialogs,
  fillAgentPrompt,
  getMainWindow,
  launchStudioApp,
  openFixtureProject,
  sendAgentPrompt,
  sudokuFixturePath,
  waitForComposerReady,
} from "./helpers/studio";

const MUTATION_PROMPT =
  "Edit src/App.tsx and add a prominent Start Game button at the top of the board.";

const MARKER_AGENTS = "MARKER_AGENTS_PACK";
const MARKER_STUDIO = "MARKER_STUDIO_RULES";
const MARKER_CURSORRULES = "MARKER_CURSORRULES_FILE";
const MARKER_MDC_A = "MARKER_MDC_ALWAYS_A";
const MARKER_MDC_Z = "MARKER_MDC_ALWAYS_Z";
const MARKER_MDC_SKIP = "MARKER_MDC_SKIP_BODY";
const MARKER_OUTSIDE = "MARKER_OUTSIDE_SYMLINK";

async function hashWorkspace(root: string): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".bryantlabs") continue;
      const abs = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        const rel = path.relative(root, abs).split(path.sep).join("/");
        hashes.set(rel, `symlink:${await fs.readlink(abs)}`);
        continue;
      }
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      const rel = path.relative(root, abs).split(path.sep).join("/");
      const buf = await fs.readFile(abs);
      hashes.set(rel, crypto.createHash("sha256").update(buf).digest("hex"));
    }
  }
  await walk(root);
  return hashes;
}

async function copySudokuWorkspace(): Promise<string> {
  const dest = await fs.mkdtemp(path.join(os.tmpdir(), "bl-instruction-pack-e2e-"));
  await fs.cp(sudokuFixturePath, dest, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}node_modules`),
  });
  return fs.realpath(dest);
}

async function seedInstructionFiles(projectDir: string): Promise<string> {
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "bl-instruction-outside-"));
  const outsideFile = path.join(outside, "secret.md");
  await fs.writeFile(outsideFile, `${MARKER_OUTSIDE}\n`, "utf8");

  await fs.writeFile(path.join(projectDir, "AGENTS.md"), `${MARKER_AGENTS}\n`, "utf8");
  await fs.mkdir(path.join(projectDir, ".bryantlabs"), { recursive: true });
  await fs.writeFile(path.join(projectDir, ".bryantlabs", "rules.md"), `${MARKER_STUDIO}\n`, "utf8");
  await fs.writeFile(path.join(projectDir, ".cursorrules"), `${MARKER_CURSORRULES}\n`, "utf8");
  await fs.mkdir(path.join(projectDir, ".cursor", "rules"), { recursive: true });
  await fs.writeFile(
    path.join(projectDir, ".cursor", "rules", "aaa.mdc"),
    `---\nalwaysApply: true\n---\n${MARKER_MDC_A}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(projectDir, ".cursor", "rules", "zzz.mdc"),
    `---\nalwaysApply: true\n---\n${MARKER_MDC_Z}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(projectDir, ".cursor", "rules", "skip.mdc"),
    `---\nalwaysApply: false\n---\n${MARKER_MDC_SKIP}\n`,
    "utf8",
  );
  await fs.symlink(outsideFile, path.join(projectDir, "escape.mdc"));
  await fs.symlink(outsideFile, path.join(projectDir, ".cursor", "rules", "escape.mdc"));
  return outside;
}

async function selectAskMode(page: Page): Promise<void> {
  const ask = page.getByTestId("composer-mode-ask");
  if (!(await ask.isVisible().catch(() => false))) {
    const options = page.getByRole("button", { name: /^Options$/i });
    if (await options.isVisible().catch(() => false)) {
      await options.click();
    }
  }
  await expect(ask).toBeVisible();
  await ask.click();
  await expect(ask).toHaveAttribute("aria-pressed", "true");
}

test.describe("Project instruction pack (mock provider)", () => {
  let app: ElectronApplication | undefined;
  let page: Page;
  let projectDir = "";
  let outsideDir = "";

  test.afterAll(async () => {
    await closeStudioApp(app);
    if (projectDir) await fs.rm(projectDir, { recursive: true, force: true }).catch(() => undefined);
    if (outsideDir) await fs.rm(outsideDir, { recursive: true, force: true }).catch(() => undefined);
  });

  test("Ask mutation keeps hashes and loads only eligible instruction sources", async () => {
    projectDir = await copySudokuWorkspace();
    app = await launchStudioApp();
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await openFixtureProject(page, projectDir);
    await waitForComposerReady(page);

    outsideDir = await seedInstructionFiles(projectDir);
    const beforeHashes = await hashWorkspace(projectDir);

    await selectAskMode(page);
    await fillAgentPrompt(page, MUTATION_PROMPT);
    await sendAgentPrompt(page);

    await expect(page.getByText(/Ask mode is read-only/i).first()).toBeVisible({
      timeout: 30_000,
    });

    const captured = await page.evaluate(() => {
      const hooks = window.__studioTestHooks;
      return {
        prompt: hooks?.getLastConsultationPrompt?.() ?? "",
        diagnostic: hooks?.getInstructionPackDiagnostic?.() ?? null,
      };
    });

    const prompt = captured.prompt;
    expect(prompt).toContain(MARKER_AGENTS);
    expect(prompt).toContain(MARKER_STUDIO);
    expect(prompt).toContain(MARKER_CURSORRULES);
    expect(prompt).toContain(MARKER_MDC_A);
    expect(prompt).toContain(MARKER_MDC_Z);
    expect(prompt.indexOf(MARKER_AGENTS)).toBeLessThan(prompt.indexOf(MARKER_STUDIO));
    expect(prompt.indexOf(MARKER_STUDIO)).toBeLessThan(prompt.indexOf(MARKER_CURSORRULES));
    expect(prompt.indexOf(MARKER_MDC_A)).toBeLessThan(prompt.indexOf(MARKER_MDC_Z));
    expect(prompt).not.toContain(MARKER_MDC_SKIP);
    expect(prompt).not.toContain(MARKER_OUTSIDE);

    const loaded = captured.diagnostic?.loaded ?? [];
    expect(loaded).toEqual([
      "AGENTS.md",
      ".bryantlabs/rules.md",
      ".cursorrules",
      ".cursor/rules/aaa.mdc",
      ".cursor/rules/zzz.mdc",
    ]);
    expect(loaded).not.toContain(".cursor/rules/skip.mdc");
    expect(loaded).not.toContain(".cursor/rules/escape.mdc");

    const afterHashes = await hashWorkspace(projectDir);
    const beforePaths = [...beforeHashes.keys()].sort();
    const afterPaths = [...afterHashes.keys()].sort();
    const addedPaths = afterPaths.filter((rel) => !beforeHashes.has(rel));
    const deletedPaths = beforePaths.filter((rel) => !afterHashes.has(rel));
    console.log(`INSTRUCTION_PACK_E2E_EXCLUSIONS ${JSON.stringify(["node_modules", ".git", ".bryantlabs"])}`);
    console.log(`INSTRUCTION_PACK_E2E_PATHS_ADDED ${JSON.stringify(addedPaths)}`);
    console.log(`INSTRUCTION_PACK_E2E_PATHS_DELETED ${JSON.stringify(deletedPaths)}`);
    expect(afterPaths).toEqual(beforePaths);
    const beforeFingerprint = [...beforeHashes.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([rel, hash]) => `${rel}:${hash}`)
      .join("\n");
    const afterFingerprint = [...afterHashes.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([rel, hash]) => `${rel}:${hash}`)
      .join("\n");
    console.log(`INSTRUCTION_PACK_E2E_HASH_BEFORE\n${beforeFingerprint}`);
    console.log(`INSTRUCTION_PACK_E2E_HASH_AFTER\n${afterFingerprint}`);
    expect(afterFingerprint).toBe(beforeFingerprint);
  });
});
