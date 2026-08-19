# Collaborator Parity Implementation Plan

**Status:** implemented in 1.0.9. Boxes are checked to record what shipped; see `docs/superpowers/specs/2026-08-19-collaborator-parity-design.md` for the reasoning.

**Goal:** Apply the unsandboxed-review principle to the remaining paths — replace mechanical constraints with explicit contracts, and stop discarding information the participants need.

**Architecture:** Sandbox selection becomes three-valued (explicit mode, inherit-from-config, or the historical default) at the app-server parameter layer. Job state gains durability across sessions and discoverability across plugin installs. Review results gain a completion gate and an assessment timeline. Claude gains the ability to follow and contest its own delegated work.

**Tech Stack:** Node.js 18+, ECMAScript modules, Codex app-server JSON-RPC, Node's built-in test runner, Markdown prompts and skills.

## Global Constraints

- Reviews keep an explicit `danger-full-access` so their contract does not depend on local configuration; only task/rescue inherits.
- Session scoping is a display filter. Nothing deletes a finished result except the existing 50-job cap.
- The review verdict enum is unchanged; interim verdicts are signal, not noise.
- The `review` / `adversarial-review` focus-text split stays.
- Every behavior change lands with a test that fails without it.

---

### Task 1: Durability and recovery

- [x] `state.mjs`: split `resolveStateDirName` out of `resolveStateDir`; add `listAlternateStateDirs` and `findJobsInAlternateStateDirs` covering sibling plugin-data roots and the temp fallback.
- [x] `job-control.mjs`: `matchJobReference` returns null on a miss (restoring the fall-through the callers already assumed, which had made "job is still running" unreachable); lookup errors append `describeJobLookupMiss`; `interrupted` counts as finished for `/codex:result`.
- [x] `session-lifecycle-hook.mjs`: `cleanupSessionJobs` becomes `finalizeSessionJobs` — stop running jobs, mark them `interrupted` in both the index and the job file, retain everything else.
- [x] `claude-session-transfer.mjs`: derive the transcript from `CLAUDE_CODE_SESSION_ID` when the hook never recorded it; name the expected path in the error.
- [x] Surface the live log path on background launch and in status output.
- Tests: `state.test.mjs` alternate-store discovery; `runtime.test.mjs` session-end retention, cross-store lookup, transcript derivation and its error, live-log surfacing.

### Task 2: Capability

- [x] `codex.mjs`: `sandbox: null` omits the field so the app server falls back to the user's config; `undefined` keeps the read-only default.
- [x] `codex-companion.mjs`: `normalizeSandboxMode` / `resolveTaskSandbox`, `--sandbox` flag, write-capable default of inherit.
- [x] `prompts/task-workspace-policy.md` attached to fresh non-read-only task runs.
- [x] Stop gate runs with `danger-full-access` and the review workspace policy; gate-side failures log and allow instead of blocking.
- Tests: sandbox omitted for `--write`, `read-only` without it, explicit modes pinned, unknown modes rejected, policy present/absent per path, gate reach, gate fail-open.

### Task 3: Result integrity

- [x] Gate verdict rendering on turn completion; render an unfinished run as unfinished with its last interim message labelled.
- [x] Retain interim assessments as a timeline on the job payload.
- [x] Inferred completion sets a synthetic completed turn so successful multi-agent runs are not recorded as failed.
- [x] Replay buffered `thread/started` / `thread/name/updated` with the same exemption the live handler uses, so subagent labels survive.
- Tests: interrupted review has no verdict and keeps its assessments; completed review keeps its verdict; inferred completion records `completed`; subagent label survives early notification.

### Task 4: Model reach

- [x] Drop `disable-model-invocation` from `status` and `result`; keep it on `cancel` and `transfer`.
- [x] Allow one `## Claude's assessment` section after verbatim review output, evidence-only.
- [x] `task --with-session` imports the Claude transcript and runs the task on that thread; mutually exclusive with `--resume-last`.
- Tests: frontmatter exposure, assessment rules present in both commands and both skills, session handoff runs on the imported thread with the workspace policy, `--with-session` + `--resume-last` rejected.

### Task 5: Prompting refresh

- [x] Rename `gpt-5-4-prompting` to `codex-prompting`; rewrite against OpenAI's GPT-5.6 guidance.
- [x] De-duplicate the adversarial review prompt (86 → 68 lines) with no loss of contract.
- [x] Fix the collection guidance to name the actual commands and drop stale read-only framing.
- [x] Update README, `using-codex`, `codex-cli-runtime`, and the rescue agent/command; bump to 1.0.9 with a changelog.
- Tests: skill rename references, GPT-5.6 specifics present and older generations absent, collection guidance assertions, README assertions.

## Verification

- `npm test` — 111 tests, all passing.
- Each behavior change confirmed to fail without its fix (the subagent-label fix was verified by reverting the hunk and re-running the new test).
