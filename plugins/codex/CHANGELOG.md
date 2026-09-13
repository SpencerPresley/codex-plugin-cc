# Changelog

## 1.0.10

Layout:

- `plugins/codex/commands/` no longer exists. Every surface is a skill under `skills/`, because a command and a skill are the same mechanism in Claude Code: both are invokable by the `Skill` tool, both can be typed as `/codex:<name>`, both read `argument-hint` and `$ARGUMENTS`, and `disable-model-invocation` governs model access in either directory. Keeping two directories for one mechanism only made it easy for the two halves to drift, which is what the rest of this release spent its time undoing.

Context cost:

- **`/codex:rescue` is now `/codex:task`**, a single user-invoked skill (`skills/task/SKILL.md`). The `codex:codex-rescue` subagent and the `codex-cli-runtime` skill are gone: the main session builds the one `codex-companion.mjs task` call itself, so the forwarding contract and the flag mapping live in one file instead of three. Transcript evidence for the collapse: the subagent was dispatched zero times across every recorded session, while 71 `codex-companion.mjs task` calls came straight from main threads.
- The rename ends a vocabulary split — the command was always `codex-companion.mjs task` under a "rescue" label. `/codex:status` and `/codex:result` now label new jobs `task` as well; jobs recorded before this release keep their stored `rescue` label.
- That also retires the `#234` recursion class by construction — there is no command → `Agent` → `Skill` path left to re-enter.
- `/codex:rescue` carries `disable-model-invocation`, so it stays out of Claude's context until the user types it. Claude can suggest a handoff; it can no longer start one, and neither can a subagent.
- `codex-prompting` swaps `user-invocable: false` for `disable-model-invocation: true`: still on disk and still runnable as `/codex:codex-prompting`, but no longer occupying a listing slot in every session. `codex:using-codex` keeps the condensed prompting guidance Claude actually works from.
- `codex-result-handling` gets the same treatment: `disable-model-invocation` instead of `user-invocable: false`. The three rules it held that nothing else stated — name the files Codex edited, say plainly when there were no findings, surface stderr and stop on a failed or malformed run — moved into `codex:using-codex` first.
- Both review commands move to skills — `skills/review/SKILL.md` and `skills/adversarial-review/SKILL.md` — stay model-invokable, and always background. Its `--wait`/`--background` flags were decoration and are gone from the docs entirely: `handleReviewCommand` parses both and then calls `runForegroundCommand` unconditionally, so only a Claude-side background task ever detached a review. Dropping them removes the size estimate and the `AskUserQuestion` round trip before every review; the emptiness guard stays, because `auto` scope resolves to a branch diff on a clean tree and would otherwise spend a run reviewing nothing.
- `/codex:cancel` moves to `skills/cancel/SKILL.md` and stops guessing: it is scoped to jobs this Claude session launched, stops them by stopping their background shell, and with no job id reports each running job — purpose, elapsed time, what cancelling costs, and a recommendation — before anything is killed. The `cancel` helper is now the fallback for an id this session did not launch, and it asks first.
- `/codex:setup` moves to `skills/setup/SKILL.md` with `disable-model-invocation`. It had never been model-invoked in any recorded session, and everything that mentions it only ever points the user at it. Dropping its `allowed-tools` also means a global `npm install -g @openai/codex` prompts for permission instead of being pre-authorized.
- The task skill declares no `allowed-tools`. It runs in the user's main session, where an allowlist would clamp the whole turn rather than one step.

Collaboration:

