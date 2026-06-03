"use client";

/**
 * Demo — Besparelse. Two summary cards on top: annual pre-tax result
 * effect (shown as % EBITDA-uplift) + one-time cash release
 * (working-capital ΔNWC from lower DSO). The detail table below sums to
 * the exact same annual total. A side-by-side "Med Svea (i dag)" vs
 * "Med Audun" comparison table below as the detail basis.
 *
 * Only hard, verifiable lines: provisjon, forsinkelsesrente, purregebyr,
 * høyere innhentingsrate, lavere finanskostnad. Everything is computed
 * live from the assumptions panel so Caroline can plug in ChiliMobil's
 * real numbers. Figures are illustrative; Svea's actual rates are
 * negotiated individually (not public) and the recovery uplift is
 * conservative.
 */

import { useState } from "react";
import type { ChangeEvent } from "react";
import { Card, CardContent } from "../../../components/ui/card";
import { cn } from "../../../lib/cn";

const BRAND = "Audun";
const CREDITOR_NAME = "Chilimobil AS";

// Faste modellforutsetninger (ikke justerbare i panelet, men dokumentert).
const SNITT_DAGER_SVEA = 120; // snitt dager til betaling i dag
const SNITT_DAGER_AUDUN = 80; // innhentingstid med Audun (DSO 120 → 80)
const SNITTKRAV_KR = 3_600; // snittstørrelse per misligholdt krav
const PURREGEBYR_KR = 38; // kr per purring
const PURRINGER_PER_SAK = 3;

const DEFAULTS = {
  subscribers: 90_000,
  arpu: 222, // kr/mnd → 90 000 × 222 × 12 ≈ kr 240 mill/år (ChiliMobil 2024)
  defaultRate: 5, // % av omsetning som misligholdes
  sveaCommission: 8, // % provisjon av inndrevet (Svea)
  sveaRate: 80, // innhentingsrate Svea %
  audunRate: 85, // innhentingsrate Audun %
  lateInterest: 12, // forsinkelsesrente % p.a.
  lateFeeShare: 50, // Audun deler purregebyr, ChiliMobils andel %
  factoringRate: 9, // factoring-/finansieringsrente % p.a.
  ebitda: 3_800_000, // ChiliMobil 2024 EBITDA — for EBITDA-uplift %
};
type Assumptions = typeof DEFAULTS;

const NB0 = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });
function kr(n: number): string {
  return `kr ${NB0.format(Math.round(n))}`;
}
function krMill(n: number, decimals = 2): string {
  return `kr ${(n / 1_000_000).toLocaleString("nb-NO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} mill`;
}

