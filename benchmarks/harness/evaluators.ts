import type { BenchmarkCheck } from "../types";

export function check(
  id: string,
  label: string,
  passed: boolean,
  expected?: string,
  actual?: string,
): BenchmarkCheck {
  return { id, label, passed, expected, actual };
}

export function allPassed(checks: readonly BenchmarkCheck[]): boolean {
  return checks.every((c) => c.passed);
}

export function passRate(checks: readonly BenchmarkCheck[]): number {
  if (checks.length === 0) return 0;
  return checks.filter((c) => c.passed).length / checks.length;
}

export async function timed<T>(fn: () => Promise<T> | T): Promise<{ result: T; durationMs: number }> {
  const started = performance.now();
  const result = await fn();
  return { result, durationMs: Math.round(performance.now() - started) };
}
