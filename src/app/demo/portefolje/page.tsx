"use client";

/**
 * Demo — portfolio dashboard.
 *
 * Visual treatment mirrors the operator `/portfolio` page: greeting
 * hero, 5 KPI tiles, aging exposure bar, by-status panel, attention
 * + recent-activity panels. Norwegian throughout. Reads the static
 * demo fixtures via `lib/api.ts` (no backend in demo mode).
 */

import { useMemo } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Bell,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  Clock,
  FileText,
  HeartHandshake,
  MessageSquare,
  Scale,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Card, CardContent } from "../../../components/ui/card";
import { cn } from "../../../lib/cn";
import { type CaseListItem } from "../../../lib/api";
import {
  demoCashMetrics,
  demoListCases,
  type DemoCashMetrics,
} from "../../../lib/demo-fixtures";
import { demoStatusTone, tState } from "../../../lib/demo-i18n";

const CREDITOR_NAME = "Chilimobil AS";

// Likviditets-/factoring-estimat. ILLUSTRATIVT — byttes med ChiliMobils
// faktiske utestående + factoring-/kassekredittrente i discovery, så blir
// tallet hennes eget (jf. demo-planen). Mekanikken: raskere innbetaling
// reduserer gapet du må finansiere via factoring/kassekreditt.
const FACTORING_RATE_ANNUAL = 0.09; // antatt finansieringskostnad p.a.
const DAYS_FASTER = 4; // antatt forbedring i snitt dager-til-betaling
const ASSUMED_AVG_OUTSTANDING_KR = 6_000_000; // representativt utestående til enhver tid

export default function DemoPortfolioPage(): JSX.Element {
  const data = useMemo(() => demoListCases(), []);
  const stats = useMemo(() => computeStats(data.items), [data.items]);
  const cash = useMemo(() => demoCashMetrics(), []);
  const aging = useMemo(() => computeAging(data.items), [data.items]);
  const byStage = useMemo(() => computeStageBreakdown(data.items), [data.items]);
  const attention = useMemo(() => computeAttention(data.items), [data.items]);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="eyebrow">Portefølje</p>
        <h1
          className="font-serif text-3xl font-light tracking-tight text-ink-900"
          style={{ fontVariationSettings: "'opsz' 60, 'SOFT' 80" }}
        >
          {greetingFor(new Date())}
        </h1>
        <div className="space-y-1">
          <p className="max-w-2xl text-sm text-ink-600">
            <strong className="font-medium text-ink-900">{stats.active}</strong>{" "}
            {stats.active === 1 ? "aktivt krav" : "aktive krav"} ·{" "}
            <strong className="font-medium text-ink-900">
              {formatKr(stats.outstanding)}
            </strong>{" "}
            utestående · {stats.debtors}{" "}
            {stats.debtors === 1 ? "aktiv skyldner" : "aktive skyldnere"} hos{" "}
            <span className="font-medium text-ink-900">{CREDITOR_NAME}</span>
          </p>
          <p className="max-w-2xl font-mono text-[11.5px] uppercase tracking-[0.12em] text-ink-500">
            Totalt ·{" "}
            <span className="text-ink-700">{stats.lifetimeTotal}</span> krav ·{" "}
            <span className="text-ink-700">{stats.lifetimeClosed}</span> løst ·{" "}
            <span className="text-ink-700">
              {formatKr(stats.lifetimeClaimed)}
            </span>{" "}
            til inndriving
          </p>
        </div>
      </header>

      <CashImpactPanel cash={cash} />

      <LifecycleRibbon />

      <StatsRow stats={stats} cash={cash} />

      <AgingPanel buckets={aging} outstanding={stats.outstanding} />

      <PipelinePanel segments={byStage} />

      <div className="grid gap-5 lg:grid-cols-2">
        <AttentionPanel items={attention} />
        <RecentClaimsPanel items={data.items.slice(0, 6)} />
      </div>
    </div>
  );
}

