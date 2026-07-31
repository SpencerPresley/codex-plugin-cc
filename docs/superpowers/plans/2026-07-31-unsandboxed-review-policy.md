# Unsandboxed Review Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run normal and adversarial Codex reviews without filesystem sandboxing while instructing both reviewers not to intentionally alter reviewed work.

**Architecture:** Store one repository-preservation contract in a prompt fragment and inject it into both review paths. Normal review remains on Codex's built-in reviewer through a `custom` review target; adversarial review keeps its existing structured-output turn. Only these two paths select `danger-full-access`.

**Tech Stack:** Node.js 18+, ECMAScript modules, Codex app-server JSON-RPC, Node's built-in test runner, Markdown prompt templates and skills.

## Global Constraints

- Review-only means the reviewer does not intentionally implement fixes or alter the reviewed work; it does not mean the filesystem remains byte-for-byte unchanged.
- Incidental caches, logs, coverage files, and build output from legitimate inspection or verification commands are acceptable.
- Commands intended to rewrite reviewed work remain prohibited.
- Task and rescue sandbox selection must remain unchanged.
- Do not add a user-facing sandbox flag.
- Keep verification proportional: targeted request/prompt assertions plus one full suite and build; no subagent pressure-test matrix and no live Codex review matrix.
- Do not merge or cherry-pick upstream `db52e28`; local `9602f5a` already contains the same functional patch.

---

### Task 1: Route both review paths through the unsandboxed shared policy

**Files:**

- Create: `plugins/codex/prompts/review-workspace-policy.md`
- Modify: `plugins/codex/prompts/adversarial-review.md`
- Modify: `plugins/codex/scripts/codex-companion.mjs:241`
- Modify: `plugins/codex/scripts/codex-companion.mjs:259`
- Modify: `plugins/codex/scripts/codex-companion.mjs:358`
- Modify: `plugins/codex/scripts/lib/codex.mjs:1002`
- Modify: `plugins/codex/scripts/lib/git.mjs:135`
- Modify: `plugins/codex/scripts/lib/git.mjs:324`
- Modify: `tests/fake-codex-fixture.mjs:20`
- Modify: `tests/fake-codex-fixture.mjs:183`
- Modify: `tests/fake-codex-fixture.mjs:308`
- Modify: `tests/fake-codex-fixture.mjs:407`
- Test: `tests/runtime.test.mjs:147`
- Test: `tests/runtime.test.mjs:356`
- Test: `tests/runtime.test.mjs:377`
- Test: `tests/runtime.test.mjs:709`

**Interfaces:**

- Consumes: `loadPromptTemplate(rootDir, name)`, `interpolateTemplate(template, variables)`, and the `resolveReviewTarget()` result.
- Produces: a Codex app-server `ReviewTarget` shaped as `{ type: "custom", instructions: string }`, and review `thread/start` requests with `sandbox: "danger-full-access"`.
- Preserves: `runAppServerReview(cwd, options)`, adversarial structured output, focus-text rejection for normal review, and `request.write ? "workspace-write" : "read-only"` for task/rescue runs.

- [ ] **Step 1: Extend the fake app-server to capture requests without changing production behavior**

In `tests/fake-codex-fixture.mjs`, record the relevant incoming parameters:

```js
case "thread/start": {
  state.lastThreadStart = message.params;
  saveState(state);
  // existing fake thread/start behavior follows
}
```

```js
case "review/start": {
  state.lastReviewStart = message.params;
  saveState(state);
  // existing fake review/start behavior follows
}
```

Update `nativeReviewText(target)` so a custom target containing `base branch "main"` still returns `Reviewed changes against main`, while a custom working-tree target still returns `Reviewed uncommitted changes`. This keeps existing rendering assertions meaningful after target type changes:

```js
function nativeReviewText(target) {
  if (target.type === "custom") {
    const baseMatch = target.instructions.match(/base branch "([^"]+)"/);
    if (baseMatch) {
      return "Reviewed changes against " + baseMatch[1] + ".\nNo material issues found.";
    }
    return "Reviewed uncommitted changes.\nNo material issues found.";
  }
  if (target.type === "baseBranch") {
    return "Reviewed changes against " + target.branch + ".\nNo material issues found.";
  }
  return "Reviewed uncommitted changes.\nNo material issues found.";
}
```

