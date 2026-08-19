import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ensureAbsolutePath } from "./fs.mjs";

export const TRANSCRIPT_PATH_ENV = "CODEX_COMPANION_TRANSCRIPT_PATH";
const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
// Claude Code sets its own session id in the environment of every command it
// runs, so it is available even when the plugin's SessionStart hook never got to
// record the transcript path.
const CLAUDE_SESSION_ID_ENVS = ["CLAUDE_CODE_SESSION_ID", "CLAUDE_SESSION_ID"];

function projectDirNameForCwd(cwd) {
  // Claude Code encodes the project directory by replacing both path separators
  // and dots: /Users/me/repo/.claude/worktrees/x -> -Users-me-repo--claude-worktrees-x
  return String(cwd).replace(/[/.]/g, "-");
}

function resolveSessionId(env) {
  for (const name of CLAUDE_SESSION_ID_ENVS) {
    const value = env[name];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

/**
 * Recover the transcript path when `TRANSCRIPT_PATH_ENV` never made it through.
 *
 * The hook that records it only fires at SessionStart and only when
 * `CLAUDE_ENV_FILE` exists, so enabling the plugin mid-session (or a hook
 * timeout) leaves `/codex:transfer` with nothing to import and no way for the
 * user to guess the path. Transcripts are named by session id, which we do have.
 */
export function deriveClaudeSessionPath(cwd, env = process.env) {
  const sessionId = resolveSessionId(env);
  if (!sessionId) {
    return null;
  }

  const preferred = path.join(CLAUDE_PROJECTS_DIR, projectDirNameForCwd(cwd), `${sessionId}.jsonl`);
  if (fs.existsSync(preferred)) {
    return preferred;
  }

  // The session may have started in a different directory than the one the
  // command runs in; the session id alone is unique across project folders.
  let projectDirs = [];
  try {
    projectDirs = fs.readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of projectDirs) {
    if (!entry.isDirectory()) {
      continue;
    }
    const candidate = path.join(CLAUDE_PROJECTS_DIR, entry.name, `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function resolveUserPath(cwd, value) {
  if (value === "~") {
    return os.homedir();
  }
  if (String(value).startsWith("~/")) {
    return path.join(os.homedir(), String(value).slice(2));
  }
  return ensureAbsolutePath(cwd, value);
}

export function resolveClaudeSessionPath(cwd, options = {}) {
  const env = options.env ?? process.env;
  const requestedPath = options.source || env[TRANSCRIPT_PATH_ENV] || deriveClaudeSessionPath(cwd, env);
  if (!requestedPath) {
    const sessionId = resolveSessionId(env);
    const expected = path.join(
      CLAUDE_PROJECTS_DIR,
      projectDirNameForCwd(cwd),
      `${sessionId ?? "<claude-session-id>"}.jsonl`
    );
    throw new Error(
      `Could not identify the current Claude transcript. Expected it at ${expected}. Retry with --source <path-to-claude-jsonl>, or restart the Claude session so the Codex plugin's SessionStart hook can record the path.`
    );
  }

  const sourcePath = resolveUserPath(cwd, requestedPath);
  if (path.extname(sourcePath) !== ".jsonl") {
    throw new Error(`Claude session source must be a JSONL file: ${sourcePath}`);
  }

  let source;
  let projects;
  try {
    source = fs.realpathSync(sourcePath);
    projects = fs.realpathSync(CLAUDE_PROJECTS_DIR);
  } catch {
    throw new Error(`Claude session file not found: ${sourcePath}`);
  }
  const relative = path.relative(projects, source);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Codex can import Claude sessions only from ${CLAUDE_PROJECTS_DIR}: ${source}`);
  }
  return source;
}
