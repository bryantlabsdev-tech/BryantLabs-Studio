import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractPreviewUrl,
  normalizePreviewUrl,
  stripAnsi,
} from "./previewUrlParse.cjs";

/**
 * Reconstructed from a real failure: preview timed out while stdout contained
 * a colored Vite "Local:" line (ANSI inside and around the URL).
 */
const VITE_PREVIEW_STDOUT_WITH_ANSI = [
  "",
  "  \x1b[32m\x1b[1mVITE\x1b[22m v5.4.21\x1b[39m  \x1b[2mready in\x1b[22m \x1b[0m234\x1b[0m\x1b[2m ms\x1b[22m",
  "",
  "  \x1b[32m➜\x1b[39m  \x1b[1mLocal\x1b[22m:   \x1b[36mhttp://127.0.0.1:4173/\x1b[39m",
  "  \x1b[32m➜\x1b[39m  \x1b[1mNetwork\x1b[22m: use \x1b[33m--host\x1b[39m to expose",
  "",
].join("\n");

/** ANSI split across the URL (common when only the host is colored). */
const VITE_URL_ANSI_INTERSPERSED =
  "  ➜  Local:   http://\x1b[36m127.0.0.1:4173/\x1b[39m\n";

describe("stripAnsi", () => {
  it("removes color codes around Local line", () => {
    const cleaned = stripAnsi(VITE_PREVIEW_STDOUT_WITH_ANSI);
    assert.match(cleaned, /Local:\s+http:\/\/127\.0\.0\.1:4173\//);
    assert.ok(!cleaned.includes("\x1b["));
  });
});

describe("extractPreviewUrl", () => {
  it("parses URL from exact failure-report style stdout", () => {
    const url = extractPreviewUrl(VITE_PREVIEW_STDOUT_WITH_ANSI);
    assert.equal(url, "http://127.0.0.1:4173/");
  });

  it("parses URL when ANSI appears inside the URL", () => {
    const url = extractPreviewUrl(VITE_URL_ANSI_INTERSPERSED);
    assert.equal(url, "http://127.0.0.1:4173/");
  });

  it("parses localhost and normalizes to 127.0.0.1", () => {
    const url = extractPreviewUrl(
      "  ➜  Local:   http://localhost:4173/\n",
    );
    assert.equal(url, "http://127.0.0.1:4173/");
  });

  it("parses plain Local line without ANSI", () => {
    const url = extractPreviewUrl("  ➜  Local:   http://127.0.0.1:4173/\n");
    assert.equal(url, "http://127.0.0.1:4173/");
  });

  it("returns null when no local preview URL", () => {
    assert.equal(extractPreviewUrl("starting preview...\n"), null);
  });

  it("parses OSC 8 terminal hyperlinks", () => {
    const url = extractPreviewUrl(
      "  ➜  Local:   \x1b]8;;http://127.0.0.1:4173/\x07\n",
    );
    assert.equal(url, "http://127.0.0.1:4173/");
  });

  it("parses bare host:port after Local line", () => {
    const url = extractPreviewUrl("  ➜  Local:   127.0.0.1:4173/\n");
    assert.equal(url, "http://127.0.0.1:4173/");
  });
});

describe("normalizePreviewUrl", () => {
  it("adds trailing slash path", () => {
    assert.equal(normalizePreviewUrl("http://127.0.0.1:4173"), "http://127.0.0.1:4173/");
  });
});