// ─── Pieces ─────────────────────────────────────────────────────────

function StatsRow({
  stats,
  cash,
}: {
  stats: Stats;
  cash: DemoCashMetrics;
}): JSX.Element {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <Tile
        icon={Banknote}
        label="Aktivt utestående"
        primary={formatKr(stats.outstanding)}
        caption={`${stats.active} krav · ${stats.debtors} skyldnere`}
      />
      <Tile
        icon={CircleDashed}
        label="Løst uten inkasso"
        primary={`${cash.resolvedWithoutInkassoPct} %`}
        caption="Betalt før salær påløp — billigere og brand-vennlig"
      />
      <Tile
        icon={Clock}
        label="Snitt dager til betaling"
        primary={`${cash.avgDaysToPay} dager`}
        caption="Fra forfall til betalt"
      />
      <Tile
        icon={HeartHandshake}
        label="Sårbare flagget"
        primary={String(cash.vulnerableHandled)}
        caption="Fanget av AI, rutet til saksbehandler"
      />
      <Tile
        icon={CircleDashed}
        label="Krever oppmerksomhet"
        primary={String(stats.needsAttention)}
        caption="Trykk for å se sakene"
        tone={stats.needsAttention > 0 ? "warn" : undefined}
        href="/demo/saker?filter=needs_attention"
      />
    </div>
  );
}

/**
 * CFO-raden — det Caroline ser først. Snakker cash, ikke AI: hentet
 * inn, frigjort arbeidskapital, og lavere finansieringskostnad fra
 * raskere innbetaling. De to siste er ESTIMAT bygd på antakelser
 * (factoring-rente, dager raskere, representativt utestående) som
 * byttes med ChiliMobils egne tall i discovery.
 */
