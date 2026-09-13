# Codex plugin for Claude Code

Use Codex from inside Claude Code for code reviews or to delegate tasks to Codex.

This plugin is for Claude Code users who want an easy way to start using Codex from the workflow
they already have.

This is a Spencer-maintained fork/distribution of OpenAI's Apache-2.0 Codex plugin for Claude Code.
It is not an official OpenAI marketplace. This fork keeps local workflow edits, including the
`using-codex` skill and model-invokable review commands.

<video src="./docs/plugin-demo.webm" controls muted playsinline autoplay></video>

## What You Get

- `/codex:review` for a normal read-only Codex review
- `/codex:adversarial-review` for a steerable challenge review
- `/codex:task`, `/codex:transfer`, `/codex:status`, `/codex:result`, and `/codex:cancel` to delegate work, hand off sessions, and manage background jobs

## Requirements

- **ChatGPT subscription (incl. Free) or OpenAI API key.**
  - Usage will contribute to your Codex usage limits. [Learn more](https://developers.openai.com/codex/pricing).
- **Node.js 18.18 or later**

## Install

Add the marketplace in Claude Code:

```bash
/plugin marketplace add SpencerPresley/codex-plugin-cc
```

Install the plugin:

```bash
/plugin install codex@spencer-codex
```

Reload plugins:

```bash
/reload-plugins
```

Then run:

```bash
/codex:setup
```

`/codex:setup` will tell you whether Codex is ready. If Codex is missing and npm is available, it can offer to install Codex for you.

If you prefer to install Codex yourself, use:

```bash
npm install -g @openai/codex
```

If Codex is installed but not logged in yet, run:

```bash
!codex login
```

After install, you should see:

- the slash commands listed below

One simple first run is:

```bash
/codex:review
/codex:status
/codex:result
```

## Usage

### `/codex:review`

Runs a normal Codex review on your current work. It gives you the same quality of code review as running `/review` inside Codex directly.

> [!NOTE]
> Code review especially for multi-file changes might take a while. It's generally recommended to run it in the background.

Use it when you want:

- a review of your current uncommitted changes
- a review of your branch compared to a base branch like `main`

Use `--base <ref>` for branch review. It is not steerable and does not take custom focus text.

It **always runs in the background** as a Claude Code background task, with nothing to answer before it starts. Claude collects the result when the run notifies it; you can watch with [`/codex:status`](#codexstatus) or re-read it later with [`/codex:result`](#codexresult). Use [`/codex:adversarial-review`](#codexadversarial-review) when you want to challenge a specific decision or risk area.

Examples:

```bash
/codex:review
/codex:review --base main
/codex:review --scope working-tree
```

This command is repository-preserving: it runs Codex without filesystem sandboxing but does not intentionally edit or fix the reviewed work. Inspection and verification commands may create incidental caches, logs, build output, coverage data, or scratch probes in a temporary directory; those artifacts do not invalidate the review. Use [`/codex:status`](#codexstatus) to check on progress and [`/codex:cancel`](#codexcancel) to stop a run.

### `/codex:adversarial-review`

Runs a **steerable** review that questions the chosen implementation and design.

It can be used to pressure-test assumptions, tradeoffs, failure modes, and whether a different approach would have been safer or simpler.

It uses the same review target selection as `/codex:review`, including `--base <ref>` for branch review. Unlike `/codex:review`, it can take extra focus text after the flags.

It **always runs in the background** as a Claude Code background task, with nothing to answer before it starts. A challenge review reads the diff, the surrounding code, and often runs checks, so waiting on it buys nothing. Claude collects the result when the run notifies it; you can watch with [`/codex:status`](#codexstatus) or re-read it later with [`/codex:result`](#codexresult).

Use it when you want:

- a review before shipping that challenges the direction, not just the code details
- review focused on design choices, tradeoffs, hidden assumptions, and alternative approaches
- pressure-testing around specific risk areas like auth, data loss, rollback, race conditions, or reliability

Examples:

```bash
/codex:adversarial-review
/codex:adversarial-review --base main challenge whether this was the right caching and retry design
/codex:adversarial-review look for race conditions and question the chosen approach
```

This command is repository-preserving: it runs Codex without filesystem sandboxing but does not intentionally edit or fix the reviewed work. It may tolerate incidental tool output or use a temporary directory for scratch probes, but it does not run commands whose purpose is to rewrite reviewed code.

### `/codex:task`

Hands a task to Codex. The command runs in your main session: Claude builds one `codex-companion.mjs task` call, hands over the request plus whatever the session already established, and returns Codex's output verbatim — optionally followed by one `## Claude's assessment` section when Claude has something checkable to add.

This command is **user-invoked only** (`disable-model-invocation`), so Claude cannot start a Codex task on its own and the command stays out of Claude's context until you type it. Claude can suggest a handoff; you decide.

Use it when you want Codex to:

- investigate a bug
- try a fix
- continue a previous Codex task
- take a faster or cheaper pass with a smaller model

> [!NOTE]
> Depending on the task and the model you choose these tasks might take a long time, so `--background` is generally recommended: the companion enqueues the run, prints a job id, and you follow up with `/codex:status` and `/codex:result`.

It supports `--background`, `--wait`, `--resume`, `--fresh`, and `--with-session`. If you omit `--resume` and `--fresh`, the plugin can offer to continue the latest Codex thread for this repo.

`--with-session` imports the current Claude session into the Codex thread before the task runs, so Codex starts from the actual investigation — the failing command, what was already ruled out — instead of a one-line restatement of it. It cannot be combined with `--resume`, because a resumed Codex thread already carries its own history.

A write-capable task inherits the sandbox from your own Codex configuration rather than a narrower one chosen by the plugin, so it can run the build, the test suite, and any network calls the fix needs. Pass `--sandbox read-only|workspace-write|danger-full-access|inherit` to pin a specific level for one run. `--write` and `--sandbox read-only` contradict each other and are rejected rather than silently resolved; a sandbox that permits writes makes the run write-capable in its own right.

Examples:

```bash
/codex:task investigate why the tests started failing
/codex:task fix the failing test with the smallest safe patch
/codex:task --resume apply the top fix from the last run
/codex:task --effort medium investigate the flaky integration test
/codex:task --model spark fix the issue quickly
/codex:task --with-session fix the bug we have been tracing
/codex:task --background investigate the regression
```

Asking Claude in prose ("ask Codex to redesign the database connection") no longer starts a run by itself — Claude will point you at the command, and you type it.

**Notes:**

- if you do not pass `--model` or `--effort`, Codex chooses its own defaults.
- if you say `spark`, the plugin maps that to `gpt-5.3-codex-spark`
- follow-up requests can continue the latest Codex task in the repo

### `/codex:transfer`

Creates a persistent Codex thread from the current Claude Code session and prints a `codex resume <session-id>` command.

Use it when you started a debugging or implementation conversation in Claude Code and want to continue that same context directly in Codex.

Examples:

```bash
/codex:transfer
/codex:transfer --source ~/.claude/projects/-Users-me-repo/<session-id>.jsonl
```

The plugin's existing `SessionStart` hook supplies the current transcript path automatically; `--source` is available as a manual override. The transfer uses Codex's external-agent session importer, so it follows the same conversion rules as importing Claude history in the Codex App and creates visible turns that can be continued in the App or TUI. The source must be under `~/.claude/projects`, and older Codex versions that do not expose session import must be upgraded before using this command.

### `/codex:status`

Shows running and recent Codex jobs for the current repository.

Examples:

```bash
/codex:status
/codex:status task-abc123
```

Use it to:

- check progress on background work
- see the latest completed job
- confirm whether a task is still running
- find a job's live log file, which is written line-by-line while the job runs, so you can `tail -f` it

By default it lists jobs from the current Claude session; pass `--all` to see every retained job for the repository. `/codex:status <id> --wait` blocks until that job finishes.

Results outlive the session that produced them. Ending a Claude session settles anything still in flight — running jobs are stopped and recorded as `interrupted` — but finished results and their logs stay on disk (the most recent 50 jobs per repository). Claude does not need `/codex:result` to follow a review it launched — a backgrounded run notifies it and writes the rendered output to a file it reads directly. `/codex:result` is yours, for re-reading a finished job later; `/codex:status` is shared, for looking in on a run that is still going.

### `/codex:result`

Shows the final stored Codex output for a finished job.
When available, it also includes the Codex session ID so you can reopen that run directly in Codex with `codex resume <session-id>`.

Examples:

```bash
/codex:result
/codex:result task-abc123
```

### `/codex:cancel`

Stops a Codex job started in this Claude session. With no job id it walks every running job first — what the job is for, how long it has been going, what cancelling costs, and a cancel/don't-cancel recommendation — so the call is made against the consequences rather than a bare id. A job this session launched is stopped by stopping its background shell; for any other id it falls back to the `cancel` helper, and it asks before doing that.

This one stays user-only: it throws away in-flight work, so Claude routes you here rather than cancelling on its own.

Examples:

```bash
/codex:cancel
/codex:cancel task-abc123
```

### `/codex:setup`

Checks whether Codex is installed and authenticated.
If Codex is missing and npm is available, it can offer to install Codex for you.

You can also use `/codex:setup` to manage the optional review gate.

#### Enabling review gate

```bash
/codex:setup --enable-review-gate
/codex:setup --disable-review-gate
```

When the review gate is enabled, the plugin uses a `Stop` hook to run a targeted Codex review based on Claude's response. If that review finds issues, the stop is blocked so Claude can address them first.

> [!WARNING]
> The review gate can create a long-running Claude/Codex loop and may drain usage limits quickly. Only enable it when you plan to actively monitor the session.

## Typical Flows

### Review Before Shipping

```bash
/codex:review
```

### Hand A Problem To Codex

```bash
/codex:task investigate why the build is failing in CI
```

### Start Something Long-Running

```bash
/codex:adversarial-review
/codex:task --background investigate the flaky test
```

Then check in with:

```bash
/codex:status
/codex:result
```

## Codex Integration

The Codex plugin wraps the [Codex app server](https://developers.openai.com/codex/app-server). It uses the global `codex` binary installed in your environment and [applies the same configuration](https://developers.openai.com/codex/config-basic).

### Common Configurations

If you want to change the default reasoning effort or the default model that gets used by the plugin, you can define that inside your user-level or project-level `config.toml`. For example to always use `gpt-5.6-terra` on `high` for a specific project you can add the following to a `.codex/config.toml` file at the root of the directory you started Claude in:

```toml
model = "gpt-5.6-terra"
model_reasoning_effort = "high"
```

`sandbox_mode` is read from the same place. Reviews always run without filesystem sandboxing so the reviewer can run the checks it reasons about, but a write-capable `/codex:task` follows whatever you configured here rather than being narrowed by the plugin.

Your configuration will be picked up based on:

- user-level config in `~/.codex/config.toml`
- project-level overrides in `.codex/config.toml`
- project-level overrides only load when the [project is trusted](https://developers.openai.com/codex/config-advanced#project-config-files-codexconfigtoml)

Check out the Codex docs for more [configuration options](https://developers.openai.com/codex/config-reference).

### Moving The Work Over To Codex

Delegated tasks and any [stop gate](#what-does-the-review-gate-do) run can also be directly resumed inside Codex by running `codex resume` either with the specific session ID you received from running `/codex:result` or `/codex:status` or by selecting it from the list.

This way you can review the Codex work or continue the work there.

## FAQ

### Do I need a separate Codex account for this plugin?

If you are already signed into Codex on this machine, that account should work immediately here too. This plugin uses your local Codex CLI authentication.

If you only use Claude Code today and have not used Codex yet, you will also need to sign in to Codex with either a ChatGPT account or an API key. [Codex is available with your ChatGPT subscription](https://developers.openai.com/codex/pricing/), and [`codex login`](https://developers.openai.com/codex/cli/reference/#codex-login) supports both ChatGPT and API key sign-in. Run `/codex:setup` to check whether Codex is ready, and use `!codex login` if it is not.

### Does the plugin use a separate Codex runtime?

No. This plugin delegates through your local [Codex CLI](https://developers.openai.com/codex/cli/) and [Codex app server](https://developers.openai.com/codex/app-server/) on the same machine.

That means:

- it uses the same Codex install you would use directly
- it uses the same local authentication state
- it uses the same repository checkout and machine-local environment

### Will it use the same Codex config I already have?

Yes. If you already use Codex, the plugin picks up the same [configuration](#common-configurations).

### Can I keep using my current API key or base URL setup?

Yes. Because the plugin uses your local Codex CLI, your existing sign-in method and config still apply.

If you need to point the built-in OpenAI provider at a different endpoint, set `openai_base_url` in your [Codex config](https://developers.openai.com/codex/config-advanced/#config-and-state-locations).
