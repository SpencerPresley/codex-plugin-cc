---
name: codex-prompting
description: Reference for composing Codex prompts (currently GPT-5.6) for coding, review, diagnosis, and research tasks inside the Codex Claude Code plugin
disable-model-invocation: true
---

# Codex Prompting

Reference for shaping a Codex task prompt. Model invocation is disabled, so this stays out of context until the user runs `/codex:codex-prompting`; `codex:task` carries the condensed version Claude works from.

Codex is a capable collaborator working the same problem you are, not a tool you configure. Give it the job, what "done" looks like, and the boundaries that matter — then let it work. The prompt's job is to remove ambiguity, not to supervise.

> **Model:** Codex currently routes to the **GPT-5.6** family (`gpt-5.6`, `gpt-5.6-sol` for quality-first work, `gpt-5.6-terra` for balance, `gpt-5.6-luna` for high throughput). The guidance below follows OpenAI's GPT-5.6 prompting guide. Do not pin a model in the prompt; the user's Codex config chooses it.

## What changed with GPT-5.6

- **It is more concise by default.** Brevity scaffolding ("be terse", "no filler") is mostly dead weight now. Delete it before adding anything.
- **Leaner prompts score better.** OpenAI measured roughly 10-15% higher eval scores with 41-66% fewer tokens after trimming system prompts. Cutting a redundant rule is a quality change, not just a cost change.
- **It is more proactive across multi-step work.** That calls for clear boundaries, not closer supervision: say what the run is authorized to do and when to stop, then stay out of the way.
- **Do not reach for reasoning effort as a fix.** The plugin sends `effort: null` when `--effort` is unset, so `model_reasoning_effort` from the user's `~/.codex/config.toml` decides (OpenAI's own default is `medium`, but the local config overrides it). Leave `--effort` alone unless the user asks for something specific; a tighter prompt buys more than a higher effort setting.

## Prompt shape

Include only the sections the task actually needs. Each one should change behavior; if it does not, cut it.

- **Role** — who Codex is on this task, when it is not obvious.
- **Goal** — the user-visible outcome, not the steps.
- **Success criteria** — what must be true before it can call the job done.
- **Constraints** — real limits: scope, safety, evidence standards.
- **Tools** — which to use when, and what their failure modes mean.
- **Output** — the exact shape the answer must take.
- **Stop rules** — when to ask instead of proceeding, and when to abandon an approach.

Keep the plugin's XML block names (`<task>`, `<structured_output_contract>`, `<verification_loop>`, `<grounding_rules>`, `<action_safety>`, `<missing_context_gating>`) — they map onto these sections and stay consistent with the built-in review prompts. See [references/prompt-blocks.md](references/prompt-blocks.md).

## Rules that carry their weight

- One task per run. Split unrelated asks into separate runs.
- Say what done looks like. Do not assume it will infer the desired end state.
- Require grounding wherever an unsupported guess would be expensive: cite the file, the line, or the command output.
- Require verification for anything that changes code: which test or command was run, and what it printed.
- Tighten the contract before raising reasoning effort. If the answer is weak, the prompt is usually missing a success criterion, a dependency rule, a tool-routing rule, or a verification loop — raising effort hides that instead of fixing it.
- Hand over what you already know. A rescue that restates the user's one-line ask makes Codex rediscover everything you established; pass the failing command and its output, the paths already read, and what you ruled out. `task --with-session` gives it the whole Claude thread.
- Label handed-over context as unverified. Codex should check it, not inherit your conclusions.

## Anti-patterns (OpenAI's list, and they cost real quality)

- Repeating the same rule in several sections.
- "Always" / "never" for judgment calls that are not actually invariants.
- Vague quality words ("be thorough", "use tools efficiently") with no concrete behavior attached.
- Generic instructions standing in for a clear goal and success criteria.
- Asking for narration of routine tool calls in long workflows.
- Rewriting a whole prompt stack at once when something regresses — change one thing, re-run, compare.

More in [references/codex-prompt-antipatterns.md](references/codex-prompt-antipatterns.md); end-to-end templates in [references/codex-prompt-recipes.md](references/codex-prompt-recipes.md).

## Assembly checklist

1. State the task and its scope.
2. Choose the smallest output contract that makes the answer usable.
3. Decide what the run is authorized to do, and when it should stop and ask.
4. Add grounding, verification, and safety blocks only where the task needs them.
5. Attach the context you already have, marked as unverified.
6. Delete every line that would not change what Codex does.
