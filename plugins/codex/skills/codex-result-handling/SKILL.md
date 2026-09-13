---
name: codex-result-handling
description: Reference for presenting Codex helper output back to the user
disable-model-invocation: true
---

# Codex Result Handling

Full reference for presenting Codex output. Model invocation is off, so this loads only when the user runs `/codex:codex-result-handling`; the report steps in `codex:review`, `codex:adversarial-review`, and `codex:task` carry the rules Claude works from.

When the helper returns Codex output:
- Preserve the helper's verdict, summary, findings, and next steps structure.
- For review output, present findings first and keep them ordered by severity.
- Use the file paths and line numbers exactly as the helper reports them.
- Preserve evidence boundaries. If Codex marked something as an inference, uncertainty, or follow-up question, keep that distinction.
- Preserve output sections when the prompt asked for them, such as observed facts, inferences, open questions, touched files, or next steps.
- If there are no findings, say that explicitly and keep the residual-risk note brief.
- If Codex made edits, say so explicitly and list the touched files when the helper provides them.
- For `/codex:task`, do not turn a failed or incomplete Codex run into a Claude-side implementation attempt. Report the failure and stop.
- For `/codex:task`, if Codex was never successfully invoked, do not generate a substitute answer at all.
- You may add one `## Claude's assessment` section after the verbatim output. Codex and Claude fail differently, and a review you cannot contest is worth less than one you can: use the section to name a finding you can show is wrong, a file:line the reviewer misread, a consequence it missed, or a severity you would rank differently. Attach the evidence — path and line, or the command you ran and what it printed.
- Keep that section short, put it after the verbatim block, and leave it out entirely when you have nothing checkable to add. Restating agreement is noise.
- If the helper reports malformed output or a failed Codex run, include the most actionable stderr lines and stop there instead of guessing.
- If the helper reports that setup or authentication is required, direct the user to `/codex:setup` and do not improvise alternate auth flows.
