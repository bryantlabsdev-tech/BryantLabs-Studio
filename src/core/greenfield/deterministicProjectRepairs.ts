import { repairTruncatedPageSource } from "@/core/greenfield/generatedSourceHardening";
import { applyQuickRepairsForFileAsync } from "@/core/greenfield/quickRepair";
import { shouldAlignUseStateWithRelaxedMock } from "@/core/greenfield/repairConvergencePolicy";
import { applyGreenfieldFileLevelFixes } from "@/core/typescript/greenfieldQuickFixes";
import {
  repairIconLibrariesInProject,
} from "@/core/typescript/iconLibraryRepair";
import { repairTypesFromDiagnostics } from "@/core/typescript/projectWideRepairs";
import { repairMissingContextModule } from "@/core/typescript/missingContextRepair";
import { applySyntaxCorruptionRepairs } from "@/core/typescript/syntaxCorruptionRepair";
import { alignUseStateWithRelaxedMock } from "@/core/typescript/intersectionTypeRepair";
import { cleanCorruptedTypeDefinitions } from "@/core/typescript/projectWideRepairs";
import {
  augmentStudentEnrollmentStatus,
  repairBrokenDocumentMockArray,
  repairExtendedCaseMockLiterals,
  repairBehaviorLogMockLiterals,
  repairHearingMockLiterals,
  repairMisappliedStatusCasts,
  repairOptionalDateConstruction,
  repairPurchaseOrderMockLiterals,
  repairReportMockLiterals,
  repairReportIconJsxUsage,
  repairStockMovementMockLiterals,
  repairVisitNoteMockLiterals,
  repairReportPageLocalIconStubs,
  repairReportsMissingIconImports,
  repairStudentProfileMockLiterals,
  repairStudentListMockLiterals,
  repairTeacherListMockLiterals,
  repairStringForObjectProperties,
  repairNoteMockLiterals,
  relaxReportIconCallbackTypes,
  augmentBehaviorLogDisplayFields,
  augmentCaseRelaxedFields,
  augmentHearingTypeFields,
  augmentReportInfoIconType,
  addStatusFallbackForBadgeProps,
  relaxNoteTagTypes,
  collapseDuplicateMockProperties,
} from "@/core/typescript/mockDataRepair";
import {
  extractExportedTypeNames,
  restoreRelaxedPageMockTypes,
} from "@/core/typescript/relaxedMockRestore";
import {
  buildTypeScriptCheckDetailsFromCommand,
} from "@/core/greenfield/tscDiagnostics";
import {
  DEFAULT_DETERMINISTIC_REPAIR_MAX_PASSES,
  type DeterministicRepairAttempt,
  type ProjectRepairIO,
  type ProjectRepairResult,
} from "@/core/greenfield/projectRepairTypes";
import { RepairConvergenceTracker } from "@/core/greenfield/repairOscillationGuard";


async function repairProjectIconLibraries(
  io: ProjectRepairIO,
  pass: number,
  attempts: DeterministicRepairAttempt[],
): Promise<boolean> {
  const sources = await io.loadSourceMap();
  const repaired = repairIconLibrariesInProject(sources);
  if (!repaired.changed) return false;

  for (const [path, content] of repaired.files) {
    const previous = sources.get(path);
    if (previous === content) continue;
    await io.writeFile( path, content);
    if (path === "src/components/IconStub.tsx") {
      attempts.push({
        attempt: pass,
        kind: "deterministic",
        targetPath: path,
        outcome: "applied",
        detail: "generated icon stub module",
      });
    } else {
      attempts.push({
        attempt: pass,
        kind: "deterministic",
        targetPath: path,
        outcome: "applied",
        detail: "rewrote icon library import to IconStub",
      });
    }
  }
  return true;
}

