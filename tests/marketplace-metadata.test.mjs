import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
}

function readText(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

test("marketplace identity is Spencer-maintained and not official OpenAI", () => {
  const marketplace = readJson(".claude-plugin/marketplace.json");
  const packageJson = readJson("package.json");
  const plugin = marketplace.plugins.find((entry) => entry.name === "codex");

  assert.equal(packageJson.name, "@spencerpresley/codex-plugin-cc");
  assert.equal(marketplace.name, "spencer-codex");
  assert.equal(marketplace.owner.name, "Spencer Presley");
  assert.equal(plugin.displayName, "Spencer Codex");
  assert.equal(plugin.author.name, "OpenAI, modified by Spencer Presley");
  assert.equal(plugin.repository, "https://github.com/SpencerPresley/codex-plugin-cc");
  assert.equal(plugin.license, "Apache-2.0");
});

test("plugin manifest preserves attribution and public metadata", () => {
  const plugin = readJson("plugins/codex/.claude-plugin/plugin.json");

  assert.equal(plugin.displayName, "Spencer Codex");
  assert.equal(plugin.author.name, "OpenAI, modified by Spencer Presley");
  assert.equal(plugin.repository, "https://github.com/SpencerPresley/codex-plugin-cc");
  assert.equal(plugin.license, "Apache-2.0");
});

test("install docs and notices distinguish this fork", () => {
  const readme = readText("README.md");
  const notice = readText("NOTICE");
  const pluginNotice = readText("plugins/codex/NOTICE");

  assert.match(readme, /\/plugin install codex@spencer-codex/);
  assert.match(readme, /Spencer-maintained fork\/distribution/);
  assert.match(readme, /not an official OpenAI marketplace/);
  assert.match(notice, /Modifications copyright 2026 Spencer Presley/);
  assert.match(notice, /not an official OpenAI distribution/);
  assert.match(pluginNotice, /Modifications copyright 2026 Spencer Presley/);
  assert.match(pluginNotice, /not an official OpenAI distribution/);
});
