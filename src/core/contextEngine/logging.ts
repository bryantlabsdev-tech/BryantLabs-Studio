export function logContextBuild(task: string, files: readonly string[]): void {
  console.log(`[context:build] task=${task} files=${files.join(",")}`);
}

export function logContextTokens(estimated: number, limit: number): void {
  console.log(`[context:tokens] estimated=${estimated} limit=${limit}`);
}

export function logContextCompress(
  before: number,
  after: number,
  reason: string,
): void {
  console.log(
    `[context:compress] before=${before} after=${after} reason=${reason}`,
  );
}
