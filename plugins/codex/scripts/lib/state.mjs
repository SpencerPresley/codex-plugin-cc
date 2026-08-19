import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveWorkspaceRoot } from "./workspace.mjs";

const STATE_VERSION = 1;
const PLUGIN_DATA_ENV = "CLAUDE_PLUGIN_DATA";
const FALLBACK_STATE_ROOT_DIR = path.join(os.tmpdir(), "codex-companion");
const STATE_FILE_NAME = "state.json";
const JOBS_DIR_NAME = "jobs";
const MAX_JOBS = 50;

function nowIso() {
  return new Date().toISOString();
}

function defaultState() {
  return {
    version: STATE_VERSION,
    config: {
      stopReviewGate: false
    },
    jobs: []
  };
}

export function resolveStateDirName(cwd) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  let canonicalWorkspaceRoot = workspaceRoot;
  try {
    canonicalWorkspaceRoot = fs.realpathSync.native(workspaceRoot);
  } catch {
    canonicalWorkspaceRoot = workspaceRoot;
  }

  const slugSource = path.basename(workspaceRoot) || "workspace";
  const slug = slugSource.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
  const hash = createHash("sha256").update(canonicalWorkspaceRoot).digest("hex").slice(0, 16);
  return `${slug}-${hash}`;
}

function resolveStateRoot(env = process.env) {
  const pluginDataDir = env[PLUGIN_DATA_ENV];
  return pluginDataDir ? path.join(pluginDataDir, "state") : FALLBACK_STATE_ROOT_DIR;
}

export function resolveStateDir(cwd) {
  return path.join(resolveStateRoot(), resolveStateDirName(cwd));
}

/**
 * Every other place this workspace's jobs could be stored.
 *
 * The active store is rooted at `CLAUDE_PLUGIN_DATA`, which Claude Code sets per
 * plugin *identity* (`codex@spencer-codex` vs an inline/local install) and which
 * reaches the companion only via the SessionStart hook writing to
 * `CLAUDE_ENV_FILE`. So the same repository legitimately ends up with more than
 * one store: one per plugin install, plus the temp-dir fallback used whenever
 * the variable never arrived. A job written under one root is invisible to a
 * command resolving another, which reads to the user as "my review vanished".
 * We cannot merge the stores safely, but we can find them and say where the job
 * actually lives.
 */
export function listAlternateStateDirs(cwd, env = process.env) {
  const dirName = resolveStateDirName(cwd);
  const activeDir = path.join(resolveStateRoot(env), dirName);
  const candidates = new Set();

  const pluginDataDir = env[PLUGIN_DATA_ENV];
  if (pluginDataDir) {
    // Sibling plugin-data roots: <...>/plugins/data/<plugin-identity>/state/<dir>
    const dataParent = path.dirname(pluginDataDir);
    let siblings = [];
    try {
      siblings = fs.readdirSync(dataParent, { withFileTypes: true });
    } catch {
      siblings = [];
    }
    for (const entry of siblings) {
      if (!entry.isDirectory()) {
        continue;
      }
      candidates.add(path.join(dataParent, entry.name, "state", dirName));
    }
  }

  candidates.add(path.join(FALLBACK_STATE_ROOT_DIR, dirName));

  return [...candidates].filter((candidate) => {
    if (path.resolve(candidate) === path.resolve(activeDir)) {
      return false;
    }
    return fs.existsSync(path.join(candidate, JOBS_DIR_NAME));
  });
}

export function resolveStateFile(cwd) {
  return path.join(resolveStateDir(cwd), STATE_FILE_NAME);
}

export function resolveJobsDir(cwd) {
  return path.join(resolveStateDir(cwd), JOBS_DIR_NAME);
}

export function ensureStateDir(cwd) {
  fs.mkdirSync(resolveJobsDir(cwd), { recursive: true });
}

export function loadState(cwd) {
  const stateFile = resolveStateFile(cwd);
  if (!fs.existsSync(stateFile)) {
    return defaultState();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    return {
      ...defaultState(),
      ...parsed,
      config: {
        ...defaultState().config,
        ...(parsed.config ?? {})
      },
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : []
    };
  } catch {
    return defaultState();
  }
}

function pruneJobs(jobs) {
  return [...jobs]
    .sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")))
    .slice(0, MAX_JOBS);
}

function removeFileIfExists(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function saveState(cwd, state) {
  const previousJobs = loadState(cwd).jobs;
  ensureStateDir(cwd);
  const nextJobs = pruneJobs(state.jobs ?? []);
  const nextState = {
    version: STATE_VERSION,
    config: {
      ...defaultState().config,
      ...(state.config ?? {})
    },
    jobs: nextJobs
  };

  const retainedIds = new Set(nextJobs.map((job) => job.id));
  for (const job of previousJobs) {
    if (retainedIds.has(job.id)) {
      continue;
    }
    removeJobFile(resolveJobFile(cwd, job.id));
    removeFileIfExists(job.logFile);
  }

  fs.writeFileSync(resolveStateFile(cwd), `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
  return nextState;
}

export function updateState(cwd, mutate) {
  const state = loadState(cwd);
  mutate(state);
  return saveState(cwd, state);
}

export function generateJobId(prefix = "job") {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function upsertJob(cwd, jobPatch) {
  return updateState(cwd, (state) => {
    const timestamp = nowIso();
    const existingIndex = state.jobs.findIndex((job) => job.id === jobPatch.id);
    if (existingIndex === -1) {
      state.jobs.unshift({
        createdAt: timestamp,
        updatedAt: timestamp,
        ...jobPatch
      });
      return;
    }
    state.jobs[existingIndex] = {
      ...state.jobs[existingIndex],
      ...jobPatch,
      updatedAt: timestamp
    };
  });
}

export function listJobs(cwd) {
  return loadState(cwd).jobs;
}

export function setConfig(cwd, key, value) {
  return updateState(cwd, (state) => {
    state.config = {
      ...state.config,
      [key]: value
    };
  });
}

export function getConfig(cwd) {
  return loadState(cwd).config;
}

export function writeJobFile(cwd, jobId, payload) {
  ensureStateDir(cwd);
  const jobFile = resolveJobFile(cwd, jobId);
  fs.writeFileSync(jobFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return jobFile;
}

export function readJobFile(jobFile) {
  return JSON.parse(fs.readFileSync(jobFile, "utf8"));
}

function removeJobFile(jobFile) {
  if (fs.existsSync(jobFile)) {
    fs.unlinkSync(jobFile);
  }
}

export function resolveJobLogFile(cwd, jobId) {
  ensureStateDir(cwd);
  return path.join(resolveJobsDir(cwd), `${jobId}.log`);
}

export function resolveJobFile(cwd, jobId) {
  ensureStateDir(cwd);
  return path.join(resolveJobsDir(cwd), `${jobId}.json`);
}

/**
 * Look for a job id (or id prefix) in the stores this process is not using.
 * Returns `[{ dir, jobIds }]` so callers can tell the user where the job went
 * instead of reporting a bare "not found".
 */
export function findJobsInAlternateStateDirs(cwd, reference = "", env = process.env) {
  const matches = [];
  for (const dir of listAlternateStateDirs(cwd, env)) {
    let entries = [];
    try {
      entries = fs.readdirSync(path.join(dir, JOBS_DIR_NAME));
    } catch {
      continue;
    }
    const jobIds = entries
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => entry.slice(0, -".json".length))
      .filter((jobId) => !reference || jobId === reference || jobId.startsWith(reference));
    if (jobIds.length > 0) {
      matches.push({ dir, jobIds });
    }
  }
  return matches;
}
