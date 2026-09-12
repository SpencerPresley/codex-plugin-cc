# Changelog

## 1.0.10

Context cost:

- `/codex:rescue` is now a single user-invoked skill (`skills/rescue/SKILL.md`). The `codex:codex-rescue` subagent and the `codex-cli-runtime` skill are gone: the main session builds the one `codex-companion.mjs task` call itself, so the forwarding contract and the flag mapping live in one file instead of three. Transcript evidence for the collapse: the subagent was dispatched zero times across every recorded session, while 71 `codex-companion.mjs task` calls came straight from main threads.
- That also retires the `#234` recursion class by construction — there is no command → `Agent` → `Skill` path left to re-enter.
- `/codex:rescue` carries `disable-model-invocation`, so it stays out of Claude's context until the user types it. Claude can suggest a handoff; it can no longer start one, and neither can a subagent.
- `codex-prompting` swaps `user-invocable: false` for `disable-model-invocation: true`: still on disk and still runnable as `/codex:codex-prompting`, but no longer occupying a listing slot in every session. `codex:using-codex` keeps the condensed prompting guidance Claude actually works from.
- The rescue skill declares no `allowed-tools`. It runs in the user's main session, where an allowlist would clamp the whole turn rather than one step.

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