function CashImpactPanel({ cash }: { cash: DemoCashMetrics }): JSX.Element {
  const financingSavedPerYear = Math.round(
    ASSUMED_AVG_OUTSTANDING_KR * FACTORING_RATE_ANNUAL * (DAYS_FASTER / 365) * 12,
  );
  const workingCapitalFreed = Math.round(
    ASSUMED_AVG_OUTSTANDING_KR * (DAYS_FASTER / 30),
  );
  return (
    <Card className="border-accent-200 bg-accent-50/40">
      <CardContent className="space-y-4 py-5">
        <div className="flex items-baseline justify-between">
          <h2
            className="font-serif text-lg font-medium tracking-tight text-ink-900"
            style={{ fontVariationSettings: "'opsz' 36, 'SOFT' 60" }}
          >
            Likviditetseffekt
          </h2>
          <p className="font-mono text-[11.5px] text-ink-500">
            Hver krone inn raskere = mindre dyr factoring
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <CashTile
            icon={Wallet}
            label="Hentet inn"
            primary={formatKr(cash.recoveredKr)}
            caption={`${cash.resolvedCount} saker løst og betalt`}
          />
          <CashTile
            icon={TrendingDown}
            label="Lavere finansieringskostnad"
            primary={`≈ ${formatKr(financingSavedPerYear)}/år`}
            caption={`Est. ved ${DAYS_FASTER} dager raskere · juster med ChiliMobils tall`}
          />
          <CashTile
            icon={Banknote}
            label="Frigjort arbeidskapital"
            primary={`≈ ${formatKr(workingCapitalFreed)}`}
            caption="Est. mindre bundet i utestående"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function CashTile({
  icon: Icon,
  label,
  primary,
  caption,
}: {
  icon: typeof Banknote;
  label: string;
  primary: string;
  caption: string;
}): JSX.Element {
  return (
    <div className="space-y-2 rounded-md bg-white/70 px-4 py-4">
      <div className="flex items-center justify-between">
        <p className="eyebrow">{label}</p>
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-100 text-accent-700">
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p
        className="font-serif text-[26px] font-light leading-none tracking-tight text-ink-900"
        style={{ fontVariationSettings: "'opsz' 48, 'SOFT' 80" }}
      >
        {primary}
      </p>
      <p className="text-[11.5px] text-ink-500">{caption}</p>
    </div>
  );
}

/**
 * "Pengene inn"-bånd — visualiserer hele kravets livssyklus som ett
 * løp: faktura → påminnelse → oppfølging → inkasso → løst. Knytter
 * dashbordet til CFO-historien: jo tidligere en sak løses, jo billigere
 * og jo raskere penger inn. De tre tidlige stegene er fargelagt som
 * "vennlig & billig" (sage), inkasso som "dyrere" (clay), løst som
 * resultat (accent) — samme palett som alders-/statusbåndene under.
 */
const LIFECYCLE_STAGES = [
  { key: "faktura", label: "Faktura", icon: FileText, tone: "neutral" },
  { key: "paaminnelse", label: "Påminnelse", icon: Bell, tone: "early" },
  { key: "oppfolging", label: "Oppfølging", icon: MessageSquare, tone: "early" },
  { key: "inkasso", label: "Inkasso", icon: Scale, tone: "late" },
  { key: "lost", label: "Løst", icon: CircleCheck, tone: "done" },
] as const;

function lifecycleToneClass(tone: (typeof LIFECYCLE_STAGES)[number]["tone"]): string {
  switch (tone) {
    case "early":
      return "bg-sage-50 text-sage-700";
    case "late":
      return "bg-clay-100 text-clay-700";
    case "done":
      return "bg-accent-100 text-accent-700";
    default:
      return "bg-ink-150 text-ink-700";
  }
}

function LifecycleRibbon(): JSX.Element {
  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2
            className="font-serif text-lg font-medium tracking-tight text-ink-900"
            style={{ fontVariationSettings: "'opsz' 36, 'SOFT' 60" }}
          >
            Pengene inn — fra faktura til løst
          </h2>
          <p className="font-mono text-[11.5px] text-ink-500">
            Solvva eier hele oppfølgingen av kravet
          </p>
        </div>
        <ol className="flex flex-wrap items-center gap-y-3">
          {LIFECYCLE_STAGES.map((node, i) => (
            <li key={node.key} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5 text-center">
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg",
                    lifecycleToneClass(node.tone),
                  )}
                >
                  <node.icon className="h-4 w-4" />
                </span>
                <span className="text-[11.5px] font-medium text-ink-800">
                  {node.label}
                </span>
              </div>
              {i < LIFECYCLE_STAGES.length - 1 ? (
                <ArrowRight className="mx-3 h-3.5 w-3.5 shrink-0 text-ink-400 sm:mx-5" />
              ) : null}
            </li>
          ))}
        </ol>
        <p className="max-w-3xl text-[11.5px] leading-snug text-ink-500">
          Jo tidligere i løpet en sak løses, jo billigere for dere og bedre for
          kunden — Solvva jobber hardest i de tidlige, vennlige stegene, før
          inkasso og dyre salærer. Hver krone inn raskere er en krone mindre
          bundet i factoring.
        </p>
      </CardContent>
    </Card>
  );
}

function Tile({
  icon: Icon,
  label,
  primary,
  caption,
  tone,
  href,
}: {
  icon: typeof Banknote;
  label: string;
  primary: string;
  caption: string;
  tone?: "warn" | undefined;
  href?: string | undefined;
}): JSX.Element {
  const body = (
    <Card
      className={cn(
        tone === "warn" ? "border-amber-300 bg-amber-50/40" : undefined,
        href
          ? "transition-colors hover:border-ink-300 hover:bg-ink-100/50"
          : undefined,
      )}
    >
      <CardContent className="space-y-3 py-5">
        <div className="flex items-center justify-between">
          <p className="eyebrow">{label}</p>
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-100 text-accent-700">
            <Icon className="h-3.5 w-3.5" />
          </span>
        </div>
        <p
          className="font-serif text-[28px] font-light leading-none tracking-tight text-ink-900"
          style={{ fontVariationSettings: "'opsz' 48, 'SOFT' 80" }}
        >
          {primary}
        </p>
        <p className="text-[11.5px] text-ink-500">{caption}</p>
      </CardContent>
    </Card>
  );
  if (href === undefined) return body;
  return (
    <Link
      href={href}
      className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
    >
      {body}
    </Link>
  );
}

