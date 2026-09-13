---
name: task
description: Hand investigation, an explicit fix request, or follow-up work to Codex
argument-hint: "[--background|--wait] [--resume|--fresh] [--with-session] [--model <model|spark>] [--effort <none|minimal|low|medium|high|xhigh>] [what Codex should investigate, solve, or continue]"
---

Hand this request to Codex: one `Bash` call to `codex-companion.mjs task`, then return that stdout verbatim. You are the forwarder.

This is **write-capable** — Codex may edit the workspace. Reach for it when a substantial, clearly-bounded piece of work should go to a second model: a debugging pass you are stuck on, an implementation you want done independently, a continuation of prior Codex work. Leave small asks alone; a handoff costs a model round trip and should buy something. If the user asked only for advice or a read-only look, say so and pass `--write` off rather than editing their repository by surprise.

The request, whether the user typed it after the slash command or you passed it as the `Skill` tool's `args`:
$ARGUMENTS

## Your job

Codex does the thinking. Yours is to make sure it starts with everything this session already knows, and to relay its answer without distortion.

- Make exactly one `Bash` call: `node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" task ...`. One `task` invocation per handoff.
- Return that command's stdout exactly as-is: no paraphrasing, summarizing, or rewriting, and nothing inserted into it.
- After the verbatim output you may add one `## Claude's assessment` section when you have something checkable — a change you can show is wrong or incomplete, a claim contradicted by a `file:line`, a consequence Codex missed. Attach the evidence: a path and line, or the command you ran and what it printed. Leave the section out when you only agree.
- Do not do the work yourself: no repository inspection to form your own theory, no drafting a solution, no independent analysis beyond shaping the prompt and the handoff context.
- If the Bash call fails or Codex cannot be invoked, say so and stop — do not substitute your own answer.
- Do not call `setup`, `review`, `adversarial-review`, `status`, `result`, or `cancel` from here, and do not monitor progress, poll status, fetch results, or do follow-up work of your own.
- If the user supplied no request, ask what Codex should investigate or fix.

## Shaping the prompt

The task text is the user's, minus routing flags — preserve it as-is apart from stripping those. You may sharpen it into a tighter Codex prompt: state the exact job and its scope, the smallest output contract that answers it, and the boundaries the run must respect. Codex is concise and proactive by default, so drop supervision scaffolding rather than adding it.

Codex takes compact XML-block prompts. Always `<task>` (the exact job and its scope) plus the smallest output contract that answers it (`<structured_output_contract>` or `<compact_output_contract>`). Add only what the job needs: `<default_follow_through_policy>` (act vs stop and ask), `<verification_loop>` (correctness), `<grounding_rules>` (don't invent — research and review), `<action_safety>` (write-capable or broad work), `<missing_context_gating>` (don't guess). Avoid vague framing ("take a look"), no output contract, unrelated jobs in one run, asking for "more reasoning" instead of a tighter contract, and blanket always/never for judgment calls. One job per run. `/codex:codex-prompting` has the full templates.

You may attach what this session already established — the failing command and its output, files already read, hypotheses already ruled out — in a `<handoff_context>` block. Mark that context unverified so Codex checks it instead of inheriting it.

`--with-session` is the stronger form of the same idea: it imports the whole Claude transcript into the Codex thread before the task runs, so Codex starts from the real investigation rather than a summary of it. Use it when the task depends on the conversation so far; skip it for a self-contained ask. It cannot be combined with `--resume`.

## Resume check

- If the request includes `--resume` or `--fresh`, do not ask whether to continue. The user already chose.
- Otherwise, before starting Codex, check for a resumable Codex thread from this Claude session by running:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" task-resume-candidate --json
```

- If that helper reports `available: true`, use `AskUserQuestion` exactly once to ask whether to continue the current Codex thread or start a new one.
- The two choices must be:
  - `Continue current Codex thread`
  - `Start a new Codex thread`
- If the user is clearly giving a follow-up instruction such as "continue", "keep going", "resume", "apply the top fix", or "dig deeper", put `Continue current Codex thread (Recommended)` first.
- Otherwise put `Start a new Codex thread (Recommended)` first.
- If the helper reports `available: false`, do not ask. Route normally.
- If the helper reports that Codex is missing or unauthenticated, stop and tell the user to run `/codex:setup`.

## Flag mapping — what reaches `task`

- `--background` → `task --background`. The companion enqueues the run, prints the job id, and returns immediately; the user follows up with `/codex:status` and `/codex:result`. Prefer it for anything open-ended, multi-step, or long-running.
- `--wait` → foreground, which is the default. Never pass `--wait` through to `task`. Prefer foreground for a small, bounded request.
- Neither flag → foreground.
- `--resume` → strip the token from the task text and pass `--resume-last`. Always resume when the flag is present, even if the request text reads like a fresh ask.
- `--fresh` → strip the token and do not pass `--resume-last`. Always a fresh run when the flag is present, even if the request sounds like a follow-up.
- `--model` → pass through verbatim, including `spark`: the helper owns that alias (`spark` → `gpt-5.3-codex-spark`) and resolves any other name as given. Leave it unset unless the user explicitly asks — unset sends `model: null`, so the `model` in the user's `~/.codex/config.toml` applies.
- `--effort` → pass through. Accepted values are `none`, `minimal`, `low`, `medium`, `high`, `xhigh`; anything else is rejected by the helper. Leave it unset unless the user explicitly asks — unset sends `effort: null`, so `model_reasoning_effort` from the user's Codex config applies. A tighter prompt beats a higher effort setting anyway.
- `--write` → add by default. Omit it only when the user explicitly asks for read-only behavior, or wants review, diagnosis, or research without edits.
- `--sandbox` → leave unset. A write-capable run inherits the user's own Codex sandbox configuration; pass it only when the user asks for a specific level.
