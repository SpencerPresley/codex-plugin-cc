---
name: adversarial-review
description: Run a Codex review that challenges the implementation approach, design choices, tradeoffs, and assumptions — accepts focus text to aim it at a specific decision or risk
argument-hint: '[--base <ref>] [--scope auto|working-tree|branch] [focus ...]'
---

Run an adversarial Codex review through the shared plugin runtime.
Position it as a challenge review that questions the chosen implementation, design choices, tradeoffs, and assumptions.
It is not just a stricter pass over implementation defects.

Arguments, whether the user typed them after the slash command or you passed them as the `Skill` tool's `args`:
`$ARGUMENTS`

The run is repository-preserving: Codex challenges the work, it does not rewrite it. What happens after the findings land is the caller's business, not this skill's.

Repository-preserving is not filesystem-read-only, though. Codex runs without filesystem sandboxing so it can use its full toolset, and legitimate inspection may leave caches, logs, build output, coverage data, or scratch probes in a temporary directory. Those incidental artifacts do not invalidate the review and are not worth cleaning up or panicking over. What it must not do is run commands whose purpose is to rewrite the reviewed work — `ruff check --fix`, formatters, snapshot updates, codemods, lockfile-updating installs.

## 1. Read the git state

- `git status --short --untracked-files=all`
- `git diff --shortstat --cached` and `git diff --shortstat`
- `git diff --shortstat <base>...HEAD` when a base is already known from the arguments.

Treat untracked files or directories as reviewable work even when `git diff --shortstat` is empty. Conclude there is nothing to review only when the relevant working-tree status is empty *and* the branch diff is empty; when in doubt, run the review. This is worth the git calls: with a clean tree and nothing ahead of the base, `auto` still resolves to a branch diff, so an empty repository state otherwise spends a Codex run reviewing nothing.

## 2. Pick the target

- Arguments provided: run with them exactly as given. Do not ask, and do not rewrite them.
- No arguments, and **you** invoked this skill: do not ask. Choose from the state above — dirty tree, `--scope working-tree`; clean tree that is ahead of its base, `--base <base>`; both in play, the default `auto` — and state which you chose in one line. You already know what you are reviewing, so a question here interrupts the user for nothing.
- No arguments, and **the user** invoked it bare: ask once with `AskUserQuestion`, using that same state to order the options and pick the recommendation. Put the recommended option first and suffix its label with `(Recommended)`:
  - `Working tree` — review uncommitted changes (`--scope working-tree`). Recommend when the tree is dirty.
  - `Branch vs <base>` — review the branch against its detected default branch (`--base <base>`). Recommend when the tree is clean and the branch is ahead.
  - `Everything uncommitted plus the branch` — the default `auto` scope.
- Telling the two apart: a user-typed invocation puts a `<command-name>` block for this skill in the turn, carrying whatever they typed in `<command-args>`. A `Skill` tool call of your own has no such block.

Focus text counts as arguments: focus text with no target flags runs under `auto` scope, and you do not ask. Preserve the user's focus text as written and do not weaken the adversarial framing.

Scope limits: it takes the same targets as `codex:review` — working tree, branch, `--base <ref>` — and does not support `--scope staged` or `--scope unstaged`. Keep the framing on whether the current approach is the right one, what assumptions it depends on, and where the design could fail under real-world conditions.

## 3. Launch it in the background

Always launch as a background Bash task, the same way you would background any long command. There is no wait-vs-background choice to make and nothing to ask about it.

```typescript
Bash({
  command: `node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" adversarial-review "$ARGUMENTS"`,
  description: "Codex adversarial review",
  run_in_background: true
})
```

## 4. Collect it when the notification arrives

Backgrounding the `Bash` call gives you an output file path and a promise of a completion notification. That file ends up holding the fully rendered review, so collection is just a `Read`:

- Do not poll. No `BashOutput` loop, no `/codex:status` polling, no blocking wait — the notification is the signal.
- When it arrives, `Read` the output file named in the launch response.
- The file opens with a handful of `[codex] ...` progress lines, then the rendered review beginning at its `# Codex ...` heading. The review is everything from that heading to the trailing `[exited with code N]` marker.
- A non-zero exit code, or a file with progress lines and no rendered review, means the run failed. Report that and the most actionable lines from the file; do not reconstruct what the review would have said.
- Nothing here needs a job id. `/codex:status` is for looking in on a run mid-flight or listing jobs from an earlier session, not for collecting this one.

## 5. Report

- Return the rendered review verbatim, exactly as-is, findings in the severity order Codex gave them, with its confidence and any inference/uncertainty markers intact.
- An interrupted run has **no** verdict. The output labels the reviewer's last interim message as not a verdict; do not report it as one.
- An `Assessment moved: approve -> needs-attention (final)` line means the reviewer's verdict changed mid-run. Pass it through — it is signal about how settled the final verdict is.
- Strip only the `[codex]` progress lines and the `[exited with code N]` marker. Do not paraphrase, summarize, or rewrite what is between them, and do not put anything before it.

Assessment (optional, after the verbatim output):
- You may add one section titled `## Claude's assessment` *after* the verbatim block, never before it and never interleaved.
- Use it only for something checkable: a finding you can show is wrong, a file:line the reviewer misread, a missing consequence, or a finding you would rank differently and why.
- Cite evidence the same way you would expect from a reviewer: the path and line, or the command you ran and what it printed.
- Codex and Claude are different models with different blind spots; a second opinion is the point of running the review. Agreement adds nothing on its own, so write the section only when you have something concrete to add.
