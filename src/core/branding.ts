/** Canonical paths for BryantLabs Studio branding assets (served from /public). */

export const BRANDING = {
  favicon: "favicon.ico",
  favicon16: "favicon-16x16.png",
  favicon32: "favicon-32x32.png",
  appleTouchIcon: "apple-touch-icon.png",
  manifest: "manifest.webmanifest",
  icon16: "icon-16.png",
  icon32: "icon-32.png",
  icon48: "icon-48.png",
  icon64: "icon-64.png",
  icon128: "icon-128.png",
  icon192: "icon-192.png",
  icon256: "icon-256.png",
  icon512: "icon-512.png",
  icon1024: "icon-1024.png",
} as const;

export type BrandingAssetKey = keyof typeof BRANDING;

const SIZE_TO_ASSET: readonly { readonly size: number; readonly key: BrandingAssetKey }[] = [
  { size: 16, key: "icon16" },
  { size: 32, key: "icon32" },
  { size: 48, key: "icon48" },
  { size: 64, key: "icon64" },
  { size: 128, key: "icon128" },
  { size: 192, key: "icon192" },
  { size: 256, key: "icon256" },
  { size: 512, key: "icon512" },
];

export function brandingAssetUrl(key: BrandingAssetKey): string {
  const file = BRANDING[key];
  const base = import.meta.env?.BASE_URL ?? "./";
  return `${base}${file}`;
}

export function brandingIconForSize(size: number): string {
  let match = SIZE_TO_ASSET[0]!;
  for (const entry of SIZE_TO_ASSET) {
    if (size >= entry.size) match = entry;
  }
  return brandingAssetUrl(match.key);
}