- Review collection matches how the runtime actually behaves. A backgrounded run already writes its fully rendered review to the task output file and notifies on completion, so both review skills now say: don't poll, wait for the notification, `Read` that file, return everything between the `# Codex ...` heading and the `[exited with code N]` marker. The `/codex:status --wait` + `/codex:result <id>` dance that shipped earlier in this release was solving a problem the harness had already solved, and the wait-vs-hand-off fork went with it — the notification arrives either way.
- `/codex:result` follows suit and becomes a user-invoked skill (`skills/result/SKILL.md`, `disable-model-invocation`). It re-renders a finished job from the store, which is what *the user* needs, since they never saw Claude's completion notification. `/codex:status` stays model-invokable for looking in on a live run or listing jobs from an earlier session; its blocking `--wait` is now a fallback rather than the norm.
- `status` and `transfer` drop `allowed-tools`, as the other converted surfaces did.
- The review skills no longer assert what happens after findings land. What survives is the property of the run — Codex judges the work without rewriting it — while acting on the findings follows whatever the caller was asked to do. The old "review-only, do not fix, ask which findings the user wants fixed" wording came from a file that cannot see the caller's intent, and it fought any review-then-fix loop. Same change in `codex:using-codex` and `codex-result-handling`.
- Audit of the review skills after the collapse turned up four more leftovers from the foreground era, all fixed: the verbatim rule named "command stdout" when an always-background run has no foreground stdout to quote (it is the review output, read from the job or `/codex:result`); handing off to the user was written as the default while blocking on the job was an afterthought, which is the same caller-intent mistake as the fix prohibition (now two named paths, neither default); the git-state checks were ordered after the targeting step that needs them; and "if the user needs adversarial framing they should use `/codex:adversarial-review`" told Claude to relay a suggestion instead of switching skills itself.
- Both review descriptions now carry what distinguishes them — `review` is the unsteered defect pass that takes no focus text, `adversarial-review` accepts focus text to aim at a decision or risk. The description is the only part of a skill that reaches the model before it decides to invoke, so the pair was easy to confuse from the listing alone.
- Both review skills now choose their target by invocation provenance rather than by whether arguments happen to be empty. Arguments win when present; with none, a user-typed invocation (identifiable by the `<command-name>` block in the turn) gets one `AskUserQuestion` with a git-state-based recommendation, while a `Skill` call Claude made itself picks the scope from git state and says so. Claude asking itself for targeting was the failure mode of keying on emptiness.

- "Return Codex output verbatim" was reading as "be a pipe." Every place that states it now also states the counterpart: one `## Claude's assessment` section may follow the verbatim block when there is something checkable to add — a finding that can be disproved, a misread `file:line`, a missed consequence, a severity worth re-ranking — with the evidence attached, and omitted when the only thing to add is agreement. Two model families with different blind spots are the reason to run both.

Accuracy:

- Model and effort defaults are described as what the helper does: unset sends `model: null` / `effort: null`, so `~/.codex/config.toml` decides. The old "Codex defaults to `medium`" line was OpenAI's API default, not what a configured machine resolves to.
- `spark` alias resolution is documented as the helper's job (`MODEL_ALIASES` in `scripts/codex-companion.mjs`) rather than something Claude restates and can drift from.

## 1.0.9

Durability and recovery:

- Ending a Claude session no longer deletes that session's Codex results. Jobs still running are stopped and recorded as `interrupted`; finished results and their logs stay on disk.
- Job lookups that miss now name the other plugin-install store the job lives in instead of reporting that nothing exists.
- `/codex:transfer` derives the Claude transcript path from the session id when the SessionStart hook never recorded it, and names the expected path when it cannot.
- Background launches and status output surface each job's live log file.

Capability:

- A write-capable `/codex:rescue` inherits the sandbox from the user's own Codex configuration instead of being narrowed to `workspace-write` (which blocks network access). `task --sandbox` pins a specific level.
- Write-capable runs carry a `<task_workspace_policy>` contract: stay in scope, do not rewrite Git history, verify before reporting, say what changed.
- The stop-time review gate runs unsandboxed with the same repository-preserving contract as `/codex:review`, and allows the stop when the gate itself fails instead of trapping the session.

Result integrity:

- A review's interim assessments are rendered as an `Assessment moved: ...` line when the verdict changed during the run, on both review paths, and the retained timeline is bounded (20 entries, each truncated) so a long run cannot inflate the stored job.
- An unfinished native review no longer reports a summary claiming it completed.
- Job lookups probe the well-known plugin-data layout, so a job is still findable when `CLAUDE_PLUGIN_DATA` never reached the process and it is running from the temp fallback.
- `--write` and `--sandbox` are reconciled instead of silently resolved, and `--no-workspace-policy` is restricted to the stop-time gate.

- A review that did not finish reports no verdict. Previously the reviewer's last interim message — schema-valid, and often `approve` — could be rendered as a final result.
- Interim assessments are retained on the job payload as a timeline instead of being discarded.
- Runs that end through inferred completion are recorded as completed rather than failed.
- Subagent labels survive notifications that arrive before the turn is acknowledged.

Collaboration:

- Claude can invoke `/codex:status` and `/codex:result` to follow a background job it launched. `/codex:cancel` and `/codex:transfer` stay user-only.
- Claude may append one `## Claude's assessment` section after a verbatim review, for evidence-backed disagreement. Applying fixes without asking remains forbidden.
- `task --with-session` imports the current Claude session into the Codex thread so a delegated task starts from the real investigation.

Prompting:

- `gpt-5-4-prompting` is now `codex-prompting`, rewritten against OpenAI's GPT-5.6 guidance; docs no longer pin a stale model generation.
- The adversarial review prompt drops duplicated rules and brevity scaffolding.

## 1.0.0

- Initial version of the Codex plugin for Claude Code
