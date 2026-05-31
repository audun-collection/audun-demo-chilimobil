/**
 * Tiny en ↔ no helper for the `NEXT_PUBLIC_DEMO_MODE=true` shipped
 * customer demo. Outside demo mode every call returns the English
 * value verbatim — the operator console is unchanged.
 *
 * Two reasons for the inline (en, no) pattern instead of a key-based
 * dictionary:
 *
 *  - The strings live next to the markup, so contributors don't have
 *    to hunt across files to translate a button label.
 *  - JSX still reads as JSX. The English value is the source of
 *    truth; the Norwegian value is a sidecar.
 */

import { isDemoMode } from "./demo-fixtures";

/** Returns `no` when `NEXT_PUBLIC_DEMO_MODE=true`, otherwise `en`. */
export function tt(en: string, no: string): string {
  return isDemoMode() ? no : en;
}

/**
 * Locale shorthand for date/number formatters. `nb-NO` in demo mode,
 * the browser default otherwise.
 */
export function demoLocale(): string {
  return isDemoMode() ? "nb-NO" : "en-GB";
}

/**
 * Pretty-print a Claim's state for the demo audience. In English the
 * existing `friendlyState()` already returns readable values; this
 * picks a Norwegian translation for each terminal/active state we
 * surface on the creditor side.
 */
export function tState(state: string): string {
  if (!isDemoMode()) return ENGLISH_STATE_LABELS[state] ?? state;
  return NORWEGIAN_STATE_LABELS[state] ?? state;
}

const ENGLISH_STATE_LABELS: Record<string, string> = {
  parsed: "In collection",
  drafting: "In collection",
  drafted: "In collection",
  approved: "In collection",
  sent: "In collection",
  needs_review: "Needs review",
  paused: "Paused",
  escalated: "Dispute / escalated",
  closed: "Resolved",
  failed: "Needs review",
  pending_legal_approval: "Send to conciliation board?",
  sent_to_enforcement: "Sent to enforcement",
  long_term_monitoring: "Long-term monitoring",
};

const NORWEGIAN_STATE_LABELS: Record<string, string> = {
  // Pre-send operational states (drafting, draft pending approval, queued)
  // are collapsed into a single creditor-facing label so the demo
  // reads as fully automatic — there's no "your draft is waiting on
  // someone" hand-off from the prospect's perspective.
  parsed: "Under inndriving",
  drafting: "Under inndriving",
  drafted: "Under inndriving",
  approved: "Under inndriving",
  sent: "Under inndriving",
  needs_review: "Krever gjennomgang",
  paused: "Pauset",
  escalated: "Innsigelse / eskalert",
  closed: "Løst",
  // SMS bounced / unreachable handset — semantically "needs your
  // attention" because the operational response is creditor-driven
  // (escalate to legal or write off), not a system retry.
  failed: "Krever oppmerksomhet",
  // Rettslig-stage sub-statuses. `pending_legal_approval` asks the
  // creditor to decide between Forliksrådet and long-term monitoring;
  // `sent_to_enforcement` is post-Forliksrådet (namsmannen);
  // `long_term_monitoring` is the passive-watch path.
  pending_legal_approval: "Send til forliksrådet?",
  sent_to_enforcement: "Sendt til tvangsinnkreving",
  long_term_monitoring: "Langtidsovervåkning",
};

/** Translates the four Norwegian dunning stages — the policy keys are already Norwegian. */
export function tStage(stage: string | null | undefined): string {
  if (!stage) return tt("Not yet started", "Ikke startet");
  const map = isDemoMode() ? NORWEGIAN_STAGE_LABELS : ENGLISH_STAGE_LABELS;
  return map[stage] ?? stage;
}

const ENGLISH_STAGE_LABELS: Record<string, string> = {
  purring: "Reminder",
  inkassovarsel: "Notice of debt collection",
  betalingsoppfordring: "Payment demand",
  rettslig_inkasso: "Legal collection",
};

const NORWEGIAN_STAGE_LABELS: Record<string, string> = {
  purring: "Purring",
  inkassovarsel: "Inkassovarsel",
  betalingsoppfordring: "Betalingsoppfordring",
  rettslig_inkasso: "Rettslig inkasso",
};

/**
 * Badge tone that matches the merged-label vocabulary. The shared
 * `statusTone()` keeps operator-state colors granular (parsed→info,
 * drafted→neutral, sent→success); for the demo we collapse all
 * "in-flight" states onto the same `success` tone so the merged
 * label `Under inndriving` reads the same colour everywhere.
 */
export function demoStatusTone(
  state: string,
): "info" | "neutral" | "success" | "warn" | "danger" | "accent" {
  switch (state) {
    case "parsed":
    case "drafting":
    case "drafted":
    case "approved":
    case "sent":
      return "success";
    case "paused":
    case "needs_review":
    case "escalated":
    case "failed":
    case "pending_legal_approval":
      return "warn";
    case "sent_to_enforcement":
      return "danger";
    case "long_term_monitoring":
      return "info";
    case "closed":
      return "neutral";
    default:
      return "neutral";
  }
}
