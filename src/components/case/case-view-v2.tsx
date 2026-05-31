"use client";

/**
 * Case View v2 — the SOL-48 redesign. Folds the prototype Variant C
 * (workbench: banner cards + horizontal status bar + full-width
 * chat) onto the live `/cases/[id]` route, wired to the real
 * `CaseDetail` response. Sections fall back to em-dash when the
 * matching backend slice hasn't merged yet.
 *
 * Gated by `useCaseViewV2Flag()` (URL param `?v=v2` or env var
 * `NEXT_PUBLIC_CASE_VIEW_V2`); when off, the page renders the
 * legacy single-column layout. Per
 * `docs/features/sol-48-claim-view-redesign.md` and ADR
 * 019.
 *
 * Note: the conversation surface re-uses the existing
 * `ConversationPanel` unchanged in this slice — the
 * AgentSuggestionBubble side-button reposition + delete-prototype
 * land in a follow-up commit so the live page can ship behind the
 * flag immediately for dev observability.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Ban,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  HeartHandshake,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Receipt,
  X,
} from "lucide-react";
import { Badge, statusTone } from "../ui/badge";
import { tState, tStage, tt } from "../../lib/demo-i18n";
import { Button } from "../ui/button";
import {
  updateCase,
  type AgenticPendingProposal,
  type AgenticTimelineStep,
  type CaseDetail,
  type CaseStageTransition,
  type DraftDetail,
  type LedgerInvoice,
  type LedgerLine,
  type LedgerPayment,
  type LedgerView,
  type UpdateCaseInput,
} from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { formatMinorAsKr } from "../../lib/format-currency";
import {
  FORLIKSRAD_GEBYR_NOK,
  FORLIKSRAD_MULTIPLIER,
  RETTSGEBYR_NOK,
} from "../../lib/demo-rates";
/** Inlined from the production case-detail page — only the shape is needed here. */
export interface PendingInputSafetyAlert { droppedEventId: string; classification: string; }
import { ConversationPanel } from "./conversation-panel";

/** dd.MM.yyyy in UTC — matches Norwegian convention. Exported for tests. */
export function formatDateNo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