async function applySyntaxAndTruncationRepairs(
  io: ProjectRepairIO,
  pass: number,
  attempts: DeterministicRepairAttempt[],
): Promise<boolean> {
  const allSources = await io.loadSourceMap();
  let changed = false;
  for (const [relPath, fileContent] of allSources) {
    let working = fileContent;
    const truncated = repairTruncatedPageSource(working, relPath);
    if (truncated.repaired) working = truncated.content;
    const syntaxFix = applySyntaxCorruptionRepairs(working);
    if (syntaxFix) working = syntaxFix;
    const docFix = repairBrokenDocumentMockArray(working);
    if (docFix) working = docFix;
    const studentMocks = repairStudentProfileMockLiterals(working);
    if (studentMocks) working = studentMocks;
    const studentListMocks = repairStudentListMockLiterals(working);
    if (studentListMocks) working = studentListMocks;
    const teacherListMocks = repairTeacherListMockLiterals(working);
    if (teacherListMocks) working = teacherListMocks;
    const noteMocks = repairNoteMockLiterals(working);
    if (noteMocks) working = noteMocks;
    const caseMocks = repairExtendedCaseMockLiterals(working);
    if (caseMocks) working = caseMocks;
    const hearingMocks = repairHearingMockLiterals(working);
    if (hearingMocks) working = hearingMocks;
    const behaviorMocks = repairBehaviorLogMockLiterals(working);
    if (behaviorMocks) working = behaviorMocks;
    const visitNoteMocks = repairVisitNoteMockLiterals(working);
    if (visitNoteMocks) working = visitNoteMocks;
    const poMocks = repairPurchaseOrderMockLiterals(working);
    if (poMocks) working = poMocks;
    const stockMocks = repairStockMovementMockLiterals(working);
    if (stockMocks) working = stockMocks;
    const dateCalls = repairOptionalDateConstruction(working);
    if (dateCalls) working = dateCalls;
    const reportIcons = relaxReportIconCallbackTypes(working);
    if (reportIcons) working = reportIcons;
    const reportImports = repairReportsMissingIconImports(working);
    if (reportImports) working = reportImports;
    const reportStubs = repairReportPageLocalIconStubs(working);
    if (reportStubs) working = reportStubs;
    const reportMocks = repairReportMockLiterals(working);
    if (reportMocks) working = reportMocks;
    const reportIconJsx = repairReportIconJsxUsage(working);
    if (reportIconJsx) working = reportIconJsx;
    const statusCasts = repairMisappliedStatusCasts(working);
    if (statusCasts) working = statusCasts;
    const statusFallbacks = addStatusFallbackForBadgeProps(working);
    if (statusFallbacks) working = statusFallbacks;
    const stringObjFix = repairStringForObjectProperties(working);
    if (stringObjFix) working = stringObjFix;
    const deduped = collapseDuplicateMockProperties(working);
    if (deduped) working = deduped;
    if (working === fileContent) continue;
    await io.writeFile( relPath, working);
    attempts.push({
      attempt: pass,
      kind: "deterministic",
      targetPath: relPath,
      outcome: "applied",
      detail: "repaired truncated or corrupted syntax",
    });
    changed = true;
  }
  return changed;
}

async function applyMockLiteralCleanup(
  io: ProjectRepairIO,
  pass: number,
  attempts: DeterministicRepairAttempt[],
): Promise<boolean> {
  const typesSource = await io.readFile( "src/types.ts");
  const knownTypes = typesSource ? extractExportedTypeNames(typesSource) : new Set<string>();
  const allSources = await io.loadSourceMap();
  let changed = false;
  for (const [relPath, fileContent] of allSources) {
    let working = fileContent;
    const restored = restoreRelaxedPageMockTypes(working, relPath, knownTypes);
    if (restored) working = restored;
    for (const fix of [
  repairStudentProfileMockLiterals,
  repairStudentListMockLiterals,
  repairTeacherListMockLiterals,
  repairNoteMockLiterals,
      repairExtendedCaseMockLiterals,
      repairHearingMockLiterals,
      repairBehaviorLogMockLiterals,
      repairVisitNoteMockLiterals,
      repairPurchaseOrderMockLiterals,
      repairStockMovementMockLiterals,
      repairOptionalDateConstruction,
      relaxReportIconCallbackTypes,
      repairReportsMissingIconImports,
      repairReportMockLiterals,
      repairReportIconJsxUsage,
      repairMisappliedStatusCasts,
      repairStringForObjectProperties,
    ]) {
      const next = fix(working);
      if (next) working = next;
    }
    const deduped = collapseDuplicateMockProperties(working);
    if (deduped) working = deduped;
    if (working === fileContent) continue;
    await io.writeFile( relPath, working);
    attempts.push({
      attempt: pass,
      kind: "deterministic",
      targetPath: relPath,
      outcome: "applied",
      detail: "completed mock literal fields",
    });
    changed = true;
  }
  return changed;
}

async function applyRelaxedMockTypeRestore(
  io: ProjectRepairIO,
  pass: number,
  attempts: DeterministicRepairAttempt[],
): Promise<boolean> {
  const typesSource = await io.readFile( "src/types.ts");
  if (!typesSource) return false;

  const knownTypes = extractExportedTypeNames(typesSource);
  const allSources = await io.loadSourceMap();
  let changed = false;

  for (const [relPath, fileContent] of allSources) {
    const restored = restoreRelaxedPageMockTypes(fileContent, relPath, knownTypes);
    if (!restored || restored === fileContent) continue;
    await io.writeFile( relPath, restored);
    attempts.push({
      attempt: pass,
      kind: "deterministic",
      targetPath: relPath,
      outcome: "applied",
      detail: "restored typed page mock arrays",
    });
    changed = true;
  }

  return changed;
}

