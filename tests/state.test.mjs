import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { makeTempDir } from "./helpers.mjs";
import {
  findJobsInAlternateStateDirs,
  listAlternateStateDirs,
  resolveJobFile,
  resolveJobLogFile,
  resolveStateDir,
  resolveStateDirName,
  resolveStateFile,
  saveState
} from "../plugins/codex/scripts/lib/state.mjs";

test("resolveStateDir uses a temp-backed per-workspace directory", () => {
  const workspace = makeTempDir();
  const stateDir = resolveStateDir(workspace);

  assert.equal(stateDir.startsWith(os.tmpdir()), true);
  assert.match(path.basename(stateDir), /.+-[a-f0-9]{16}$/);
  assert.match(stateDir, new RegExp(`^${os.tmpdir().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});

test("resolveStateDir uses CLAUDE_PLUGIN_DATA when it is provided", () => {
  const workspace = makeTempDir();
  const pluginDataDir = makeTempDir();
  const previousPluginDataDir = process.env.CLAUDE_PLUGIN_DATA;
  process.env.CLAUDE_PLUGIN_DATA = pluginDataDir;

  try {
    const stateDir = resolveStateDir(workspace);

    assert.equal(stateDir.startsWith(path.join(pluginDataDir, "state")), true);
    assert.match(path.basename(stateDir), /.+-[a-f0-9]{16}$/);
    assert.match(
      stateDir,
      new RegExp(`^${path.join(pluginDataDir, "state").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)
    );
  } finally {
    if (previousPluginDataDir == null) {
      delete process.env.CLAUDE_PLUGIN_DATA;
    } else {
      process.env.CLAUDE_PLUGIN_DATA = previousPluginDataDir;
    }
  }
});

test("saveState prunes dropped job artifacts when indexed jobs exceed the cap", () => {
  const workspace = makeTempDir();
  const stateFile = resolveStateFile(workspace);
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });

  const jobs = Array.from({ length: 51 }, (_, index) => {
    const jobId = `job-${index}`;
    const updatedAt = new Date(Date.UTC(2026, 0, 1, 0, index, 0)).toISOString();
    const logFile = resolveJobLogFile(workspace, jobId);
    const jobFile = resolveJobFile(workspace, jobId);
    fs.writeFileSync(logFile, `log ${jobId}\n`, "utf8");
    fs.writeFileSync(jobFile, JSON.stringify({ id: jobId, status: "completed" }, null, 2), "utf8");
    return {
      id: jobId,
      status: "completed",
      logFile,
      updatedAt,
      createdAt: updatedAt
    };
  });

  fs.writeFileSync(
    stateFile,
    `${JSON.stringify(
      {
        version: 1,
        config: { stopReviewGate: false },
        jobs
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  saveState(workspace, {
    version: 1,
    config: { stopReviewGate: false },
    jobs
  });

  const prunedJobFile = resolveJobFile(workspace, "job-0");
  const prunedLogFile = resolveJobLogFile(workspace, "job-0");
  const retainedJobFile = resolveJobFile(workspace, "job-50");
  const retainedLogFile = resolveJobLogFile(workspace, "job-50");
  const jobsDir = path.dirname(prunedJobFile);

  assert.equal(fs.existsSync(retainedJobFile), true);
  assert.equal(fs.existsSync(retainedLogFile), true);

  const savedState = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  assert.equal(savedState.jobs.length, 50);
  assert.deepEqual(
    savedState.jobs.map((job) => job.id),
    Array.from({ length: 50 }, (_, index) => `job-${50 - index}`)
  );
  assert.deepEqual(
    fs.readdirSync(jobsDir).sort(),
    Array.from({ length: 50 }, (_, index) => `job-${index + 1}`)
      .flatMap((jobId) => [`${jobId}.json`, `${jobId}.log`])
      .sort()
  );
});

test("listAlternateStateDirs finds the same workspace under sibling plugin installs and the temp fallback", () => {
  const workspace = makeTempDir();
  const pluginDataRoot = makeTempDir();
  const activeDataDir = path.join(pluginDataRoot, "codex-spencer-codex");
  const siblingDataDir = path.join(pluginDataRoot, "codex-inline");
  const env = { CLAUDE_PLUGIN_DATA: activeDataDir };

  const dirName = resolveStateDirName(workspace);
  const activeDir = path.join(activeDataDir, "state", dirName);
  const siblingDir = path.join(siblingDataDir, "state", dirName);
  const fallbackDir = path.join(os.tmpdir(), "codex-companion", dirName);
  const unrelatedDir = path.join(siblingDataDir, "state", "some-other-workspace-0123456789abcdef");

  for (const dir of [activeDir, siblingDir, unrelatedDir]) {
    fs.mkdirSync(path.join(dir, "jobs"), { recursive: true });
  }
  fs.writeFileSync(path.join(siblingDir, "jobs", "review-lost.json"), JSON.stringify({ id: "review-lost" }), "utf8");

  const alternates = listAlternateStateDirs(workspace, env);

  // The store this process is using is not an "alternate", and neither is an
  // unrelated workspace that happens to live under the same sibling install.
  assert.equal(alternates.includes(activeDir), false);
  assert.equal(alternates.includes(unrelatedDir), false);
  assert.equal(alternates.includes(siblingDir), true);
  // The temp fallback is always considered, but only reported when it exists.
  assert.equal(alternates.includes(fallbackDir), fs.existsSync(path.join(fallbackDir, "jobs")));

  const matches = findJobsInAlternateStateDirs(workspace, "review-lost", env);
  assert.deepEqual(
    matches.map((match) => ({ dir: match.dir, jobIds: match.jobIds })),
    [{ dir: siblingDir, jobIds: ["review-lost"] }]
  );

  // A prefix that matches nothing must not invent a location.
  assert.deepEqual(findJobsInAlternateStateDirs(workspace, "review-absent", env), []);
});
