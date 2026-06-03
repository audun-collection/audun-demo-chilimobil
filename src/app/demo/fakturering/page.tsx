"use client";

/**
 * Demo — Fakturakjøring (billing run). An interactive guided flow that
 * mirrors how a telecom MVNO actually invoices.
 *
 * Clear split of responsibility:
 *  - ChiliMobil's own systems (Telia/nett → Mediation → Rating) produce
 *    the finished priced amount per customer. Shown as a static, greyed
 *    "done before us" band — Audun never touches the network or the
 *    rating engine.
 *  - Audun takes over from the finished amount: Mottak → Generer →
 *    Avvikssjekk → Godkjenning → Send → Distribusjon.
 *
 * Honest about AI: a human approves the flagged exceptions (the run
 * freezes until they're reviewed) — no claim of unattended autonomy.
 *
 * Pure client-side state. Transition animations are one-shot (a single
 * setTimeout per transition, cleared on unmount) so the flow always
 * lands in a calm final state — never a perpetual spinner.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Ban,
  Calculator,
  Check,
  CircleAlert,
  CircleCheck,
  FileText,
  Layers,
  Loader2,
  Pencil,
  ReceiptText,
  ScanLine,
  Send,
  Signal,
  Sparkles,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { cn } from "../../../lib/cn";
import {
  demoBillingRun,
  type BillingException,
  type BillingExceptionCategory,
  type PaymentFunnelStep,
} from "../../../lib/demo-fixtures";

type Decision = "approve" | "reject" | "edit";

const STEP_LABELS = [
  "Mottak",
  "Generer fakturaer",
  "Avvikssjekk",
  "Godkjenning",
  "Send",
  "Distribusjon",
];

const NB = new Intl.NumberFormat("nb-NO");
const NB2 = new Intl.NumberFormat("nb-NO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const kr = (n: number): string => `kr ${NB.format(n)}`;
const kr2 = (n: number): string => `kr ${NB2.format(n)}`;
const num = (n: number): string => NB.format(n);

// Same channel palette as the /demo overview — autotrekk in brand-blå,
// manual channels muted grey/clay.
const CHANNEL_COLORS: Record<string, string> = {
  AvtaleGiro: "bg-accent-500",
  eFaktura: "bg-accent-400",
  Vipps: "bg-accent-200",
  EHF: "bg-ink-300",
  "Print / papir": "bg-clay-100",
};

export default function FaktureringPage(): JSX.Element {
  const run = useMemo(() => demoBillingRun(), []);
  const [step, setStep] = useState(1);
  const [running, setRunning] = useState<{ message: string; next: number } | null>(
    null,
  );
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});

  const decidedCount = run.exceptions.filter((e) => decisions[e.id]).length;
  const allDecided = decidedCount === run.exceptions.length;

  // One-shot transition: a single timer per `running` state, cleared on
  // unmount or if `running` changes. Guarantees we always land on the
  // next step — no perpetual spinner, no setInterval.
  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(() => {
      setStep(running.next);
      setRunning(null);
      window.scrollTo({ top: 0 });
    }, 900);
    return () => window.clearTimeout(id);
  }, [running]);

  function runThen(message: string, next: number): void {
    setRunning({ message, next });
  }

  function decide(id: string, decision: Decision): void {
    setDecisions((prev) => ({ ...prev, [id]: decision }));
  }

  function decideAllRecommended(): void {
    setDecisions((prev) => {
      const next = { ...prev };
      for (const e of run.exceptions) next[e.id] = e.recommendedDecision;
      return next;
    });
  }

  function reset(): void {
    setDecisions({});
    setRunning(null);
    setStep(1);
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Fakturering</p>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h1
            className="font-serif text-3xl font-light tracking-tight text-ink-900"
          >
            Fakturakjøring
          </h1>
          <p className="font-mono text-[11.5px] uppercase tracking-[0.12em] text-ink-500">
            Faktureringssyklus · {run.cycleLabel}
          </p>
        </div>
        <p className="max-w-2xl text-sm text-ink-600">
          ChiliMobils systemer priser forbruket. Audun tar over fra ferdig
          beløp: mottar, genererer, fanger avvik (menneske godkjenner), sender og
          distribuerer — i ett løp.
        </p>
      </header>

      <UpstreamBand run={run} />

      <div className="border-t border-ink-200" />

      <StepProgress step={step} />

      {running ? (
        <RunningCard message={running.message} />
      ) : step === 1 ? (
        <StepMottak
          run={run}
          onNext={() =>
            runThen("Mottar og validerer faktureringsdata fra ChiliMobil …", 2)
          }
        />
      ) : step === 2 ? (
        <StepGenerer
          run={run}
          onNext={() =>
            runThen("Audun genererer fakturautkast og kjører avvikssjekk …", 3)
          }
        />
      ) : step === 3 ? (
        <StepAvvik run={run} onNext={() => setStep(4)} />
      ) : step === 4 ? (
        <StepGodkjenning
          run={run}
          decisions={decisions}
          decidedCount={decidedCount}
          allDecided={allDecided}
          onDecide={decide}
          onDecideAll={decideAllRecommended}
          onNext={() => setStep(5)}
        />
      ) : step === 5 ? (
        <StepSend
          run={run}
          onSend={() =>
            runThen("Fullfører kjøringen og genererer endelige fakturaer …", 6)
          }
        />
      ) : (
        <StepDistribusjon run={run} onReset={reset} />
      )}
    </div>
  );
}

type Run = ReturnType<typeof demoBillingRun>;

// ─── Upstream band (gjort av ChiliMobil før oss) ────────────────────

const UPSTREAM_ICONS = [Signal, Layers, Calculator];

function UpstreamBand({ run }: { run: Run }): JSX.Element {
  return (
    <div className="space-y-3">
      <p className="max-w-2xl text-[12.5px] text-ink-500">
        Dette skjer i ChiliMobils egne systemer — Audun rører verken nettet
        eller rating-motoren.
      </p>
      <div className="rounded-lg border border-dashed border-ink-300 bg-ink-100/40 px-4 py-4">
        <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">
          Gjort av ChiliMobil før oss
        </p>
        <ol className="flex flex-wrap items-start gap-y-3">
          {run.upstreamSteps.map((s, i) => {
            const Icon = UPSTREAM_ICONS[i] ?? Signal;
            return (
              <li key={s.label} className="flex items-start">
                <div className="flex w-[150px] flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink-200 text-ink-500">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <CircleCheck className="h-3.5 w-3.5 text-ink-400" />
                  </div>
                  <p className="text-[12px] font-medium text-ink-600">{s.label}</p>
                  <p className="text-[10.5px] leading-snug text-ink-400">
                    {s.detail}
                  </p>
                </div>
                {i < run.upstreamSteps.length - 1 ? (
                  <ArrowRight className="mx-1 mt-2 h-3.5 w-3.5 shrink-0 text-ink-300" />
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
      <div className="flex items-start gap-2.5 rounded-md border border-accent-200 bg-accent-50/50 px-3 py-2.5 text-[12.5px] text-ink-700">
        <ArrowRight className="mt-0.5 h-4 w-4 flex-none text-accent-700" />
        <p>
          <strong className="font-medium text-ink-900">
            Audun henter det ferdig-prisede beløpet per kunde
          </strong>{" "}
          (via fil eller API) — og tar det derfra.
        </p>
      </div>
    </div>
  );
}

// ─── Step progress ──────────────────────────────────────────────────

function StepProgress({ step }: { step: number }): JSX.Element {
  return (
    <ol className="flex flex-wrap items-center gap-y-2">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const current = n === step;
        return (
          <li key={label} className="flex items-center">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold",
                  done
                    ? "border-accent-500 bg-accent-500 text-ink-50"
                    : current
                      ? "border-accent-500 bg-white text-accent-700"
                      : "border-ink-300 bg-white text-ink-500",
                )}
              >
                {done ? <Check className="h-3 w-3" strokeWidth={3} /> : n}
              </span>
              <span
                className={cn(
                  "text-[12px] font-medium",
                  current ? "text-ink-900" : "text-ink-500",
                )}
              >
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 ? (
              <span className="mx-2 h-[2px] w-5 bg-ink-300 sm:w-8" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

// ─── Running card (one-shot) ────────────────────────────────────────

function RunningCard({ message }: { message: string }): JSX.Element {
  return (
    <Card>
      <CardContent className="flex items-center justify-center gap-3 py-14">
        <Loader2 className="h-5 w-5 animate-spin text-accent-500" />
        <p className="text-sm text-ink-600">{message}</p>
      </CardContent>
    </Card>
  );
}

// ─── Step 1 — Mottak ────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  aktiv: "bg-sage-50 text-sage-700",
  sperret: "bg-amber-50 text-amber-700",
  oppsagt: "bg-clay-50 text-clay-700",
};

function StepMottak({ run, onNext }: { run: Run; onNext: () => void }): JSX.Element {
  const inv = run.sampleInvoice;
  return (
    <Card>
      <CardContent className="space-y-5 py-5">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-accent-700" />
          <h2
            className="font-serif text-lg font-medium tracking-tight text-ink-900"
          >
            Mottak
          </h2>
        </div>
        <p className="max-w-3xl text-[12.5px] leading-snug text-ink-600">
          De tre tingene vi trenger for å lage en faktura:{" "}
          <span className="font-medium text-ink-900">hva</span> som skal betales,{" "}
          <span className="font-medium text-ink-900">hvem</span> som skal betales,
          og <span className="font-medium text-ink-900">hvordan</span> den betales
          og avstemmes. Det leverer ChiliMobils system via fil eller API — vi tar
          det derfra.
        </p>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Venstre — datafil inn */}
          <div className="rounded-lg border border-ink-200 bg-ink-50/40 p-4">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2">
              <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-600">
                Dette mottar vi fra ChiliMobil
              </p>
              <span className="font-mono text-[10px] text-ink-400">
                fil via SFTP eller API
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="mt-2 w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-ink-200 font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-400">
                    <th className="py-1.5 pr-2 font-medium">Kunde · abonnement</th>
                    <th className="py-1.5 pr-2 font-medium">Beløp</th>
                    <th className="py-1.5 font-medium">Betaling · KID</th>
                  </tr>
                </thead>
                <tbody>
                  {run.intakeRows.map((r) => (
                    <tr
                      key={r.customer}
                      className={cn(
                        "border-b border-ink-200/60 align-top last:border-b-0",
                        !r.billed && "text-ink-400",
                      )}
                    >
                      <td className="py-2 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px] font-medium text-ink-900">
                            {r.customer}
                          </span>
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-0.5 font-mono text-[8.5px] font-semibold uppercase tracking-wider",
                              STATUS_BADGE[r.status] ?? "bg-ink-150 text-ink-500",
                            )}
                          >
                            {r.status}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-ink-400">
                          {r.plan}
                        </span>
                      </td>
                      <td className="py-2 pr-2 font-mono text-[11px] text-ink-800">
                        {r.baseAmount === null ? (
                          "—"
                        ) : (
                          <>
                            {NB.format(r.baseAmount)}
                            {r.extraAmount !== null ? (
                              <span className="text-accent-700">
                                {" "}
                                + {NB.format(r.extraAmount)} ({r.extraLabel})
                              </span>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td className="py-2 font-mono text-[10.5px] text-ink-600">
                        {r.paymentMethod ? (
                          <>
                            {r.paymentMethod}
                            <br />
                            <span className="text-ink-400">KID {r.kid}</span>
                          </>
                        ) : (
                          <span className="italic">faktureres ikke</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[10.5px] leading-snug text-ink-500">
              <span className="font-medium text-ink-700">Beløp</span> = hva ·{" "}
              <span className="font-medium text-ink-700">abonnement + status</span>{" "}
              = hvem ·{" "}
              <span className="font-medium text-ink-700">AvtaleGiro + KID</span> =
              hvordan
            </p>
          </div>

          {/* Høyre — ferdig faktura ut */}
          <div className="rounded-lg border border-accent-200 bg-accent-50/30 p-4">
            <div className="mb-2 flex items-center gap-2">
              <ArrowRight className="h-3.5 w-3.5 text-accent-700" />
              <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent-700">
                Audun lager fakturaen
              </p>
            </div>
            <div className="rounded-md border border-ink-200 bg-white px-4 py-3.5">
              <div className="flex items-baseline justify-between border-b border-ink-200 pb-2">
                <div>
                  <p className="text-[13px] font-medium text-ink-900">
                    {inv.customer}
                  </p>
                  <p className="font-mono text-[10px] text-ink-400">
                    {inv.plan} · {inv.reference}
                  </p>
                </div>
                <ReceiptText className="h-4 w-4 text-ink-400" />
              </div>
              <ul className="space-y-1.5 py-2.5 text-[12px]">
                {inv.lines.map((l) => (
                  <li
                    key={l.label}
                    className="flex items-baseline justify-between gap-3 text-ink-700"
                  >
                    <span>{l.label}</span>
                    <span className="font-mono text-ink-900">{kr2(l.amount)}</span>
                  </li>
                ))}
                <li className="flex items-baseline justify-between gap-3 text-ink-700">
                  <span>MVA ({inv.vatPct} %)</span>
                  <span className="font-mono text-ink-900">{kr2(inv.vatAmount)}</span>
                </li>
              </ul>
              <div className="flex items-baseline justify-between border-t border-ink-200 pt-2.5">
                <span className="text-[12px] font-medium text-ink-900">
                  Å betale
                </span>
                <span
                  className="font-serif text-xl font-light tracking-tight text-ink-900"
                >
                  {kr2(inv.total)}
                </span>
              </div>
              <p className="mt-2 text-[10.5px] leading-snug text-ink-500">
                Forfall {inv.dueDays} dager · Betales automatisk via{" "}
                {inv.paymentMethod} · KID {inv.kid}
              </p>
            </div>
          </div>
        </div>

        <p className="rounded-md bg-ink-100/60 px-3 py-2.5 text-[11px] leading-snug text-ink-600">
          KID-en følger ChiliMobils skjema — betalingen lander på deres konto, så
          vi bruker den bare for at betaling og avstemming havner riktig hos dem.
        </p>

        <div className="flex justify-end pt-1">
          <Button variant="primary" size="lg" onClick={onNext}>
            Fortsett til fakturagenerering
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Step 2 — Generer fakturaer ─────────────────────────────────────

function StepGenerer({ run, onNext }: { run: Run; onNext: () => void }): JSX.Element {
  const ok = [
    "Grupperer linjer per kunde og summerer beløpet",
    `Legger på MVA (${run.vatPct} %)`,
    `Tildeler fakturanummer, KID og forfall (${run.dueDays} dager)`,
  ];
  return (
    <Card>
      <CardContent className="space-y-5 py-5">
        <div className="flex items-center gap-2">
          <ReceiptText className="h-4 w-4 text-accent-700" />
          <h2
            className="font-serif text-lg font-medium tracking-tight text-ink-900"
          >
            Generer fakturaer
          </h2>
        </div>
        <p className="max-w-2xl text-[12.5px] text-ink-600">
          Dette er det Audun faktisk gjør — bygger fakturaene fra de mottatte
          beløpene.
        </p>
        <ul className="space-y-2.5">
          {ok.map((line) => (
            <li
              key={line}
              className="flex items-start gap-2.5 text-[13px] text-ink-800"
            >
              <CircleCheck className="mt-0.5 h-4 w-4 flex-none text-sage-700" />
              {line}
            </li>
          ))}
        </ul>
        <p className="rounded-md bg-ink-100/60 px-3 py-2.5 text-[11.5px] leading-snug text-ink-600">
          Fast avgift er konstant fra måned til måned — det som varierer er
          overforbruk og roaming.
        </p>
        <div className="flex items-start gap-2.5 rounded-md border border-amber-700/30 bg-amber-50/60 px-3 py-2 text-[13px] text-ink-800">
          <CircleAlert className="mt-0.5 h-4 w-4 flex-none text-amber-700" />
          <span>
            <strong className="font-medium">
              {num(run.activeSubscriptions)} fakturautkast generert
            </strong>{" "}
            · {run.flaggedCount} flagget av AI for gjennomgang.
          </span>
        </div>
        <div className="flex justify-end pt-1">
          <Button variant="primary" size="lg" onClick={onNext}>
            <ScanLine className="h-4 w-4" />
            Kjør AI-avvikssjekk
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Step 3 — Avvikssjekk ───────────────────────────────────────────

const CATEGORY_DETAIL: Record<BillingExceptionCategory, string> = {
  cancelled:
    "Fakturert for et abonnement de sa opp forrige syklus → faktura holdt tilbake.",
  high_amount:
    "Uvanlig høyt beløp fra overforbruk/roaming (f.eks. kr 1 240 mot snitt kr 399) → verifiser.",
  proration:
    "Proratering avviker fra forventet (abonnement endret midt i syklus) → korriger.",
  missing_usage:
    "Manglende forventet forbruk — mulig inntektslekkasje → verifiser.",
};

function StepAvvik({ run, onNext }: { run: Run; onNext: () => void }): JSX.Element {
  const groups = groupByCategory(run.exceptions);
  return (
    <Card>
      <CardContent className="space-y-5 py-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent-700" />
          <h2
            className="font-serif text-lg font-medium tracking-tight text-ink-900"
          >
            Avvikssjekk
          </h2>
        </div>
        <p className="max-w-2xl text-[12.5px] text-ink-600">
          Tradisjonell kontroll sjekker bare et utvalg. Audun sjekker hele
          populasjonen — alle {num(run.reviewedDrafts)} utkast — mot hver kundes
          historiske, sesongjusterte normal.
        </p>

        <div className="flex items-start gap-2.5 rounded-md border border-sage-700/25 bg-sage-50/60 px-3 py-2.5 text-[13px] text-ink-800">
          <CircleCheck className="mt-0.5 h-4 w-4 flex-none text-sage-700" />
          <span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-sage-700">
              Auto-fikset
            </span>
            <br />
            {run.autoFixedNote}
          </span>
        </div>

        <div className="space-y-2.5">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-500">
            Til menneskelig godkjenning ({run.flaggedCount})
          </p>
          {groups.map((g) => (
            <div
              key={g.category}
              className="flex items-start gap-3 rounded-md border border-ink-200 bg-ink-50/60 px-3 py-2.5"
            >
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-amber-50 text-amber-700">
                <CircleAlert className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] text-ink-900">
                  <strong className="font-medium">{g.count}</strong> · {g.label}
                </p>
                <p className="text-[11.5px] leading-snug text-ink-500">
                  {CATEGORY_DETAIL[g.category]}
                </p>
              </div>
            </div>
          ))}
        </div>

        <p className="border-t border-ink-200 pt-3 font-mono text-[10.5px] leading-snug text-ink-500">
          Bransjesnitt inntektslekkasje: {run.industryLeakagePct.toLocaleString("nb-NO")} % av omsetningen (TM Forum 2024/25). Å fange
          den krever at hele populasjonen sjekkes — ikke et stikkprøveutvalg.
        </p>

        <div className="flex justify-end pt-1">
          <Button variant="primary" size="lg" onClick={onNext}>
            Til godkjenningskø
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Step 4 — Godkjenning ───────────────────────────────────────────

const DECISION_META: Record<Decision, { label: string; className: string }> = {
  approve: { label: "Godkjent", className: "bg-sage-50 text-sage-700" },
  edit: { label: "Redigert", className: "bg-accent-100 text-accent-700" },
  reject: { label: "Holdt tilbake", className: "bg-clay-50 text-clay-700" },
};

function StepGodkjenning({
  run,
  decisions,
  decidedCount,
  allDecided,
  onDecide,
  onDecideAll,
  onNext,
}: {
  run: Run;
  decisions: Record<string, Decision>;
  decidedCount: number;
  allDecided: boolean;
  onDecide: (id: string, d: Decision) => void;
  onDecideAll: () => void;
  onNext: () => void;
}): JSX.Element {
  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex items-center gap-2">
            <h2
              className="font-serif text-lg font-medium tracking-tight text-ink-900"
            >
              Godkjenning
            </h2>
            <span className="font-mono text-[11px] text-ink-500">
              {decidedCount}/{run.exceptions.length} behandlet
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={onDecideAll}>
            <Check className="h-3.5 w-3.5" />
            Godkjenn alle anbefalinger
          </Button>
        </div>
        <p className="text-[12px] text-ink-500">
          En saksbehandler tar avgjørelsen (Godkjenn / Rediger / Avvis).
          Kjøringen fryses og fullføres først når avvikene er gjennomgått.
        </p>

        <ul className="max-h-[30rem] divide-y divide-ink-200/70 overflow-y-auto rounded-md border border-ink-200">
          {run.exceptions.map((exc) => (
            <ExceptionRow
              key={exc.id}
              exc={exc}
              decision={decisions[exc.id]}
              onDecide={onDecide}
            />
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-[11.5px] text-ink-500">
            {allDecided
              ? "Alle unntak er behandlet — kjøringen kan fullføres."
              : `Behandle de resterende ${run.exceptions.length - decidedCount} for å låse opp utsending.`}
          </p>
          <Button variant="primary" size="lg" onClick={onNext} disabled={!allDecided}>
            Fortsett til utsending
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ExceptionRow({
  exc,
  decision,
  onDecide,
}: {
  exc: BillingException;
  decision: Decision | undefined;
  onDecide: (id: string, d: Decision) => void;
}): JSX.Element {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-amber-50 px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wider text-amber-700">
            {exc.categoryLabel}
          </span>
          <span className="text-[13px] font-medium text-ink-900">
            {exc.customer}
          </span>
          <span className="font-mono text-[10.5px] text-ink-400">
            {exc.reference} · {exc.plan} · {kr(exc.amount)}
          </span>
        </div>
        <p className="mt-0.5 text-[11.5px] leading-snug text-ink-500">
          {exc.note} ·{" "}
          <span className="text-ink-600">Anbefalt: {exc.recommendation}</span>
        </p>
      </div>
      {decision ? (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
            DECISION_META[decision].className,
          )}
        >
          <Check className="h-3 w-3" />
          {DECISION_META[decision].label}
        </span>
      ) : (
        <div className="flex items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => onDecide(exc.id, "approve")}>
            <Check className="h-3.5 w-3.5" />
            Godkjenn
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDecide(exc.id, "edit")}>
            <Pencil className="h-3.5 w-3.5" />
            Rediger
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDecide(exc.id, "reject")}>
            <Ban className="h-3.5 w-3.5" />
            Avvis
          </Button>
        </div>
      )}
    </li>
  );
}

// ─── Step 5 — Send ──────────────────────────────────────────────────

function StepSend({ run, onSend }: { run: Run; onSend: () => void }): JSX.Element {
  return (
    <Card>
      <CardContent className="space-y-5 py-8 text-center">
        <div className="space-y-1">
          <p
            className="font-serif text-[40px] font-light leading-none tracking-tight text-ink-900"
          >
            {num(run.sendCount)}
          </p>
          <p className="text-[12.5px] text-ink-600">
            fakturaer klare — avvikene er gjennomgått, {run.flaggedCount} trukket
            ut til manuell behandling.
          </p>
        </div>
        <div className="flex justify-center">
          <Button variant="primary" size="lg" onClick={onSend}>
            <Send className="h-4 w-4" />
            Generer og send {num(run.sendCount)} fakturaer
          </Button>
        </div>
        <p className="font-mono text-[10.5px] text-ink-500">
          Kjøringen fullføres og endelige fakturaer genereres — med KID, MVA
          ({run.vatPct} %) og {run.dueDays} dagers forfallsfrist.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Step 6 — Distribusjon ──────────────────────────────────────────

function StepDistribusjon({
  run,
  onReset,
}: {
  run: Run;
  onReset: () => void;
}): JSX.Element {
  return (
    <div className="space-y-5">
      <Card className="border-sage-700/25 bg-sage-50/50">
        <CardContent className="flex items-center gap-3 py-4">
          <CircleCheck className="h-5 w-5 flex-none text-sage-700" />
          <p className="text-sm text-ink-800">
            <strong className="font-medium">Kjøringen er fullført.</strong>{" "}
            {num(run.sendCount)} fakturaer generert og sendt/distribuert —
            fordelt automatisk på riktig kanal per kunde.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5 py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2
              className="font-serif text-lg font-medium tracking-tight text-ink-900"
            >
              Distribusjon per kanal
            </h2>
            <p className="font-mono text-[11.5px] text-ink-500">
              {run.autotrekkPct} % ({num(run.autotrekkCount)}) på autotrekk
            </p>
          </div>

          <div className="flex h-3 w-full overflow-hidden rounded-full bg-ink-200">
            {run.distribution.map((d) => (
              <div
                key={d.channel}
                className={cn("h-full", CHANNEL_COLORS[d.channel] ?? "bg-ink-200")}
                style={{ width: `${d.pct}%` }}
                title={`${d.channel} · ${num(d.count)}`}
              />
            ))}
          </div>

          <ul className="space-y-2.5">
            {run.distribution.map((d) => (
              <li key={d.channel} className="flex items-start gap-2.5">
                <span
                  className={cn(
                    "mt-1 inline-block h-2.5 w-2.5 flex-none rounded-full",
                    CHANNEL_COLORS[d.channel] ?? "bg-ink-200",
                  )}
                />
                <div className="min-w-0">
                  <p className="text-[13px] text-ink-900">
                    <strong className="font-medium">{num(d.count)}</strong> på{" "}
                    {d.channel}{" "}
                    <span className="font-mono text-[10.5px] text-ink-400">
                      · {d.pct} %
                    </span>
                    {d.autodebit ? (
                      <span className="ml-1.5 text-[10px] text-sage-700">
                        autotrekk
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[11.5px] leading-snug text-ink-500">
                    {d.note}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-start gap-2.5 border-t border-ink-200 pt-4 text-[12.5px] text-ink-700">
            <TrendingDown className="mt-0.5 h-4 w-4 flex-none text-sage-700" />
            <p>
              Jo høyere autotrekk-andel, jo lavere DSO ({run.dsoDays} dager) og
              mindre factoring-behov. <Wallet className="inline h-3.5 w-3.5 text-ink-400" />
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-start">
        <button
          type="button"
          onClick={onReset}
          className="font-mono text-[11px] uppercase tracking-wider text-ink-500 hover:text-ink-900"
        >
          ↺ Start ny kjøring
        </button>
      </div>

      {/* Bro, ikke et steg: betalingstrakten er et innkrevings-utfall over
          tid — ikke resultatet av å generere/sende fakturaer. Vises derfor
          som et eget avsnitt etter at selve kjøringen er ferdig. */}
      <div className="border-t border-ink-200 pt-6">
        <BridgePanel run={run} />
      </div>
    </div>
  );
}

// ─── Bridge: fra faktura til betalt (innkrevings-utfall over tid) ───
// Ikke et steg i kjøringen — en bro fra «fakturaene er sendt» til
// inkasso-delen. Forteller hvordan fakturaene løser seg de neste ukene.

const FUNNEL_TONE: Record<PaymentFunnelStep["tone"], string> = {
  paid: "bg-accent-500",
  reminder: "bg-accent-200",
  notice: "bg-amber-100",
  inkasso: "bg-clay-100",
};

function BridgePanel({ run }: { run: Run }): JSX.Element {
  return (
    <Card className="border-accent-200 bg-accent-50/30">
      <CardContent className="space-y-5 py-5">
        <div className="space-y-1.5">
          <p className="eyebrow">Hva skjer videre</p>
          <h2
            className="font-serif text-lg font-medium tracking-tight text-ink-900"
          >
            Fra faktura til betalt
          </h2>
          <p className="max-w-2xl text-[12.5px] leading-snug text-ink-600">
            Fakturaene er sendt. De fleste betaler automatisk. Slik løser de seg
            de neste ukene — og for de få som ikke betaler, tar inkasso-motoren
            over.
          </p>
        </div>

        <div className="flex h-3 w-full overflow-hidden rounded-full bg-ink-200">
          {run.paymentFunnel.map((s) => (
            <div
              key={s.key}
              className={cn("h-full", FUNNEL_TONE[s.tone])}
              style={{ width: `${s.pct}%` }}
              title={`${s.label} · ${s.pct} %`}
            />
          ))}
        </div>

        <ul className="space-y-2.5">
          {run.paymentFunnel.map((s) => (
            <li key={s.key} className="flex items-start gap-2.5">
              <span
                className={cn(
                  "mt-1 inline-block h-2.5 w-2.5 flex-none rounded-full",
                  FUNNEL_TONE[s.tone],
                )}
              />
              <div className="min-w-0">
                <p className="text-[13px] text-ink-900">
                  <strong className="font-medium">{s.pct} %</strong> · {s.label}
                </p>
                {s.note ? (
                  <p className="text-[11.5px] leading-snug text-ink-500">
                    {s.note}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        <div className="rounded-lg border border-accent-200 bg-white/60 px-4 py-4">
          <p
            className="font-serif text-[32px] font-light leading-none tracking-tight text-ink-900"
          >
            {run.resolvedBeforeInkassoPct} % løst før inkasso
          </p>
          <p className="mt-2 max-w-2xl text-[12.5px] leading-snug text-ink-700">
            Jo mer som løses tidlig, jo billigere for dere og bedre for kunden —
            og jo raskere cash. Bare {run.reachesInkassoPct} % når et dyrt
            inkassoløp.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="font-mono text-[10px] text-ink-500">
            Illustrative tall — byttes med ChiliMobils egne.
          </p>
          <Link
            href="/demo/portefolje"
            className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-2.5 text-sm font-medium text-ink-50 transition-colors hover:bg-ink-800"
          >
            Se inkasso-porteføljen
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── helpers ────────────────────────────────────────────────────────

function groupByCategory(
  exceptions: BillingException[],
): Array<{ category: BillingExceptionCategory; label: string; count: number }> {
  const order: BillingExceptionCategory[] = [
    "cancelled",
    "high_amount",
    "proration",
    "missing_usage",
  ];
  return order
    .map((category) => {
      const rows = exceptions.filter((e) => e.category === category);
      return {
        category,
        label: rows[0]?.categoryLabel ?? category,
        count: rows.length,
      };
    })
    .filter((g) => g.count > 0);
}
