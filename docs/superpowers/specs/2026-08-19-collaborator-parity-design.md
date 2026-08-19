# Collaborator Parity Design

## Goal

Extend the principle behind the unsandboxed review policy to the rest of the plugin: replace mechanical constraints with explicit contracts, and give each participant — Codex, Claude, and the user — the capability and the information needed to hold up its end.

The unsandboxed review change established the pattern. Reviews stopped being fenced by a filesystem sandbox and started carrying a written contract that says what "review-only" means, pre-authorizes the ambiguous cases, and states what to do when something goes wrong. This document applies the same reasoning to the paths that change deliberately left alone, and to the places where the plugin was losing information the participants needed.

## Findings This Addresses

### 1. The capability inversion

`/codex:rescue` — the path that exists to *fix* things — ran with `workspace-write`, which maps to `PermissionProfile::workspace_write()` and `NetworkSandboxPolicy::Restricted`. Verified empirically: a `task --write` run could write to the repository but `curl` failed to resolve any host. Meanwhile `/codex:review`, which must not change anything, had full access.

The plugin also always sent an explicit sandbox on `thread/start`, so a user who had configured `sandbox_mode = "danger-full-access"` for Codex was silently narrowed by the plugin.

**Resolution.** `thread/start`'s `sandbox` is optional and falls back to configuration, so the plugin now omits it for write-capable tasks and sends `--sandbox` only when asked. Reviews keep an explicit `danger-full-access` so their contract does not depend on local configuration. Write-capable runs receive a `<task_workspace_policy>` block that states scope, forbids rewriting Git history, and requires verification and disclosure of what changed.

### 2. The stop-time review gate

The gate ran through `task` with no `--write`, so it was read-only, and never received the review workspace policy — while its own prompt asked it to check second-order failures it had no ability to exercise. It also emitted `decision: "block"` on timeout, non-zero exit, and unparseable output, so a broken reviewer trapped the session.

**Resolution.** The gate is a review: it gets `danger-full-access` and the same repository-preserving contract. Failures of the gate itself are now reported loudly on stderr and allow the stop. Only a real `BLOCK:` verdict blocks.

### 3. Results deleted at session end

`cleanupSessionJobs` removed every job belonging to the ending session from the index, and `saveState` then unlinked each dropped job's stored result *and* its streamed log. A background review whose session ended was gone, so the only way to see the findings again was to run it a second time.

Compounding this, the state root is `$CLAUDE_PLUGIN_DATA`, which is per plugin *identity* and reaches the companion only through the SessionStart hook. The same repository legitimately accumulates stores under more than one plugin install, plus a temp-dir fallback when the variable never arrived — and a job written under one is invisible to a command resolving another.

**Resolution.** The session boundary settles what is in flight (running jobs are stopped and marked `interrupted`) and retains everything else, bounded by the existing 50-job cap. Session scoping is a display filter, not a lifecycle. On a lookup miss the plugin searches sibling plugin-data roots and the temp fallback and names where the job actually lives.

### 4. A verdict from a run that never finished

The review output schema requires `verdict` on every assistant message, so a mid-run status update is itself a schema-valid review object. The runtime kept only the last message and parsed it regardless of whether the turn completed, so an interrupted review could render `approve`.

**Resolution.** Only a completed turn produces a verdict; anything else renders as unfinished with the last interim message explicitly labelled as not a verdict. The verdict enum is unchanged — interim verdicts drifting across a long run are real signal — and those interim assessments are now retained as a timeline instead of discarded. Separately, runs that end through inferred completion set a synthetic completed turn, so a successful multi-agent run is no longer recorded as failed.

### 5. Claude could not follow its own work, or disagree with it

`/codex:status` and `/codex:result` carried `disable-model-invocation`, so Claude could launch a background review and then had to ask the user to check on it. The result-handling skill also forbade any commentary, which meant Claude could not tell the user that a finding was wrong.

**Resolution.** `status` and `result` are model-invokable; `cancel` (destroys in-flight work) and `transfer` (hands over the user's session) stay user-only. Claude may append one `## Claude's assessment` section *after* the verbatim output, for evidence-backed disagreement only. Applying fixes without being asked remains forbidden.

### 6. The delegate started from nothing

The rescue subagent was forbidden from inspecting anything, so Codex received a bare restatement of the user's request and rediscovered an investigation Claude had already done.

**Resolution.** The forwarder may attach a `<handoff_context>` block — the failing command and its output, files already read, hypotheses ruled out — marked unverified so Codex checks rather than inherits it. `task --with-session` is the stronger form: it imports the Claude transcript into the Codex thread (reusing the existing `/codex:transfer` machinery) and runs the task on that thread. It cannot be combined with `--resume-last`.

### 7. Prompting guidance pinned to a stale model

The `gpt-5-4-prompting` skill named a model generation the plugin no longer routes to, and its framing ("prompt Codex like an operator, not a collaborator") contradicted the design principle everywhere else in the fork.

**Resolution.** Renamed to `codex-prompting` and rewritten against OpenAI's GPT-5.6 prompting guide, which independently supports the direction: GPT-5.6 is more concise by default, leaner prompts measured higher eval scores with substantially fewer tokens, and greater proactivity calls for clearer boundaries rather than closer supervision. Repeated rules and blanket "always/never" for judgment calls are named anti-patterns; the adversarial review prompt was de-duplicated accordingly.

## Non-Goals

- Merging job stores across plugin installs. The plugin reports where a job lives; it does not move or copy state between installs.
- Making `/codex:review` steerable. The focus-text split between `review` and `adversarial-review` is retained deliberately, so unsteered results stay comparable across runs. The error message now says that instead of citing a protocol limitation that no longer exists.
- Changing the review verdict enum.
