"use client";

/**
 * Unified Conversation panel for /cases/:id.
 *
 * One chat-first view that replaces the previous trio (Draft card +
 * Agent activity card + standalone Conversation panel). Per
 * peter@audun.no's 2026-05-12 product feedback — "merging agent
 * activity and chat together into one feature?? could be super slick" —
 * everything the operator needs to see and act on for SMS-mediated
 * collection on a Claim now lives here:
 *
 *   - Inbound Debtor replies   → left-aligned bubbles labelled with the
 *                                Debtor's first name (e.g. "MAGNUS").
 *   - Sent outbound messages   → right-aligned Audun-clay bubbles.
 *   - Pending operator-reviewable draft (drafts table, state=pending)
 *                              → right-aligned muted-clay bubble with
 *                                Approve / Edit / Reject buttons inline.
 *   - Pending Decision Agent proposal (decision_proposals table)
 *                              → right-aligned muted-clay bubble with
 *                                Approve / Edit / Reject buttons + an
 *                                expandable "Reasoning trace" panel.
 *   - Agent step strips        → small inline notes between bubbles for
 *                                input_safety.classified, rule.evaluated,
 *                                decision.approved/rejected, etc.
 *   - Composer at the bottom   → manual operator reply (bypasses the
 *                                Decision Agent, sent as Operator).
 *
 * Escalated state shows a soft banner above the composer reminding the
 * Operator the Agent has stepped back.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileEdit,
  Loader2,
  Pencil,
  Send,
  ShieldAlert,
  Sparkles,
  Sprout,
  UserCheck,
  X,
} from "lucide-react";

import { useAuth } from "../../lib/auth-context";
import { tt } from "../../lib/demo-i18n";
import {
  acknowledgeInputSafetyAlert,
  approveDecisionProposal,
  approveDraft,
  editDraftBody,
  generateDraft,
  rejectDecisionProposal,
  rejectDraft,
  resumeAgent,
  sendDraft,
  sendOperatorReply,
  type AgenticPendingProposal,
  type AgenticRuleEvaluation,
  type AgenticTimelineStep,
  type DraftDetail,
} from "../../lib/api";
import { decideApprovalSurface } from "../../lib/approval-surface";
/** Inlined from the production case-detail page — only the shape is needed here. */
export interface PendingInputSafetyAlert { droppedEventId: string; classification: string; }
import { Button } from "../ui/button";

const MAX_SMS_CHARS = 459;

interface ConversationPanelProps {
  caseId: string;
  caseState: string;
  debtorName: string | null;
  steps: AgenticTimelineStep[];
  draftDetail: DraftDetail | null;
  pendingProposal: AgenticPendingProposal | null;
  /**
   * Unacknowledged Input Safety drop event (per
   * `features/input-safety-drop-alerts-operator.md`). Computed in
   * `page.tsx` by walking the audit log. `null` when every dropped
   * reply has a matching `input_safety.alert_acknowledged` row.
   */
  pendingInputSafetyAlert: PendingInputSafetyAlert | null;
  /**
   * SOL-101 — when `"creditor"`, the panel renders as a read-only
   * comm thread: pending/approved drafts surface as status-labelled
   * bubbles (no Approve / Edit / Reject / Send affordances), the
   * Decision Agent proposal block is hidden entirely, the operator
   * composer + Resume Agent + Input Safety acknowledge are hidden,
   * and inline operator-only agent reasoning rows collapse to
   * neutral summary text. Default `"operator"`.
   */
  viewerRole?: "operator" | "creditor";
  onReload?: () => void;
}

type ConversationItem =
  | {
      kind: "outbound";
      at: string;
      body: string;
      source: "agent" | "operator" | "system";
    }
  | {
      kind: "inbound";
      at: string;
      body: string;
    }
  // Human-/agent-in-the-loop milestones (operator approval, vulnerability
  // flag, routing to a case manager, payment plan active). Rendered as a
  // centred system line, visually distinct from SMS bubbles — so a CFO
  // reading the thread sees that a human was involved, not just SMS.
  | {
      kind: "system-event";
      at: string;
      label: string;
    }
  | {
      kind: "agent-note";
      at: string;
      title: string;
      detail: string;
    }
  // Rule-citation strip per features/agentic-timeline-rule-citations.md
  // — every Policy Engine / Company Rules row in a rule.evaluated step
  // is click-to-expand and reveals the full persisted rule (rule_id,
  // explanation, fired/blocked, ruleset_version, policy_set_id) so the
  // agent's reasoning is verifiable instead of paraphrased.
  | {
      kind: "rule-citation";
      at: string;
      ruleEvaluation: AgenticRuleEvaluation;
      policySetId?: string | undefined;
    };

