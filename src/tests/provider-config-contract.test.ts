import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

function stripJsoncComments(value: string): string {
  return value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const execFileAsync = promisify(execFile);
const packageSpec = "@little_tale/opencode-with-claude";
const workflowProviderNames = ["with-claude", "with-gemini", "with-gemini-yolo"];

test("opencode.example.jsonc declares portable workflow provider config", async () => {
  const raw = await readFile(path.join(process.cwd(), "opencode.example.jsonc"), "utf8");
  const parsed = JSON.parse(stripJsoncComments(raw)) as {
    provider?: Record<string, { npm?: string; models?: Record<string, unknown>; options?: Record<string, unknown> }>;
    agent?: Record<string, { model?: string; geminiExecutionPolicy?: string }>;
  };

  for (const providerName of workflowProviderNames) {
    assert.equal(parsed.provider?.[providerName]?.npm, packageSpec);
  }
  assert.doesNotMatch(raw, /file:\/\/\/Users\//);
  assert.doesNotMatch(raw, /\/Users\/[^/]+\//);
  assert.deepEqual(Object.keys(parsed.provider?.["with-claude"]?.models ?? {}).sort(), ["haiku", "opus", "sonnet"]);
  assert.deepEqual(Object.keys(parsed.provider?.["with-gemini"]?.models ?? {}).sort(), ["auto", "flash", "flash-lite", "pro"]);
  assert.deepEqual(Object.keys(parsed.provider?.["with-gemini-yolo"]?.models ?? {}).sort(), ["auto", "flash", "flash-lite", "pro"]);
  assert.equal(parsed.provider?.["with-gemini"]?.options?.cliPath, "gemini");
  assert.equal(parsed.provider?.["with-gemini-yolo"]?.options?.skipPermissions, true);
  assert.equal(parsed.agent?.planClaude?.model, "with-claude/opus");
  assert.equal(parsed.agent?.implClaude?.model, "with-claude/sonnet");
  assert.equal(parsed.agent?.reviewClaude?.model, "with-claude/sonnet");
  assert.equal(parsed.agent?.designGemini?.model, "with-gemini-yolo/auto");
  assert.equal(parsed.agent?.reviewGemini?.model, "with-gemini/auto");
  assert.equal(parsed.agent?.designGemini?.geminiExecutionPolicy, "write-enabled");
  assert.equal(parsed.agent?.reviewGemini?.geminiExecutionPolicy, "read-only");
});

test("local OpenCode setup script generates checkout-specific provider config", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "withclaude-local-opencode-"));
  const exampleRaw = await readFile(path.join(process.cwd(), "opencode.example.jsonc"), "utf8");
  const exampleConfig = JSON.parse(stripJsoncComments(exampleRaw)) as {
    provider?: Record<string, { npm?: string }>;
  };
  exampleConfig.provider = {
    ...(exampleConfig.provider ?? {}),
    "other-provider": {
      npm: "some-other-package"
    }
  };
  await writeFile(path.join(tmp, "opencode.example.jsonc"), `${JSON.stringify(exampleConfig, null, 2)}\n`, "utf8");
  await execFileAsync(process.execPath, [
    path.join(process.cwd(), "scripts", "setup-local-opencode.mjs")
  ], { cwd: tmp });

  const raw = await readFile(path.join(tmp, "opencode.jsonc"), "utf8");
  const parsed = JSON.parse(raw) as {
    provider?: Record<string, { npm?: string }>;
  };
  const expectedDistUrl = pathToFileURL(path.join(await realpath(tmp), "dist", "index.js")).href;
  for (const providerName of workflowProviderNames) {
    assert.equal(parsed.provider?.[providerName]?.npm, expectedDistUrl);
  }
  assert.equal(parsed.provider?.["other-provider"]?.npm, "some-other-package");
});
