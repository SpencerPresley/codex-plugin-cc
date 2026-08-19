import test from "node:test";
import assert from "node:assert/strict";

import { renderReviewResult, renderStoredJobResult } from "../plugins/codex/scripts/lib/render.mjs";

test("renderReviewResult degrades gracefully when JSON is missing required review fields", () => {
  const output = renderReviewResult(
    {
      parsed: {
        verdict: "approve",
        summary: "Looks fine."
      },
      rawOutput: JSON.stringify({
        verdict: "approve",
        summary: "Looks fine."
      }),
      parseError: null
    },
    {
      reviewLabel: "Adversarial Review",
      targetLabel: "working tree diff"
    }
  );

  assert.match(output, /Codex returned JSON with an unexpected review shape\./);
  assert.match(output, /Missing array `findings`\./);
  assert.match(output, /Raw final message:/);
});

test("renderStoredJobResult prefers rendered output for structured review jobs", () => {
  const output = renderStoredJobResult(
    {
      id: "review-123",
      status: "completed",
      title: "Codex Adversarial Review",
      jobClass: "review",
      threadId: "thr_123"
    },
    {
      threadId: "thr_123",
      rendered: "# Codex Adversarial Review\n\nTarget: working tree diff\nVerdict: needs-attention\n",
      result: {
        result: {
          verdict: "needs-attention",
          summary: "One issue.",
          findings: [],
          next_steps: []
        },
        rawOutput:
          '{"verdict":"needs-attention","summary":"One issue.","findings":[],"next_steps":[]}'
      }
    }
  );

  assert.match(output, /^# Codex Adversarial Review/);
  assert.doesNotMatch(output, /^\{/);
  assert.match(output, /Codex session ID: thr_123/);
  assert.match(output, /Resume in Codex: codex resume thr_123/);
});

function assessment(verdict, summary) {
  return {
    at: "2026-08-19T00:00:00.000Z",
    phase: "analysis",
    text: JSON.stringify({ verdict, summary, findings: [], next_steps: [] })
  };
}

test("renderReviewResult shows how the assessment moved, and stays quiet when it did not", () => {
  const parsed = {
    parsed: { verdict: "needs-attention", summary: "Blocking issue in the retry path.", findings: [], next_steps: [] },
    rawOutput: "{}",
    parseError: null
  };
  const meta = { reviewLabel: "Adversarial Review", targetLabel: "working tree diff" };

  const moved = renderReviewResult(parsed, {
    ...meta,
    assessments: [assessment("approve", "Nothing yet."), assessment("needs-attention", "Found it.")]
  });
  // The drift is the whole reason interim assessments are retained: a review
  // that went approve -> needs-attention says something the final verdict alone
  // does not.
  assert.match(moved, /Assessment moved: approve -> needs-attention \(final\)/);

  const steady = renderReviewResult(parsed, {
    ...meta,
    assessments: [assessment("needs-attention", "Found it."), assessment("needs-attention", "Still there.")]
  });
  assert.equal(/Assessment moved/.test(steady), false);

  const single = renderReviewResult(parsed, { ...meta, assessments: [assessment("approve", "Only one.")] });
  assert.equal(/Assessment moved/.test(single), false);

  const none = renderReviewResult(parsed, meta);
  assert.equal(/Assessment moved/.test(none), false);
});

test("an interrupted review shows its trail even when the verdict never moved", () => {
  const output = renderReviewResult(
    {
      parsed: null,
      interrupted: true,
      parseError: "The review did not finish (turn status: failed).",
      rawOutput: JSON.stringify({ verdict: "approve", summary: "Still tracing." })
    },
    {
      reviewLabel: "Adversarial Review",
      targetLabel: "working tree diff",
      assessments: [
        { ...assessment("approve", "Starting."), omittedBefore: 4 },
        assessment("approve", "Still tracing.")
      ]
    }
  );

  assert.match(output, /did not finish, so it has no verdict/);
  // No "(final)" on a run that never reached one, and the truncation is stated
  // rather than silently dropping earlier entries.
  assert.match(output, /Assessment moved: \.\.\. \(4 earlier\) -> approve -> approve$/m);
  assert.equal(/\(final\)/.test(output), false);
});
