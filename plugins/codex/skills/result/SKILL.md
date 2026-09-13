---
name: result
description: Re-read the stored output of a finished Codex job in this repository
argument-hint: '[job-id]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" result "$ARGUMENTS"`

This re-renders a job whose output already landed once, from the store on disk, so it stays readable after the session that produced it. Present the full command output to the user. Do not summarize or condense it. You may add one `## Claude's assessment` section after it when you have specific, evidence-backed disagreement or context; skip it when you only agree. Acting on what the result says follows whatever you were asked to do — this command reports, it does not decide that for you. Preserve all details including:
- Job ID and status
- The complete result payload, including verdict, summary, findings, details, artifacts, and next steps
- File paths and line numbers exactly as reported
- Any error messages or parse errors
- Follow-up commands such as `/codex:status <id>` and `/codex:review`
