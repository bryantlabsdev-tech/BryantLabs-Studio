#!/usr/bin/env node
/**
 * Generate BryantLabs Studio branding assets from the source PNG on Desktop.
 * Outputs to assets/branding/ and copies web icons to public/.
 */
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE =
  process.env.BRYANTLABS_ICON_SOURCE ??
  path.join(process.env.HOME ?? "", "Desktop", "bryantlabsicon.png");
const BRANDING = path.join(ROOT, "assets", "branding");
const PUBLIC = path.join(ROOT, "public");
const ICONSET = path.join(BRANDING, "icon.iconset");

const PNG_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];
const WEB_SIZES = [16, 32, 48, 64, 128, 192, 256, 512];

function run(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

async function generatePng(size, outPath) {
  run(`sips -z ${size} ${size} "${SOURCE}" --out "${outPath}"`);
}

async function main() {
  run(`test -f "${SOURCE}"`);

  await rm(BRANDING, { recursive: true, force: true });
  await rm(PUBLIC, { recursive: true, force: true });
  await mkdir(BRANDING, { recursive: true });
  await mkdir(PUBLIC, { recursive: true });

  await cp(SOURCE, path.join(BRANDING, "bryantlabsicon-source.png"));

  for (const size of PNG_SIZES) {
    await generatePng(size, path.join(BRANDING, `icon-${size}.png`));
  }

  await generatePng(180, path.join(BRANDING, "apple-touch-icon.png"));
  await generatePng(192, path.join(BRANDING, "icon-192.png"));

  await mkdir(ICONSET, { recursive: true });
  const icnsMap = [
    [16, "icon_16x16.png"],
    [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"],
    [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"],
    [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"],
    [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"],
    [1024, "icon_512x512@2x.png"],
  ];
  for (const [size, name] of icnsMap) {
    await generatePng(size, path.join(ICONSET, name));
  }
  run(`iconutil -c icns "${ICONSET}" -o "${path.join(BRANDING, "icon.icns")}"`);
  await rm(ICONSET, { recursive: true, force: true });

  const icoOutput = path.join(BRANDING, "icon.ico");
  const icoInput = path.join(BRANDING, "icon-256.png");
  run(`npx --yes png-to-ico "${icoInput}" > "${icoOutput}"`);

  for (const size of WEB_SIZES) {
    const src =
      size === 192
        ? path.join(BRANDING, "icon-192.png")
        : path.join(BRANDING, `icon-${size}.png`);
    await cp(src, path.join(PUBLIC, `icon-${size}.png`));
  }

  await cp(path.join(BRANDING, "apple-touch-icon.png"), path.join(PUBLIC, "apple-touch-icon.png"));
  await cp(path.join(BRANDING, "icon.ico"), path.join(PUBLIC, "favicon.ico"));
  await cp(path.join(BRANDING, "icon-32.png"), path.join(PUBLIC, "favicon-32x32.png"));
  await cp(path.join(BRANDING, "icon-16.png"), path.join(PUBLIC, "favicon-16x16.png"));

  const manifest = {
    name: "BryantLabs Studio",
    short_name: "BryantLabs",
    description: "Local-first AI app builder",
    start_url: ".",
    display: "standalone",
    background_color: "#0b0d12",
    theme_color: "#0b0d12",
    icons: [
      {
        src: "icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };

  await writeFile(
    path.join(BRANDING, "manifest.webmanifest"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await cp(path.join(BRANDING, "manifest.webmanifest"), path.join(PUBLIC, "manifest.webmanifest"));

  console.log(`Branding assets generated in ${BRANDING}`);
  console.log(`Web icons copied to ${PUBLIC}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
