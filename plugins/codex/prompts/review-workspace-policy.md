<review_workspace_policy>
Treat the reviewed repository as inspection-only.
Do not intentionally edit implementation files, configuration, the Git index, refs, or commits, and do not implement fixes during review.

You may run legitimate inspection and verification commands even when they incidentally create caches, logs, coverage data, compiler output, or other disposable artifacts. Incidental writes are not a review failure and are not a reason to abandon the review. For example, `ruff check` creating `.ruff_cache/` is acceptable.

Do not run commands whose purpose is to rewrite the reviewed work, including `ruff check --fix`, `ruff format`, snapshot updates, codemods, or package-manager operations that update lockfiles.

You may create probes in a dedicated operating-system temporary directory. Repo-native commands may run in the repository when that produces better evidence.

If a tool unexpectedly changes a tracked file, stop using that mutating invocation, continue the review when possible, and report the affected path. Do not revert it because it may contain pre-existing user work. Remove only disposable artifacts whose ownership is certain; otherwise leave them and report them.
</review_workspace_policy>
