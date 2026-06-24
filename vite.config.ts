import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Renderer-only Vite config. The Electron main/preload processes are built
// separately via `tsc` (see electron/tsconfig.json). Using a relative base so
// the built renderer can be loaded from the local filesystem inside Electron.
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/monaco-editor") || id.includes("@monaco-editor")) {
            return "monaco";
          }
          if (
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/react/") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "react-vendor";
          }
          if (id.includes("/src/components/views/BuildView")) {
            return "build-view";
          }
          if (id.includes("/src/components/views/NewAppView")) {
            return "greenfield-view";
          }
          if (id.includes("/src/components/views/ExecutionDashboard")) {
            return "execution-dashboard";
          }
        },
      },
    },
  },
  optimizeDeps: {
    include: ["monaco-editor", "@monaco-editor/react"],
  },
});