- [ ] **Step 2: Add focused failing runtime assertions**

Extend the working-tree review test at `tests/runtime.test.mjs:147`:

```js
const state = JSON.parse(fs.readFileSync(path.join(binDir, "fake-codex-state.json"), "utf8"));
assert.equal(state.lastThreadStart.approvalPolicy, "never");
assert.equal(state.lastThreadStart.sandbox, "danger-full-access");
assert.equal(state.lastReviewStart.target.type, "custom");
assert.match(state.lastReviewStart.target.instructions, /Do not intentionally edit/i);
assert.match(state.lastReviewStart.target.instructions, /incidental/i);
assert.match(state.lastReviewStart.target.instructions, /ruff check --fix/i);
assert.match(state.lastReviewStart.target.instructions, /operating-system temporary directory/i);
```

Extend the base-branch review test at `tests/runtime.test.mjs:356`:

```js
const state = JSON.parse(fs.readFileSync(path.join(binDir, "fake-codex-state.json"), "utf8"));
assert.equal(state.lastReviewStart.target.type, "custom");
assert.match(state.lastReviewStart.target.instructions, /base branch "main"/);
assert.match(state.lastReviewStart.target.instructions, /merge-base commit is [0-9a-f]{40}/i);
```

Extend the adversarial review test at `tests/runtime.test.mjs:377`:

```js
const state = JSON.parse(fs.readFileSync(path.join(binDir, "fake-codex-state.json"), "utf8"));
assert.equal(state.lastThreadStart.approvalPolicy, "never");
assert.equal(state.lastThreadStart.sandbox, "danger-full-access");
assert.match(state.lastTurnStart.prompt, /<review_workspace_policy>/);
assert.match(state.lastTurnStart.prompt, /incidental/i);
assert.match(state.lastTurnStart.prompt, /ruff check --fix/i);
```

Extend the existing write-task test at `tests/runtime.test.mjs:709` to prove the unrelated write-capable path stays on `workspace-write`:

```js
const state = JSON.parse(fs.readFileSync(path.join(binDir, "fake-codex-state.json"), "utf8"));
assert.equal(state.lastThreadStart.sandbox, "workspace-write");
```

- [ ] **Step 3: Run only the affected runtime tests and verify the production assertions fail**

Run:

```bash
node --test \
  --test-name-pattern='review renders a no-findings|review accepts the quoted raw argument|adversarial review renders structured findings|write task output focuses' \
  tests/runtime.test.mjs
```

Expected: the write-task assertion passes, while review assertions fail because the current requests use `read-only`, normal review sends `uncommittedChanges`/`baseBranch`, and the shared policy does not exist.

- [ ] **Step 4: Add the shared review workspace policy**

Create `plugins/codex/prompts/review-workspace-policy.md` with this complete contract:

```markdown
<review_workspace_policy>
Treat the reviewed repository as inspection-only.
Do not intentionally edit implementation files, configuration, the Git index, refs, or commits, and do not implement fixes during review.

You may run legitimate inspection and verification commands even when they incidentally create caches, logs, coverage data, compiler output, or other disposable artifacts. Incidental writes are not a review failure and are not a reason to abandon the review. For example, `ruff check` creating `.ruff_cache/` is acceptable.

Do not run commands whose purpose is to rewrite the reviewed work, including `ruff check --fix`, `ruff format`, snapshot updates, codemods, or package-manager operations that update lockfiles.

You may create probes in a dedicated operating-system temporary directory. Repo-native commands may run in the repository when that produces better evidence.

If a tool unexpectedly changes a tracked file, stop using that mutating invocation, continue the review when possible, and report the affected path. Do not revert it because it may contain pre-existing user work. Remove only disposable artifacts whose ownership is certain; otherwise leave them and report them.
</review_workspace_policy>
```

- [ ] **Step 5: Inject the policy into adversarial review and remove its sandbox**

Add the placeholder to `plugins/codex/prompts/adversarial-review.md` after `</task>`:

```markdown
{{REVIEW_WORKSPACE_POLICY}}
```

In `plugins/codex/scripts/codex-companion.mjs`, load it once per prompt build:

