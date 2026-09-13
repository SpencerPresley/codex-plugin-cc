---
name: using-codex
description: Use when running Codex reviews or delegating work through the Codex Claude Code plugin, especially when choosing review, adversarial-review, or task and when handling their results.
---

# Using Codex from Claude Code

Codex is a second AI collaborator from another model family. Two shapes of use:

- **Review** (`review`, `adversarial-review`) — repository-preserving critique: the Codex run judges the work without rewriting it. Acting on the findings afterward is up to whatever you were asked to do.
- **Delegate** (`task`) — **write-capable** work handed to Codex (debug, fix, implement, investigate). User-invoked only.

In *this* build the review commands are model-invokable, so you (Claude) can run them directly.

> **Model:** Codex routes to whatever the user's Codex config selects — currently the **GPT-5.6** family (`gpt-5.6-sol` quality-first, `gpt-5.6-terra` balanced, `gpt-5.6-luna` high-throughput). Don't pin a model unless the user asks.

## Critical rules (non-negotiable)

- **Reviews are repository-preserving, not filesystem read-only.** Codex runs without filesystem sandboxing so it can use its full toolset. It must not intentionally edit or fix the reviewed work, but legitimate inspection and verification commands may create caches, logs, build output, coverage data, or scratch probes. Those incidental writes are acceptable and are not a reason to panic, abandon the review, or silently implement cleanup.
- **Return Codex output verbatim.** No paraphrasing or summarizing of review or task output. Present findings ordered by severity, with file paths and line numbers exactly as reported. You may append one `## Claude's assessment` section *after* the verbatim block — see "Assessing the output" below.
- **Know what intentionally writes.** `task` is write-capable and may edit the workspace. `review` and `adversarial-review` must not intentionally change reviewed files, configuration, the Git index, refs, or commits.
- **Don't improvise auth.** If Codex isn't set up/authenticated, send the user to `/codex:setup`.
- **Say what changed and what broke.** If Codex edited files, state that and list the touched files the helper reports. If there were no findings, say so plainly and keep the residual-risk note to a line. If the run failed or the output came back malformed, surface the most actionable stderr lines and stop there rather than guessing at what Codex would have said.

Review commands may use a dedicated temporary directory for probes. Repo-native checks may also run in the repository when that produces better evidence, even if they leave incidental artifacts such as `.ruff_cache/`. Do not run commands intended to rewrite reviewed work, such as `ruff check --fix`, `ruff format`, snapshot updates, codemods, or lockfile-updating package-manager operations.

## Commands you can invoke

### `codex:review` — native code review (repository-preserving)
Reviews local git state.
- Flags: `--base <ref>`, `--scope auto|working-tree|branch`.
- No focus text, no staged-only/unstaged-only.
- **Always launch it as a background Bash task**, and don't ask which mode to use. To report in-turn anyway, block with `/codex:status <id> --wait --timeout-ms <ms>` then `/codex:result <id>`.
- Use for: a straight defect review of uncommitted changes (`--scope working-tree`) or a branch vs base (`--base main`).
- Examples: `/codex:review`, `/codex:review --base main`, `/codex:review --scope working-tree`.

### `codex:adversarial-review` — challenge review (repository-preserving)
Same targets + `--base`, but it **attacks the approach/design/tradeoffs/assumptions** ("break confidence in the change"), not just defects.
- **Always launch it as a background Bash task**, and don't ask which mode to use. To report in-turn anyway, block with `/codex:status <id> --wait --timeout-ms <ms>` then `/codex:result <id>`.
- **Unlike `review`, it accepts extra focus text** after the flags.
- Use for: pre-ship pressure-testing — is this the right design? what breaks under load/partial-failure/rollback?
- Examples: `/codex:adversarial-review`, `/codex:adversarial-review --base main challenge the retry + caching design`.

### `/codex:task` — delegate write-capable work (user-invoked only)
Hands a task to Codex (debug, fix, implement, investigate, or continue prior Codex work). **The user runs it; you cannot** — it carries `disable-model-invocation`, so it never appears in your skill list and the `Skill` tool refuses it. When a handoff would help, say so and let the user type it. Once they do, the command body runs in this session: you build one `codex-companion.mjs task` call and return its stdout verbatim.
- Flags: `--background` | `--wait`, `--resume` | `--fresh`, `--model <name|spark>`, `--effort <none|minimal|low|medium|high|xhigh>`.
- **Write-capable by default.** Worth suggesting for substantial, clearly-bounded handoffs; not for quick tasks you can finish yourself.
- `--model`/`--effort`: leave unset unless the user asks (Codex picks sane defaults). `spark` → `gpt-5.3-codex-spark`. Any other model name passes through.
- `--resume` continues the latest Codex thread in this repo; `--fresh` forces a new one.
- `--with-session` imports the current Claude session into the Codex thread first, so Codex starts from the actual investigation instead of a one-line restatement. Use it when the task depends on the conversation so far; it cannot be combined with `--resume`.
- Sandbox: a write-capable task inherits the user's own Codex configuration rather than a narrower plugin-chosen one, so it can run the build, the tests, and the network calls a fix usually needs.
- Return the companion's stdout verbatim; an assessment section after it is allowed, a rewrite of it is not.
- Examples: `/codex:task investigate why the integration test is flaky`, `/codex:task --model spark fix the failing test`, `/codex:task --resume apply the top fix`.

