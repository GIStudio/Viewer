#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const viewerRoot = path.resolve(path.dirname(scriptPath), "..");
const forwardConsoleToStderr = (...args) => {
  console.error(...args);
};
console.log = forwardConsoleToStderr;
console.info = forwardConsoleToStderr;
console.warn = forwardConsoleToStderr;

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

function requireArg(args, key) {
  const value = String(args[key] ?? "").trim();
  if (!value) {
    throw new Error(`Missing --${key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`);
  }
  return value;
}

function decodeDataUrl(dataUrl) {
  const text = String(dataUrl || "");
  const marker = ";base64,";
  const markerIndex = text.indexOf(marker);
  if (!text.startsWith("data:image/") || markerIndex < 0) {
    throw new Error("Capture result did not contain an image data URL");
  }
  return Buffer.from(text.slice(markerIndex + marker.length), "base64");
}

function fileApiUrl(baseUrl, filePath) {
  const prefix = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${prefix}/api/file?path=${encodeURIComponent(filePath)}`;
}

async function startViewerServer() {
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: path.join(viewerRoot, "vite.config.ts"),
    root: viewerRoot,
    logLevel: "error",
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
    },
  });
  await server.listen();
  const urls = server.resolvedUrls?.local ?? [];
  const url = urls.find((item) => item.startsWith("http://127.0.0.1")) || urls[0];
  if (!url) {
    await server.close();
    throw new Error("Vite did not report a local viewer URL");
  }
  return { server, url };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const layoutPath = path.resolve(requireArg(args, "layout"));
  const glbPath = path.resolve(requireArg(args, "glb"));
  const targetPath = path.resolve(requireArg(args, "targets"));
  const outDir = path.resolve(requireArg(args, "out"));
  const width = Math.max(64, Number.parseInt(String(args.width ?? "1280"), 10) || 1280);
  const height = Math.max(64, Number.parseInt(String(args.height ?? "720"), 10) || 720);
  const targetsPayload = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
  const targets = Array.isArray(targetsPayload.targets) ? targetsPayload.targets : [];
  fs.mkdirSync(outDir, { recursive: true });

  let server;
  let viewerUrl = String(args.viewerUrl ?? "").trim();
  if (!viewerUrl) {
    const started = await startViewerServer();
    server = started.server;
    viewerUrl = started.url;
  }

  let browser;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        console.error(`[viewer:${message.type()}] ${message.text()}`);
      }
    });
    const url = new URL(viewerUrl);
    url.searchParams.set("layout", layoutPath);
    url.searchParams.set("capture", "1");
    await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => typeof window.__roadgen3dCaptureGallery === "function",
      null,
      { timeout: 60_000 },
    );
    const result = await page.evaluate(
      async (payload) => window.__roadgen3dCaptureGallery(payload),
      {
        layoutPath,
        glbUrl: fileApiUrl(viewerUrl, glbPath),
        targets,
        width,
        height,
      },
    );
    const written = [];
    for (let index = 0; index < (result.views ?? []).length; index += 1) {
      const view = result.views[index];
      const targetId = String(view.target_id || `capture_${index + 1}`)
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "_")
        .replace(/^_+|_+$/g, "") || `capture_${index + 1}`;
      const filename = `${String(index + 1).padStart(2, "0")}_${targetId}.png`;
      const imagePath = path.join(outDir, filename);
      fs.writeFileSync(imagePath, decodeDataUrl(view.image_data_url));
      written.push({
        target_id: String(view.target_id || targetId),
        kind: String(view.kind || "view"),
        label: String(view.label || targetId),
        path: imagePath,
        width: Number(view.width || width),
        height: Number(view.height || height),
      });
    }
    process.stdout.write(JSON.stringify({ status: "succeeded", views: written }, null, 2));
  } finally {
    if (browser) {
      await browser.close();
    }
    if (server) {
      await server.close();
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
