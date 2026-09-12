import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ROOT = path.join(ROOT, "plugins", "codex");

function read(relativePath) {
  return fs.readFileSync(path.join(PLUGIN_ROOT, relativePath), "utf8");
}

test("review command uses AskUserQuestion and background Bash while staying review-only", () => {
  const source = read("commands/review.md");
  assert.match(source, /AskUserQuestion/);
  assert.match(source, /\bBash\(/);
  assert.match(source, /Do not fix issues/i);
  assert.match(source, /review-only/i);
  assert.match(source, /return Codex's output verbatim to the user/i);
  assert.match(source, /```bash/);
  assert.match(source, /```typescript/);
  assert.match(source, /review "\$ARGUMENTS"/);
  assert.match(source, /\[--scope auto\|working-tree\|branch\]/);
  assert.match(source, /run_in_background:\s*true/);
  assert.match(source, /command:\s*`node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/codex-companion\.mjs" review "\$ARGUMENTS"`/);
  assert.match(source, /description:\s*"Codex review"/);
  assert.match(source, /Do not call `BashOutput`/);
  assert.match(source, /Return the command stdout verbatim, exactly as-is/i);
  assert.match(source, /git status --short --untracked-files=all/);
  assert.match(source, /git diff --shortstat/);
  assert.match(source, /Treat untracked files or directories as reviewable work/i);
  assert.match(source, /Recommend waiting only when the review is clearly tiny, roughly 1-2 files total/i);
  assert.match(source, /In every other case, including unclear size, recommend background/i);
  assert.match(source, /The companion script parses `--wait` and `--background`/i);
  assert.match(source, /Claude Code's `Bash\(..., run_in_background: true\)` is what actually detaches the run/i);
  assert.match(source, /When in doubt, run the review/i);
  assert.match(source, /\(Recommended\)/);
  assert.match(source, /does not support staged-only review, unstaged-only review, or extra focus text/i);
});

test("adversarial review command uses AskUserQuestion and background Bash while staying review-only", () => {
  const source = read("commands/adversarial-review.md");
  assert.match(source, /AskUserQuestion/);
  assert.match(source, /\bBash\(/);
  assert.match(source, /Do not fix issues/i);
  assert.match(source, /review-only/i);
  assert.match(source, /return Codex's output verbatim to the user/i);
  assert.match(source, /```bash/);
  assert.match(source, /```typescript/);
  assert.match(source, /adversarial-review "\$ARGUMENTS"/);
  assert.match(source, /\[--scope auto\|working-tree\|branch\] \[focus \.\.\.\]/);
  assert.match(source, /run_in_background:\s*true/);
  assert.match(source, /command:\s*`node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/codex-companion\.mjs" adversarial-review "\$ARGUMENTS"`/);
  assert.match(source, /description:\s*"Codex adversarial review"/);
  assert.match(source, /Do not call `BashOutput`/);
  assert.match(source, /Return the command stdout verbatim, exactly as-is/i);
  assert.match(source, /git status --short --untracked-files=all/);
  assert.match(source, /git diff --shortstat/);
  assert.match(source, /Treat untracked files or directories as reviewable work/i);
  assert.match(source, /Recommend waiting only when the scoped review is clearly tiny, roughly 1-2 files total/i);
  assert.match(source, /In every other case, including unclear size, recommend background/i);
  assert.match(source, /The companion script parses `--wait` and `--background`/i);
  assert.match(source, /Claude Code's `Bash\(..., run_in_background: true\)` is what actually detaches the run/i);
  assert.match(source, /When in doubt, run the review/i);
  assert.match(source, /\(Recommended\)/);
  assert.match(source, /uses the same review target selection as `\/codex:review`/i);
  assert.match(source, /supports working-tree review, branch review, and `--base <ref>`/i);
  assert.match(source, /does not support `--scope staged` or `--scope unstaged`/i);
  assert.match(source, /can still take extra focus text after the flags/i);
});

test("review documentation describes the unsandboxed repository-preserving contract", () => {
  const skill = read("skills/using-codex/SKILL.md");
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");

  assert.match(skill, /^description: Use when /m);
  for (const source of [skill, readme]) {
    assert.match(source, /without filesystem sandboxing/i);
    assert.match(source, /repository-preserving/i);
    assert.match(source, /incidental/i);
    assert.match(source, /scratch|temporary directory/i);
    assert.match(source, /does not intentionally (?:edit|alter)|must not intentionally edit/i);
  }

  assert.doesNotMatch(skill, /Reviews are READ-ONLY/i);
  assert.doesNotMatch(skill, /review \(read-only\)|challenge review \(read-only\)/i);
  assert.doesNotMatch(readme, /This command is read-only/i);
});

test("continue is not exposed as a user-facing command", () => {
  const commandFiles = fs.readdirSync(path.join(PLUGIN_ROOT, "commands")).sort();
  assert.deepEqual(commandFiles, [
    "adversarial-review.md",
    "result.md",
    "review.md",
    "status.md",
    "transfer.md"
  ]);
});

test("task is a single user-invoked skill that forwards to the task helper", () => {
  const taskSkill = read("skills/task/SKILL.md");
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");

  // The rescue command + codex-rescue subagent + codex-cli-runtime skill collapsed into
  // one surface: the main session builds the `task` call itself. That removes
  // the #234 recursion class (command -> Agent -> Skill re-entering the command)
  // along with the agent and runtime-contract indirection.
  assert.equal(fs.existsSync(path.join(PLUGIN_ROOT, "agents")), false);
  assert.equal(fs.existsSync(path.join(PLUGIN_ROOT, "skills", "codex-cli-runtime")), false);
  assert.equal(fs.existsSync(path.join(PLUGIN_ROOT, "commands", "rescue.md")), false);
  assert.equal(fs.existsSync(path.join(PLUGIN_ROOT, "skills", "rescue")), false);
  assert.equal(/codex-rescue|subagent|Agent tool/i.test(taskSkill), false);

  // User-invoked only: it stays out of Claude's context until the user types it.
  assert.match(taskSkill, /^disable-model-invocation: true$/m);
  assert.match(taskSkill, /^name: task$/m);
  // No allowed-tools: this body runs in the user's main session, where an
  // allowlist would clamp the whole turn's tools, not just this step.
  assert.equal(/allowed-tools/.test(taskSkill), false);
  assert.match(taskSkill, /\$ARGUMENTS/);

  // Forwarder contract.
  assert.match(taskSkill, /Make exactly one `Bash` call/i);
  assert.match(taskSkill, /codex-companion\.mjs" task/);
  assert.match(taskSkill, /Return that command's stdout exactly as-is/i);
  assert.match(taskSkill, /no paraphrasing, summarizing, or rewriting, and nothing inserted into it/i);
  // Verbatim means unfiltered, not mute: a second model is only useful if its
  // output can be argued with.
  assert.match(taskSkill, /After the verbatim output you may add one `## Claude's assessment` section/i);
  assert.match(taskSkill, /Attach the evidence/i);
  assert.match(taskSkill, /Leave the section out when you only agree/i);
  assert.match(taskSkill, /no repository inspection to form your own theory, no drafting a solution/i);
  assert.match(taskSkill, /do not substitute your own answer/i);
  assert.match(taskSkill, /Do not call `setup`, `review`, `adversarial-review`, `status`, `result`, or `cancel`/i);
  assert.match(taskSkill, /One `task` invocation per handoff/i);

  // Prompt shaping and handoff context are the only Claude-side work.
  assert.match(taskSkill, /You may sharpen it into a tighter Codex prompt/i);
  assert.match(taskSkill, /<handoff_context>/);
  assert.match(taskSkill, /Mark that context unverified/i);
  assert.match(taskSkill, /--with-session/);

  // Resume semantics.
  assert.match(taskSkill, /task-resume-candidate --json/);
  assert.match(taskSkill, /AskUserQuestion/);
  assert.match(taskSkill, /Continue current Codex thread/);
  assert.match(taskSkill, /Start a new Codex thread/);
  assert.match(taskSkill, /If the request includes `--resume` or `--fresh`, do not ask whether to continue/i);

  // Flag mapping now lives here rather than in a runtime-contract skill, and
  // backgrounding is the helper's own job rather than a Claude-side agent.
  assert.match(taskSkill, /--background\|--wait/);
  assert.match(taskSkill, /--resume\|--fresh/);
  assert.match(taskSkill, /--model <model\|spark>/);
  assert.match(taskSkill, /--effort <none\|minimal\|low\|medium\|high\|xhigh>/);
  assert.match(taskSkill, /`--background` → `task --background`/);
  assert.match(taskSkill, /Never pass `--wait` through to `task`/i);
  assert.match(taskSkill, /`--resume` → strip the token from the task text and pass `--resume-last`/i);
  // The helper owns the alias and the defaults; the skill must not restate them
  // as Claude-side mapping that can drift from scripts/codex-companion.mjs.
  assert.match(taskSkill, /the helper owns that alias \(`spark` → `gpt-5\.3-codex-spark`\)/i);
  assert.match(taskSkill, /`--effort` → pass through/i);
  assert.match(taskSkill, /unset sends `effort: null`, so `model_reasoning_effort` from the user's Codex config applies/i);
  assert.match(taskSkill, /`--write` → add by default/i);
  assert.match(taskSkill, /`--sandbox` → leave unset/i);

  assert.match(readme, /### `\/codex:task`/);
  assert.equal(/codex:codex-rescue/.test(readme), false);
  assert.match(readme, /user-invoked only/i);
});

test("transfer and cancel stay user-only while status and result are model-invokable", () => {
  const transfer = read("commands/transfer.md");
  const result = read("commands/result.md");
  const status = read("commands/status.md");
  const cancel = read("skills/cancel/SKILL.md");
  const resultHandling = read("skills/codex-result-handling/SKILL.md");

  // Cancel throws away in-flight work and transfer hands the user's own session
  // to another agent: both stay the user's call.
  assert.match(transfer, /disable-model-invocation:\s*true/);
  assert.match(cancel, /disable-model-invocation:\s*true/);
  assert.match(cancel, /^name: cancel$/m);

  // Claude can launch a background job, so it must be able to follow that job to
  // completion instead of handing the user a job id and going quiet.
  assert.equal(/disable-model-invocation/.test(status), false);
  assert.equal(/disable-model-invocation/.test(result), false);
  assert.match(status, /--wait --timeout-ms/);
  assert.match(status, /live log path/i);

  assert.match(transfer, /codex-companion\.mjs" transfer "\$ARGUMENTS"/);
  assert.match(transfer, /codex resume <session-id>/);
  assert.match(result, /codex-companion\.mjs" result "\$ARGUMENTS"/);
  assert.match(status, /codex-companion\.mjs" status "\$ARGUMENTS"/);
  // The helper is the fallback for a job this session did not launch; a job it
  // did launch is stopped by stopping its background shell.
  assert.match(cancel, /codex-companion\.mjs" cancel "<job-id>"/);
  assert.match(cancel, /StopTask/);
  assert.match(cancel, /Cancellation Consequences and Recommendation/);
  assert.match(resultHandling, /do not turn a failed or incomplete Codex run into a Claude-side implementation attempt/i);
  assert.match(resultHandling, /if Codex was never successfully invoked, do not generate a substitute answer at all/i);
});

test("review results can be contested by Claude without being edited", () => {
  const resultHandling = read("skills/codex-result-handling/SKILL.md");
  const usingCodex = read("skills/using-codex/SKILL.md");
  const review = read("commands/review.md");
  const adversarial = read("commands/adversarial-review.md");

  for (const source of [review, adversarial]) {
    // The verbatim block still comes first and untouched; the assessment is
    // additive, not a rewrite.
    assert.match(source, /Return the command stdout verbatim, exactly as-is/);
    assert.match(source, /Claude's assessment/);
    assert.match(source, /never before it and never interleaved/i);
    assert.match(source, /Still do not edit anything/i);
  }

  assert.match(resultHandling, /Claude's assessment/);
  assert.match(resultHandling, /Attach the evidence/i);
  assert.match(usingCodex, /Assessing the output/);
  assert.match(usingCodex, /Verbatim is about not filtering what Codex said — it is not an instruction to be a pipe/);
  // The rules that only lived in the hidden reference now live where Claude
  // will actually read them.
  assert.match(usingCodex, /If Codex edited files, state that and list the touched files/i);
  assert.match(usingCodex, /surface the most actionable stderr lines and stop there/i);
  // Hidden from the model, still runnable by the user.
  assert.match(resultHandling, /^disable-model-invocation: true$/m);
  assert.equal(/user-invocable/.test(resultHandling), false);
  // Auto-applying fixes remains forbidden even though commentary is allowed.
  assert.match(resultHandling, /Auto-applying fixes from a review is strictly forbidden/);
});

test("internal docs use task terminology throughout", () => {
  const taskSkill = read("skills/task/SKILL.md");
  const promptingSkill = read("skills/codex-prompting/SKILL.md");
  const promptRecipes = read("skills/codex-prompting/references/codex-prompt-recipes.md");

  assert.match(taskSkill, /codex-companion\.mjs" task \.\.\./);
  assert.match(taskSkill, /`--resume-last`/);
  // The skill stays on disk as a user-invoked reference: model invocation off,
  // slash command on.
  assert.match(promptingSkill, /^disable-model-invocation: true$/m);
  assert.equal(/user-invocable/.test(promptingSkill), false);
  assert.match(promptingSkill, /Hand over what you already know/i);
  assert.match(promptingSkill, /task --with-session/);
  // The guidance must track the model Codex actually routes to, not the one it
  // shipped against.
  assert.match(promptingSkill, /GPT-5\.6/);
  assert.match(promptingSkill, /The plugin sends `effort: null` when `--effort` is unset/i);
  assert.equal(/GPT-5\.4|GPT-5\.5/.test(promptingSkill), false);
  assert.match(promptRecipes, /Codex task prompts/i);
  assert.match(promptRecipes, /Use these as starting templates for Codex task prompts/i);
  assert.match(promptRecipes, /## Diagnosis/);
  assert.match(promptRecipes, /## Narrow Fix/);
});

test("hooks keep session-end cleanup and stop gating enabled", () => {
  const source = read("hooks/hooks.json");
  assert.match(source, /SessionStart/);
  assert.match(source, /SessionEnd/);
  assert.match(source, /stop-review-gate-hook\.mjs/);
  assert.match(source, /session-lifecycle-hook\.mjs/);
});

test("setup is a user-invoked skill that can offer Codex install and still points users to codex login", () => {
  const setup = read("skills/setup/SKILL.md");
  assert.match(setup, /^name: setup$/m);
  assert.match(setup, /^disable-model-invocation: true$/m);
  // Runs in the user's main session, so no allowed-tools clamp on the turn —
  // and a global npm install prompts for permission like any other write.
  assert.equal(/allowed-tools/.test(setup), false);
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");

  assert.match(setup, /argument-hint:\s*'\[--enable-review-gate\|--disable-review-gate\]'/);
  assert.match(setup, /AskUserQuestion/);
  assert.match(setup, /npm install -g @openai\/codex/);
  assert.match(setup, /codex-companion\.mjs" setup --json \$ARGUMENTS/);
  assert.match(readme, /!codex login/);
  assert.match(readme, /offer to install Codex for you/i);
  assert.match(readme, /\/codex:setup --enable-review-gate/);
  assert.match(readme, /\/codex:setup --disable-review-gate/);
});
