import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import { loadBrokerSession, teardownBrokerSession } from "../plugins/codex/scripts/lib/broker-lifecycle.mjs";

const trackedTempDirs = new Set();
let cleanupHandlersInstalled = false;

export function makeTempDir(prefix = "codex-plugin-test-") {
  installCleanupHandlers();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  trackedTempDirs.add(dir);
  return dir;
}

export function writeExecutable(filePath, source) {
  fs.writeFileSync(filePath, source, { encoding: "utf8", mode: 0o755 });
}

export function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    input: options.input,
    shell: options.shell ?? (process.platform === "win32" && !path.isAbsolute(command)),
    windowsHide: true
  });
}

export function initGitRepo(cwd) {
  run("git", ["init", "-b", "main"], { cwd });
  run("git", ["config", "user.name", "Codex Plugin Tests"], { cwd });
  run("git", ["config", "user.email", "tests@example.com"], { cwd });
  run("git", ["config", "commit.gpgsign", "false"], { cwd });
  run("git", ["config", "tag.gpgsign", "false"], { cwd });
}

// --- Broker / temp-dir reaping ----------------------------------------------
// Integration tests exercise real commands (`review`, `task`, …) that spawn a
// detached, unref()'d broker daemon (see spawnBrokerProcess in
// broker-lifecycle.mjs). Because the broker is intentionally detached so it can
// outlive a Claude Code session, it also outlives `node --test`: without an
// explicit teardown, every suite run leaks an orphaned broker (plus its codex
// app-server child) into a codex-plugin-test-* tmp dir. We track every temp dir
// and reap its broker + remove the dir when the test process exits.

function killProcessTree(pid, signal = "SIGKILL") {
  if (!Number.isFinite(pid)) {
    return;
  }
  // The broker is spawned detached, so it leads its own process group; killing
  // the negative pid reaps the broker together with its app-server child.
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Already exited.
    }
  }
}

function killBrokersForDir(dir) {
  // Safety net for brokers whose state file could not be read: kill any live
  // broker still bound to this temp dir. Posix-only (relies on `ps`).
  if (process.platform === "win32") {
    return;
  }
  const marker = path.basename(dir);
  const result = spawnSync("ps", ["-Awwo", "pid=,command="], { encoding: "utf8" });
  if (result.status !== 0 || typeof result.stdout !== "string") {
    return;
  }
  for (const line of result.stdout.split("\n")) {
    if (!line.includes("app-server-broker") || !line.includes(marker)) {
      continue;
    }
    const pid = Number.parseInt(line.trim().split(/\s+/, 1)[0], 10);
    killProcessTree(pid);
  }
}

function reapTempDir(dir) {
  // 1. Kill the recorded broker and clean its pid file / socket / session dir.
  let session = null;
  try {
    session = loadBrokerSession(dir);
  } catch {
    session = null;
  }
  if (session) {
    try {
      teardownBrokerSession({
        endpoint: session.endpoint ?? null,
        pidFile: session.pidFile ?? null,
        logFile: session.logFile ?? null,
        sessionDir: session.sessionDir ?? null,
        pid: session.pid ?? null,
        killProcess: (pid) => killProcessTree(pid)
      });
    } catch {
      // Best effort during teardown.
    }
  }

  // 2. Catch any broker the state file missed.
  killBrokersForDir(dir);

  // 3. Remove the temp dir itself.
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best effort during teardown.
  }
}

export function cleanupTempDirs() {
  for (const dir of trackedTempDirs) {
    reapTempDir(dir);
  }
  trackedTempDirs.clear();
}

function installCleanupHandlers() {
  if (cleanupHandlersInstalled) {
    return;
  }
  cleanupHandlersInstalled = true;
  // Runs on normal completion of the test-file process. Synchronous only.
  process.on("exit", cleanupTempDirs);
  // And on interruption (Ctrl-C, runner teardown) so we don't leak on abort.
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      cleanupTempDirs();
      process.exit(1);
    });
  }
}
