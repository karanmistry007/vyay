/**
 * The assertions that already fail on a clean checkout.
 *
 * Both the post-edit hook and the CI verifier need to agree on this list: if CI treats a
 * known failure as a regression it is red forever and people stop reading it, and if the
 * hook ignores one CI does not, an edit passes locally and fails in the pull request.
 * Keeping the list in one module is what stops those two drifting apart.
 *
 * Each entry needs a reason and, ideally, a shorter life than this comment. Remove an
 * entry the moment the assertion is fixed — a stale allowance hides a real regression,
 * which is the one failure mode this file must not have.
 */

export const BASELINE = [
  {
    /* Matched as a substring against the "  FAIL  <label>" line the test prints. */
    label: "a short history charts month by month",
    script: "test-analytics.mjs",
    /*
     * buildRange("all", ...) ends the range at the real today rather than the anchor it is
     * given, so the expected bucket count drifts by one every month. That is a defect in
     * the test's assumption, not in the app. The fix is to make the range honour its anchor
     * or to inject a clock — never to edit the expectation to match the current month.
     */
    reason: 'buildRange("all") ignores its anchor and ends at the real today, so the expected bucket count drifts monthly',
  },
];

/** True when a "FAIL" line from `script` is one of the known, allowed failures. */
export function isKnownFailure(script, line) {
  return BASELINE.some((known) => known.script === script && line.includes(known.label));
}
