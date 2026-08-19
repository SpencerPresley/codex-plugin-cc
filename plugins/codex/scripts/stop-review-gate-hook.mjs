#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { getCodexAvailability } from "./lib/codex.mjs";
import { loadPromptTemplate, interpolateTemplate } from "./lib/prompts.mjs";
import { INTERNAL_CALLER_ENV } from "./lib/process.mjs";
import { getConfig, listJobs } from "./lib/state.mjs";
import { sortJobsNewestFirst } from "./lib/job-control.mjs";
import { SESSION_ID_ENV } from "./lib/tracked-jobs.mjs";
import { resolveWorkspaceRoot } from "./lib/workspace.mjs";

const STOP_REVIEW_TIMEOUT_MS = 15 * 60 * 1000;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const STOP_REVIEW_TASK_MARKER = "Run a stop-gate review of the previous Claude turn.";

function readHookInput() {
  const raw = fs.readFileSync(0, "utf8").trim();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

function emitDecision(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function logNote(message) {
  if (!message) {
    return;
  }
  process.stderr.write(`${message}\n`);
}

function filterJobsForCurrentSession(jobs, input = {}) {
  const sessionId = input.session_id || process.env[SESSION_ID_ENV] || null;
  if (!sessionId) {
    return jobs;
  }
  return jobs.filter((job) => job.sessionId === sessionId);
}

function buildStopReviewPrompt(input = {}) {
  const lastAssistantMessage = String(input.last_assistant_message ?? "").trim();
  const template = loadPromptTemplate(ROOT_DIR, "stop-review-gate");
  const claudeResponseBlock = lastAssistantMessage
    ? ["Previous Claude response:", lastAssistantMessage].join("\n")
    : "";
  return interpolateTemplate(template, {
    CLAUDE_RESPONSE_BLOCK: claudeResponseBlock,
    REVIEW_WORKSPACE_POLICY: loadPromptTemplate(ROOT_DIR, "review-workspace-policy").trim()
  });
}

function buildSetupNote(cwd) {
  const availability = getCodexAvailability(cwd);
  if (availability.available) {
    return null;
  }

  const detail = availability.detail ? ` ${availability.detail}.` : "";
  return `Codex is not set up for the review gate.${detail} Run /codex:setup.`;
}

/**
 * The gate blocks on a verdict, never on its own plumbing.
 *
 * `unavailable` means the review did not produce an answer — it timed out,
 * crashed, or returned something unparseable. Blocking there traps the session
 * because Codex broke, which punishes the model for the harness's failure and
 * gives the user no way forward except bypassing the gate entirely. Those cases
 * warn loudly on stderr and allow the stop.
 */
function parseStopReviewOutput(rawOutput) {
  const text = String(rawOutput ?? "").trim();
  if (!text) {
    return {
      ok: false,
      unavailable: true,
      reason:
        "The stop-time Codex review task returned no final output, so the gate could not evaluate this turn. Run /codex:review --wait manually if you want a review."
    };
  }

  const firstLine = text.split(/\r?\n/, 1)[0].trim();
  if (firstLine.startsWith("ALLOW:")) {
    return { ok: true, reason: null };
  }
  if (firstLine.startsWith("BLOCK:")) {
    const reason = firstLine.slice("BLOCK:".length).trim() || text;
    return {
      ok: false,
      reason: `Codex stop-time review found issues that still need fixes before ending the session: ${reason}`
    };
  }

  return {
    ok: false,
    unavailable: true,
    reason:
      "The stop-time Codex review task returned an unexpected answer, so the gate could not evaluate this turn. Run /codex:review --wait manually if you want a review."
  };
}

function runStopReview(cwd, input = {}) {
  const scriptPath = path.join(SCRIPT_DIR, "codex-companion.mjs");
  const prompt = buildStopReviewPrompt(input);
  const childEnv = {
    ...process.env,
    [INTERNAL_CALLER_ENV]: "1",
    ...(input.session_id ? { [SESSION_ID_ENV]: input.session_id } : {})
  };
  // The gate is a review: it gets full reach, but its prompt already carries the
  // repository-preserving contract, so it must not also receive the task
  // contract that authorizes changes.
  const result = spawnSync(
    process.execPath,
    [scriptPath, "task", "--json", "--sandbox", "danger-full-access", "--no-workspace-policy", prompt],
    {
      cwd,
      env: childEnv,
      encoding: "utf8",
      timeout: STOP_REVIEW_TIMEOUT_MS
    }
  );

  if (result.error?.code === "ETIMEDOUT") {
    return {
      ok: false,
      unavailable: true,
      reason:
        "The stop-time Codex review task timed out after 15 minutes, so the gate could not evaluate this turn. Run /codex:review --wait manually if you want a review."
    };
  }

  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "").trim();
    return {
      ok: false,
      unavailable: true,
      reason: detail
        ? `The stop-time Codex review task failed, so the gate could not evaluate this turn: ${detail}`
        : "The stop-time Codex review task failed, so the gate could not evaluate this turn. Run /codex:review --wait manually if you want a review."
    };
  }

  try {
    const payload = JSON.parse(result.stdout);
    return parseStopReviewOutput(payload?.rawOutput);
  } catch {
    return {
      ok: false,
      unavailable: true,
      reason:
        "The stop-time Codex review task returned invalid JSON, so the gate could not evaluate this turn. Run /codex:review --wait manually if you want a review."
    };
  }
}

function main() {
  const input = readHookInput();
  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const config = getConfig(workspaceRoot);

  const jobs = sortJobsNewestFirst(filterJobsForCurrentSession(listJobs(workspaceRoot), input));
  const runningJob = jobs.find((job) => job.status === "queued" || job.status === "running");
  const runningTaskNote = runningJob
    ? `Codex task ${runningJob.id} is still running. Check /codex:status and use /codex:cancel ${runningJob.id} if you want to stop it before ending the session.`
    : null;

  if (!config.stopReviewGate) {
    logNote(runningTaskNote);
    return;
  }

  const setupNote = buildSetupNote(cwd);
  if (setupNote) {
    logNote(setupNote);
    logNote(runningTaskNote);
    return;
  }

  const review = runStopReview(cwd, input);
  if (review.unavailable) {
    logNote(review.reason);
    logNote(runningTaskNote);
    return;
  }
  if (!review.ok) {
    emitDecision({
      decision: "block",
      reason: runningTaskNote ? `${runningTaskNote} ${review.reason}` : review.reason
    });
    return;
  }

  logNote(runningTaskNote);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