```js
function loadReviewWorkspacePolicy() {
  return loadPromptTemplate(ROOT_DIR, "review-workspace-policy").trim();
}

function buildAdversarialReviewPrompt(context, focusText) {
  const template = loadPromptTemplate(ROOT_DIR, "adversarial-review");
  return interpolateTemplate(template, {
    REVIEW_KIND: "Adversarial Review",
    TARGET_LABEL: context.target.label,
    USER_FOCUS: focusText || "No extra focus provided.",
    REVIEW_WORKSPACE_POLICY: loadReviewWorkspacePolicy(),
    REVIEW_COLLECTION_GUIDANCE: context.collectionGuidance,
    REVIEW_INPUT: context.content
  });
}
```

Change only the adversarial review request:

```js
const result = await runAppServerTurn(context.repoRoot, {
  prompt,
  model: request.model,
  sandbox: "danger-full-access",
  outputSchema: readOutputSchema(REVIEW_SCHEMA),
  onProgress: request.onProgress
});
```

- [ ] **Step 6: Resolve branch comparisons before building custom native review instructions**

Add `comparison: buildBranchComparison(cwd, baseRef)` to each branch-shaped return from `resolveReviewTarget()` in `plugins/codex/scripts/lib/git.mjs`. In `collectReviewContext()`, reuse it without recomputing:

```js
const comparison = target.comparison ?? buildBranchComparison(repoRoot, target.baseRef);
```

This fixes the discovered pre-implementation assumption: branch targets previously carried `baseRef` but did not carry their merge-base until adversarial context collection.

- [ ] **Step 7: Preserve native review while supplying custom target instructions**

Replace `buildNativeReviewTarget(target)` in `plugins/codex/scripts/codex-companion.mjs` with:

```js
function buildNativeReviewTarget(target) {
  let targetInstructions;

  if (target.mode === "working-tree") {
    targetInstructions =
      "Review the current code changes, including staged, unstaged, and untracked files. Provide prioritized, actionable findings.";
  } else if (target.mode === "branch" && target.comparison?.mergeBase) {
    targetInstructions = [
      `Review the code changes against base branch ${JSON.stringify(target.baseRef)}.`,
      `The merge-base commit is ${target.comparison.mergeBase}.`,
      `Run git diff ${target.comparison.mergeBase} to inspect the changes that would merge into that base branch.`,
      "Provide prioritized, actionable findings."
    ].join("\n");
  } else {
    return null;
  }

  return {
    type: "custom",
    instructions: `${targetInstructions}\n\n${loadReviewWorkspacePolicy()}`
  };
}
```

This keeps normal review on `review/start`, so Codex still applies its built-in reviewer rubric and structured review output. `validateNativeReviewRequest()` continues rejecting focus text before returning this custom target.

- [ ] **Step 8: Remove the native reviewer filesystem sandbox**

Change only `runAppServerReview()` in `plugins/codex/scripts/lib/codex.mjs`:

```js
const thread = await startThread(client, cwd, {
  model: options.model,
  sandbox: "danger-full-access",
  ephemeral: true,
  threadName: options.threadName
});
```

Do not change the `"read-only"` defaults in `buildThreadParams()`/`buildResumeParams()` or the task selection at `codex-companion.mjs:491`.

- [ ] **Step 9: Run the focused runtime tests and verify they pass**

Run:

```bash
node --test \
  --test-name-pattern='review renders a no-findings|review accepts the quoted raw argument|adversarial review renders structured findings|write task output focuses' \
  tests/runtime.test.mjs
```

Expected: all selected tests pass; skipped tests are reported as skipped rather than failures.

- [ ] **Step 10: Commit the runtime and prompt contract**

Before committing:

```bash
git status --short --branch
git log -1 --oneline --decorate
git diff --check
```

Commit only the runtime, prompt, fixture, and runtime-test files:

```bash
git add \
  plugins/codex/prompts/review-workspace-policy.md \
  plugins/codex/prompts/adversarial-review.md \
  plugins/codex/scripts/codex-companion.mjs \
  plugins/codex/scripts/lib/codex.mjs \
  plugins/codex/scripts/lib/git.mjs \
  docs/superpowers/specs/2026-07-31-unsandboxed-review-policy-design.md \
  tests/fake-codex-fixture.mjs \
  tests/runtime.test.mjs
git diff --cached --check
git commit -m "feat: run code reviews without filesystem sandboxing"
```