export function ConversationPanel({
  caseId,
  caseState,
  debtorName,
  steps,
  draftDetail,
  pendingProposal,
  pendingInputSafetyAlert,
  viewerRole = "operator",
  onReload,
}: ConversationPanelProps): JSX.Element {
  const { getIdToken } = useAuth();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [acking, setAcking] = useState(false);
  const [ackError, setAckError] = useState<string | null>(null);

  const isCreditor = viewerRole === "creditor";

  // SOL-101 — Creditors see the comm thread as a read-only audit
  // surface. Hide the agent-reasoning notes (rule.evaluated,
  // input_safety.classified, decision.proposed/.approved/.rejected)
  // so the thread reads as SMS conversation + system events only.
  const items = useMemo(
    () => deriveConversationItems(steps, isCreditor),
    [steps, isCreditor],
  );

  const escalated = caseState === "escalated";
  const closed = caseState === "closed";
  const debtorFirstName = (debtorName ?? "Debtor")
    .split(/\s+/)[0]
    ?.toUpperCase() ?? "DEBTOR";

  // Single-Approve rule (`features/agentic-timeline-ui.md`
  // §"Single-Approve interaction"). An unresolved proposal with verdict
  // `allowed` / `human_confirm` collapses both approval surfaces onto
  // the richer Decision gate; a `blocked` proposal keeps the manual
  // draft visible as a fallback. The rule itself lives in
  // `lib/approval-surface.ts` so it is exercised by a unit test
  // independently of this component.
  //
  // SOL-101 — when viewing as a Creditor, the Decision Agent proposal
  // block is hidden entirely (operator-only reasoning surface). A
  // pending draft surfaces as a status-labelled bubble instead, so
  // the Creditor sees that a draft is awaiting operator approval.
  const surface = decideApprovalSurface({
    draftDetail,
    pendingProposal,
  });
  const showPendingProposal = isCreditor ? false : surface.showPendingProposal;
  const showPendingDraft = isCreditor
    ? draftDetail !== null &&
      (draftDetail.draft.state === "pending" ||
        draftDetail.draft.state === "approved")
    : surface.showPendingDraft;

  // Empty-thread fallback: no draft, no proposal, no steps with
  // user-visible content. Surface a Generate-draft CTA so the Operator
  // can kick the conversation off manually if auto-draft did not fire.
  // Creditors never see this — they don't author drafts.
  const canGenerateDraft = !isCreditor && !draftDetail && !closed;

  async function onSendOperatorReply(): Promise<void> {
    setComposerError(null);
    setSending(true);
    try {
      const token = await getIdToken();
      await sendOperatorReply(caseId, draft, token);
      setDraft("");
      onReload?.();
    } catch (err) {
      setComposerError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  // Resume Agent — flips the Claim out of `escalated` so the
  // Decision Agent re-engages on future inbound replies. Per
  // features/resume-agent-after-escalation.md. Manual replies
  // already in the thread stay as history.
  async function onResumeAgent(): Promise<void> {
    setResumeError(null);
    setResuming(true);
    try {
      const token = await getIdToken();
      await resumeAgent(caseId, token);
      onReload?.();
    } catch (err) {
      setResumeError(err instanceof Error ? err.message : String(err));
    } finally {
      setResuming(false);
    }
  }

  // Acknowledge an Input Safety alert — writes one
  // input_safety.alert_acknowledged audit row carrying the original
  // dropped event id, so the banner hides on the next reload. Per
  // features/input-safety-drop-alerts-operator.md. Independent of
  // Resume Agent: ack does not change cases.state.
  async function onAcknowledgeAlert(): Promise<void> {
    if (!pendingInputSafetyAlert) return;
    setAckError(null);
    setAcking(true);
    try {
      const token = await getIdToken();
      await acknowledgeInputSafetyAlert(
        caseId,
        pendingInputSafetyAlert.droppedEventId,
        token,
      );
      onReload?.();
    } catch (err) {
      setAckError(err instanceof Error ? err.message : String(err));
    } finally {
      setAcking(false);
    }
  }

  // No outer Card chrome — the thread IS the page. Page-level header +
  // metadata strip live in page.tsx; the thread renders as a flowing
  // column of events / blocks underneath. Per peter@audun.no's
  // 2026-05-13 feedback that the previous design felt boilerplate
  // ("too many boxes").
  return (
    <section className="space-y-4">
      <header className="border-b border-ink-200 pb-2">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-600">
          {tt("Thread", "Tråd")}
        </h2>
      </header>
      {items.length === 0 && !showPendingDraft && !showPendingProposal ? (
        <p className="text-[12.5px] text-ink-500">
          No messages yet.{" "}
          {canGenerateDraft
            ? "Generate the first reminder draft below to kick things off."
            : "The first reminder will appear here once it has been drafted."}
        </p>
      ) : (
        <ol className="space-y-4">
          {items.map((item, i) => (
            <li key={i}>
              <ConversationItemView
                item={item}
                debtorFirstName={debtorFirstName}
              />
            </li>
          ))}
          {showPendingProposal && pendingProposal ? (
            <li>
              <AgentSuggestionBubble
                proposal={pendingProposal}
                onResolved={onReload}
              />
            </li>
          ) : null}
          {showPendingDraft && draftDetail ? (
            <li>
              {isCreditor ? (
                <DraftReadOnlyBubble detail={draftDetail} />
              ) : (
                <DraftPendingBubble
                  detail={draftDetail}
                  onResolved={onReload}
                  agentFlagged={showPendingProposal && pendingProposal !== null}
                />
              )}
            </li>
          ) : null}
        </ol>
      )}

      {canGenerateDraft ? (
        <GenerateDraftCta caseId={caseId} onGenerated={onReload} />
      ) : null}

      {pendingInputSafetyAlert && !isCreditor ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-start gap-3 rounded-md border-2 border-rose-500/60 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 flex-none text-rose-600" />
            <p className="min-w-0 flex-1">
              <strong>Input Safety alert.</strong> The last Debtor reply
              was dropped as{" "}
              <code className="rounded bg-rose-100 px-1 font-mono text-[11px]">
                {pendingInputSafetyAlert.classification}
              </code>{" "}
              and did not enter the Decision Agent pipeline. Review the
              thread below and decide the next action.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void onAcknowledgeAlert()}
              disabled={acking}
            >
              {acking ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Acknowledging…
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Acknowledge
                </>
              )}
            </Button>
          </div>
          {ackError ? (
            <p className="text-[12px] text-rose-700">{ackError}</p>
          ) : null}
        </div>
      ) : null}

      {escalated && !isCreditor ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-start gap-3 rounded-md border border-clay-700/20 bg-clay-50/40 px-3 py-2 text-[12.5px] text-clay-800">
            <p className="min-w-0 flex-1">
              The Agent has escalated this Claim to Operator review.
              Type below to continue the conversation with the Debtor
              manually &mdash; the Agent stays out until you tell it
              to come back.
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void onResumeAgent()}
              disabled={resuming}
            >
              {resuming ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Resuming…
                </>
              ) : (
                <>
                  <Sprout className="h-3.5 w-3.5" />
                  Resume Agent
                </>
              )}
            </Button>
          </div>
          {resumeError ? (
            <p className="text-[12px] text-clay-700">{resumeError}</p>
          ) : null}
        </div>
      ) : null}

      {isCreditor ? (
        <p className="text-[12.5px] text-ink-500">
          {closed
            ? tt(
                "This Claim is closed. The conversation thread is read-only.",
                "Dette kravet er lukket. Samtaletråden er skrivebeskyttet.",
              )
            : tt(
                "Read-only view — Audun handles the follow-up; a case manager approves and steps in where needed.",
                "Skrivebeskyttet visning — Audun håndterer oppfølgingen, og en saksbehandler godkjenner og tar over der det trengs.",
              )}
        </p>
      ) : !closed ? (
        <div className="rounded border border-ink-200 bg-white">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              escalated
                ? "Reply to the Debtor as Operator…"
                : "Send a manual reply to the Debtor (bypasses the Agent)…"
            }
            rows={3}
            disabled={sending}
            maxLength={MAX_SMS_CHARS}
            className="block w-full resize-y rounded-t border-0 bg-transparent px-3 py-2 text-sm placeholder:text-ink-400 focus:outline-none"
          />
          <div className="flex items-center justify-between gap-3 border-t border-ink-200 px-3 py-2">
            <p className="font-mono text-[10.5px] text-ink-500">
              {draft.length} / {MAX_SMS_CHARS} chars &middot; sends as you,
              bypasses the Agent
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void onSendOperatorReply()}
              disabled={sending || draft.trim().length === 0}
            >
              {sending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Send reply
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-[12.5px] text-ink-500">
          This Claim is closed. The conversation thread is read-only.
        </p>
      )}

      {composerError && !isCreditor ? (
        <p className="text-[12px] text-clay-700">{composerError}</p>
      ) : null}
    </section>
  );
}