### `/codex:setup` — readiness + review gate (user-invoked only)
Checks Codex CLI install/auth. Point the user at it; you cannot run it. Can toggle the optional **stop-time review gate** (`--enable-review-gate` / `--disable-review-gate`) — when on, a `Stop` hook runs a Codex review of the previous turn and can block stopping until issues are addressed. The gate can create a long Claude↔Codex loop and burn usage; only enable it when actively watching.

## Background always

- Both reviews always run as background Bash tasks. There is no wait-vs-background decision and nothing to ask the user before starting one.
- To report findings in the same turn, block on the job rather than polling: `/codex:status <id> --wait --timeout-ms <ms>`, then `/codex:result <id>`.
- Otherwise hand off: tell the user it started and point them at `/codex:status`.

## Following up on a background job

You can invoke these yourself:
- `/codex:status [id]` — progress and recent jobs (also shows review-gate status and each job's live log path).
- `/codex:result [id]` — the final stored output of a finished job.

Prefer `/codex:status <id> --wait --timeout-ms <ms>` over polling: one blocking call beats a poll loop. The status output names the job's log file, which is written line-by-line while the run is in flight — read it if you need to see what Codex is doing mid-run.

These stay user-only, so route the user instead of invoking them:
- `/codex:cancel [id]` — stops a running job and throws away in-flight work. With no id it reports each running job with the cost of cancelling it before anything is killed.
- `/codex:transfer` — hands the user's Claude session to Codex.

Jobs are tracked per workspace (max 50 retained). The default `/codex:status` view is scoped to the current Claude session; `--all` shows every retained job. Results survive the session that produced them — a job that was still running when a session ended is recorded as `interrupted`, not deleted. If a job id cannot be found, the error names the other plugin-install store it lives in rather than implying the run is gone.

## Assessing the output

Running a second model is only worth it if its output can be argued with. Verbatim is about not filtering what Codex said — it is not an instruction to be a pipe.

After the verbatim block you may add one `## Claude's assessment` section when you have something checkable: a finding you can disprove, a `file:line` it misread, a consequence it missed, a severity you would rank differently, or — for a task run — a change you can show is wrong or incomplete. Attach the evidence each time: a path and line, or the command you ran and what it printed. Skip the section entirely when you only agree; restating agreement is noise.

## Review output shape

Both review commands return JSON against a fixed schema:
- `verdict`: `approve` | `needs-attention`. A run that was interrupted has **no** verdict: the plugin reports it as unfinished and shows the reviewer's last interim message, labelled as not a verdict. Do not read that message as a result.
- An `Assessment moved: approve -> needs-attention (final)` line appears when the reviewer's interim verdicts changed during the run. Treat it as signal about how confident the final verdict is, and pass it through with the rest of the output.
- `findings[]`: each has `severity` (`critical|high|medium|low`), `title`, `body`, `file`, `line_start`, `line_end`, `confidence` (0–1), `recommendation`.
- `next_steps[]`: short follow-up actions.

Present findings severity-ordered; preserve confidence and any "inference/uncertainty" markers Codex includes.

## Prompting Codex (when shaping a task prompt)

Codex responds best to compact, XML-block prompts. GPT-5.6 is concise and proactive by default, so state the goal, the success criteria, and the boundaries — then stop. Assemble only the blocks the task needs:

- Always: `<task>` (exact job + scope) + the smallest output contract (`<structured_output_contract>` or `<compact_output_contract>`).
- Add as needed: `<default_follow_through_policy>` (act vs stop-and-ask), `<verification_loop>` (correctness), `<grounding_rules>` (don't invent — for review/research), `<action_safety>` (write-capable/broad tasks), `<missing_context_gating>` (don't guess).

Recipes (block combos): **Diagnosis**, **Narrow Fix**, **Root-Cause Review**, **Research/Recommendation**, **Prompt-Patching**. The full templates and the GPT-5.6 specifics live in the plugin's `codex-prompting` skill, which is user-invoked only (`/codex:codex-prompting`) and so never appears in your skill list — ask the user to run it if you want the templates verbatim.

Antipatterns to avoid: vague task framing ("take a look"), no output contract, mixing unrelated jobs in one run, asking for "more reasoning" instead of a tighter contract, repeating the same rule in several blocks, blanket "always/never" for judgment calls, and unsupported certainty (ground claims).

One task per run — split unrelated asks into separate Codex runs.