async function applyShellExportRepairs(
  io: ProjectRepairIO,
  pass: number,
  attempts: DeterministicRepairAttempt[],
): Promise<boolean> {
  let changed = false;
  for (const shellPath of ["src/components/IconStub.tsx", "src/components/Layout.tsx", "src/components/Sidebar.tsx", "src/App.tsx"]) {
    const shellContent = await io.readFile( shellPath);
    if (shellContent == null) continue;
    const shellFix = applyGreenfieldFileLevelFixes(shellPath, shellContent);
    if (shellFix && shellFix.content !== shellContent) {
      await io.writeFile( shellPath, shellFix.content);
      attempts.push({
        attempt: pass,
        kind: "deterministic",
        targetPath: shellPath,
        outcome: "applied",
        detail: shellFix.fixes.join(", "),
      });
      changed = true;
    }
  }
  return changed;
}

async function applyQuickRepairsAcrossProject(
  io: ProjectRepairIO,
  pass: number,
  attempts: DeterministicRepairAttempt[],
  diagnostics: ReturnType<typeof buildTypeScriptCheckDetailsFromCommand>["diagnostics"],
): Promise<boolean> {
  const files = [...new Set(diagnostics.map((d) => d.file.replace(/\\/g, "/")))];
  let changed = false;

  for (const relPath of files) {
    const content = await io.readFile( relPath);
    if (content == null) continue;

    const repaired = await applyQuickRepairsForFileAsync(
      relPath,
      content,
      diagnostics,
      (path) => io.readFile(path),
    );

    if (repaired?.extraFiles) {
      for (const [extraPath, extraContent] of Object.entries(repaired.extraFiles)) {
        const existing = await io.readFile( extraPath);
        const extraLevel = applyGreenfieldFileLevelFixes(extraPath, extraContent);
        const toWrite = extraLevel?.content ?? extraContent;
        if (existing === toWrite) continue;
        await io.writeFile( extraPath, toWrite);
        attempts.push({
          attempt: pass,
          kind: "deterministic",
          targetPath: extraPath,
          outcome: "applied",
          detail: extraLevel?.fixes.join(", ") ?? "export/import or types repair",
        });
        changed = true;
      }
    }

    if (repaired && repaired.content !== content) {
      await io.writeFile( relPath, repaired.content);
      attempts.push({
        attempt: pass,
        kind: "deterministic",
        targetPath: relPath,
        outcome: "applied",
        detail: repaired.fixes.join(", "),
      });
      changed = true;
    }
  }

  return changed;
}