### Task 2: Align the using-codex skill and public documentation

**Files:**

- Modify: `plugins/codex/skills/using-codex/SKILL.md:8`
- Modify: `plugins/codex/skills/using-codex/SKILL.md:17`
- Modify: `plugins/codex/skills/using-codex/SKILL.md:26`
- Modify: `README.md:81`
- Modify: `README.md:105`
- Test: `tests/commands.test.mjs:14`

**Interfaces:**

- Consumes: the shared runtime policy implemented in Task 1.
- Produces: user- and model-facing documentation that calls reviews repository-preserving rather than filesystem read-only.
- Preserves: review-only behavior, verbatim result handling, command flags, and rescue's write-capable description.

- [ ] **Step 1: Add focused failing documentation assertions**

Add a new test to `tests/commands.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the documentation test and verify it fails**

Run:

```bash
node --test \
  --test-name-pattern='review documentation describes the unsandboxed repository-preserving contract' \
  tests/commands.test.mjs
```

Expected: FAIL because the skill and README currently describe both review commands as read-only and claim they never write.

- [ ] **Step 3: Rewrite the using-codex review contract**

In `plugins/codex/skills/using-codex/SKILL.md`:

- Replace the frontmatter description with a trigger-only description:

```yaml
description: Use when running Codex reviews or delegating work through the Codex Claude Code plugin, especially when choosing review, adversarial-review, or rescue and when handling their results.
```

- Replace the top-level review description with “repository-preserving critique” and state that Codex runs without filesystem sandboxing.
- Replace “Reviews are READ-ONLY” with “Reviews do not intentionally edit the reviewed work.”
- State that caches, logs, coverage files, build output, and scratch probes are allowed incidental writes and must not cause the invoking model to panic or abandon the review.
- State that commands intended to rewrite source, snapshots, configuration, or lockfiles are outside review scope.
- Keep the rule that Claude must stop after returning findings and wait for explicit authorization before implementing fixes.
- Rename the review section labels from `(read-only)` to `(repository-preserving)`.
- Keep rescue explicitly write-capable.

Use this concrete wording for the critical rule:

```markdown
- **Reviews are repository-preserving, not filesystem read-only.** Codex runs without filesystem sandboxing so it can use its full toolset. It must not intentionally edit or fix the reviewed work, but legitimate inspection and verification commands may create caches, logs, build output, coverage data, or scratch probes. Those incidental writes are acceptable and are not a reason to panic, abandon the review, or silently implement cleanup. After presenting findings, STOP and ask the user which findings, if any, to fix.
```

- [ ] **Step 4: Align README review descriptions**

For both review command sections in `README.md`:

- Replace “This command is read-only” with “This command is repository-preserving and does not intentionally edit or fix the reviewed work.”
- State that the Codex review runs without filesystem sandboxing.
- State that incidental tool output and dedicated temporary-directory probes are allowed.
- Keep background/status/cancel guidance unchanged.

- [ ] **Step 5: Run command/documentation tests**

Run:

```bash
node --test tests/commands.test.mjs
```

Expected: all command and documentation tests pass.

- [ ] **Step 6: Run proportional final verification**

Run once:

```bash
npm test
npm run build
npm run check-version
git diff --check
```

Expected:

- `npm test`: zero failing tests.
- `npm run build`: TypeScript compilation exits 0.
- `npm run check-version`: fork package and marketplace versions remain aligned at the release version.
- `git diff --check`: no whitespace errors.

Do not run a live Codex review matrix or subagent pressure tests. The request-shape assertions prove the plugin-owned behavior; OpenAI's reviewer internals remain upstream-owned.

- [ ] **Step 7: Commit the skill and public documentation**

Before committing:

```bash
git status --short --branch
git log -1 --oneline --decorate
```

Commit only the documentation and its test:

```bash
git add \
  plugins/codex/skills/using-codex/SKILL.md \
  README.md \
  tests/commands.test.mjs
git diff --cached --check
git commit -m "docs: explain repository-preserving code reviews"
```

Leave the approved design and implementation plan in place. Do not merge, push, publish, bump versions, or clean up branches/worktrees unless Spencer asks.
