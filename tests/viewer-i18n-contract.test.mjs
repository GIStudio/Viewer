import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const viewerRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = path.join(viewerRoot, "src");
const catalogPath = path.join(sourceRoot, "viewer-i18n.ts");
const markerAttributes = [
  "data-i18n-key",
  "data-i18n-title-key",
  "data-i18n-aria-label-key",
  "data-i18n-placeholder-key",
];
const activeRoots = [
  "react",
  "viewer-panels",
  "scene-graph",
];
const activeFiles = [
  "app.ts",
  "asset-editor.ts",
  "scene-graph.ts",
  "model-input-browser.ts",
  "compare-mode.ts",
  "desktop-shell-adapter.ts",
  "desktop-shell.ts",
  "viewer-design-controller.ts",
  "viewer-design-matrix.ts",
  "viewer-design-workspace.ts",
  "viewer-branch-workspace.ts",
  "viewer-evaluation.ts",
  "viewer-evaluation-runner.ts",
  "viewer-evaluation-capture.ts",
  "viewer-history-panel.ts",
  "history-trend-chart.ts",
  "history-frequency-chart.ts",
  "history-scatter-plot.ts",
  "history-three-system-scores.ts",
];

function stringValue(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null;
}

function propertyName(node) {
  if (ts.isIdentifier(node)) return node.text;
  return stringValue(node);
}

function placeholderSet(value) {
  return [...value.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort();
}

function parseCatalog(sourceText) {
  const sourceFile = ts.createSourceFile(catalogPath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let catalogObject = null;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "TRANSLATIONS" && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      catalogObject = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  assert.ok(catalogObject, "TRANSLATIONS must remain an object literal that contract checks can inspect");

  const catalog = new Map();
  for (const property of catalogObject.properties) {
    assert.ok(ts.isPropertyAssignment(property), "TRANSLATIONS entries must be property assignments");
    const key = stringValue(property.name);
    assert.ok(key, "TRANSLATIONS keys must be string literals");
    assert.ok(!catalog.has(key), `duplicate translation key: ${key}`);
    assert.ok(ts.isObjectLiteralExpression(property.initializer), `${key} must contain en and zh values`);
    const values = {};
    for (const localeProperty of property.initializer.properties) {
      if (!ts.isPropertyAssignment(localeProperty)) continue;
      const locale = propertyName(localeProperty.name);
      const value = stringValue(localeProperty.initializer);
      if (locale && value !== null) values[locale] = value;
    }
    assert.equal(typeof values.en, "string", `${key} is missing English text`);
    assert.equal(typeof values.zh, "string", `${key} is missing Simplified Chinese text`);
    assert.notEqual(values.en.trim(), "", `${key} has empty English text`);
    assert.notEqual(values.zh.trim(), "", `${key} has empty Simplified Chinese text`);
    assert.deepEqual(placeholderSet(values.en), placeholderSet(values.zh), `${key} has mismatched interpolation placeholders`);
    catalog.set(key, values);
  }
  return catalog;
}

async function collectFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(entryPath));
    else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) files.push(entryPath);
  }
  return files;
}

function collectLiteralLookupKeys(sourceFile) {
  const keys = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && (node.expression.text === "translateViewerKey" || node.expression.text === "formatViewerKey")) {
      const keyArgument = node.arguments[1];
      const key = keyArgument && stringValue(keyArgument);
      if (key) keys.push(key);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return keys;
}

const catalogSource = await fs.readFile(catalogPath, "utf8");
const catalog = parseCatalog(catalogSource);
const scopedFiles = [
  ...activeFiles.map((file) => path.join(sourceRoot, file)),
  ...(await Promise.all(activeRoots.map((directory) => collectFiles(path.join(sourceRoot, directory))))).flat(),
];

for (const filePath of scopedFiles) {
  let sourceText;
  try {
    sourceText = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") continue;
    throw error;
  }
  for (const attribute of markerAttributes) {
    const expression = new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, "g");
    for (const match of sourceText.matchAll(expression)) {
      assert.ok(catalog.has(match[1]), `${path.relative(viewerRoot, filePath)} uses unknown ${attribute} key ${match[1]}`);
    }
  }
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  for (const key of collectLiteralLookupKeys(sourceFile)) {
    assert.ok(catalog.has(key), `${path.relative(viewerRoot, filePath)} looks up missing key ${key}`);
  }
}

console.log(`viewer i18n contract: ${catalog.size} bilingual keys with matched placeholders and known static lookups`);
