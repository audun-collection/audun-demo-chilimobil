/**
 * Demo — Oversikt (landing). The first thing the CFO sees: Audun as
 * the owner of the *entire* value chain for ChiliMobil (telekom-MVNO),
 * from subscription to collected. The angle is "replace the bundled
 * Svea mess with one seamless, integrated run — built for telecom."
 *
 * Cash story, not AI: the channel-mix graph (share of invoices on
 * autopay) is the strongest lever for a subscription business — more
 * autopay → fewer dunning loops → lower DSO → less factoring need.
 *
 * The operational portfolio dashboard lives at /demo/portefolje; the
 * CTA at the bottom links there. Reads static fixtures (no backend).
 */

import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  ChevronRight,
  CircleCheck,
  FileText,
  Landmark,
  MessageSquare,
  Scale,
  Send,
  Signal,
  TrendingDown,
  Users,
  Wallet,
} from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { cn } from "../../lib/cn";
import {
  demoBillingOverview,
  demoCashMetrics,
  type DemoBillingIntegration,
} from "../../lib/demo-fixtures";

const CREDITOR_NAME = "Chilimobil AS";

export default function DemoOverviewPage(): JSX.Element {
  const billing = demoBillingOverview();
  const cash = demoCashMetrics();

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="eyebrow">Oversikt</p>
        <h1
          className="font-serif text-3xl font-light tracking-tight text-ink-900"
        >
          Ett løp fra faktura til innkrevd.
        </h1>
        <p className="max-w-2xl text-sm text-ink-600">
          Slik ser det ut for{" "}
          <span className="font-medium text-ink-900">{CREDITOR_NAME}</span> i
          Audun: fakturering og innkreving samlet på ett sted, koblet på
          systemene dere allerede bruker. Du følger hele løpet — fra faktura
          sendt til pengene er inne.
        </p>
      </header>

      <ValueChainPanel />

      <IntegrationsPanel integrations={billing.integrations} />

      <div className="grid gap-5 lg:grid-cols-3">
        <ChannelMixPanel
          className="lg:col-span-2"
          channels={billing.channelMix}
          autotrekkPct={billing.autotrekkPct}
          invoices={billing.invoicesThisCycle}
        />
        <HeadlineMetric
          dso={billing.dsoDays}
          trend={billing.dsoTrendDays}
          resolvedWithoutInkassoPct={cash.resolvedWithoutInkassoPct}
        />
      </div>

      <div className="flex flex-col items-center gap-2 pt-1">
        <Link
          href="/demo/portefolje"
          className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-2.5 text-sm font-medium text-ink-50 transition-colors hover:bg-ink-800"
        >
          Se porteføljen
          <ChevronRight className="h-4 w-4" />
        </Link>
        <p className="font-mono text-[10.5px] text-ink-500">
          Tallene på denne siden er illustrative — byttes med ChiliMobils egne i
          discovery.
        </p>
      </div>
    </div>
  );
}

// ─── Value chain (hero) ─────────────────────────────────────────────

type ChainTone = "system" | "core" | "soft" | "late" | "done";

const VALUE_CHAIN: ReadonlyArray<{
  key: string;
  label: string;
  icon: typeof FileText;
  tone: ChainTone;
  href?: string;
  cta?: string;
}> = [
  { key: "crm", label: "Abonnement / CRM", icon: Users, tone: "system" },
  {
    key: "faktura",
    label: "Faktura generert",
    icon: FileText,
    tone: "core",
    href: "/demo/fakturering",
    cta: "Se kjøring →",
  },
  { key: "distribusjon", label: "Distribusjon", icon: Send, tone: "core" },
  { key: "betaling", label: "Betaling & avstemming", icon: Wallet, tone: "core" },
  { key: "oppfolging", label: "Oppfølging", icon: MessageSquare, tone: "soft" },
  {
    key: "inkasso",
    label: "Inkasso",
    icon: Scale,
    tone: "late",
    href: "/demo/saker",
    cta: "Se sakene →",
  },
  { key: "lost", label: "Løst", icon: CircleCheck, tone: "done" },
];

