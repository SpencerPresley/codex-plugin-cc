---
description: Cancel an active background Codex job in this repository
argument-hint: '[job-id]'
disable-model-invocation: true
---

`job-id`: "$ARGUMENTS"

A `codex job` refers to a codex task which was initiated within a Claude Code session via this plugin, this plugin is `spencer-codex`.

## `job-id` provided

### Scenario A: There is a background shell running a codex with `job-id` within the current session

Cancel it via stopping the background shell task as normal with `StopTask` or via killing the process.

### Scenario B: No `job-id` was provided and there is not a codex job running in the current session with that `job-id`

Present a question to the user with the `AskUserQuestion` tool.

For the question description state: `"There are no currently running codex jobs with the job id: <job-id> in this session, what to do?"`, then provide the following question options:

- "Attempt to cancel it via `node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" cancel "<job-id>"`"
- "Nevermind"

You may provide additional information in those options if relevant.

## No `job-id` provided

If no `job-id` is provided, then ONLY consider codex jobs running within the current session.

### Response Format / Guidance

For each codex job:

Mark the job with a section titled `## Job <job-id>`

In a section titled `### Job Info`, state the following:

- **Job ID**: `job-id`
- **What the job is for**: Provide 1-2 sentences detailing what the job is for
- **Time Elapsed**: How long the job has been running in minutes

In a section titled `### Cancellation Consequences and Recommendation`, state the following:

- **Cancellation Consequences**: Provide 1-2 sentences detailing the consequence to cancelling it e.g., progress will be lost, the review will not be ran, the task will not be finished, and so forth. If the job is a review/adversarial-review/task related to either a planning or execution phase ask the user how they would like to proceed e.g., skip the review, have claude review instead, have claude do the task instead, and so forth, same applies if its a branch or PR review.
- **Recommendation**: `"Cancel"` or `"Do not cancel`" followed by 1-2 sentences explaining your reasoning why.
