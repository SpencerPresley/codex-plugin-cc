---
description: Show active and recent Codex jobs for this repository, including review-gate status
argument-hint: '[job-id] [--wait] [--timeout-ms <ms>] [--all]'
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" status "$ARGUMENTS"`

If the user did not pass a job ID:
- Render the command output as a single Markdown table for the current and past runs in this session.
- Keep it compact. Do not include progress blocks or extra prose outside the table.
- Preserve the actionable fields from the command output, including job ID, kind, status, phase, elapsed or duration, summary, and follow-up commands.

If the user did pass a job ID:
- Present the full command output to the user.
- Do not summarize or condense it.

If you launched the job yourself:
- You do not need this to collect its output. A backgrounded run notifies you when it finishes and writes the rendered result to its own output file; read that instead.
- Use this to look in on a run that is still going — the output includes the job's live log path, written line by line while the run is in flight.
- If you genuinely have to wait on a job rather than collect a notification, block once with `/codex:status <id> --wait --timeout-ms <ms>` instead of polling repeatedly.
