---
name: using-codex
description: Use when running Codex reviews or delegating work through the Codex Claude Code plugin, especially when choosing review, adversarial-review, or rescue and when handling their results.
---

# Using Codex from Claude Code

Codex (OpenAI GPT-5.5) is a second AI collaborator. Two shapes of use:

- **Review** (`review`, `adversarial-review`) — repository-preserving critique that does not intentionally edit or fix the reviewed work.
- **Delegate** (`rescue`) — **write-capable** work handed to a Codex agent (debug, fix, implement, investigate).

In *this* build the review commands are model-invokable, so you (Claude) can run them directly.

> **Model version:** Codex currently routes to **GPT-5.5** (OpenAI's latest). Some plugin text — including the `gpt-5-4-prompting` skill name — still says "GPT-5.4"; that guidance applies unchanged to 5.5. Don't be thrown by the version label.

## Critical rules (non-negotiable)

- **Reviews are repository-preserving, not filesystem read-only.** Codex runs without filesystem sandboxing so it can use its full toolset. It must not intentionally edit or fix the reviewed work, but legitimate inspection and verification commands may create caches, logs, build output, coverage data, or scratch probes. Those incidental writes are acceptable and are not a reason to panic, abandon the review, or silently implement cleanup. After presenting findings, STOP and ask the user which findings, if any, to fix.
- **Return Codex output verbatim.** No paraphrasing or summarizing of review/rescue output. Present findings ordered by severity, with file paths and line numbers exactly as reported.
- **Know what intentionally writes.** `rescue` is write-capable and may edit the workspace. `review` and `adversarial-review` must not intentionally change reviewed files, configuration, the Git index, refs, or commits.
- **Don't improvise auth.** If Codex isn't set up/authenticated, send the user to `/codex:setup`.

Review commands may use a dedicated temporary directory for probes. Repo-native checks may also run in the repository when that produces better evidence, even if they leave incidental artifacts such as `.ruff_cache/`. Do not run commands intended to rewrite reviewed work, such as `ruff check --fix`, `ruff format`, snapshot updates, codemods, or lockfile-updating package-manager operations.

## Commands you can invoke

### `codex:review` — native code review (repository-preserving)
Reviews local git state.
- Flags: `--wait` | `--background`, `--base <ref>`, `--scope auto|working-tree|branch`.
- No focus text, no staged-only/unstaged-only.
- Use for: a straight defect review of uncommitted changes (`--scope working-tree`) or a branch vs base (`--base main`).
- Examples: `/codex:review`, `/codex:review --base main`, `/codex:review --background`.

### `codex:adversarial-review` — challenge review (repository-preserving)
Same targets + `--base`, but it **attacks the approach/design/tradeoffs/assumptions** ("break confidence in the change"), not just defects.
- **Unlike `review`, it accepts extra focus text** after the flags.
- Use for: pre-ship pressure-testing — is this the right design? what breaks under load/partial-failure/rollback?
- Examples: `/codex:adversarial-review`, `/codex:adversarial-review --base main challenge the retry + caching design`.

### `codex:rescue` — delegate write-capable work
Hands a task to the `codex:codex-rescue` agent (debug, fix, implement, investigate, or continue prior Codex work).
- Flags: `--background` | `--wait`, `--resume` | `--fresh`, `--model <name|spark>`, `--effort <none|minimal|low|medium|high|xhigh>`.
- **Write-capable by default.** Use proactively for substantial, clearly-bounded handoffs; don't grab quick tasks you can finish yourself, and don't spawn nested Codex runs for trivial work.
- `--model`/`--effort`: leave unset unless the user asks (Codex picks sane defaults). `spark` → `gpt-5.3-codex-spark`. Any other model name passes through.
- `--resume` continues the latest rescue thread in this repo; `--fresh` forces a new one.
- Return the agent's output verbatim.
- Examples: `/codex:rescue investigate why the integration test is flaky`, `/codex:rescue --model spark fix the failing test`, `/codex:rescue --resume apply the top fix`.

### `codex:setup` — readiness + review gate
Checks Codex CLI install/auth. Can toggle the optional **stop-time review gate** (`--enable-review-gate` / `--disable-review-gate`) — when on, a `Stop` hook runs a Codex review of the previous turn and can block stopping until issues are addressed. The gate can create a long Claude↔Codex loop and burn usage; only enable it when actively watching.

## Background vs foreground

- **Wait** (`--wait`) only when the review is clearly tiny (~1–2 files, no directory-sized change).
- **Background** (`--background`) for anything larger or unclear in size — reviews of multi-file changes take a while.
- After backgrounding, the **user** follows up with the user-only commands below.

## User-only commands (you can't invoke — route the user)

After launching a background review/rescue, tell the user how to follow up:
- `/codex:status [id]` — progress and recent jobs (also shows review-gate status).
- `/codex:result [id]` — the final stored output of a finished job.
- `/codex:cancel [id]` — stop a running job.

Jobs are tracked per workspace (max 50 retained) and filtered to the current session.

## Review output shape

Both review commands return JSON against a fixed schema:
- `verdict`: `approve` | `needs-attention`.
- `findings[]`: each has `severity` (`critical|high|medium|low`), `title`, `body`, `file`, `line_start`, `line_end`, `confidence` (0–1), `recommendation`.
- `next_steps[]`: short follow-up actions.

Present findings severity-ordered; preserve confidence and any "inference/uncertainty" markers Codex includes.

## Prompting Codex (when shaping a rescue prompt)

GPT-5.5 responds best to compact, XML-block prompts. Assemble only the blocks the task needs:

- Always: `<task>` (exact job + scope) + the smallest output contract (`<structured_output_contract>` or `<compact_output_contract>`).
- Add as needed: `<default_follow_through_policy>` (act vs stop-and-ask), `<verification_loop>` (correctness), `<grounding_rules>` (don't invent — for review/research), `<action_safety>` (write-capable/broad tasks), `<missing_context_gating>` (don't guess).

Recipes (block combos): **Diagnosis**, **Narrow Fix**, **Root-Cause Review**, **Research/Recommendation**, **Prompt-Patching**. The plugin's `gpt-5-4-prompting` skill has the full templates.

Antipatterns to avoid: vague task framing ("take a look"), no output contract, mixing unrelated jobs in one run, asking for "more reasoning" instead of a tighter contract, and unsupported certainty (ground claims).

One task per run — split unrelated asks into separate Codex runs.
