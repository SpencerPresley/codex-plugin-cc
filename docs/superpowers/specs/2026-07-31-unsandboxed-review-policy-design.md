# Unsandboxed Review Policy Design

## Goal

Run both `/codex:review` and `/codex:adversarial-review` without Codex filesystem sandboxing while preserving their review-only purpose through explicit instructions.

Review-only means the reviewer does not intentionally implement fixes or alter the reviewed work. It does not mean the filesystem must remain byte-for-byte unchanged.

## Upstream Reconciliation

`upstream/main` has one commit that is not an ancestor of this fork: `db52e28` (`Remove shell expansion for git commands (#447)`). Its functional changes have the same stable patch ID as local commit `9602f5a`.

The remaining upstream-only changes bump OpenAI package and marketplace metadata from `1.0.5` to `1.0.6`. This fork already uses the Spencer package identity and version `1.0.7`. Do not cherry-pick or merge `db52e28`; doing so would duplicate the functional patch and regress fork-specific metadata.

## Runtime Policy

Both review paths start Codex with:

- `sandbox: "danger-full-access"`
- `approvalPolicy: "never"`

`danger-full-access` is the app-server protocol's no-filesystem-sandbox mode. The change applies only to normal and adversarial reviews. Task and rescue sandbox selection remains unchanged.

## Review Workspace Contract

Normal and adversarial review share one repository-preservation contract:

- Do not intentionally edit implementation files, configuration, the Git index, refs, or commits.
- Do not implement fixes during review.
- Inspection and verification commands are allowed even when they incidentally create caches, logs, coverage data, compiler output, or other disposable artifacts.
- Commands whose purpose is to rewrite reviewed work remain prohibited. Examples include `ruff check --fix`, `ruff format`, snapshot updates, codemods, and package-manager operations that update lockfiles.
- Scratch probes may use a dedicated operating-system temporary directory. Repo-native commands do not have to be forced into that directory when executing them in the repository gives better evidence.
- If a tool unexpectedly changes a tracked file, stop using that mutating invocation, continue the review when possible, and report the affected path. Do not revert the file because it may contain pre-existing user work.
- Clearly disposable artifacts created by the review may be removed when ownership is certain. Otherwise leave them in place and report them.

For example, `ruff check` creating `.ruff_cache/` is acceptable. Running `ruff check --fix` and rewriting a reviewed Python file is not.

## Normal Review

The normal review continues to use Codex's built-in reviewer and output contract.

Codex's built-in reviewer discards the parent thread's developer instructions when it spawns the review turn. Therefore, setting developer instructions on `thread/start` would not deliver the repository-preservation contract to the actual reviewer.

Instead, the plugin sends a built-in `custom` review target whose instructions contain:

1. The same target definition currently represented by `uncommittedChanges` or `baseBranch`.
2. The shared review workspace contract.

For a branch review, the plugin resolves the base branch and merge-base SHA before building the custom instructions so Codex inspects the same comparison the plugin reports to the user. The command remains non-steerable: user-supplied focus text is still rejected and routed to adversarial review.

## Adversarial Review

The adversarial reviewer continues to use the plugin's structured-output prompt and schema. A workspace-policy section containing the shared contract is added to that prompt, and its thread starts with `danger-full-access`.

The existing adversarial review method, finding bar, grounding rules, and JSON output contract remain unchanged.

## User-Facing Documentation

Documentation must stop describing the commands as filesystem read-only.

`plugins/codex/skills/using-codex/SKILL.md`, the command documentation, and `README.md` instead describe reviews as repository-preserving:

- Codex runs without filesystem sandboxing.
- It may write scratch probes and incidental tool output.
- It must not intentionally edit or fix the reviewed work.
- Incidental writes are not treated as review failure or a reason to abandon the review.

## Testing

Runtime regression tests verify:

- Normal review starts its Codex thread with `sandbox: "danger-full-access"`.
- Adversarial review starts its Codex thread with `sandbox: "danger-full-access"`.
- Normal review uses a custom target that preserves working-tree and base-branch comparison semantics.
- The normal review target contains the shared repository-preservation and incidental-write rules.
- The adversarial prompt contains the same rules.
- Review documentation no longer claims the Codex filesystem is read-only.
- Task and rescue sandbox behavior is unchanged.

Tests use the existing fake Codex app-server state capture. The implementation follows red-green-refactor: add assertions that fail against the current `read-only` requests and missing policy, then make the minimal runtime and documentation changes required for them to pass.

## Non-Goals

- Preventing a review model from writing through operating-system enforcement.
- Guaranteeing a byte-for-byte clean worktree after arbitrary verification tools run.
- Changing task or rescue permissions.
- Adding a new user-facing flag for sandbox selection.
- Automatically reverting files or deleting artifacts whose ownership is uncertain.
