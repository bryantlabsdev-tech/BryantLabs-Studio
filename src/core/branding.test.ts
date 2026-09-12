import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { brandingAssetUrl, brandingIconForSize } from "@/core/branding";

describe("brandingAssetUrl", () => {
  it("builds relative asset urls for favicon and icons", () => {
    assert.match(brandingAssetUrl("favicon"), /favicon\.ico$/);
    assert.match(brandingAssetUrl("appleTouchIcon"), /apple-touch-icon\.png$/);
    assert.match(brandingAssetUrl("icon512"), /icon-512\.png$/);
  });
});

describe("brandingIconForSize", () => {
  it("selects the nearest generated icon size", () => {
    assert.match(brandingIconForSize(20), /icon-16\.png$/);
    assert.match(brandingIconForSize(40), /icon-32\.png$/);
    assert.match(brandingIconForSize(128), /icon-128\.png$/);
    assert.match(brandingIconForSize(900), /icon-512\.png$/);
    assert.match(brandingIconForSize(1024), /icon-512\.png$/);
  });
});