/** dd.MM.yyyy HH:mm UTC. */
function formatDateTimeNo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${dd}.${mm}.${yyyy} ${hh}:${mi}`;
}

/** Format a numeric string from pg as "kr 1 248,50" (Norwegian). Exported for tests. */
export function formatNok(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  const f = new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `kr ${f}`;
}

const DEFAULT_STAGE_ORDER = [
  "purring",
  "inkassovarsel",
  "betalingsoppfordring",
  "rettslig_inkasso",
];

/**
 * Returns true when the case-detail page should render the SOL-48
 * workbench layout (banner cards + status bar + collapsible
 * conversation) instead of the legacy single-column view.
 *
 * Resolution order:
 *   1. `?v=v2` / `?v=v1` URL param — manual override, wins everywhere.
 *   2. `NEXT_PUBLIC_CASE_VIEW_V2=1|0` env override — emergency kill /
 *      forced-on switch baked at build.
 *   3. Default ON in dev (NEXT_PUBLIC_ENVIRONMENT === "dev"); OFF in
 *      every other environment until the Claim Ledger projection is
 *      wired up and the workbench shows real numbers in prod too.
 *
 * SSR and client agree on the same answer when no URL param is
 * present, so there's no hydration flicker between legacy and
 * workbench layouts.
 *
 * Not a hook (no React state) — safe to call from anywhere in
 * render, including after early returns.
 */
export function isCaseViewV2Enabled(): boolean {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.get("v") === "v2") return true;
    if (params.get("v") === "v1") return false;
  }
  const flag = process.env["NEXT_PUBLIC_CASE_VIEW_V2"];
  if (flag === "1" || flag === "true") return true;
  if (flag === "0" || flag === "false") return false;
  return process.env["NEXT_PUBLIC_ENVIRONMENT"] === "dev";
}

interface CaseViewV2Props {
  caseId: string;
  detail: CaseDetail;
  draftDetail: DraftDetail | null;
  pendingProposal: AgenticPendingProposal | null;
  agenticSteps: AgenticTimelineStep[];
  pendingInputSafetyAlert: PendingInputSafetyAlert | null;
  /**
   * SOL-101 — propagated down to the embedded ConversationPanel so
   * operator-only affordances (Approve / Edit / Send draft, Resume
   * Agent, Decision Agent proposal block, composer) hide for
   * creditors. The workbench cards themselves stay the same.
   */
  viewerRole?: "operator" | "creditor";
  onReload: () => void;
}

export function CaseViewV2({
  caseId,
  detail,
  draftDetail,
  pendingProposal,
  agenticSteps,
  pendingInputSafetyAlert,
  viewerRole = "operator",
  onReload,
}: CaseViewV2Props): JSX.Element {
  const c = detail.case;
  const stages = detail.stage_transitions ?? [];
  const ledger = detail.ledger ?? null;
  const lastInvoice = detail.last_invoice ?? null;

  // A Claim pulled into needs_review by a vulnerability signal (e.g.
  // Astrid — sykmeldt) is NOT a missing-data problem: automation +
  // fee-escalation are paused and a human takes over. Detect the flag
  // so we show a caring "sårbar kunde" banner instead of the generic
  // fill-in-the-fields card, and soften the status sub-line.
  const isVulnerable = detail.audit.some(
    (e) =>
      e.event_type === "needs_review_flagged" &&
      e.payload?.["signal"] === "vulnerability",
  );

  return (
    <div className="space-y-3">
      <ClaimHeader detail={detail} />

      {c.state === "needs_review" ? (
        isVulnerable ? (
          <VulnerableReviewCard />
        ) : (
          <NeedsReviewCard detail={detail} onReload={onReload} />
        )
      ) : null}

      {c.state === "failed" ? <LegalEscalationReviewCard /> : null}
      {c.state === "pending_legal_approval" ? (
        <ForliksradetReviewCard detail={detail} />
      ) : null}

      <section className="grid auto-rows-fr grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <DebtorIdentityCard detail={detail} onReload={onReload} />
        <CurrentStatusCard detail={detail} isVulnerable={isVulnerable} />
        <BalanceCard detail={detail} />
        <DueDatesCard detail={detail} />
      </section>

      <StatusBar
        currentStage={c.dunning_stage ?? null}
        transitions={stages}
        ledger={ledger}
        invoiceIssuedAt={lastInvoice?.issued_at ?? null}
        policySetId={null}
      />

      <LatestInvoiceCard invoice={lastInvoice} />

      <CollapsibleConversation
        caseId={caseId}
        caseState={c.state}
        debtorName={c.debtor_name}
        steps={agenticSteps}
        draftDetail={draftDetail}
        pendingProposal={pendingProposal}
        pendingInputSafetyAlert={pendingInputSafetyAlert}
        viewerRole={viewerRole}
        onReload={onReload}
      />
    </div>
  );
}

// ─── Header ─────────────────────────────────────────────────────────

function ClaimHeader({ detail }: { detail: CaseDetail }): JSX.Element {
  const c = detail.case;
  // A Claim that's already resolved or in the enforcement track can't
  // be stopped by the creditor any more, so the button hides.
  const stoppable = c.state !== "closed" && c.state !== "sent_to_enforcement";
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="space-y-1.5">
        <p className="eyebrow">
          {c.creditor_display_name ?? c.creditor}
          {c.creditor_display_name && c.creditor_display_name !== c.creditor ? (
            <span className="ml-1.5 font-mono text-[10px] normal-case tracking-normal text-ink-400">
              {c.creditor}
            </span>
          ) : null}
        </p>
        <h1
          className="font-serif text-3xl font-light tracking-tight text-ink-900"
          style={{ fontVariationSettings: "'opsz' 60, 'SOFT' 80" }}
        >
          {c.invoice_reference ?? "(no invoice reference)"}
        </h1>
      </div>
      {stoppable ? <StopCaseButton /> : null}
    </header>
  );
}

/**
 * "Stopp sak" — halts all collection activity on the Claim. Demo-only:
 * a confirm dialog flips the control to an inline "stopped" pill (no
 * browser alert). In the real product this signals the Temporal
 * workflow to cancel reminders and move the Claim to a stopped state.
 */
function StopCaseButton(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [stopped, setStopped] = useState(false);
  // Portals need a client-side document; gate on mount so SSR is safe.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Lock body scroll while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (stopped) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-clay-300 bg-clay-50 px-2.5 py-1 text-[11.5px] font-medium text-clay-800">
        <Ban className="h-3.5 w-3.5" />
        {tt("Case stopped", "Sak stoppet")}
      </span>
    );
  }

  const dialog = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-md rounded-xl border border-ink-200 p-5 shadow-2xl"
        style={{ backgroundColor: "#ffffff" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-clay-100 text-clay-700">
            <Ban className="h-4 w-4" />
          </span>
          <div className="space-y-1">
            <h3
              className="font-serif text-lg font-medium tracking-tight text-ink-900"
              style={{ fontVariationSettings: "'opsz' 36, 'SOFT' 60" }}
            >
              {tt("Stop this case?", "Stoppe denne saken?")}
            </h3>
            <p className="text-[12.5px] leading-snug text-ink-600">
              {tt(
                "Solvva will halt all reminders and collection activity for this Claim. You can re-activate it later.",
                "Solvva stopper alle påminnelser og all inndriving for dette kravet. Du kan aktivere det igjen senere.",
              )}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            {tt("Cancel", "Avbryt")}
          </Button>
          <button
            type="button"
            onClick={() => {
              setStopped(true);
              setOpen(false);
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-md bg-clay-700 px-3 text-[11.5px] font-medium text-paper-50 transition-colors hover:bg-clay-800"
          >
            <Ban className="h-3.5 w-3.5" />
            {tt("Stop case", "Stopp sak")}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-clay-300 bg-paper-50 px-2.5 text-[11.5px] font-medium text-clay-700 transition-colors hover:border-clay-400 hover:bg-clay-50"
      >
        <Ban className="h-3.5 w-3.5" />
        {tt("Stop case", "Stopp sak")}
      </button>
      {open && mounted ? createPortal(dialog, document.body) : null}
    </>
  );
}

// ─── Legal-escalation review card (state=failed) ────────────────────

/**
 * Renders when Solvva couldn't deliver the SMS reminder (bounced
 * handset, opt-out without re-contact path, unreachable number). The
 * agent has done what it can; the creditor now decides whether to
 * push the claim to the legal track (Forliksrådet) or withdraw it.
 *
 * Demo-only: each choice swaps the card to an inline confirmation
 * (no browser alert). The real product wires these through the
 * Temporal close / escalate signals (`temporal-controls.ts`).
 */
function LegalEscalationReviewCard(): JSX.Element {
  const [decision, setDecision] = useState<"escalate" | "withdraw" | null>(null);

  if (decision !== null) {
    const message =
      decision === "escalate"
        ? tt(
            "Sent to legal collection. Solvva files with Forliksrådet and steps back from automated reminders.",
            "Sendt til rettslig inkasso. Solvva sender saken til Forliksrådet og trer tilbake fra automatiske påminnelser.",
          )
        : tt(
            "Claim withdrawn and marked Resolved.",
            "Kravet er frafalt og merket som Løst.",
          );
    return (
      <section className="rounded-lg border border-sage-300 bg-sage-50/60 p-5">
        <div className="flex items-start gap-3">
          <Check className="mt-0.5 h-4 w-4 flex-none text-sage-700" strokeWidth={3} />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-sage-700">
              {tt("Decision recorded", "Beslutning registrert")}
            </p>
            <p className="text-[12.5px] leading-snug text-ink-700">{message}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50/60 p-5">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-amber-700" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-amber-800">
            {tt("Needs your review", "Krever din gjennomgang")}
          </p>
          <h3
            className="font-serif text-base font-medium tracking-tight text-ink-900"
            style={{ fontVariationSettings: "'opsz' 36, 'SOFT' 60" }}
          >
            {tt(
              "Solvva couldn't reach the debtor.",
              "Solvva nådde ikke skyldneren.",
            )}
          </h3>
          <p className="text-[12.5px] leading-snug text-ink-700">
            {tt(
              "SMS delivery failed and no inbound reply has come in. The agent has stopped reminders for this Claim. You can push it to legal collection (Forliksrådet) or withdraw it.",
              "SMS-leveringen feilet og ingen svar er mottatt. Solvva har stoppet påminnelser for dette kravet. Du kan sende det videre til rettslig inkasso (Forliksrådet), eller frafalle kravet.",
            )}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={() => setDecision("escalate")}>
          {tt("Send to legal collection", "Send til rettslig inkasso")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setDecision("withdraw")}>
          {tt("Withdraw Claim", "Frafall kravet")}
        </Button>
      </div>
    </section>
  );
}

// ─── Forliksrådet decision card (state=pending_legal_approval) ──────

/**
 * Solvva has worked the Claim through purring, inkassovarsel, and
 * betalingsoppfordring without resolution. The next step in Norwegian
 * debt collection is Forliksrådet (the conciliation board) — but
 * filing a Forliksrådet claim costs money, so the creditor decides
 * whether to escalate or place the Claim under long-term monitoring.
 *
 * Demo-only: each choice swaps the card to an inline confirmation
 * (no browser alert). The real product wires these to the legal-
 * track Temporal workflow.
 */
function ForliksradetReviewCard({ detail }: { detail: CaseDetail }): JSX.Element {
  const [decision, setDecision] = useState<"forliksradet" | "monitoring" | null>(
    null,
  );

  // Current outstanding (principal + accrued fees + interest) drives
  // the estimated total exposure if the Claim goes to Forliksrådet.
  const outstandingMinor =
    detail.ledger?.outstanding_minor ??
    Math.round(Number(detail.case.amount ?? 0) * 100);
  const forliksradGebyrMinor = FORLIKSRAD_GEBYR_NOK * 100;
  const estimatedTotalMinor = outstandingMinor + forliksradGebyrMinor;

  if (decision !== null) {
    const message =
      decision === "forliksradet"
        ? tt(
            "Sent to Forliksrådet. Solvva files the claim and keeps you posted on the ruling.",
            "Sendt til Forliksrådet. Solvva sender inn kravet og holder deg oppdatert om utfallet.",
          )
        : tt(
            "Placed under long-term monitoring. Solvva watches passively for payment-ability signals.",
            "Plassert under langtidsovervåkning. Solvva overvåker passivt etter signal om betalingsevne.",
          );
    return (
      <section className="rounded-lg border border-sage-300 bg-sage-50/60 p-5">
        <div className="flex items-start gap-3">
          <Check className="mt-0.5 h-4 w-4 flex-none text-sage-700" strokeWidth={3} />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-sage-700">
              {tt("Decision recorded", "Beslutning registrert")}
            </p>
            <p className="text-[12.5px] leading-snug text-ink-700">{message}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50/60 p-5">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-amber-700" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-amber-800">
            {tt("Awaiting your decision", "Avventer din beslutning")}
          </p>
          <h3
            className="font-serif text-base font-medium tracking-tight text-ink-900"
            style={{ fontVariationSettings: "'opsz' 36, 'SOFT' 60" }}
          >
            {tt(
              "Send this Claim to Forliksrådet?",
              "Send dette kravet til Forliksrådet?",
            )}
          </h3>
          <p className="text-[12.5px] leading-snug text-ink-700">
            {tt(
              "Solvva has exhausted the reminder ladder. Filing with Forliksrådet starts the legal track and incurs a court fee. Alternatively, place the Claim under long-term monitoring — Solvva keeps watching for payment-ability signals at no additional cost.",
              "Solvva har sendt alle påminnelsene i inkassoløpet. Forliksrådet starter rettslig inkasso og medfører rettsgebyr. Alternativt kan kravet plasseres under langtidsovervåkning — Solvva fortsetter å overvåke etter signal om betalingsevne, uten ekstra kostnad.",
            )}
          </p>

          {/* Estimated cost of escalating — real 2026 court fees. */}
          <div className="mt-3 rounded-md border border-amber-300/70 bg-paper-50/70 p-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">
              {tt("Estimated cost of Forliksrådet", "Estimert kostnad ved Forliksrådet")}
            </p>
            <ul className="mt-2 space-y-1 text-[12px]">
              <li className="flex items-baseline justify-between gap-2 text-ink-700">
                <span>
                  {tt("Court fee (Forliksrådet)", "Rettsgebyr (Forliksrådet)")}{" "}
                  <span className="font-mono text-[10.5px] text-ink-400">
                    1,54 × {RETTSGEBYR_NOK.toLocaleString("nb-NO")}
                  </span>
                </span>
                <span className="font-mono text-ink-900">
                  {formatMinorAsKr(forliksradGebyrMinor)}
                </span>
              </li>
              <li className="flex items-baseline justify-between gap-2 text-ink-700">
                <span>{tt("Current claim balance", "Nåværende kravsaldo")}</span>
                <span className="font-mono text-ink-900">
                  {formatMinorAsKr(outstandingMinor)}
                </span>
              </li>
              <li className="mt-1 flex items-baseline justify-between gap-2 border-t border-amber-300/50 pt-1.5 font-medium text-ink-900">
                <span>{tt("Total exposure", "Samlet eksponering")}</span>
                <span className="font-mono">
                  {formatMinorAsKr(estimatedTotalMinor)}
                </span>
              </li>
            </ul>
            <p className="mt-2 text-[10.5px] leading-snug text-ink-500">
              {tt(
                `The court fee (${FORLIKSRAD_MULTIPLIER.toLocaleString("nb-NO")} × the court-fee unit R) is advanced by the creditor and added to the claim — recoverable from the debtor if Forliksrådet rules in your favour.`,
                `Rettsgebyret (${FORLIKSRAD_MULTIPLIER.toLocaleString("nb-NO")} × rettsgebyret R) forskutteres av kreditor og legges til kravet — kan kreves tilbake fra skyldner hvis Forliksrådet gir deg medhold.`,
              )}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() => setDecision("forliksradet")}
        >
          {tt("Send to Forliksrådet", "Send til Forliksrådet")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDecision("monitoring")}
        >
          {tt("Place under long-term monitoring", "Plasser i langtidsovervåkning")}
        </Button>
      </div>
    </section>
  );
}

// ─── Vulnerable-customer care banner ────────────────────────────────

/**
 * Shown above the card grid when a Claim is in `needs_review` because a
 * vulnerability signal fired (sickness, hardship, distress language) —
 * NOT because data is missing. Replaces the generic "fill in the fields"
 * card with a calm, caring Norwegian message: automation and fee
 * escalation are paused and a human case manager has taken over, at no
 * extra cost to the customer. This is the ESG / brand-protection moment
 * the CFO cares about.
 */
function VulnerableReviewCard(): JSX.Element {
  return (
    <section className="rounded-lg border border-sage-700/30 bg-sage-50/60 p-5">
      <div className="flex items-start gap-3">
        <HeartHandshake className="mt-0.5 h-4 w-4 flex-none text-sage-700" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-sage-700">
            {tt("Vulnerable customer", "Sårbar kunde")}
          </p>
          <h3
            className="font-serif text-base font-medium tracking-tight text-ink-900"
            style={{ fontVariationSettings: "'opsz' 36, 'SOFT' 60" }}
          >
            {tt(
              "Automation and fee escalation are paused",
              "Automatikk og gebyr-eskalering er pauset",
            )}
          </h3>
          <p className="text-[12.5px] leading-snug text-ink-700">
            {tt(
              "Solvva detected a vulnerability signal and put the Claim on hold. It has been routed to a case manager for personal follow-up, and no extra costs accrue while it is under human review.",
              "Solvva fanget et sårbarhetssignal og satte saken på vent. Den er rutet til en saksbehandler for personlig oppfølging, og det påløper ingen ekstra kostnader mens saken er under menneskelig gjennomgang.",
            )}
          </p>
        </div>
      </div>
    </section>
  );
}

// ─── Needs-review fix-it card ───────────────────────────────────────

/**
 * Required-but-currently-null columns for a Claim to leave needs_review
 * and land in `parsed`. Mirrors the backend's `REQUIRED_FOR_PARSED`
 * list in `routes/cases.ts` so the form here only asks for fields the
 * server will actually re-check on PATCH. `creditor` is excluded —
 * the row can't physically reach this surface without one (the column
 * is set on every insert path), and reassigning the creditor is a
 * separate workflow with its own scope / audit semantics.
 */
const NEEDS_REVIEW_FIELDS: ReadonlyArray<{
  key: keyof UpdateCaseInput;
  label: string;
  placeholder: string;
  hint: string;
  inputMode?: "tel" | "decimal" | "text";
  type?: "text" | "date";
}> = [
  {
    key: "debtor_name",
    label: "Debtor name",
    placeholder: "e.g. Erlend Brekke",
    hint: "Full name as it should appear on the Inkassovarsel.",
  },
  {
    key: "debtor_phone",
    label: "Debtor phone",
    placeholder: "+4790203045",
    hint: "E.164 format with country code (Norway: +47…).",
    inputMode: "tel",
  },
  {
    key: "amount",
    label: "Outstanding amount",
    placeholder: "24706.50",
    hint: "Decimal point, no thousands separators. Currency below.",
    inputMode: "decimal",
  },
  {
    key: "currency",
    label: "Currency",
    placeholder: "NOK",
    hint: "ISO 4217 three-letter code (NOK / EUR / SEK / …).",
  },
  {
    key: "due_date",
    label: "Due date",
    placeholder: "YYYY-MM-DD",
    hint: "Original invoice due date — Interest accrues from this point.",
    type: "date",
  },
  {
    key: "invoice_reference",
    label: "Invoice reference",
    placeholder: "Fakturanummer / invoice id",
    hint: "Creditor's own reference for the Claim.",
  },
];

/**
 * Banner card shown above the 4-card grid when a Claim is in
 * `needs_review`. Lists every REQUIRED_FOR_PARSED column that's still
 * null with an inline input the operator or creditor can fill in;
 * the Save button PATCHes the Claim, recomputes state on the server
 * (needs_review → parsed when every required column is now present),
 * and triggers a parent reload so the badge, conversation thread,
 * and auto-draft surface refresh in place.
 *
 * Per peter@solvva.no 2026-05-26 feedback: "when opening and seeing a
 * needs review case I should as an operator and creditor quickly see
 * what is missing and be able to fill out the missing information".
 */
function NeedsReviewCard({
  detail,
  onReload,
}: {
  detail: CaseDetail;
  onReload: () => void;
}): JSX.Element {
  const c = detail.case;
  const { getIdToken } = useAuth();
  const [values, setValues] = useState<UpdateCaseInput>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Anything in REQUIRED_FOR_PARSED that is currently null on the
  // server-side row. The form intentionally hides fields that are
  // already populated — the user wants a focused "what's missing"
  // checklist, not a full edit surface. (Typo fixes flow through a
  // future per-card "Edit" affordance.)
  const missingFields = useMemo(
    () =>
      NEEDS_REVIEW_FIELDS.filter((f) => {
        const v = (c as unknown as Record<string, string | null>)[f.key];
        return v === null || v === undefined || v === "";
      }),
    [c],
  );

  async function onSave(): Promise<void> {
    setError(null);
    setSaving(true);
    try {
      const payload: UpdateCaseInput = {};
      for (const f of missingFields) {
        const raw = values[f.key];
        if (typeof raw === "string" && raw.trim() !== "") {
          payload[f.key] = raw.trim();
        }
      }
      if (Object.keys(payload).length === 0) {
        setError("Fill at least one field before saving.");
        setSaving(false);
        return;
      }
      const token = await getIdToken();
      await updateCase(c.id, payload, token);
      onReload();
      setValues({});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (missingFields.length === 0) {
    // Edge case: state says needs_review but every REQUIRED_FOR_PARSED
    // column has been populated since (e.g. a parallel PATCH from
    // another session). Surface a recheck affordance — saving with an
    // empty payload would 400, so instead let the operator nudge the
    // server to re-evaluate state.
    return (
      <section className="rounded-lg border border-amber-300 bg-amber-50/60 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-amber-700" />
          <div className="flex-1">
            <p className="text-[13px] font-medium text-amber-900">
              Needs review — but every required field looks present.
            </p>
            <p className="mt-1 text-[12px] text-amber-800">
              Reload to re-check the Claim&rsquo;s state.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onReload()}
            className="rounded-md border border-amber-400 bg-ink-50 px-3 py-1.5 text-[12px] font-medium text-amber-900 hover:border-amber-500"
          >
            Reload
          </button>
        </div>
      </section>
    );
  }

  const fieldLabelList = missingFields.map((f) => f.label).join(", ");

  return (
    <section className="rounded-lg border-2 border-amber-400 bg-amber-50/50 p-4 shadow-[0_1px_0_rgba(180,83,9,0.08)]">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-amber-700" />
        <div className="flex-1">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-800">
            Needs review · {missingFields.length} missing
          </p>
          <h2
            className="mt-1 font-serif text-base font-medium tracking-tight text-amber-950"
            style={{ fontVariationSettings: "'opsz' 36, 'SOFT' 60" }}
          >
            Fill in the missing fields to start drafting
          </h2>
          <p className="mt-1 text-[12px] text-amber-900/80">
            We can&rsquo;t generate the first reminder until {fieldLabelList} {missingFields.length === 1 ? "is" : "are"} known.
            Save once you have the values; the Claim flips to{" "}
            <span className="font-medium">Ready to draft</span> and the
            auto-drafter picks it up.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {missingFields.map((f) => (
          <label key={f.key} className="block text-[12px]">
            <span className="block font-medium text-amber-950">{f.label}</span>
            <input
              type={f.type ?? "text"}
              inputMode={f.inputMode}
              value={(values[f.key] as string | undefined) ?? ""}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
              }
              placeholder={f.placeholder}
              className="mt-1 w-full rounded-md border border-amber-300 bg-ink-50 px-2.5 py-1.5 font-mono text-[12.5px] text-ink-900 outline-none focus:border-amber-500"
            />
            <span className="mt-1 block text-[10.5px] text-amber-900/70">
              {f.hint}
            </span>
          </label>
        ))}
      </div>

      {error ? (
        <p className="mt-3 text-[12px] text-clay-700">{error}</p>
      ) : null}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md border border-amber-700 bg-amber-700 px-3.5 py-1.5 text-[12.5px] font-medium text-ink-50 hover:border-amber-800 hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Saving…</span>
            </>
          ) : (
            <>
              <Check className="h-3.5 w-3.5" />
              <span>Save and re-check</span>
            </>
          )}
        </button>
      </div>
    </section>
  );
}

// ─── Banner cards ───────────────────────────────────────────────────

/**
 * Editable debtor identity fields on the DebtorIdentityCard. The card
 * lets an operator or creditor fix typos and fill in the postal address
 * post-ingest; every change goes through PATCH /api/cases/:id, which
 * records a per-field before/after diff in `audit_log` (event_type
 * `case.fields_updated`). The audit trail is load-bearing for the
 * Compliance Auditor user story and for the namsmann / utleggsbegjäring
 * defence once Track B lands.
 *
 * `language` is intentionally excluded — that surface lives elsewhere
 * (see SOL-127 follow-up: native Norwegian / language picker work).
 */
const DEBTOR_IDENTITY_FIELDS: ReadonlyArray<{
  key: keyof UpdateCaseInput;
  label: string;
  placeholder: string;
  inputMode?: "tel" | "email" | "text";
}> = [
  { key: "debtor_name", label: "Name", placeholder: "Erlend Brekke" },
  {
    key: "debtor_phone",
    label: "Phone",
    placeholder: "+4790203045",
    inputMode: "tel",
  },
  {
    key: "debtor_email",
    label: "Email",
    placeholder: "debtor@example.no",
    inputMode: "email",
  },
  { key: "debtor_street", label: "Street", placeholder: "Storgata 12" },
  { key: "debtor_postcode", label: "Postcode", placeholder: "0123" },
  { key: "debtor_city", label: "City", placeholder: "Oslo" },
];

export function DebtorIdentityCard({
  detail,
  onReload,
}: {
  detail: CaseDetail;
  onReload: () => void;
}): JSX.Element {
  const c = detail.case;
  const { getIdToken } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<UpdateCaseInput>({});

  function openEditor(): void {
    setValues({
      debtor_name: c.debtor_name ?? "",
      debtor_phone: c.debtor_phone ?? "",
      debtor_email: c.debtor_email ?? "",
      debtor_street: c.debtor_street ?? "",
      debtor_postcode: c.debtor_postcode ?? "",
      debtor_city: c.debtor_city ?? "",
    });
    setError(null);
    setEditing(true);
  }

  function cancelEditor(): void {
    setEditing(false);
    setError(null);
    setValues({});
  }

  async function onSave(): Promise<void> {
    setError(null);
    setSaving(true);
    try {
      // Build a minimal patch — only fields whose trimmed value differs
      // from the current row. Identical re-submits collapse to a no-op
      // so we don't generate an audit row with an empty `changes` diff.
      // (The backend would still record the request, but skipping the
      // round-trip is cleaner.)
      const original: Record<string, string> = {
        debtor_name: c.debtor_name ?? "",
        debtor_phone: c.debtor_phone ?? "",
        debtor_email: c.debtor_email ?? "",
        debtor_street: c.debtor_street ?? "",
        debtor_postcode: c.debtor_postcode ?? "",
        debtor_city: c.debtor_city ?? "",
      };
      const payload: UpdateCaseInput = {};
      for (const f of DEBTOR_IDENTITY_FIELDS) {
        const raw = values[f.key];
        const next = typeof raw === "string" ? raw.trim() : "";
        if (original[f.key] !== next) {
          (payload as Record<string, string>)[f.key] = next;
        }
      }
      if (Object.keys(payload).length === 0) {
        setEditing(false);
        return;
      }
      const token = await getIdToken();
      await updateCase(c.id, payload, token);
      onReload();
      setValues({});
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const fullAddress =
    c.debtor_street || c.debtor_postcode || c.debtor_city
      ? [c.debtor_street, [c.debtor_postcode, c.debtor_city].filter(Boolean).join(" ")]
      : null;

  if (editing) {
    return (
      <section className="rounded-lg border-2 border-ink-900/85 bg-ink-50 p-4 shadow-[0_1px_0_rgba(31,24,19,0.06)]">
        <div className="flex items-start justify-between">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-900">
            Debtor · editing
          </p>
          <button
            type="button"
            onClick={cancelEditor}
            disabled={saving}
            aria-label="Cancel"
            className="-mr-1 -mt-1 rounded p-1 text-ink-500 hover:bg-ink-100 hover:text-ink-900 disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {DEBTOR_IDENTITY_FIELDS.map((f) => (
            <label key={f.key} className="block text-[11px]">
              <span className="block text-ink-700">{f.label}</span>
              <input
                type="text"
                inputMode={f.inputMode}
                value={(values[f.key] as string | undefined) ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
                placeholder={f.placeholder}
                className="mt-0.5 w-full rounded-md border border-ink-300 bg-ink-50 px-2 py-1 font-mono text-[11.5px] text-ink-900 outline-none focus:border-ink-700"
              />
            </label>
          ))}
        </div>
        {error ? (
          <p className="mt-2 text-[11px] text-clay-700">{error}</p>
        ) : null}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={cancelEditor}
            disabled={saving}
            className="rounded-md border border-ink-300 bg-ink-50 px-2.5 py-1 text-[11.5px] font-medium text-ink-700 hover:border-ink-500 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-700 bg-amber-700 px-2.5 py-1 text-[11.5px] font-medium text-ink-50 hover:border-amber-800 hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Saving…</span>
              </>
            ) : (
              <>
                <Check className="h-3 w-3" />
                <span>Save</span>
              </>
            )}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="group relative rounded-lg border-2 border-ink-900/85 bg-ink-50 p-4 shadow-[0_1px_0_rgba(31,24,19,0.06)]">
      <button
        type="button"
        onClick={openEditor}
        aria-label="Edit debtor"
        title="Edit debtor"
        className="absolute right-2 top-2 rounded p-1 text-ink-400 opacity-0 transition-opacity hover:bg-ink-100 hover:text-ink-900 focus:opacity-100 group-hover:opacity-100"
      >
        <Pencil className="h-3 w-3" />
      </button>
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-900">
        {tt("Debtor", "Skyldner")}
      </p>
      <h2
        className="mt-1 font-serif text-lg font-medium tracking-tight text-ink-900"
        style={{ fontVariationSettings: "'opsz' 36, 'SOFT' 60" }}
      >
        {c.debtor_name ?? "—"}
      </h2>
      {fullAddress ? (
        <address className="not-italic mt-1.5 text-[11.5px] leading-snug text-ink-800">
          {fullAddress[0] ? (
            <>
              {fullAddress[0]}
              <br />
            </>
          ) : null}
          {fullAddress[1]}
        </address>
      ) : (
        <p className="mt-1.5 text-[11px] text-ink-500">
          {tt("Missing — ask Creditor for address", "Mangler — be kreditor om adresse")}
        </p>
      )}
      <ul className="mt-2 space-y-0.5 text-[11px]">
        <li className="flex items-center gap-1.5 text-ink-800">
          <Phone className="h-3 w-3 flex-none text-ink-500" />
          <span className="truncate font-mono">{c.debtor_phone ?? "—"}</span>
        </li>
        {c.debtor_email ? (
          <li className="flex items-center gap-1.5 text-ink-800">
            <Mail className="h-3 w-3 flex-none text-ink-500" />
            <span className="truncate font-mono">{c.debtor_email}</span>
          </li>
        ) : null}
      </ul>
      {c.language ? (
        <p className="mt-2 font-mono text-[10px] text-ink-500">{c.language}</p>
      ) : null}
    </section>
  );
}

/**
 * Operator/creditor-friendly one-liner describing what the Claim's
 * current state actually means for the reader. Used as the secondary
 * line under the STATUS pill on the case-detail card so the surface
 * tells someone non-technical "what's happening to this Claim right
 * now" instead of repeating the raw enum value.
 *
 * Mirrors the state vocabulary in `friendlyState()` (badge.tsx) and
 * the dunning ladder. Unknown states fall through to an empty string —
 * the pill alone is enough to communicate the situation.
 */
function statusDescription(state: string): string {
  switch (state) {
    case "parsed":
    case "drafting":
    case "drafted":
    case "approved":
    case "sent":
      return tt(
        "Solvva is handling this Claim automatically. We'll let you know if you need to step in.",
        "Solvva håndterer dette kravet automatisk. Vi gir beskjed hvis du må gripe inn.",
      );
    case "needs_review":
      return tt(
        "Missing fields — fill them in to start drafting.",
        "Manglende felter — fyll dem ut for å starte utkast.",
      );
    case "paused":
      return tt(
        "Paused — Solvva is waiting on a signal before continuing.",
        "Pauset — Solvva venter på et signal før den fortsetter.",
      );
    case "escalated":
      return tt("Flagged for Solvva review.", "Flagget for gjennomgang.");
    case "closed":
      return tt(
        "Closed — no further reminders will go out.",
        "Lukket — ingen flere påminnelser sendes.",
      );
    case "failed":
      return tt(
        "Solvva couldn't reach the debtor. Review for legal escalation or withdraw.",
        "Solvva nådde ikke skyldneren. Vurder rettslig inkasso eller frafall kravet.",
      );
    case "pending_legal_approval":
      return tt(
        "Reminder cycle exhausted. Approve escalation to Forliksrådet or place under long-term monitoring.",
        "Påminnelsene er uttømt. Godkjenn videresendelse til Forliksrådet eller plasser under langtidsovervåkning.",
      );
    case "sent_to_enforcement":
      return tt(
        "Forliksrådet judgment received — case transferred to namsmannen for enforcement.",
        "Forliksrådet-dom mottatt — sak overført til namsmannen for tvangsinnkreving.",
      );
    case "long_term_monitoring":
      return tt(
        "Placed under long-term monitoring — Solvva watches passively for payment-ability signals.",
        "Plassert under langtidsovervåkning — Solvva overvåker passivt etter signal om betalingsevne.",
      );
    default:
      return "";
  }
}

/**
 * STATUS card — operational state in the operator's vocabulary
 * (`friendlyState`). Mirrors the pill that appears on the `/cases`
 * row for the same Claim so the visual language is consistent across
 * surfaces. The supporting line below the pill explains what the
 * state actually means for the reader instead of repeating the raw
 * enum value, so a creditor opening the card understands the situation
 * without learning operator jargon.
 *
 * The Dunning Stage (Purring / Inkassovarsel / etc.) is intentionally
 * NOT shown here — it lives on the COLLECTION PROGRESS card's
 * stepper below, which already renders the stage ladder + entered-at
 * dates + fee-applied-at-transition. Putting it here too duplicated
 * the same information in a less informative shape.
 */
export function CurrentStatusCard({
  detail,
  isVulnerable = false,
}: {
  detail: CaseDetail;
  isVulnerable?: boolean;
}): JSX.Element {
  const c = detail.case;
  const description =
    isVulnerable && c.state === "needs_review"
      ? tt(
          "Vulnerability flag raised — automation paused, routed to a case manager.",
          "Sårbar-flagg utløst — automatikk pauset, rutet til saksbehandler.",
        )
      : statusDescription(c.state);
  return (
    <section className="rounded-lg border border-ink-300 bg-ink-150 p-4">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-600">
        {tt("Status", "Status")}
      </p>
      <div className="mt-3">
        <Badge
          tone={statusTone(c.state)}
          className="px-2.5 py-1 text-[11.5px]"
        >
          {tState(c.state)}
        </Badge>
      </div>
      {description ? (
        <p className="mt-3 text-[11.5px] leading-snug text-ink-600">
          {description}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Outstanding card — reads the Claim Ledger projection
 * (`detail.ledger`). When the ledger hasn't been wired up yet, the
 * card still renders its three-bucket layout (Principal / Fees /
 * Interest) with em-dash placeholders so the workbench surface is
 * stable for the operator; only the Outstanding headline falls back
 * to the legacy `case.amount` string.
 *
 * Fee tiers stack as separate rows (one per ledger.fees[] entry).
 * The Norwegian inkasso ladder caps at ~3 statutory tiers so the
 * stack stays short in practice; if it ever exceeds 3, the rest
 * collapse behind a "show all" toggle.
 */
export function BalanceCard({ detail }: { detail: CaseDetail }): JSX.Element {
  const ledger = detail.ledger ?? null;

  if (ledger === null) {
    return (
      <section className="rounded-lg border border-ink-300 bg-ink-150 p-4">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-600">
          {tt("Outstanding", "Utestående")}
        </p>
        <p
          className="mt-1 font-serif text-2xl font-light tracking-tight text-ink-900"
          style={{ fontVariationSettings: "'opsz' 60, 'SOFT' 80" }}
        >
          {formatNok(detail.case.amount)}
        </p>
        <ul className="mt-2 space-y-1 text-[11.5px]">
          <BreakdownRow label={tt("Principal", "Hovedstol")} minor={null} />
          <BreakdownRow label={tt("Fees", "Gebyrer")} minor={null} />
          <BreakdownRow label={tt("Interest", "Renter")} minor={null} />
        </ul>
        <p className="mt-2 font-mono text-[10px] text-ink-500">
          {tt("Awaiting payment ledger", "Venter på betalingsregister")}
        </p>
      </section>
    );
  }

  const feesTotalMinor = ledger.fees.reduce((acc, f) => acc + f.amount_minor, 0);
  return (
    <section className="rounded-lg border border-ink-300 bg-ink-150 p-4">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-600">
        {tt("Outstanding", "Utestående")}
      </p>
      <p
        className="mt-1 font-serif text-2xl font-light tracking-tight text-ink-900"
        style={{ fontVariationSettings: "'opsz' 60, 'SOFT' 80" }}
      >
        {formatMinorAsKr(ledger.outstanding_minor)}
      </p>
      <ul className="mt-2 space-y-1 text-[11.5px]">
        <BreakdownRow label={tt("Principal", "Hovedstol")} minor={ledger.principal.amount_minor} />
        <BreakdownRow label={tt("Fees", "Gebyrer")} minor={feesTotalMinor} />
        <BreakdownRow
          label={tt("Interest", "Renter")}
          minor={ledger.interest.amount_minor}
          hint={
            ledger.interest.accrued_through_date
              ? `through ${formatDateNo(ledger.interest.accrued_through_date).slice(0, 5)}`
              : null
          }
        />
      </ul>
      {ledger.fees.length > 1 ? (
        <ul className="mt-1.5 space-y-0.5 border-t border-ink-200 pt-1.5 font-mono text-[10px] text-ink-500">
          {ledger.fees.slice(0, 3).map((f, i) => (
            <FeeTierRow key={f.event_id ?? i} line={f} />
          ))}
          {ledger.fees.length > 3 ? (
            <li className="text-ink-400">+ {ledger.fees.length - 3} more tier(s)</li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}

function FeeTierRow({ line }: { line: LedgerLine }): JSX.Element {
  const label = line.label ?? line.tier ?? "Fee tier";
  return (
    <li className="flex items-baseline justify-between gap-2">
      <span>· {label}</span>
      <span className="text-ink-700">{formatMinorAsKr(line.amount_minor)}</span>
    </li>
  );
}

/**
 * Due date card — shows the Claim's original due date (anchor for
 * Interest accrual per Henrik's Claim Payment Workflow spec
 * §"Workflow input"). The "next due date" concept moves into per-
 * Invoice line items in the new model — see `LatestInvoiceCard`
 * below — so this card stays single-line.
 */
export function DueDatesCard({ detail }: { detail: CaseDetail }): JSX.Element {
  const dueDate = detail.case.due_date ?? null;
  return (
    <section className="rounded-lg border border-ink-300 bg-ink-150 p-4">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-600">
        {tt("Due", "Forfall")}
      </p>
      <p
        className="mt-1.5 font-serif text-base font-medium tracking-tight text-ink-900"
        style={{ fontVariationSettings: "'opsz' 36, 'SOFT' 60" }}
      >
        {formatDateNo(dueDate)}
      </p>
      <p className="mt-1 font-mono text-[10px] text-ink-500">
        {tt("original — Interest accrual anchor", "opprinnelig — utgangspunkt for renteberegning")}
      </p>
    </section>
  );
}

function BreakdownRow({
  label,
  minor,
  hint,
}: {
  label: string;
  minor: number | null | undefined;
  hint?: string | null;
}): JSX.Element {
  return (
    <li className="flex items-baseline justify-between gap-2">
      <span className="text-ink-700">
        {label}
        {hint ? (
          <span className="ml-1 font-mono text-[10px] text-ink-500">{hint}</span>
        ) : null}
      </span>
      <span className="font-mono text-[12.5px] text-ink-900">
        {minor === null || minor === undefined ? "—" : formatMinorAsKr(minor)}
      </span>
    </li>
  );
}

// ─── Status bar (horizontal stepper + collapsible Payments) ────────

export function StatusBar({
  currentStage,
  transitions,
  ledger,
  invoiceIssuedAt,
  policySetId,
}: {
  currentStage: string | null;
  transitions: CaseStageTransition[];
  ledger: LedgerView | null;
  /**
   * Original-invoice issuance timestamp from `lastInvoice.issued_at`.
   * Drives the leading "Faktura" step — every Claim begins with the
   * invoice, so the stepper reads as the full money-in lifecycle
   * (Faktura → Purring → … → Rettslig inkasso) rather than starting
   * mid-ladder at the first reminder.
   */
  invoiceIssuedAt: string | null;
  policySetId: string | null;
}): JSX.Element {
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const payments = ledger?.payments ?? [];

  // Build the ordered stage list — prefer the order the Policy
  // uses (derivable from transitions if we have them), fall back to
  // the NO-B2C-v0 default.
  const stagesOrdered = useMemo(() => {
    if (transitions.length > 0) {
      const seen = new Set<string>();
      const ordered: string[] = [];
      for (const t of transitions) {
        if (!seen.has(t.stage)) {
          seen.add(t.stage);
          ordered.push(t.stage);
        }
      }
      // Append defaults that haven't been entered yet, in order.
      for (const s of DEFAULT_STAGE_ORDER) {
        if (!seen.has(s)) ordered.push(s);
      }
      return ordered;
    }
    return [...DEFAULT_STAGE_ORDER];
  }, [transitions]);

  const transitionsByStage = useMemo(() => {
    const map = new Map<string, CaseStageTransition>();
    for (const t of transitions) map.set(t.stage, t);
    return map;
  }, [transitions]);

  // Unified lifecycle steps: the original invoice (always step 1, always
  // complete — every Claim starts here) followed by the dunning ladder.
  // Modelling them as one list keeps the stepper render uniform and lets
  // the invoice anchor the "money-in" story visually.
  const invoicePrincipalMinor = ledger?.principal.amount_minor ?? null;
  type LifecycleStep = {
    key: string;
    label: string;
    dateText: string;
    status: "done" | "current" | "future";
    note: JSX.Element;
  };
  const steps: LifecycleStep[] = [
    {
      key: "faktura",
      label: tt("Invoice", "Faktura"),
      dateText: invoiceIssuedAt
        ? formatDateTimeNo(invoiceIssuedAt)
        : tt("issued", "utstedt"),
      status: "done",
      note: (
        <p className="mt-0.5 font-mono text-[10.5px] text-ink-500">
          {invoicePrincipalMinor !== null
            ? formatMinorAsKr(invoicePrincipalMinor)
            : tt("principal", "hovedstol")}
        </p>
      ),
    },
    ...stagesOrdered.slice(0, 4).map((stage): LifecycleStep => {
      const transition = transitionsByStage.get(stage);
      const isDone = transition != null && stage !== currentStage;
      const isCurrent = stage === currentStage;
      return {
        key: stage,
        label: tStage(stage),
        dateText: transition
          ? formatDateTimeNo(transition.entered_at)
          : tt("not scheduled", "ikke planlagt"),
        status: isDone ? "done" : isCurrent ? "current" : "future",
        note:
          transition && Number(transition.fee_applied_nok) > 0 ? (
            <p className="mt-0.5 font-mono text-[10.5px] text-accent-700">
              +{formatNok(transition.fee_applied_nok)} {tt("fee", "gebyr")}
            </p>
          ) : transition ? (
            <p className="mt-0.5 font-mono text-[10.5px] text-ink-400">
              {tt("fee on filing", "gebyr ved innsending")}
            </p>
          ) : (
            <p className="mt-0.5 font-mono text-[10.5px] text-ink-500">
              {tt("fee set at transition", "gebyr settes ved overgang")}
            </p>
          ),
      };
    }),
  ];

  return (
    <section className="rounded-lg border border-ink-300 bg-ink-150 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-600">
            {tt("Claim lifecycle", "Saksforløp")}
          </p>
          {policySetId ? (
            <span className="font-mono text-[10px] text-ink-500">
              policy {policySetId}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setPaymentsOpen((v) => !v)}
          aria-expanded={paymentsOpen}
          className="inline-flex items-center gap-1.5 rounded-md border border-ink-300 bg-white px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-600 hover:border-ink-400 hover:text-ink-900"
        >
          {tt("Payments", "Betalinger")} · {payments.length}
          <ChevronDown
            className={`h-3 w-3 transition-transform ${paymentsOpen ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      <ol className="relative grid grid-cols-5 gap-3">
        {steps.map((step, i) => {
          const isDone = step.status === "done";
          const isCurrent = step.status === "current";
          const isFuture = step.status === "future";
          return (
            <li key={step.key} className="relative">
              {i < steps.length - 1 ? (
                // Connector line from this stage's dot to the next.
                // Math: dot is centered in its column (50%) with radius
                // 11px; columns share equal width W with a 12px gap.
                //   left  = 50% + 14px → 3px stroke gap past this dot's
                //           right edge.
                //   right = calc(2px - 50%) → extend (W/2 - 2) past the
                //           <li>'s right edge. That clears the 12px gap
                //           and crosses into the next column, stopping
                //           3px before the next dot's left edge.
                // The 2px right value gives a symmetric 3px stroke gap
                // on both ends (3 == 14 - 11 on the left, 3 == 11 - 14
                // + 12 - 2 on the right). Tested across grid-cols-4
                // with auto-sized columns.
                <span
                  aria-hidden
                  className={`pointer-events-none absolute left-[calc(50%+14px)] right-[calc(2px-50%)] top-[10px] h-[2px] ${
                    isDone ? "bg-accent-500" : "bg-ink-400"
                  }`}
                />
              ) : null}
              <div className="flex flex-col items-center text-center">
                <span
                  className={`flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 ${
                    isDone
                      ? "border-accent-500 bg-accent-500 text-white"
                      : isCurrent
                        ? "border-accent-500 bg-white text-accent-700"
                        : "border-ink-300 bg-white text-ink-500"
                  }`}
                >
                  {isDone ? (
                    <Check className="h-3 w-3" strokeWidth={3} />
                  ) : isCurrent ? (
                    <Clock className="h-3 w-3" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-ink-400" />
                  )}
                </span>
                <p
                  className={`mt-2 text-[12.5px] font-semibold tracking-tight ${
                    isFuture ? "text-ink-500" : "text-ink-900"
                  }`}
                >
                  {step.label}
                </p>
                <p className="mt-0.5 font-mono text-[10.5px] text-ink-500">
                  {step.dateText}
                </p>
                {step.note}
              </div>
            </li>
          );
        })}
      </ol>

      {paymentsOpen ? (
        <div className="mt-5 border-t border-ink-200 pt-4">
          <PaymentsTable payments={payments} />
        </div>
      ) : null}
    </section>
  );
}

