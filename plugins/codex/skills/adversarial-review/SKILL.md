---
name: adversarial-review
description: Run a Codex review that challenges the implementation approach and design choices
argument-hint: '[--base <ref>] [--scope auto|working-tree|branch] [focus ...]'
---

Run an adversarial Codex review through the shared plugin runtime.
Position it as a challenge review that questions the chosen implementation, design choices, tradeoffs, and assumptions.
It is not just a stricter pass over implementation defects.

Arguments, whether the user typed them after the slash command or you passed them as the `Skill` tool's `args`:
`$ARGUMENTS`

The run itself is repository-preserving: Codex challenges the work, it does not rewrite it. What happens after the findings land is the caller's business, not this skill's.

Keep the framing focused on whether the current approach is the right one, what assumptions it depends on, and where the design could fail under real-world conditions.

Execution:
- Always launch it as a background Bash task (`run_in_background: true`), the same way you would background any long command. There is no wait-vs-background choice to make and nothing to ask about it: a challenge review reads the diff, the surrounding code, and often runs checks, so holding the turn open buys nothing.

Before launching, confirm there is something to review:
- For working-tree or auto scope: `git status --short --untracked-files=all`, and `git diff --shortstat --cached` plus `git diff --shortstat`.
- For base-branch review: `git diff --shortstat <base>...HEAD`.
- Treat untracked files or directories as reviewable work even when `git diff --shortstat` is empty.
- Only conclude there is nothing to review when the relevant scope is actually empty. When in doubt, run the review.
- This guard is worth the two git calls: with a clean tree and nothing ahead of the base, `auto` still resolves to a branch diff, so an empty repository state otherwise spends a Codex run reviewing nothing.

Targeting:
- Arguments provided: run with them exactly as given. Do not ask, and do not rewrite them.
- No arguments, and **you** invoked this skill: do not ask. Choose the target from the git state you just checked — dirty tree, `--scope working-tree`; clean tree that is ahead of its base, `--base <base>`; both in play, the default `auto` — and state which you chose in one line. You already know what you are reviewing, so a question here interrupts the user for nothing.
- No arguments, and **the user** invoked it bare: ask once with `AskUserQuestion`, using that same git state to order the options and pick the recommendation. Put the recommended option first and suffix its label with `(Recommended)`:
  - `Working tree` — review uncommitted changes (`--scope working-tree`). Recommend when the tree is dirty.
  - `Branch vs <base>` — review the branch against its detected default branch (`--base <base>`). Recommend when the tree is clean and the branch is ahead.
  - `Everything uncommitted plus the branch` — the default `auto` scope.
- Telling the two apart: a user-typed invocation puts a `<command-name>` block for this skill in the turn, carrying whatever they typed in `<command-args>`. A `Skill` tool call of your own has no such block.
- Focus text counts as arguments. Focus text with no target flags runs under `auto` scope; do not ask.

Argument handling:
- Preserve the user's arguments exactly.
- Do not weaken the adversarial framing or rewrite the user's focus text.
- This review uses the same target selection as `/codex:review`: working-tree review, branch review, and `--base <ref>`.
- It does not support `--scope staged` or `--scope unstaged`.
- Unlike `/codex:review`, it can still take extra focus text after the flags.

Launch:
```typescript
Bash({
  command: `node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" adversarial-review "$ARGUMENTS"`,
  description: "Codex adversarial review",
  run_in_background: true
})
```
- Do not call `BashOutput` or wait for completion in that same step.
- Then tell the user: "Codex adversarial review started in the background. Check `/codex:status` for progress." `/codex:status` lists this session's jobs, so neither of you needs to have captured the job id.
- To present the findings in this turn rather than handing off, block on the job instead of polling: `/codex:status <id> --wait --timeout-ms <ms>`, then `/codex:result <id>`.

Reporting:
- Return the command stdout verbatim, exactly as-is.
- Do not paraphrase, summarize, or rewrite it, and do not put anything before it.

Assessment (optional, after the verbatim output):
- You may add one section titled `## Claude's assessment` *after* the verbatim block, never before it and never interleaved.
- Use it only for something checkable: a finding you can show is wrong, a file:line the reviewer misread, a missing consequence, or a finding you would rank differently and why.
- Cite evidence the same way you would expect from a reviewer: the path and line, or the command you ran and what it printed.
- Codex and Claude are different models with different blind spots; a second opinion is the point of running the review. Agreement adds nothing on its own, so write the section only when you have something concrete to add.
