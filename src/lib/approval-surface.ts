import type { AgenticPendingProposal, DraftDetail } from "./api";

/**
 * Approval-surface rule for `/cases/:id`. Decides whether to render
 * the manual `DraftPendingBubble`, the agentic `AgentSuggestionBubble`,
 * or both for a Claim that may have a pending `drafts` row and a
 * pending `decision_proposals` row at the same time.
 *
 * The rule is specced in
 * `docs/features/agentic-timeline-ui.md` §"Approval-surface
 * interaction" — keep this function and that section aligned.
 *
 *   - An unresolved proposal with verdict `allowed` supersedes the
 *     manual draft surface: the agent is confident the auto-draft is
 *     safe to send, so the Decision gate is the canonical (single)
 *     Approve surface. This is the happy path that avoids emitting
 *     `draft.approved` + `decision.approved` for one Operator intent.
 *   - An unresolved proposal with verdict `human_confirm` (SOL-126 —
 *     relaxed from the original Single-Approve rule) keeps the draft
 *     visible alongside the agent panel. `human_confirm` means the
 *     agent has *asked* for human judgment (low confidence, missing
 *     context, ambiguous policy match, etc.); the Operator should see
 *     both the agent's reasoning AND the auto-drafted body they would
 *     otherwise send, then approve one or the other. The pilot wants
 *     the agentic decision system to be auditable in this case, not
 *     opaque.
 *   - An unresolved proposal with verdict `blocked` keeps the draft
 *     visible too. The agent Approve button is disabled in that case,
 *     so the manual draft remains as a fallback path.
 *   - A resolved proposal (Operator already clicked Approve or Reject)
 *     no longer competes for the surface: the draft state decides on
 *     its own.
 */
export type ApprovalSurfaceDecision = {
  showPendingProposal: boolean;
  showPendingDraft: boolean;
};

export function decideApprovalSurface(args: {
  draftDetail: DraftDetail | null;
  pendingProposal: AgenticPendingProposal | null;
}): ApprovalSurfaceDecision {
  const { draftDetail, pendingProposal } = args;

  const proposalActive =
    pendingProposal !== null && !pendingProposal.resolved_by_operator;

  const proposalVerdict =
    pendingProposal?.rule_evaluation?.verdict ?? "human_confirm";

  // Only `allowed` verdicts collapse onto the single agent surface.
  // `human_confirm` and `blocked` both keep the draft visible so the
  // Operator can see what would have been sent and either approve the
  // agent's decision OR send the draft directly.
  const proposalSupersedesDraft =
    proposalActive && proposalVerdict === "allowed";

  const draftIsReviewable =
    draftDetail !== null &&
    (draftDetail.draft.state === "pending" ||
      draftDetail.draft.state === "approved");

  return {
    showPendingProposal: proposalActive,
    showPendingDraft: !proposalSupersedesDraft && draftIsReviewable,
  };
}
