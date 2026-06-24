import {
  formatRepairReplayReport,
  replayRepairsOnLegacySuite,
} from "../benchmarks/stress/repairReplay.ts";
import { writeReplayArtifacts } from "../benchmarks/stress/history.ts";

const report = await replayRepairsOnLegacySuite();
const markdown = formatRepairReplayReport(report);
const { markdownPath } = await writeReplayArtifacts(report, markdown);

console.log(markdown);
console.log(`\nWrote ${markdownPath}`);

if (!report.targetMet) {
  process.exitCode = 1;
}