function ConversationItemView({
  item,
  debtorFirstName,
}: {
  item: ConversationItem;
  debtorFirstName: string;
}): JSX.Element {
  if (item.kind === "system-event") {
    return (
      <div className="flex items-center justify-center py-1">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-ink-50 px-3 py-1 text-[11px] font-medium text-ink-600">
          <UserCheck className="h-3 w-3 flex-none text-ink-500" />
          {item.label}
          <span className="font-mono text-[10px] text-ink-400">
            · {formatRelative(item.at)}
          </span>
        </span>
      </div>
    );
  }
  if (item.kind === "rule-citation") {
    return (
      <RuleCitationStrip
        at={item.at}
        ruleEvaluation={item.ruleEvaluation}
        policySetId={item.policySetId}
        variant="inline"
      />
    );
  }
  if (item.kind === "agent-note") {
    return (
      <div className="flex items-start gap-2 rounded-md bg-ink-50/80 px-3 py-1.5 text-[11.5px] text-ink-600">
        <Sparkles className="mt-[2px] h-3.5 w-3.5 flex-none text-accent-500" />
        <div className="min-w-0">
          <span className="font-medium text-ink-800">{item.title}</span>
          {item.detail ? (
            <span className="text-ink-500"> &middot; {item.detail}</span>
          ) : null}
          <span className="ml-2 font-mono text-[10.5px] text-ink-400">
            {formatRelative(item.at)}
          </span>
        </div>
      </div>
    );
  }
  // SMS events — pure text rows. No background, no border, no left
  // accent rule. Direction is encoded entirely in the header label
  // ("AUDUN → DEBTOR" vs "MAGNUS → AUDUN"), not in colour, so the
  // thread reads as a flat document. Per peter@audun.no's 2026-05-13
  // feedback ("still too boxy in the chat, not sure why different
  // colors").
  if (item.kind === "outbound") {
    return (
      <div>
        <div className="mb-0.5 flex items-baseline gap-2">
          <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-600">
            {item.source === "operator"
              ? tt("You → Debtor", "Du → Skyldner")
              : item.source === "agent"
                ? tt("Audun → Debtor", "Audun → Skyldner")
                : tt("System → Debtor", "System → Skyldner")}
          </span>
          <span className="font-mono text-[10.5px] text-ink-400">
            {tt("SMS sent", "SMS sendt")} &middot; {formatRelative(item.at)}
          </span>
        </div>
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-900">
          {item.body}
        </p>
      </div>
    );
  }
  // inbound
  return (
    <div>
      <div className="mb-0.5 flex items-baseline gap-2">
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-600">
          {debtorFirstName} → Audun
        </span>
        <span className="font-mono text-[10.5px] text-ink-400">
          {tt("SMS received", "SMS mottatt")} &middot; {formatRelative(item.at)}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-900">
        {item.body}
      </p>
    </div>
  );
}

/**
 * SOL-101 — Creditor-facing read-only variant of `DraftPendingBubble`.
 * Shows the proposed reply body with a status label
 * ("pending operator approval" / "approved, awaiting send") and no
 * Approve / Edit / Reject / Send affordances. Creditors observe that
 * a draft is queued for their tenant's Audun operator to action.
 */
function DraftReadOnlyBubble({
  detail,
}: {
  detail: DraftDetail;
}): JSX.Element {
  const state = detail.draft.state;
  const statusLabel =
    state === "pending"
      ? "Awaiting Audun approval"
      : state === "approved"
        ? "Approved — awaiting send"
        : state === "sent"
          ? "Sent"
          : state === "rejected"
            ? "Rejected"
            : state;

  return (
    <div className="relative space-y-3 py-1">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 flex-none text-accent-700" />
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent-700">
          Drafted reminder &middot; {statusLabel}
        </span>
        <span className="ml-auto font-mono text-[10px] text-ink-500">
          {detail.draft.template_slug} &middot;{" "}
          {formatRelative(detail.draft.updated_at)}
        </span>
      </div>
      <div className="rounded border border-ink-200 bg-white px-3 py-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">
            Proposed reply
          </span>
          <span className="font-mono text-[10px] text-ink-400">
            to Debtor &middot; SMS
          </span>
        </div>
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-900">
          {detail.draft.body}
        </p>
      </div>
    </div>
  );
}