const DISTRIBUTION_CHANNELS = [
  "eFaktura",
  "Vipps",
  "AvtaleGiro",
  "EHF",
  "print",
];

function chainToneClass(tone: ChainTone): string {
  switch (tone) {
    case "core":
      return "bg-accent-100 text-accent-700";
    case "soft":
      return "bg-sage-50 text-sage-700";
    case "late":
      return "bg-clay-100 text-clay-700";
    case "done":
      return "bg-accent-200 text-accent-700";
    default:
      return "bg-ink-150 text-ink-700";
  }
}

function ValueChainPanel(): JSX.Element {
  return (
    <Card className="border-accent-200 bg-accent-50/40">
      <CardContent className="space-y-5 py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2
            className="font-serif text-xl font-medium tracking-tight text-ink-900"
          >
            Audun eier hele løpet
          </h2>
          <p className="font-mono text-[11.5px] text-ink-500">
            Fra faktura til innkrevd — i ett system
          </p>
        </div>

        <ol className="flex flex-wrap items-start gap-y-4">
          {VALUE_CHAIN.map((node, i) => {
            const Icon = node.icon;
            const inner = (
              <>
                <span
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl",
                    chainToneClass(node.tone),
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="text-[11.5px] font-medium leading-tight text-ink-800">
                  {node.label}
                </span>
                {node.cta ? (
                  <span className="font-mono text-[9px] uppercase tracking-wider text-accent-700">
                    {node.cta}
                  </span>
                ) : null}
              </>
            );
            return (
              <li key={node.key} className="flex items-start">
                {node.href ? (
                  <Link
                    href={node.href}
                    className="flex w-[88px] flex-col items-center gap-1.5 rounded-lg py-1 text-center transition-colors hover:bg-white/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="flex w-[88px] flex-col items-center gap-1.5 text-center">
                    {inner}
                  </div>
                )}
                {i < VALUE_CHAIN.length - 1 ? (
                  <ArrowRight className="mx-1.5 mt-3.5 h-3.5 w-3.5 shrink-0 text-ink-400 sm:mx-2.5" />
                ) : null}
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border border-ink-200 bg-white/70 px-3 py-2.5">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">
            Distribusjon
          </span>
          {DISTRIBUTION_CHANNELS.map((channel) => (
            <span
              key={channel}
              className="rounded-full border border-ink-200 bg-white px-2 py-0.5 text-[11px] text-ink-700"
            >
              {channel}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Integration plugs ──────────────────────────────────────────────

const INTEGRATION_ICONS: Record<DemoBillingIntegration["key"], typeof Users> = {
  crm: Users,
  nett: Signal,
  bank: Landmark,
  erp: Calculator,
};

function IntegrationsPanel({
  integrations,
}: {
  integrations: DemoBillingIntegration[];
}): JSX.Element {
  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2
            className="font-serif text-lg font-medium tracking-tight text-ink-900"
          >
            Integrert i systemene deres
          </h2>
          <p className="font-mono text-[11.5px] text-ink-500">
            Plugger inn — ikke en ny silo
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {integrations.map((int) => {
            const Icon = INTEGRATION_ICONS[int.key];
            return (
              <div
                key={int.key}
                className="flex items-start gap-3 rounded-md bg-ink-50/70 px-3 py-3"
              >
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-accent-100 text-accent-700">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-medium text-ink-900">
                    {int.system}
                  </p>
                  <p className="text-[11px] leading-snug text-ink-500">
                    {int.detail}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Channel mix (main graph) ───────────────────────────────────────

// Autotrekk-kanalene i accent-/brand-blå (dominerer baren = bra for
// cash), de manuelle i nøytral grå + clay. Kun definerte palett-tokens.
const CHANNEL_COLORS: Record<string, string> = {
  AvtaleGiro: "bg-accent-500",
  eFaktura: "bg-accent-400",
  Vipps: "bg-accent-200",
  EHF: "bg-ink-300",
  "Print / papir": "bg-clay-100",
};

function ChannelMixPanel({
  channels,
  autotrekkPct,
  invoices,
  className,
}: {
  channels: Array<{ channel: string; pct: number; autodebit: boolean }>;
  autotrekkPct: number;
  invoices: number;
  className?: string;
}): JSX.Element {
  return (
    <Card className={className}>
      <CardContent className="space-y-5 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2
            className="font-serif text-lg font-medium tracking-tight text-ink-900"
          >
            Betaling per kanal
          </h2>
          <p className="font-mono text-[11.5px] text-ink-500">
            {invoices.toLocaleString("nb-NO")} fakturaer / syklus
          </p>
        </div>

        <div className="flex items-end gap-3">
          <p
            className="font-serif text-[44px] font-light leading-none tracking-tight text-ink-900"
          >
            {autotrekkPct} %
          </p>
          <p className="pb-1 text-[12px] leading-snug text-ink-600">
            på autotrekk
            <br />
            <span className="text-ink-500">AvtaleGiro · eFaktura · Vipps</span>
          </p>
        </div>

        <div className="flex h-3 w-full overflow-hidden rounded-full bg-ink-200">
          {channels.map((c) => (
            <div
              key={c.channel}
              className={cn("h-full", CHANNEL_COLORS[c.channel] ?? "bg-ink-200")}
              style={{ width: `${c.pct}%` }}
              title={`${c.channel} · ${c.pct} %`}
            />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          {channels.map((c) => (
            <div key={c.channel} className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "inline-block h-2 w-2 rounded-full",
                    CHANNEL_COLORS[c.channel] ?? "bg-ink-200",
                  )}
                />
                <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-500">
                  {c.channel}
                </p>
              </div>
              <p className="font-mono text-[13px] text-ink-900">
                {c.pct} %
                {c.autodebit ? (
                  <span className="ml-1.5 text-[10px] text-sage-700">
                    autotrekk
                  </span>
                ) : null}
              </p>
            </div>
          ))}
        </div>

        <p className="max-w-2xl border-t border-ink-200 pt-3 text-[11.5px] leading-snug text-ink-600">
          Jo flere kunder på autotrekk, jo færre havner i purreløp →{" "}
          <span className="font-medium text-ink-900">lavere DSO</span> →{" "}
          mindre factoring-behov. For en abonnementsbedrift er dette den
          sterkeste cash-spaken.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Headline metric (DSO) ──────────────────────────────────────────

function HeadlineMetric({
  dso,
  trend,
  resolvedWithoutInkassoPct,
}: {
  dso: number;
  trend: number;
  resolvedWithoutInkassoPct: number;
}): JSX.Element {
  const improved = trend < 0;
  return (
    <Card>
      <CardContent className="flex h-full flex-col gap-3 py-5">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Snitt dager til betaling</p>
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sage-50 text-sage-700">
            <TrendingDown className="h-3.5 w-3.5" />
          </span>
        </div>
        <p
          className="font-serif text-[40px] font-light leading-none tracking-tight text-ink-900"
        >
          {dso}{" "}
          <span className="font-sans text-base font-normal text-ink-500">
            dager
          </span>
        </p>
        {improved ? (
          <p className="text-[11.5px] font-medium text-sage-700">
            ↓ {Math.abs(trend)} dager kortere enn for tre sykluser siden
          </p>
        ) : null}
        <p className="text-[11.5px] leading-snug text-ink-500">
          Raskere innbetaling = mindre bundet i factoring.
        </p>
        <p className="mt-auto border-t border-ink-200 pt-3 text-[11.5px] text-ink-600">
          <span className="font-medium text-ink-900">
            {resolvedWithoutInkassoPct} %
          </span>{" "}
          av løste saker er betalt før inkasso påløp.
        </p>
      </CardContent>
    </Card>
  );
}
