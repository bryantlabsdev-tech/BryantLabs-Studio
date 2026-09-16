#!/usr/bin/env node
/**
 * Manual Studio vs Cursor pilot harness.
 * Does not launch Studio, Cursor, or any model provider.
 */
import { runPilotCli } from "../benchmarks/cursorParityPilot/cli.ts";

try {
  const code = await runPilotCli(process.argv.slice(2));
  process.exit(code);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
