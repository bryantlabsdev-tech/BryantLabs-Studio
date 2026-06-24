import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatRuntimeSmokeDetails } from "@/core/greenfield/loadProjectSourcesForSmoke";
import { runtimeSmokeFromProjectFiles } from "@/core/greenfield/runtimeSmokeVerification";

describe("loadProjectSourcesForSmoke helpers", () => {
  it("formatRuntimeSmokeDetails lists pass and fail markers", () => {
    const result = runtimeSmokeFromProjectFiles([
      { path: "src/main.tsx", content: "createRoot(document.getElementById('root')!).render(<App />)" },
      { path: "src/App.tsx", content: "<Routes><Route path='/' /></Routes>" },
    ]);
    const formatted = formatRuntimeSmokeDetails(result);
    assert.match(formatted, /React root mounts/);
    assert.match(formatted, /[✓✗]/);
  });
});