/**
 * Full-width "pending draft" analysis block. Stylistically a muted
 * variant of the AgentSuggestion block — left accent rule, monospace
 * header, proposed-reply sub-block, action row at the bottom. Reads as
 * a draft awaiting approval, not as a chat message (because it hasn't
 * been sent yet).
 */
function DraftPendingBubble({
  detail,
  onResolved,
  agentFlagged = false,
}: {
  detail: DraftDetail;
  onResolved?: (() => void) | undefined;
  /**
   * SOL-126: when the Decision Agent has an unresolved
   * `human_confirm` proposal on this Claim, the draft surface renders
   * alongside the agent panel and a chip explains that the Operator
   * can either approve the agent's call or send the draft directly.
   */
  agentFlagged?: boolean;
}): JSX.Element {
  const { getIdToken } = useAuth();
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(detail.draft.body);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [pending, setPending] = useState<
    "approve" | "reject" | "edit" | "send" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  // Keep editBody in sync when a fresh draft arrives via reload.
  useEffect(() => {
    setEditBody(detail.draft.body);
  }, [detail.draft.id, detail.draft.body]);

  const state = detail.draft.state;
  const bodyTooLong = editBody.length > MAX_SMS_CHARS;
  const isPending = state === "pending";
  const isApproved = state === "approved";

  async function withAction<T>(
    label: typeof pending,
    fn: (token: string | null) => Promise<T>,
  ): Promise<void> {
    setError(null);
    setPending(label);
    try {
      const token = await getIdToken();
      await fn(token);
      onResolved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="relative space-y-3 py-1">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 flex-none text-accent-700" />
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent-700">
          Drafted reminder &middot; awaiting approval
        </span>
        <span className="ml-auto font-mono text-[10px] text-ink-500">
          {detail.draft.template_slug} &middot;{" "}
          {formatRelative(detail.draft.updated_at)}
        </span>
      </div>

      {/* SOL-126: explain why this draft is showing alongside an
          active agent proposal — the Operator can confirm the agent
          OR override and send the draft directly. */}
      {agentFlagged ? (
        <div className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50/60 px-2.5 py-1.5 text-[11.5px] text-amber-900">
          <span className="mt-0.5 inline-block h-1.5 w-1.5 flex-none rounded-full bg-amber-700" />
          <p>
            The Decision Agent flagged this Claim for review (see
            panel above). You can confirm the agent&apos;s call, or
            approve and send this draft directly if you disagree.
          </p>
        </div>
      ) : null}

      {/* Proposed reply sub-block */}
      <div className="rounded border border-ink-200 bg-white px-3 py-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">
            Proposed reply
          </span>
          <span className="font-mono text-[10px] text-ink-400">
            to Debtor &middot; SMS
          </span>
        </div>
        {editing && isPending ? (
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={3}
            maxLength={MAX_SMS_CHARS}
            className="block w-full resize-y rounded border border-ink-300 bg-white px-2 py-1.5 text-[13px] leading-relaxed text-ink-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
          />
        ) : (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-900">
            {detail.draft.body}
          </p>
        )}
        {editing && isPending ? (
          <p
            className={`mt-1 text-[10.5px] ${
              bodyTooLong ? "text-clay-700" : "text-ink-500"
            }`}
          >
            {editBody.length} / {MAX_SMS_CHARS} chars
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="text-[12px] text-clay-700">{error}</p>
      ) : null}

      {/* Action row — left-aligned, Codex-style. */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
          {isPending && !editing && !rejecting ? (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  void withAction("approve", (token) =>
                    approveDraft(detail.draft.id, token),
                  )
                }
                disabled={pending !== null}
              >
                {pending === "approve" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Approving…
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Approve &amp; send
                  </>
                )}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditing(true)}
                disabled={pending !== null}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit reply
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRejecting(true)}
                disabled={pending !== null}
              >
                <X className="h-3.5 w-3.5" />
                Reject
              </Button>
            </>
          ) : null}

          {isPending && editing ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setEditBody(detail.draft.body);
                }}
                disabled={pending !== null}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  void withAction("edit", async (token) => {
                    await editDraftBody(detail.draft.id, editBody, token);
                    setEditing(false);
                  })
                }
                disabled={
                  pending !== null ||
                  editBody.trim().length === 0 ||
                  bodyTooLong ||
                  editBody === detail.draft.body
                }
              >
                {pending === "edit" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Save edits
                  </>
                )}
              </Button>
            </>
          ) : null}

          {isPending && rejecting ? (
            <div className="flex w-full flex-wrap items-center gap-2">
              <input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection"
                className="block min-w-[16rem] flex-1 rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm placeholder:text-ink-500 focus:border-clay-700 focus:outline-none focus:ring-1 focus:ring-clay-700"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRejecting(false);
                  setRejectReason("");
                }}
                disabled={pending !== null}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() =>
                  void withAction("reject", async (token) => {
                    await rejectDraft(
                      detail.draft.id,
                      rejectReason || "(no reason given)",
                      token,
                    );
                    setRejecting(false);
                    setRejectReason("");
                  })
                }
                disabled={pending !== null}
              >
                {pending === "reject" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Rejecting…
                  </>
                ) : (
                  "Confirm reject"
                )}
              </Button>
            </div>
          ) : null}

          {isApproved ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() =>
                void withAction("send", (token) =>
                  sendDraft(detail.draft.id, token),
                )
              }
              disabled={pending !== null}
            >
              {pending === "send" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Send SMS
                </>
              )}
            </Button>
          ) : null}
        </div>
    </div>
  );
}