/**
 * Payments table — reads `ledger.payments[]` from Henrik's Claim
 * Payment Workflow `currentLedger` query. Each Payment carries its
 * per-line allocation (`allocations.{fees, interest, principal}`,
 * minor units) and a `source` tag identifying how the Payment
 * arrived. Per `docs/features/case-view-claim-ledger.md`.
 */
function PaymentsTable({
  payments,
}: {
  payments: LedgerPayment[];
}): JSX.Element {
  if (payments.length === 0) {
    return (
      <p className="text-[12px] text-ink-500">No registered Payments yet.</p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border border-ink-300 bg-white">
      <table className="min-w-full text-[12.5px]">
        <thead className="bg-ink-100 text-left">
          <tr className="border-b border-ink-200 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-600">
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Source</th>
            <th className="px-3 py-2 text-right">Amount</th>
            <th className="px-3 py-2 text-right">→ Principal</th>
            <th className="px-3 py-2 text-right">→ Fees</th>
            <th className="px-3 py-2 text-right">→ Interest</th>
            <th className="px-3 py-2">Reference</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => {
            const isRefund = p.source === "refund";
            return (
              <tr
                key={p.payment_id}
                className={`border-b border-ink-200 last:border-b-0 ${
                  isRefund ? "bg-clay-50/40" : ""
                }`}
              >
                <td className="px-3 py-2 font-mono text-[11.5px]">
                  {formatDateNo(p.received_at)}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={paymentSourceTone(p.source)} className="text-[10px]">
                    {paymentSourceLabel(p.source)}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {formatMinorAsKr(p.amount_minor)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-ink-700">
                  {formatMinorAsKr(p.allocations.principal)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-ink-700">
                  {formatMinorAsKr(p.allocations.fees)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-ink-700">
                  {formatMinorAsKr(p.allocations.interest)}
                </td>
                <td className="px-3 py-2 text-[11px] text-ink-500">
                  {p.bank_ref ? (
                    <span className="font-mono">{p.bank_ref}</span>
                  ) : p.note ? (
                    p.note
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function paymentSourceLabel(source: LedgerPayment["source"]): string {
  switch (source) {
    case "payment_link":
      return "Payment Link";
    case "bank_transfer":
      return "Bank transfer";
    case "operator_assigned":
      return "Operator-assigned";
    case "refund":
      return "Refund";
  }
}

function paymentSourceTone(
  source: LedgerPayment["source"],
): "success" | "info" | "warn" | "danger" {
  switch (source) {
    case "payment_link":
    case "bank_transfer":
      return "success";
    case "operator_assigned":
      return "info";
    case "refund":
      return "danger";
  }
}

// ─── Latest Invoice card ────────────────────────────────────────────

/**
 * Latest Invoice surface — reads Henrik's Claim Payment Workflow
 * `lastInvoice` query. Renders the Invoice header, line items, and
 * the Payment Link (when present) so the Operator can preview the
 * outbound the Debtor sees. Per
 * `docs/features/case-view-claim-ledger.md`.
 *
 * Renders a stub with an "Awaiting first invoice" hint when no
 * Invoice has been issued for the Claim yet, so the workbench
 * surface stays visible and slots in seamlessly once the payment
 * ledger fires the first invoice.
 */
export function LatestInvoiceCard({
  invoice,
}: {
  invoice: LedgerInvoice | null;
}): JSX.Element {
  if (invoice === null) {
    return (
      <section className="rounded-lg border border-ink-300 bg-ink-150 p-5">
        <div className="flex items-baseline gap-2">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-600">
            {tt("Original invoice", "Opprinnelig faktura")}
          </p>
          <span className="font-mono text-[10px] text-ink-500">N/A</span>
        </div>
        <p className="mt-3 text-[11.5px] text-ink-500">
          {tt(
            "Awaiting first invoice issuance — populates from the payment ledger once the first invoice fires for this Claim.",
            "Venter på første fakturautstedelse — fylles inn fra betalingsregisteret når første faktura sendes ut for dette kravet.",
          )}
        </p>
      </section>
    );
  }

  const total = invoice.line_items.reduce(
    (acc, li) => acc + li.amount_minor,
    0,
  );

  return (
    <section className="rounded-lg border border-ink-300 bg-ink-150 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-600">
            {tt("Original invoice", "Opprinnelig faktura")}
          </p>
          <span className="font-mono text-[10px] text-ink-500">
            {invoice.invoice_id}
          </span>
        </div>
        <span className="font-mono text-[10px] text-ink-500">
          {tt("issued", "utstedt")} {formatDateTimeNo(invoice.issued_at)}
        </span>
      </div>

      <p
        className="mt-2 font-serif text-2xl font-light tracking-tight text-ink-900"
        style={{ fontVariationSettings: "'opsz' 60, 'SOFT' 80" }}
      >
        {formatMinorAsKr(total)}
      </p>

      <ul className="mt-2 space-y-0.5 text-[11.5px]">
        {invoice.line_items.map((li, i) => (
          <li
            key={i}
            className="flex items-baseline justify-between gap-2 text-ink-700"
          >
            <span>{li.label}</span>
            <span className="font-mono text-ink-900">
              {formatMinorAsKr(li.amount_minor)}
            </span>
          </li>
        ))}
      </ul>

      {invoice.payment_link ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 pt-3">
          <div className="flex items-baseline gap-2 text-[11px] text-ink-600">
            <Receipt className="h-3.5 w-3.5 translate-y-[2px] text-ink-500" />
            <span>
              {paymentProviderLabel(invoice.payment_link.provider)} ·{" "}
              {tt("expires", "utløper")}{" "}
              {formatDateTimeNo(invoice.payment_link.expires_at)}
            </span>
          </div>
          <a
            href={invoice.payment_link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-accent-500 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accent-700"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {tt("Open payment link", "Åpne betalingslenke")}
          </a>
        </div>
      ) : (
        <p className="mt-3 border-t border-ink-200 pt-3 text-[11px] text-ink-500">
          {tt(
            "No payment link issued for this invoice.",
            "Ingen betalingslenke utstedt for denne fakturaen.",
          )}
        </p>
      )}

      <div className="mt-3 flex justify-end">
        <Button variant="ghost" size="sm" disabled>
          {tt("Re-send invoice", "Send faktura på nytt")}
        </Button>
      </div>
    </section>
  );
}

function paymentProviderLabel(provider: string): string {
  // Per ADR 022 — provider names normalise at the boundary. The UI
  // shows the human-readable form; the wire value stays the slug.
  if (provider === "stripe") return "Stripe";
  if (provider === "vipps") return "Vipps";
  if (provider === "mollie") return "Mollie";
  if (provider === "klarna") return "Klarna";
  return provider;
}

// ─── Collapsible conversation ───────────────────────────────────────

/**
 * Collapsible wrapper around the live ConversationPanel. The chat
 * itself is the visually-heaviest piece on `/cases/:id` and most of
 * the time the Operator is scanning the workbench banners + ledger,
 * not actively reading messages — so the conversation collapses to
 * a single-row header by default.
 *
 * When a pending Decision Agent proposal exists, the header
 * highlights in amber and reads "Action required: <action>". One
 * click opens the panel, exposing the live `AgentSuggestionBubble`
 * — whose own click-to-expand Rationale + Policy Engine citation
 * disclosures answer "see the agent's reasoning and the rules that
 * kicked in", which is the second half of the SOL-75 polish ask.
 *
 * If there's no pending action, the header reads "Conversation
 * thread · N messages" and stays neutral.
 */
export function CollapsibleConversation(props: {
  caseId: string;
  caseState: string;
  debtorName: string | null;
  steps: AgenticTimelineStep[];
  draftDetail: DraftDetail | null;
  pendingProposal: AgenticPendingProposal | null;
  pendingInputSafetyAlert: PendingInputSafetyAlert | null;
  viewerRole?: "operator" | "creditor";
  onReload: () => void;
}): JSX.Element {
  const {
    pendingProposal,
    draftDetail,
    pendingInputSafetyAlert,
    steps,
    viewerRole = "operator",
  } = props;
  const isCreditor = viewerRole === "creditor";

  // SOL-101 — creditors don't action proposals or safety alerts, so
  // they shouldn't see the amber/rose "action required" header. The
  // panel still surfaces a pending draft as a neutral status note.
  const effectivePendingProposal = isCreditor ? null : pendingProposal;
  const effectivePendingSafety = isCreditor ? null : pendingInputSafetyAlert;

  // Default-open when there's something demanding the Operator's
  // attention; default-closed otherwise. The operator can override
  // either way and the local state holds for the page lifetime.
  const hasUrgent =
    effectivePendingSafety !== null ||
    effectivePendingProposal !== null ||
    draftDetail?.draft.state === "pending" ||
    draftDetail?.draft.state === "approved";
  const [open, setOpen] = useState<boolean>(hasUrgent);

  const sentSmsCount = steps.filter((s) => s.kind === "communication.sent").length;
  const inboundCount = steps.filter(
    (s) => s.kind === "debtor.reply_received",
  ).length;
  const totalMessages = sentSmsCount + inboundCount;

  const headerLabel = effectivePendingSafety
    ? tt(
        "Input Safety alert — review required",
        "Innholdsvarsel — krever gjennomgang",
      )
    : effectivePendingProposal
      ? tt(
          `Action required · ${effectivePendingProposal.proposed_action_type}`,
          `Handling kreves · ${effectivePendingProposal.proposed_action_type}`,
        )
      : draftDetail?.draft.state === "pending"
        ? isCreditor
          ? tt(
              "Drafted reminder — awaiting Solvva approval",
              "Utkast klart — venter på godkjenning fra Solvva",
            )
          : tt(
              "Drafted reminder — awaiting approval",
              "Utkast klart — venter på godkjenning",
            )
        : tt(
            `Conversation thread · ${totalMessages} message${totalMessages === 1 ? "" : "s"}`,
            `Samtaletråd · ${totalMessages} ${totalMessages === 1 ? "melding" : "meldinger"}`,
          );

  const headerTone =
    effectivePendingSafety !== null
      ? "border-rose-300 bg-rose-50/60"
      : effectivePendingProposal !== null ||
          draftDetail?.draft.state === "pending" ||
          draftDetail?.draft.state === "approved"
        ? "border-amber-700/30 bg-amber-50/60"
        : "border-ink-300 bg-ink-150";

  return (
    <section className={`rounded-lg border ${headerTone}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-ink-200/30"
      >
        <div className="flex items-baseline gap-2 min-w-0">
          <ConversationHeaderIcon
            urgent={
              effectivePendingProposal !== null ||
              effectivePendingSafety !== null
            }
          />
          <span className="truncate text-[13px] font-medium text-ink-900">
            {headerLabel}
          </span>
          {effectivePendingProposal && effectivePendingProposal.confidence ? (
            <span
              className={`flex-none rounded-full px-1.5 py-[1px] font-mono text-[9.5px] font-semibold uppercase tracking-wider ${
                effectivePendingProposal.confidence === "high"
                  ? "bg-sage-50 text-sage-700"
                  : effectivePendingProposal.confidence === "medium"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-clay-50 text-clay-700"
              }`}
            >
              {effectivePendingProposal.confidence}
            </span>
          ) : null}
        </div>
        <span className="flex flex-none items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wider text-ink-600">
          {open ? tt("Hide", "Skjul") : tt("Show", "Vis")}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {open ? (
        <div className="border-t border-ink-200 px-5 py-5">
          <ConversationPanel {...props} />
        </div>
      ) : null}
    </section>
  );
}

function ConversationHeaderIcon({ urgent }: { urgent: boolean }): JSX.Element {
  if (urgent) {
    return (
      <span className="flex h-2 w-2 flex-none translate-y-[2px] items-center justify-center">
        <span className="h-2 w-2 rounded-full bg-amber-700 animate-pulse" />
      </span>
    );
  }
  return (
    <Receipt className="h-3.5 w-3.5 translate-y-[2px] flex-none text-ink-500" />
  );
}