const BUCKET_COLORS = {
  "0-30": "bg-sage-50",
  "31-60": "bg-accent-100",
  "61-90": "bg-accent-200",
  "90+": "bg-clay-100",
} as const;

const BUCKET_LABEL: Record<"0-30" | "31-60" | "61-90" | "90+", string> = {
  "0-30": "0–30 dager",
  "31-60": "31–60 dager",
  "61-90": "61–90 dager",
  "90+": "90+ dager",
};

function AgingPanel({
  buckets,
  outstanding,
}: {
  buckets: AgingBucket[];
  outstanding: number;
}): JSX.Element {
  const total = buckets.reduce((s, b) => s + b.exposure, 0);
  return (
    <Card>
      <CardContent className="space-y-5 py-5">
        <div className="flex items-baseline justify-between">
          <h2
            className="font-serif text-lg font-medium tracking-tight text-ink-900"
            style={{ fontVariationSettings: "'opsz' 36, 'SOFT' 60" }}
          >
            Aldersfordeling og eksponering
          </h2>
          <p className="font-mono text-[11.5px] text-ink-500">
            {formatKr(outstanding)} utestående
          </p>
        </div>
        {total === 0 ? (
          <p className="py-4 text-center text-sm text-ink-500">
            Ingen utestående krav med forfallsdato ennå.
          </p>
        ) : (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-ink-200">
              {buckets.map((b) => {
                const pct = total === 0 ? 0 : (b.exposure / total) * 100;
                if (pct === 0) return null;
                return (
                  <div
                    key={b.bucket}
                    className={cn("h-full", BUCKET_COLORS[b.bucket])}
                    style={{ width: `${pct}%` }}
                    title={`${BUCKET_LABEL[b.bucket]} · ${formatKr(b.exposure)}`}
                  />
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
              {buckets.map((b) => (
                <div key={b.bucket} className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-block h-2 w-2 rounded-full",
                        BUCKET_COLORS[b.bucket],
                      )}
                    />
                    <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-500">
                      {BUCKET_LABEL[b.bucket]}
                    </p>
                  </div>
                  <p className="font-mono text-[13px] text-ink-900">
                    {formatKr(b.exposure)}
                  </p>
                  <p className="text-[10.5px] text-ink-500">
                    {b.count} krav
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const STATE_COLORS: Record<string, string> = {
  parsed: "bg-ink-300",
  drafting: "bg-ink-300",
  drafted: "bg-accent-100",
  approved: "bg-accent-200",
  sent: "bg-sage-50",
  paused: "bg-amber-100",
  closed: "bg-sage-100",
  escalated: "bg-clay-100",
  needs_review: "bg-amber-100",
  failed: "bg-clay-200",
};

function PipelinePanel({ segments }: { segments: StageSegment[] }): JSX.Element {
  const total = segments.reduce((s, seg) => s + seg.count, 0);
  return (
    <Card>
      <CardContent className="space-y-5 py-5">
        <div className="flex items-baseline justify-between">
          <h2
            className="font-serif text-lg font-medium tracking-tight text-ink-900"
            style={{ fontVariationSettings: "'opsz' 36, 'SOFT' 60" }}
          >
            Fordeling etter status
          </h2>
          <p className="font-mono text-[11.5px] text-ink-500">
            {total} krav totalt
          </p>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-ink-200">
          {segments.map((seg) => {
            const pct = total === 0 ? 0 : (seg.count / total) * 100;
            if (pct === 0) return null;
            return (
              <div
                key={seg.state}
                className={cn("h-full", STATE_COLORS[seg.state] ?? "bg-ink-200")}
                style={{ width: `${pct}%` }}
                title={`${tState(seg.state)} · ${seg.count}`}
              />
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4 lg:grid-cols-5">
          {segments.map((seg) => (
            <div key={seg.state} className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "inline-block h-2 w-2 rounded-full",
                    STATE_COLORS[seg.state] ?? "bg-ink-200",
                  )}
                />
                <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-500">
                  {tState(seg.state)}
                </p>
              </div>
              <p className="font-mono text-[13px] text-ink-900">{seg.count}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AttentionPanel({ items }: { items: CaseListItem[] }): JSX.Element {
  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <div className="flex items-baseline justify-between">
          <h2
            className="font-serif text-lg font-medium tracking-tight text-ink-900"
            style={{ fontVariationSettings: "'opsz' 36, 'SOFT' 60" }}
          >
            Krever oppmerksomhet
          </h2>
          <p className="font-mono text-[11.5px] text-ink-500">
            {items.length} {items.length === 1 ? "sak" : "saker"}
          </p>
        </div>
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-500">
            Ingenting venter på deg.
          </p>
        ) : (
          <ul className="-mx-2 max-h-[20rem] divide-y divide-ink-200/60 overflow-y-auto pr-1">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/demo/saker/${item.id}`}
                  className="flex items-center justify-between gap-3 rounded px-2 py-2.5 transition-colors hover:bg-ink-100/60"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Badge tone={demoStatusTone(item.state)}>
                        {tState(item.state)}
                      </Badge>
                      <p className="truncate text-[13px] font-medium text-ink-900">
                        {item.debtor_name ?? "Ukjent skyldner"}
                      </p>
                    </div>
                    <p className="truncate text-[11.5px] text-ink-500">
                      {item.invoice_reference}
                      {item.amount ? ` · ${formatKr(item.amount)}` : ""}
                    </p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-500" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RecentClaimsPanel({ items }: { items: CaseListItem[] }): JSX.Element {
  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <div className="flex items-baseline justify-between">
          <h2
            className="font-serif text-lg font-medium tracking-tight text-ink-900"
            style={{ fontVariationSettings: "'opsz' 36, 'SOFT' 60" }}
          >
            Siste aktivitet
          </h2>
          <Link
            href="/demo/saker"
            className="font-mono text-[11.5px] text-ink-500 hover:text-ink-900"
          >
            Se alle →
          </Link>
        </div>
        <ul className="divide-y divide-ink-200/60">
          {items.map((it) => (
            <li key={it.id}>
              <Link
                href={`/demo/saker/${it.id}`}
                className="flex items-center justify-between gap-3 py-2 hover:bg-ink-100/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-ink-900">
                    {it.debtor_name ?? "Ukjent skyldner"}
                  </p>
                  <p className="truncate font-mono text-[10.5px] text-ink-500">
                    {it.invoice_reference} ·{" "}
                    {it.amount ? formatKr(it.amount) : "—"}
                  </p>
                </div>
                <Badge tone={demoStatusTone(it.state)}>{tState(it.state)}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

interface Stats {
  active: number;
  outstanding: number;
  debtors: number;
  smsThisWeek: number;
  needsAttention: number;
  inDialogue: number;
  lifetimeTotal: number;
  lifetimeClosed: number;
  lifetimeClaimed: number;
}

function computeStats(items: CaseListItem[]): Stats {
  let outstanding = 0;
  let lifetimeClaimed = 0;
  let active = 0;
  let closed = 0;
  let needsAttention = 0;
  const debtors = new Set<string>();
  for (const c of items) {
    const amount = c.amount ? Number(c.amount) : 0;
    lifetimeClaimed += Number.isFinite(amount) ? amount : 0;
    if (c.state === "closed") {
      closed += 1;
    } else {
      active += 1;
      outstanding += Number.isFinite(amount) ? amount : 0;
      if (c.debtor_phone) debtors.add(c.debtor_phone);
    }
    if (
      c.state === "escalated" ||
      c.state === "failed" ||
      c.state === "needs_review" ||
      c.state === "pending_legal_approval"
    ) {
      needsAttention += 1;
    }
  }
  const smsThisWeek = items.filter(
    (c) => c.state === "sent" || c.state === "paused",
  ).length;
  const inDialogue = items.filter(
    (c) => c.state === "paused" || c.state === "escalated",
  ).length;
  return {
    active,
    outstanding,
    debtors: debtors.size,
    smsThisWeek,
    needsAttention,
    inDialogue,
    lifetimeTotal: items.length,
    lifetimeClosed: closed,
    lifetimeClaimed,
  };
}

interface AgingBucket {
  bucket: "0-30" | "31-60" | "61-90" | "90+";
  exposure: number;
  count: number;
}

function computeAging(items: CaseListItem[]): AgingBucket[] {
  const empty = {
    "0-30": { exposure: 0, count: 0 },
    "31-60": { exposure: 0, count: 0 },
    "61-90": { exposure: 0, count: 0 },
    "90+": { exposure: 0, count: 0 },
  };
  const now = Date.now();
  for (const c of items) {
    if (c.state === "closed" || !c.due_date) continue;
    const dueMs = new Date(c.due_date).getTime();
    const overdueDays = Math.max(0, Math.floor((now - dueMs) / 86_400_000));
    if (overdueDays === 0) continue;
    const amount = c.amount ? Number(c.amount) : 0;
    const bucket: keyof typeof empty =
      overdueDays <= 30
        ? "0-30"
        : overdueDays <= 60
          ? "31-60"
          : overdueDays <= 90
            ? "61-90"
            : "90+";
    empty[bucket].exposure += Number.isFinite(amount) ? amount : 0;
    empty[bucket].count += 1;
  }
  return (Object.keys(empty) as Array<keyof typeof empty>).map((bucket) => ({
    bucket,
    exposure: empty[bucket].exposure,
    count: empty[bucket].count,
  }));
}

interface StageSegment {
  state: string;
  count: number;
}

function computeStageBreakdown(items: CaseListItem[]): StageSegment[] {
  // Merge every pre-send operational state into `sent` so the demo
  // panel reads "Under inndriving · N" once instead of three near-
  // identical rows. The creditor never sees the draft handoff.
  const groupKey = (s: string): string => {
    if (s === "parsed" || s === "drafting" || s === "drafted" || s === "approved") {
      return "sent";
    }
    return s;
  };
  const counts: Record<string, number> = {};
  for (const c of items) {
    const key = groupKey(c.state);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const order = [
    "sent",
    "paused",
    "escalated",
    "needs_review",
    "failed",
    "pending_legal_approval",
    "sent_to_enforcement",
    "long_term_monitoring",
    "closed",
  ];
  return order
    .filter((s) => (counts[s] ?? 0) > 0)
    .map((state) => ({ state, count: counts[state] ?? 0 }));
}

function computeAttention(items: CaseListItem[]): CaseListItem[] {
  return items
    .filter(
      (c) =>
        c.state === "escalated" ||
        c.state === "failed" ||
        c.state === "needs_review" ||
        c.state === "pending_legal_approval",
    )
    .slice(0, 8);
}

function greetingFor(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "God morgen.";
  if (h < 18) return "God ettermiddag.";
  return "God kveld.";
}

const NB_NUM_FMT = new Intl.NumberFormat("nb-NO", {
  maximumFractionDigits: 0,
});

function formatKr(amount: string | number): string {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return String(amount);
  return `kr ${NB_NUM_FMT.format(Math.round(n))}`;
}