/**
 * Full-width "agent analysis block" — Claude / Codex reasoning style.
 * Renders the Decision Agent's proposed action, rationale, Policy /
 * Rules citations, and proposed reply (if any) as a flat, left-aligned
 * block with a subtle accent rule down the left edge. The whole thing
 * is the agent's analysis; the Approve / Edit / Reject row at the
 * bottom is the operator's action on that analysis.
 */
function AgentSuggestionBubble({
  proposal,
  onResolved,
}: {
  proposal: AgenticPendingProposal;
  onResolved?: (() => void) | undefined;
}): JSX.Element {
  const { getIdToken } = useAuth();
  // Rationale + Policy Engine evidence are collapsed by default —
  // they're the reasoning the operator can verify on demand. The
  // Proposed reply is NOT a disclosure — it's the agent's output,
  // surfaced flat below the reasoning rows.
  const [rationaleOpen, setRationaleOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(proposal.communication_text ?? "");
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [resolution, setResolution] = useState<
    "approved" | "rejected" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEditBody(proposal.communication_text ?? "");
  }, [proposal.id, proposal.communication_text]);

  const verdict = proposal.rule_evaluation?.verdict ?? "human_confirm";
  const hasCommunication = proposal.communication_text !== null;
  const bodyTooLong = editBody.length > MAX_SMS_CHARS;
  const approveDisabled =
    verdict === "blocked" ||
    pending !== null ||
    resolution !== null ||
    bodyTooLong;

  async function handleApprove(): Promise<void> {
    setError(null);
    setPending("approve");
    try {
      const token = await getIdToken();
      const opts: { editedCommunicationText?: string } = {};
      if (
        hasCommunication &&
        editBody !== proposal.communication_text &&
        !bodyTooLong
      ) {
        opts.editedCommunicationText = editBody;
      }
      await approveDecisionProposal(proposal.id, opts, token);
      setResolution("approved");
      setEditing(false);
      onResolved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  }

  async function handleReject(): Promise<void> {
    setError(null);
    setPending("reject");
    try {
      const token = await getIdToken();
      await rejectDecisionProposal(
        proposal.id,
        rejectReason.trim() || "(no reason given)",
        token,
      );
      setResolution("rejected");
      setRejecting(false);
      onResolved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  }

  const confidenceTone =
    proposal.confidence === "high"
      ? "bg-sage-100 text-sage-800"
      : proposal.confidence === "medium"
        ? "bg-amber-100 text-amber-800"
        : "bg-clay-100 text-clay-800";

  // Full-width "agent analysis block" — Claude / Codex reasoning style,
  // not a chat bubble. The block reads as: header strip with action +
  // confidence + model · rationale paragraph · Policy Engine citation
  // strip · proposed reply (rendered as a sub-block, NOT a chat bubble,
  // because it isn't sent yet — it's a draft awaiting approval) ·
  // action row. The whole thing is left-aligned, full-width, with a
  // subtle accent rule down the left so the operator's eye reads it as
  // "the agent's analysis" rather than "another text message".
  return (
    <div className="relative space-y-3 py-1">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 flex-none text-accent-700" />
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent-700">
          Agent analysis &middot; proposing {proposal.proposed_action_type}
        </span>
        <span
          className={`rounded-full px-1.5 py-[1px] font-mono text-[9.5px] font-semibold uppercase tracking-wider ${confidenceTone}`}
        >
          {proposal.confidence}
        </span>
        <span className="ml-auto font-mono text-[10px] text-ink-500">
          {proposal.model} &middot; {formatRelative(proposal.created_at)}
        </span>
      </div>

      {/* Rationale — click-to-expand. The closed line shows a short
          summary so the operator can scan without expanding. */}
      {proposal.rationale.trim() ? (
        <DisclosureRow
          label="Rationale"
          summary={summarize(proposal.rationale.trim(), 100)}
          open={rationaleOpen}
          onToggle={() => setRationaleOpen((v) => !v)}
        >
          <p className="text-[13px] leading-relaxed text-ink-800">
            {proposal.rationale.trim()}
          </p>
        </DisclosureRow>
      ) : null}

      {/* Policy Engine + Company Rules citation strip — its header is
          already its own click-to-expand summary, no DisclosureRow
          wrapper needed. */}
      {proposal.rule_evaluation ? (
        <RuleCitationStrip
          at={proposal.rule_evaluation.evaluated_at}
          ruleEvaluation={proposal.rule_evaluation}
          policySetId={proposal.policy_set_id}
          variant="boxed"
        />
      ) : null}

      {/* Proposed reply — the agent's OUTPUT, not part of its reasoning.
          Rendered flat (no chevron, no disclosure) and outdented one
          notch so it sits at the analysis-block edge rather than under
          the Rationale / Policy Engine sub-rows. Per peter@audun.no's
          2026-05-13 feedback: "the actual proposed reply doesn't need to
          be part of the collapses, that is the output of the agent
          reasoning". */}
      {hasCommunication ? (
        <div className="mt-2 pt-2 border-t border-ink-200">
          <div className="mb-1 flex items-baseline gap-2">
            <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-700">
              Proposed reply
            </span>
            <span className="font-mono text-[10px] text-ink-400">
              to Debtor &middot; SMS
            </span>
          </div>
          {editing && resolution === null ? (
            <>
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={3}
                maxLength={MAX_SMS_CHARS}
                disabled={pending !== null}
                className="block w-full resize-y rounded border border-ink-300 bg-white px-2 py-1.5 text-[13px] leading-relaxed text-ink-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
              <p
                className={`mt-1 text-[10.5px] ${
                  bodyTooLong ? "text-clay-700" : "text-ink-500"
                }`}
              >
                {editBody.length} / {MAX_SMS_CHARS} chars
              </p>
            </>
          ) : (
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-900">
              {editBody || proposal.communication_text}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 pt-2 border-t border-ink-200 text-[12px] italic text-ink-600">
          No outbound communication for this action &mdash; approving
          executes {proposal.proposed_action_type} directly.
        </p>
      )}

      {error ? (
        <p className="text-[12px] text-clay-700">{error}</p>
      ) : null}

      {/* Action row — left-aligned, Codex-style: ghost Reject / secondary
          Edit / primary Approve sit at the bottom of the analysis block. */}
      {resolution === null ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {rejecting ? (
            <div className="flex w-full flex-wrap items-center gap-2">
              <input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection"
                className="block min-w-[16rem] flex-1 rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm placeholder:text-ink-500 focus:border-clay-700 focus:outline-none focus:ring-1 focus:ring-clay-700"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRejecting(false);
                  setRejectReason("");
                }}
                disabled={pending !== null}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => void handleReject()}
                disabled={pending !== null}
              >
                {pending === "reject" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Rejecting…
                  </>
                ) : (
                  "Confirm reject"
                )}
              </Button>
            </div>
          ) : (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleApprove()}
                disabled={approveDisabled}
              >
                {pending === "approve" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Approving…
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Approve &amp; send
                  </>
                )}
              </Button>
              {hasCommunication ? (
                editing ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(false);
                      setEditBody(proposal.communication_text ?? "");
                    }}
                    disabled={pending !== null}
                  >
                    Cancel edit
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditing(true)}
                    disabled={pending !== null}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit reply
                  </Button>
                )
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRejecting(true)}
                disabled={pending !== null}
              >
                <X className="h-3.5 w-3.5" />
                Reject
              </Button>
            </>
          )}
        </div>
      ) : (
        <p
          className={`text-[11.5px] ${
            resolution === "approved" ? "text-sage-700" : "text-clay-700"
          }`}
        >
          {resolution === "approved"
            ? "Approved — Action Executor will dispatch."
            : "Rejected — proposal cleared from the queue."}
        </p>
      )}
    </div>
  );
}

