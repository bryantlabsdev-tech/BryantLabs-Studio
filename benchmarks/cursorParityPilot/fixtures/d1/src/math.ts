export function compute(a: number, b: number, op: string): number {
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "*") return a * b;
  if (op === "/") return b === 0 ? Number.NaN : a / b;
  return b;
}

export function add(a: number, b: number): number {
  return a + b;
}

export const PLANTED_ERROR: number = "not-a-number";
