import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  monacoProjectTypeLibSpecs,
  monacoReactCompilerPaths,
  monacoTypeLibSpec,
  selectMonacoTypeLibs,
} from "@/monaco/projectTypeLibs";

describe("monaco project type libs", () => {
  it("maps type libs onto the open project path", () => {
    const spec = monacoTypeLibSpec("/Users/dev/app", "node_modules/@types/react/index.d.ts");
    assert.equal(spec.absPath, "/Users/dev/app/node_modules/@types/react/index.d.ts");
  });

  it("includes react and vite client libs for a Vite React app", () => {
    const specs = monacoProjectTypeLibSpecs("/tmp/task-manager");
    const selected = selectMonacoTypeLibs(
      specs,
      JSON.stringify({
        dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
        devDependencies: { vite: "^6.0.0", typescript: "^5.0.0" },
      }),
    );
    assert.ok(selected.some((s) => s.relPath.endsWith("@types/react/index.d.ts")));
    assert.ok(selected.some((s) => s.relPath.endsWith("vite/client.d.ts")));
    assert.ok(selected.some((s) => s.relPath.endsWith("vite/dist/node/index.d.ts")));
    assert.ok(selected.some((s) => s.relPath.endsWith("@vitejs/plugin-react/dist/index.d.ts")));
    assert.ok(selected.some((s) => s.relPath.endsWith("csstype/index.d.ts")));
  });

  it("maps react module names onto the project's @types files", () => {
    const paths = monacoReactCompilerPaths("/tmp/task-manager");
    assert.equal(paths.react?.[0], "node_modules/@types/react/index.d.ts");
    assert.equal(
      paths["react-dom/client"]?.[0],
      "node_modules/@types/react-dom/client.d.ts",
    );
    assert.equal(paths.vite?.[0], "node_modules/vite/dist/node/index.d.ts");
    assert.equal(
      paths["@vitejs/plugin-react"]?.[0],
      "node_modules/@vitejs/plugin-react/dist/index.d.ts",
    );
  });

  it("omits react types when the project has no react dependency", () => {
    const specs = monacoProjectTypeLibSpecs("/tmp/cli");
    const selected = selectMonacoTypeLibs(
      specs,
      JSON.stringify({ dependencies: { express: "^4.0.0" } }),
    );
    assert.equal(
      selected.some((s) => s.relPath.includes("@types/react")),
      false,
    );
  });
});