/**
 * DisclosureRow — single-line click-to-expand row. Mirrors the visual
 * pattern of the RuleCitationStrip's Policy Engine header so every
 * disclosable section inside the analysis block has the same shape:
 *
 *   ▾ <Label>    <one-line summary>       <optional right meta>
 *
 * Closed by default. When open, the children render below the row.
 */
function DisclosureRow({
  label,
  summary,
  rightMeta,
  open,
  onToggle,
  children,
}: {
  label: string;
  summary?: string;
  rightMeta?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-accent-50/60 focus:bg-accent-50 focus:outline-none focus:ring-1 focus:ring-accent-500"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 flex-none text-ink-500" />
        ) : (
          <ChevronRight className="h-3 w-3 flex-none text-ink-500" />
        )}
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-700">
          {label}
        </span>
        {summary && !open ? (
          <span className="truncate text-[12px] text-ink-500">{summary}</span>
        ) : null}
        {rightMeta ? (
          <span className="ml-auto font-mono text-[10px] text-ink-400">
            {rightMeta}
          </span>
        ) : null}
      </button>
      {open ? <div className="ml-5 mt-1 pl-3">{children}</div> : null}
    </div>
  );
}

function summarize(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1)}…`;
}

/**
 * RuleCitationStrip — the click-to-expand citation pattern from
 * features/agentic-timeline-rule-citations.md. Each Policy Engine row +
 * every fired/blocked Company Rule renders as an inline disclosure
 * (role="button", aria-expanded, keyboard-activatable) that, when open,
 * reveals the full persisted rule (rule_id verbatim, full untruncated
 * explanation, Fired/Blocked pill, "Recorded under ruleset v<x> ·
 * policy set <slug>" footer) so the agent's reasoning is verifiable
 * rather than paraphrased.
 *
 *  - `inline` variant: a left-aligned strip used inside the chat thread
 *    for past `rule.evaluated` steps.
 *  - `boxed` variant: a contained card used inside the AgentSuggestion
 *    bubble's reasoning trace.
 */
function RuleCitationStrip({
  at,
  ruleEvaluation,
  policySetId,
  variant,
}: {
  at: string;
  ruleEvaluation: AgenticRuleEvaluation;
  policySetId?: string | undefined;
  variant: "inline" | "boxed";
}): JSX.Element {
  const [policyOpen, setPolicyOpen] = useState(false);
  const [openRuleKeys, setOpenRuleKeys] = useState<Set<string>>(new Set());

  function toggleRule(key: string): void {
    setOpenRuleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const fired = ruleEvaluation.fired_rules;
  const blocked = ruleEvaluation.blocked_rules;
  const verdictTone =
    ruleEvaluation.verdict === "allowed"
      ? "bg-sage-100 text-sage-800 border-sage-300"
      : ruleEvaluation.verdict === "blocked"
        ? "bg-clay-100 text-clay-800 border-clay-300"
        : "bg-amber-100 text-amber-800 border-amber-300";

  // Citation strip wears no box of its own — it sits in flow inside
  // the analysis block (boxed) or inline in the thread (inline) and
  // relies on the leading icon + uppercase mono header for affordance.
  const containerClass = variant === "boxed" ? "" : "py-1";

  return (
    <div className={containerClass}>
      {/* Single-line header — click to expand the per-rule citation rows.
          Collapsed by default so the operator sees the verdict + counts
          at a glance, and only opens the detail when they want to verify
          the source. */}
      <button
        type="button"
        onClick={() => setPolicyOpen((v) => !v)}
        aria-expanded={policyOpen}
        className="group flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-accent-50/60 focus:bg-accent-50 focus:outline-none focus:ring-1 focus:ring-accent-500"
      >
        {policyOpen ? (
          <ChevronDown className="h-3 w-3 flex-none text-ink-500" />
        ) : (
          <ChevronRight className="h-3 w-3 flex-none text-ink-500" />
        )}
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-700">
          Policy Engine
        </span>
        <span
          className={`rounded-full border px-1.5 py-[1px] font-mono text-[9.5px] font-semibold uppercase tracking-wider ${verdictTone}`}
        >
          {ruleEvaluation.verdict}
        </span>
        <span className="font-mono text-[10.5px] text-ink-500">
          {ruleEvaluation.approval_tier} tier
        </span>
        <span className="font-mono text-[10.5px] text-ink-400">
          &middot; {fired.length} fired
        </span>
        {blocked.length > 0 ? (
          <span className="rounded-full bg-clay-100 px-1.5 py-[1px] font-mono text-[9.5px] font-semibold uppercase text-clay-800">
            {blocked.length} blocked
          </span>
        ) : null}
        <span className="ml-auto font-mono text-[10px] text-ink-400">
          {formatRelative(at)}
        </span>
      </button>

      {/* Policy Engine disclosure */}
      {policyOpen ? (
        <div className="ml-5 mt-1.5 space-y-1.5 border-l border-ink-200 pl-3 text-[12px] leading-relaxed text-ink-700">
          {ruleEvaluation.explanation.trim() ? (
            <p>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                Explanation
              </span>
              <br />
              {ruleEvaluation.explanation.trim()}
            </p>
          ) : null}
          <p className="font-mono text-[10.5px] text-ink-500">
            verdict <strong>{ruleEvaluation.verdict}</strong> &middot;
            approval tier <strong>{ruleEvaluation.approval_tier}</strong>
            {ruleEvaluation.ruleset_version ? (
              <>
                {" "}
                &middot; ruleset v
                <code className="font-mono">
                  {ruleEvaluation.ruleset_version}
                </code>
              </>
            ) : null}
            {policySetId ? (
              <>
                {" "}
                &middot; policy set{" "}
                <code className="font-mono">{policySetId}</code>
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      {/* Per-rule citation rows. Hidden by default to keep the strip
          compact — the operator expands the Policy Engine row to reveal
          them. Per peter@audun.no's 2026-05-13 feedback ("right now we
          are showing too much information at default"). */}
      {policyOpen && (fired.length > 0 || blocked.length > 0) ? (
        <ul className="ml-5 mt-1.5 space-y-1 border-l border-ink-200 pl-3">
          {fired.map((r) => (
            <RuleCitationRow
              key={`fired:${r.rule_id}`}
              rule={r}
              status="fired"
              open={openRuleKeys.has(`fired:${r.rule_id}`)}
              onToggle={() => toggleRule(`fired:${r.rule_id}`)}
              ruleSetVersion={ruleEvaluation.ruleset_version}
              policySetId={policySetId}
            />
          ))}
          {blocked.map((r) => (
            <RuleCitationRow
              key={`blocked:${r.rule_id}`}
              rule={r}
              status="blocked"
              open={openRuleKeys.has(`blocked:${r.rule_id}`)}
              onToggle={() => toggleRule(`blocked:${r.rule_id}`)}
              ruleSetVersion={ruleEvaluation.ruleset_version}
              policySetId={policySetId}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RuleCitationRow({
  rule,
  status,
  open,
  onToggle,
  ruleSetVersion,
  policySetId,
}: {
  rule: { rule_id: string; explanation: string };
  status: "fired" | "blocked";
  open: boolean;
  onToggle: () => void;
  ruleSetVersion: string;
  policySetId?: string | undefined;
}): JSX.Element {
  const pillClass =
    status === "fired"
      ? "bg-sage-100 text-sage-800"
      : "bg-clay-100 text-clay-800";
  // Truncate the explanation when closed so the strip stays compact;
  // the full text is revealed on click per the spec.
  const SUMMARY_LIMIT = 78;
  const summary =
    rule.explanation.length > SUMMARY_LIMIT
      ? `${rule.explanation.slice(0, SUMMARY_LIMIT - 1)}…`
      : rule.explanation;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group flex w-full items-start gap-2 rounded px-1 py-1 text-left hover:bg-accent-50/60 focus:bg-accent-50 focus:outline-none focus:ring-1 focus:ring-accent-500"
      >
        {open ? (
          <ChevronDown className="mt-[3px] h-3 w-3 flex-none text-ink-500" />
        ) : (
          <ChevronRight className="mt-[3px] h-3 w-3 flex-none text-ink-500" />
        )}
        <span
          className={`mt-[1px] rounded-full px-1.5 py-[1px] font-mono text-[9.5px] font-semibold uppercase tracking-wider ${pillClass}`}
        >
          {status}
        </span>
        <code className="mt-[1px] font-mono text-[11.5px] text-ink-900">
          {rule.rule_id}
        </code>
        {!open ? (
          <span className="ml-1 text-[11.5px] text-ink-500">
            &middot; {summary}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="ml-5 mt-1 mb-1 space-y-1 border-l border-ink-200 pl-3 text-[12px] leading-relaxed text-ink-700">
          <p>{rule.explanation}</p>
          <p className="font-mono text-[10.5px] text-ink-500">
            Recorded under
            {ruleSetVersion ? (
              <>
                {" "}
                ruleset v
                <code className="font-mono">{ruleSetVersion}</code>
              </>
            ) : null}
            {policySetId ? (
              <>
                {ruleSetVersion ? " · " : " "}
                policy set <code className="font-mono">{policySetId}</code>
              </>
            ) : null}
          </p>
        </div>
      ) : null}
    </li>
  );
}

function GenerateDraftCta({
  caseId,
  onGenerated,
}: {
  caseId: string;
  onGenerated?: (() => void) | undefined;
}): JSX.Element {
  const { getIdToken } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate(): Promise<void> {
    setError(null);
    setPending(true);
    try {
      const token = await getIdToken();
      await generateDraft(caseId, token);
      onGenerated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-ink-300 bg-ink-50/60 px-3 py-2">
      <p className="text-[12.5px] text-ink-600">
        No draft yet for this Claim. Kick off the conversation with the
        Debtor by generating the first reminder.
      </p>
      <div className="flex items-center gap-2">
        {error ? (
          <p className="text-[12px] text-clay-700">{error}</p>
        ) : null}
        <Button
          variant="primary"
          size="sm"
          onClick={() => void onGenerate()}
          disabled={pending}
        >
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Drafting…
            </>
          ) : (
            <>
              <FileEdit className="h-3.5 w-3.5" />
              Generate first draft
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * Maps the human-/agent-in-the-loop audit events to a short, creditor-
 * facing label. Returns null for events that shouldn't appear as a
 * thread milestone. These are the moments that prove a human was
 * involved — the opposite of "fully automatic".
 */
function humanEventLabel(eventType: string): string | null {
  switch (eventType) {
    case "plan_approved":
      return tt(
        "Payment plan approved by case manager",
        "Betalingsplan godkjent av saksbehandler",
      );
    case "needs_review_flagged":
      return tt("Vulnerability flag raised", "Sårbar-flagg utløst");
    case "routed_to_agent":
      return tt("Routed to a case manager", "Rutet til saksbehandler");
    case "payment_plan_active":
      return tt("Payment plan active", "Betalingsplan aktiv");
    default:
      return null;
  }
}

function deriveConversationItems(
  steps: AgenticTimelineStep[],
  hideOperatorOnly: boolean = false,
): ConversationItem[] {
  const items: ConversationItem[] = [];
  for (const step of steps) {
    if (step.kind === "debtor.reply_received") {
      const body =
        (step.payload["body"] as string | undefined) ??
        (step.payload["body_preview"] as string | undefined) ??
        (step.payload["text"] as string | undefined);
      if (body) {
        items.push({ kind: "inbound", at: step.at, body });
      }
      continue;
    }
    if (step.kind === "communication.sent") {
      const body =
        (step.payload["body"] as string | undefined) ??
        (step.payload["draft_body"] as string | undefined);
      const source =
        step.payload["source"] === "operator_reply" ? "operator" : "agent";
      if (body) {
        items.push({ kind: "outbound", at: step.at, body, source });
      }
      continue;
    }
    // Human-/agent-in-the-loop milestones surface for everyone (incl.
    // creditors) as a centred system line — the whole point is that the
    // CFO sees a person was involved. Other action.executed events
    // (stage advances, ingestion, etc.) stay out of the thread.
    if (step.kind === "action.executed") {
      const label = humanEventLabel(String(step.payload["event_type"] ?? ""));
      if (label) {
        items.push({ kind: "system-event", at: step.at, label });
      }
      continue;
    }
    // SOL-101 — Creditors don't see agent reasoning / rule citation /
    // input-safety classifier strips. Their thread is the SMS
    // conversation as the Debtor experiences it.
    if (hideOperatorOnly) continue;
    // Surface a small inline agent-activity note for the high-signal
    // proposal + verdict steps so the operator sees the agent's
    // contribution inline in the thread.
    if (step.kind === "decision.proposed") {
      const actionType = String(step.payload["proposed_action_type"] ?? "—");
      const confidence = String(step.payload["confidence"] ?? "—");
      items.push({
        kind: "agent-note",
        at: step.at,
        title: `Agent proposed ${actionType}`,
        detail: `confidence ${confidence}`,
      });
      continue;
    }
    if (step.kind === "rule.evaluated") {
      // Hydrate the full rule_evaluation payload into a citation strip
      // so each fired/blocked rule is independently inspectable inline.
      // The step.payload columns mirror the rule_evaluations row 1:1.
      const fired = Array.isArray(step.payload["fired_rules"])
        ? (step.payload["fired_rules"] as Array<{
            rule_id: string;
            explanation: string;
          }>)
        : [];
      const blocked = Array.isArray(step.payload["blocked_rules"])
        ? (step.payload["blocked_rules"] as Array<{
            rule_id: string;
            explanation: string;
          }>)
        : [];
      const policySetId =
        typeof step.payload["policy_set_id"] === "string"
          ? (step.payload["policy_set_id"] as string)
          : undefined;
      items.push({
        kind: "rule-citation",
        at: step.at,
        ruleEvaluation: {
          verdict: String(step.payload["verdict"] ?? "—"),
          approval_tier: String(step.payload["approval_tier"] ?? "—"),
          ruleset_version: String(step.payload["ruleset_version"] ?? ""),
          fired_rules: fired,
          blocked_rules: blocked,
          explanation: String(step.payload["explanation"] ?? ""),
          evaluated_at: step.at,
        },
        policySetId,
      });
      continue;
    }
    if (step.kind === "decision.approved") {
      items.push({
        kind: "agent-note",
        at: step.at,
        title: "Operator approved Agent proposal",
        detail: "",
      });
      continue;
    }
    if (step.kind === "decision.rejected") {
      items.push({
        kind: "agent-note",
        at: step.at,
        title: "Operator rejected Agent proposal",
        detail: "",
      });
      continue;
    }
    if (step.kind === "input_safety.classified") {
      const classification = String(step.payload["classification"] ?? "—");
      const rec = String(step.payload["recommendation"] ?? "—");
      items.push({
        kind: "agent-note",
        at: step.at,
        title: `Input Safety: ${classification}`,
        detail: `recommendation ${rec}`,
      });
      continue;
    }
  }
  return items;
}

function formatRelative(at: string): string {
  const ts = new Date(at).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - ts) / 1000));
  if (diffSec < 60) return tt("just now", "akkurat nå");
  if (diffSec < 3600) {
    return tt(`${Math.floor(diffSec / 60)}m ago`, `${Math.floor(diffSec / 60)} min siden`);
  }
  if (diffSec < 86400) {
    return tt(`${Math.floor(diffSec / 3600)}h ago`, `${Math.floor(diffSec / 3600)} t siden`);
  }
  return new Date(at).toLocaleString(tt("en-GB", "nb-NO"), {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
