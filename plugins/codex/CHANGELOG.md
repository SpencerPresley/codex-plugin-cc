# Changelog

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
