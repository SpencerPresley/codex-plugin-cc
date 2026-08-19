---
description: Show the stored final output for a finished Codex job in this repository
argument-hint: '[job-id]'
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" result "$ARGUMENTS"`

Present the full command output to the user. Do not summarize or condense it. You may add one `## Claude's assessment` section after it when you have specific, evidence-backed disagreement or context; never edit files off the back of a result without asking. Preserve all details including:
- Job ID and status
- The complete result payload, including verdict, summary, findings, details, artifacts, and next steps
- File paths and line numbers exactly as reported
- Any error messages or parse errors
- Follow-up commands such as `/codex:status <id>` and `/codex:review`
