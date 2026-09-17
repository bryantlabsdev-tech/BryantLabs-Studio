/**
 * Toolchain pins copied from the current root `package.json` (documented repository
 * configuration). This module does not read the filesystem.
 */
export const SCAFFOLD_GENERATOR_VERSION = "1";

export const SCAFFOLD_TOOLCHAIN = {
  react: "^19.2.7",
  reactDom: "^19.2.7",
  typesReact: "^19.2.16",
  typesReactDom: "^19.2.3",
  vitePluginReact: "^6.0.2",
  typescript: "^6.0.3",
  vite: "^8.0.16",
} as const;

export const SCAFFOLD_SPECIFICATIONS = [
  "benchmarks/stress/prompts.ts (STRESS_PROMPTS ids, minPages, expectedKeywords, Pages list)",
  "src/core/greenfield/types.ts (GREENFIELD_FILE_PATHS)",
  "package.json (react ^19.2.7, react-dom ^19.2.7, @types/react ^19.2.16, @types/react-dom ^19.2.3, @vitejs/plugin-react ^6.0.2, typescript ^6.0.3, vite ^8.0.16)",
] as const;