export default function DemoBesparelsePage(): JSX.Element {
  const [a, setA] = useState<Assumptions>(DEFAULTS);

  // ── Ankertall ──────────────────────────────────────────────────
  const omsetning = a.subscribers * a.arpu * 12;
  const misligholdt = omsetning * (a.defaultRate / 100);
  const audunCollected = (a.audunRate / 100) * misligholdt;
  const sveaCollected = (a.sveaRate / 100) * misligholdt;
  const antallSaker = SNITTKRAV_KR > 0 ? misligholdt / SNITTKRAV_KR : 0;

  // ── KOSTNAD (penger Svea tar som Audun gir tilbake) ────────────
  const provisjonSpart = (a.sveaCommission / 100) * audunCollected;
  const renteBeholdt =
    audunCollected * (a.lateInterest / 100) * (SNITT_DAGER_SVEA / 365);
  const purregebyrTotal = antallSaker * PURRINGER_PER_SAK * PURREGEBYR_KR;
  const purregebyrDelt = purregebyrTotal * (a.lateFeeShare / 100);
  const kostnadSum = provisjonSpart + renteBeholdt + purregebyrDelt;

  // ── TOPPLINJE (mer penger inn) ─────────────────────────────────
  const ekstraInnhenting = ((a.audunRate - a.sveaRate) / 100) * misligholdt;

  // ── ARBEIDSKAPITAL ─────────────────────────────────────────────
  const frigjortAk =
    ((SNITT_DAGER_SVEA - SNITT_DAGER_AUDUN) / 365) * misligholdt; // engang
  const finanskostnadSpart = frigjortAk * (a.factoringRate / 100); // per år

  // ── Totaler (kun harde, årlige linjer — ingen LTV) ─────────────
  const samletAarlig = kostnadSum + ekstraInnhenting + finanskostnadSpart;
  const ebitdaSharePct = a.ebitda > 0 ? (samletAarlig / a.ebitda) * 100 : null;

  const set =
    (k: keyof Assumptions) =>
    (e: ChangeEvent<HTMLInputElement>): void =>
      setA((prev) => ({ ...prev, [k]: Number(e.target.value) || 0 }));

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="eyebrow">Besparelse · {CREDITOR_NAME}</p>
        <h1 className="max-w-3xl font-serif text-3xl font-light leading-tight tracking-tight text-ink-900">
          Svea i dag, eller {BRAND}?
        </h1>
        <p className="max-w-2xl text-sm text-ink-600">
          Samme mislighold — to utfall. Kun harde, etterprøvbare linjer. Tallene
          regnes live fra forutsetningene nederst.
        </p>
      </header>

      {/* ── Oppsummering (toppen) ─────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-accent-200 bg-accent-50/40">
          <CardContent className="space-y-1 py-6">
            <p className="eyebrow">Resultat før skatt — hvert år</p>
            <p className="font-serif text-[46px] font-light leading-none tracking-tight text-ink-900">
              ≈ {krMill(samletAarlig, 1)}
              <span className="ml-2 align-middle font-sans text-sm font-normal text-ink-500">
                / år
              </span>
            </p>
            {ebitdaSharePct !== null ? (
              <p className="font-mono text-[11px] text-sage-700">
                ≈{" "}
                {ebitdaSharePct.toLocaleString("nb-NO", {
                  maximumFractionDigits: 0,
                })}{" "}
                % av fjorårets EBITDA
              </p>
            ) : null}
            <p className="text-[12px] text-ink-600">
              Tilbakeført proveny, høyere innhenting og lavere finanskostnad.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 py-6">
            <p className="eyebrow">Frigjort arbeidskapital — én gang</p>
            <p className="font-serif text-[46px] font-light leading-none tracking-tight text-ink-800">
              ≈ {krMill(frigjortAk, 1)}
            </p>
            <p className="text-[12px] text-ink-600">
              Lavere DSO (~{SNITT_DAGER_SVEA}→{SNITT_DAGER_AUDUN} dager) frigjør
              bundet kapital (−ΔNWC).
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Sammenligningstabell (detaljgrunnlag) ─────────────────── */}
      <Card>
        <CardContent className="space-y-1 py-5">
          <HeaderRow />

          <Group title="Kostnad" subtitle="Penger Svea tar — som Audun gir tilbake">
            <Row
              label="Provisjon av inndrevet"
              note={`Svea ~${a.sveaCommission} % · ${BRAND} 0 %`}
              svea={kr(provisjonSpart)}
              audun="kr 0"
              fordel={provisjonSpart}
            />
            <Row
              label="Forsinkelsesrente"
              note={`Tilhører dere juridisk · Svea beholder · ${BRAND} gir tilbake`}
              svea="kr 0"
              audun={kr(renteBeholdt)}
              fordel={renteBeholdt}
            />
            <Row
              label="Purregebyr"
              note={`Svea beholder alt · ${BRAND} deler ${a.lateFeeShare}/${100 - a.lateFeeShare}`}
              svea="kr 0"
              audun={kr(purregebyrDelt)}
              fordel={purregebyrDelt}
            />
          </Group>

          <Group title="Topplinje" subtitle="Mer penger inn">
            <Row
              label="Høyere innhentingsrate"
              note={`${a.sveaRate} % → ${a.audunRate} % innhentet`}
              svea={kr(sveaCollected)}
              audun={kr(audunCollected)}
              fordel={ekstraInnhenting}
            />
          </Group>

          <Group title="Arbeidskapital" subtitle="Lavere finanskostnad — per år">
            <Row
              label="Lavere finansieringskostnad"
              note={`Mindre å factore til ${a.factoringRate} % · hvert år`}
              svea={kr(finanskostnadSpart)}
              audun="kr 0"
              fordel={finanskostnadSpart}
            />
          </Group>

          <TotalRow label="Samlet årlig effekt" amount={samletAarlig} />

          <Group title="Engangseffekt" subtitle="Frigjort kapital fra raskere innhenting — ikke i årlig sum">
            <Row
              label="Frigjort arbeidskapital"
              note={`~${SNITT_DAGER_SVEA} → ~${SNITT_DAGER_AUDUN} dager · cash løsner én gang`}
              svea={`~${SNITT_DAGER_SVEA} dager`}
              audun={`~${SNITT_DAGER_AUDUN} dager`}
              fordel={frigjortAk}
              oneTime
            />
          </Group>
        </CardContent>
      </Card>

      {/* ── Forutsetninger (driver alt live) ──────────────────────── */}
      <Card>
        <CardContent className="space-y-3 py-5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-600">
            Forutsetninger — juster og se at tallene følger
          </p>
          <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
            <Field label="Abonnenter" suffix="stk" value={a.subscribers} step={1000} onChange={set("subscribers")} />
            <Field label="ARPU" suffix="kr/mnd" value={a.arpu} onChange={set("arpu")} />
            <Field label="Andel mislighold" suffix="%" value={a.defaultRate} onChange={set("defaultRate")} />
            <Field label="Svea-provisjon" suffix="%" value={a.sveaCommission} onChange={set("sveaCommission")} />
            <Field label="Innhentingsrate Svea" suffix="%" value={a.sveaRate} onChange={set("sveaRate")} />
            <Field label={`Innhentingsrate ${BRAND}`} suffix="%" value={a.audunRate} onChange={set("audunRate")} />
            <Field label="Forsinkelsesrente" suffix="% p.a." value={a.lateInterest} onChange={set("lateInterest")} />
            <Field label="Purregebyr-andel" suffix="%" value={a.lateFeeShare} onChange={set("lateFeeShare")} />
            <Field label="Factoring-rente" suffix="% p.a." value={a.factoringRate} onChange={set("factoringRate")} />
            <Field label="EBITDA (årlig)" suffix="kr" value={a.ebitda} step={100_000} onChange={set("ebitda")} />
          </div>
          <p className="text-[10.5px] leading-snug text-ink-500">
            Omsetning ({krMill(omsetning, 0)}/år) = abonnenter × ARPU × 12;
            misligholdt volum ({krMill(misligholdt, 1)}/år) = omsetning × andel
            mislighold. Snittkrav ≈ {kr(SNITTKRAV_KR)}, snittdager{" "}
            {SNITT_DAGER_SVEA} → {SNITT_DAGER_AUDUN}. Omsetning ~240 mill og
            EBITDA 3,8 mill er ChiliMobils 2024-tall.
          </p>
        </CardContent>
      </Card>

      {/* ── Ærlighet ──────────────────────────────────────────────── */}
      <p className="max-w-3xl text-[11px] leading-relaxed text-ink-500">
        Omsetning og EBITDA er ChiliMobils 2024-tall; øvrige tall er
        illustrative og justerbare. Sveas faktiske satser forhandles
        individuelt og er ikke offentlige; innhentingsløftet er et konservativt
        estimat som bekreftes i pilot.
      </p>
    </div>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────

const GRID = "grid grid-cols-[1.5fr_1fr_1fr_1.1fr] items-baseline gap-x-3";

function HeaderRow(): JSX.Element {
  return (
    <div className={cn(GRID, "border-b border-ink-200 pb-2")}>
      <span />
      <span className="text-right font-mono text-[10px] uppercase tracking-[0.1em] text-ink-500">
        Med Svea (i dag)
      </span>
      <span className="text-right font-mono text-[10px] uppercase tracking-[0.1em] text-ink-700">
        Med Audun
      </span>
      <span className="text-right font-mono text-[10px] uppercase tracking-[0.1em] text-accent-700">
        Deres fordel
      </span>
    </div>
  );
}

function Group({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="pt-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pb-1">
        <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-700">
          {title}
        </p>
        <p className="text-[11px] text-ink-500">— {subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function Row({
  label,
  note,
  svea,
  audun,
  fordel,
  oneTime,
}: {
  label: string;
  note?: string;
  svea: string;
  audun: string;
  fordel: number;
  oneTime?: boolean;
}): JSX.Element {
  return (
    <div className={cn(GRID, "border-t border-ink-200/60 py-2.5")}>
      <div className="pr-2">
        <p className="text-[13px] text-ink-800">{label}</p>
        {note ? (
          <p className="mt-0.5 text-[11px] leading-snug text-ink-500">{note}</p>
        ) : null}
      </div>
      <p className="text-right font-mono text-[12px] tabular-nums text-ink-500">
        {svea}
      </p>
      <p className="text-right font-mono text-[12px] tabular-nums text-ink-800">
        {audun}
      </p>
      <p className="text-right font-mono text-[13px] font-semibold tabular-nums text-sage-700">
        {fordel >= 0 ? "+" : ""}
        {kr(fordel)}
        {oneTime ? (
          <span className="ml-1 font-sans text-[9px] font-normal uppercase tracking-wide text-ink-400">
            én gang
          </span>
        ) : null}
      </p>
    </div>
  );
}

function TotalRow({
  label,
  amount,
}: {
  label: string;
  amount: number;
}): JSX.Element {
  return (
    <div className={cn(GRID, "mt-2 border-t-2 border-ink-400 pt-3")}>
      <span className="text-[13px] font-semibold text-ink-900">{label}</span>
      <span />
      <span />
      <span className="text-right font-mono text-[15px] font-semibold tabular-nums text-ink-900">
        + {kr(amount)}
      </span>
    </div>
  );
}

function Field({
  label,
  suffix,
  value,
  onChange,
  step,
}: {
  label: string;
  suffix: string;
  value: number;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  step?: number;
}): JSX.Element {
  return (
    <label className="block">
      <span className="block font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-500">
        {label}
      </span>
      <span className="mt-1 flex items-baseline gap-1">
        <input
          type="number"
          value={value}
          step={step ?? 1}
          onChange={onChange}
          className="w-24 rounded border border-ink-300 bg-white px-1.5 py-1 font-serif text-[16px] leading-none text-ink-900 outline-none focus:border-accent-500 focus-visible:ring-1 focus-visible:ring-accent-500"
        />
        <span className="text-[10.5px] text-ink-500">{suffix}</span>
      </span>
    </label>
  );
}
