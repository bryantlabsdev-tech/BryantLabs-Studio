/**
 * Must load before react-dom so console.error wrapping is visible to React.
 * E2E-only: records max-update-depth without swallowing the original error.
 */
if (import.meta.env.VITE_BRYANTLABS_E2E === "1") {
  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const text = args
      .map((arg) => {
        if (arg instanceof Error) {
          return `${arg.message}\n${arg.stack ?? ""}`;
        }
        return String(arg);
      })
      .join("\n");
    if (/Maximum update depth exceeded/i.test(text)) {
      const w = window as Window & { __studioMaxUpdateDepthErrors?: string[] };
      const trace = `${text}\n${new Error("studio-max-update-depth-trace").stack ?? ""}`;
      w.__studioMaxUpdateDepthErrors = [
        ...(w.__studioMaxUpdateDepthErrors ?? []),
        trace,
      ];
    }
    origError(...args);
  };
}