export async function applyDeterministicRepairs(
  io: ProjectRepairIO,
  maxPasses = DEFAULT_DETERMINISTIC_REPAIR_MAX_PASSES,
): Promise<ProjectRepairResult> {
  const attempts: DeterministicRepairAttempt[] = [];
  let deterministicPasses = 0;
  const convergence = new RepairConvergenceTracker();
  const recordRepairPass = () => {
    convergence.markRepairsApplied();
    deterministicPasses += 1;
  };

  for (let pass = 1; pass <= maxPasses; pass++) {
    const tsc = await io.runTypecheck();
    convergence.beginPass(tsc.stdout, tsc.stderr);

    if (convergence.shouldStopForOscillation()) {
      return {
        attempts,
        deterministicPasses,
        typecheckOk: false,
        stderr: `${tsc.stdout}\n${tsc.stderr}`,
        stoppedForOscillation: true,
      };
    }

    if (tsc.exitCode === 0 && !tsc.timedOut) {
      return {
        attempts,
        deterministicPasses,
        typecheckOk: true,
        stderr: tsc.stderr,
        stoppedForOscillation: false,
      };
    }

    const tscOutput = `${tsc.stdout}\n${tsc.stderr}`;
    const iconModuleInOutput =
      /Cannot find module ['"]lucide-react|Cannot find module ['"]@heroicons\/react|Cannot find module ['"]react-icons\//.test(
        tscOutput,
      );

    const iconStubInOutput =
      /Module ['"].*IconStub['"] has no exported member/.test(tscOutput);

    if (pass === 1 || iconModuleInOutput || iconStubInOutput) {
      const iconChanged = await repairProjectIconLibraries(io, pass, attempts);
      if (iconChanged) {
        recordRepairPass();
        continue;
      }
    }

    const details = buildTypeScriptCheckDetailsFromCommand({
      command: "npx tsc --noEmit",
      ok: false,
      exitCode: tsc.exitCode ?? 2,
      stdout: tsc.stdout,
      stderr: tsc.stderr,
      durationMs: tsc.durationMs,
      errorCount: 1,
      warningCount: 0,
      timedOut: tsc.timedOut,
      truncated: false,
    });

    if (await applySyntaxAndTruncationRepairs(io, pass, attempts)) {
      recordRepairPass();
      continue;
    }

    if (details.diagnostics.length === 0) break;

    if (await applyShellExportRepairs(io, pass, attempts)) {
      recordRepairPass();
      continue;
    }

    if (await applyRelaxedMockTypeRestore(io, pass, attempts)) {
      recordRepairPass();
      continue;
    }

    const appSource = await io.readFile( "src/App.tsx");
    if (appSource) {
      const sourcePaths = new Set((await io.loadSourceMap()).keys());
      const contextRepair = repairMissingContextModule(appSource, sourcePaths);
      if (contextRepair) {
        await io.writeFile( contextRepair.relPath, contextRepair.content);
        attempts.push({
          attempt: pass,
          kind: "deterministic",
          targetPath: contextRepair.relPath,
          outcome: "applied",
          detail: contextRepair.label,
        });
        recordRepairPass();
        continue;
      }
    }

    if (await applyQuickRepairsAcrossProject(io, pass, attempts, details.diagnostics)) {
      recordRepairPass();
      continue;
    }

    if (await applyMockLiteralCleanup(io, pass, attempts)) {
      recordRepairPass();
      continue;
    }

    const shapeResult = await repairTypesFromDiagnostics(
      details.diagnostics,
      (path) => io.readFile(path),
    );
    if (shapeResult) {
      await io.writeFile( "src/types.ts", shapeResult.content);
      attempts.push({
        attempt: pass,
        kind: "deterministic",
        targetPath: "src/types.ts",
        outcome: "applied",
        detail: shapeResult.labels.join(", "),
      });
      recordRepairPass();
      continue;
    }

    const typesSource = await io.readFile( "src/types.ts");
    if (typesSource) {
      let nextTypes = typesSource;
      const cleanedTypes = cleanCorruptedTypeDefinitions(typesSource);
      if (cleanedTypes) nextTypes = cleanedTypes;
      const enrollmentTypes = augmentStudentEnrollmentStatus(nextTypes);
      if (enrollmentTypes) nextTypes = enrollmentTypes;
      const hearingTypes = augmentHearingTypeFields(nextTypes);
      if (hearingTypes) nextTypes = hearingTypes;
      const caseFields = augmentCaseRelaxedFields(nextTypes);
      if (caseFields) nextTypes = caseFields;
      const behaviorFields = augmentBehaviorLogDisplayFields(nextTypes);
      if (behaviorFields) nextTypes = behaviorFields;
      const reportInfoIcon = augmentReportInfoIconType(nextTypes);
      if (reportInfoIcon) nextTypes = reportInfoIcon;
      const noteTags = relaxNoteTagTypes(nextTypes);
      if (noteTags) nextTypes = noteTags;
      if (nextTypes !== typesSource) {
        await io.writeFile( "src/types.ts", nextTypes);
        attempts.push({
          attempt: pass,
          kind: "deterministic",
          targetPath: "src/types.ts",
          outcome: "applied",
          detail: "cleaned or augmented types.ts",
        });
        recordRepairPass();
        continue;
      }
    }

    let alignChanged = false;
    const allSourcesForAlign = await io.loadSourceMap();
    for (const [relPath, fileContent] of allSourcesForAlign) {
      if (!shouldAlignUseStateWithRelaxedMock(relPath)) continue;
      const aligned = alignUseStateWithRelaxedMock(fileContent);
      if (!aligned || aligned === fileContent) continue;
      await io.writeFile( relPath, aligned);
      attempts.push({
        attempt: pass,
        kind: "deterministic",
        targetPath: relPath,
        outcome: "applied",
        detail: "aligned useState with relaxed mock array",
      });
      alignChanged = true;
    }
    if (alignChanged) {
      recordRepairPass();
      continue;
    }

    break;
  }

  const finalTsc = await io.runTypecheck();
  return {
    attempts,
    deterministicPasses,
    typecheckOk: finalTsc.exitCode === 0 && !finalTsc.timedOut,
    stderr: `${finalTsc.stdout}\n${finalTsc.stderr}`,
    stoppedForOscillation: false,
  };
}

