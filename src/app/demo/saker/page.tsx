"use client";

/**
 * Demo — claims list. Sortable table with debtor name, reference,
 * amount, due date, status. Filters by status group + free-text
 * search. Click a row to drill into `/demo/saker/[id]`.
 *
 * Honors `?filter=<key>` on first render so deep links from the
 * portfolio's KPI tiles (e.g. "Krever oppmerksomhet" → here)
 * pre-select the right pill.
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Card, CardContent } from "../../../components/ui/card";
import { type CaseListItem } from "../../../lib/api";
import { demoListCases } from "../../../lib/demo-fixtures";
import { demoStatusTone, tState } from "../../../lib/demo-i18n";

type FilterKey =
  | "all"
  | "active"
  | "needs_attention"
  | "in_dialogue"
  | "paused"
  | "resolved";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "Alle" },
  { key: "active", label: "Aktive" },
  { key: "needs_attention", label: "Krever oppmerksomhet" },
  { key: "in_dialogue", label: "I dialog" },
  { key: "paused", label: "Pauset" },
  { key: "resolved", label: "Løst" },
];

function isFilterKey(value: string | null): value is FilterKey {
  return (
    value === "all" ||
    value === "active" ||
    value === "needs_attention" ||
    value === "in_dialogue" ||
    value === "paused" ||
    value === "resolved"
  );
}

export default function DemoClaimsListPage(): JSX.Element {
  return (
    <Suspense fallback={<div className="h-32 animate-pulse rounded-lg bg-ink-50" />}>
      <Inner />
    </Suspense>
  );
}

function Inner(): JSX.Element {
  const data = useMemo(() => demoListCases(), []);
  const searchParams = useSearchParams();
  const initialFilter = useMemo<FilterKey>(() => {
    const raw = searchParams.get("filter");
    return isFilterKey(raw) ? raw : "all";
  }, [searchParams]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>(initialFilter);

  // Reflect URL changes (e.g. browser back/forward) without losing
  // the local search input.
  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  const filtered = useMemo(
    () => applyFilters(data.items, filter, query),
    [data.items, filter, query],
  );

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Saker</p>
        <h1
          className="font-serif text-3xl font-light tracking-tight text-ink-900"
          style={{ fontVariationSettings: "'opsz' 60, 'SOFT' 80" }}
        >
          Dine krav
        </h1>
        <p className="max-w-2xl text-sm text-ink-600">
          Skrivebeskyttet visning av alle innsendte krav. Solvva lager
          utkast, sender og følger opp automatisk — du ser hvert steg
          etter hvert som det skjer.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Søk skyldner, referanse…"
            className="w-72 rounded-md border border-ink-200 bg-paper-50 py-1.5 pl-7 pr-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={[
                "rounded-md border px-2.5 py-1 text-[12px] transition-colors",
                filter === f.key
                  ? "border-ink-900 bg-ink-900 text-ink-50"
                  : "border-ink-200 bg-paper-50 text-ink-700 hover:border-ink-300 hover:bg-ink-100",
              ].join(" ")}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="ml-auto font-mono text-[11.5px] text-ink-500">
          {filtered.length} / {data.items.length}
        </p>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-ink-500">
            Ingen krav matcher filteret.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-paper-50">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-left font-mono text-[11px] uppercase tracking-[0.14em] text-ink-500">
              <tr>
                <th className="px-4 py-2">Skyldner</th>
                <th className="px-4 py-2">Referanse</th>
                <th className="px-4 py-2 text-right">Beløp</th>
                <th className="px-4 py-2">Forfall</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-t border-ink-100 hover:bg-ink-50/60"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/demo/saker/${c.id}`}
                      className="block hover:underline"
                    >
                      <span className="text-ink-900">{c.debtor_name}</span>
                      <span className="ml-2 font-mono text-[10.5px] text-ink-500">
                        {c.debtor_phone}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-ink-700">
                    {c.invoice_reference}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-[12.5px] text-ink-900">
                    {c.amount ? formatKr(c.amount) : "—"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-ink-700">
                    {c.due_date ? formatDate(c.due_date) : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={demoStatusTone(c.state)}>{tState(c.state)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function applyFilters(
  items: CaseListItem[],
  filter: FilterKey,
  query: string,
): CaseListItem[] {
  const q = query.trim().toLowerCase();
  return items.filter((c) => {
    if (filter === "active" && (c.state === "closed" || c.state === "paused")) {
      return false;
    }
    if (filter === "paused" && c.state !== "paused") return false;
    if (filter === "resolved" && c.state !== "closed") return false;
    if (filter === "needs_attention") {
      // Mirrors the portfolio's "Krever oppmerksomhet" KPI — the
      // states the agent has stopped acting on and that need a
      // creditor decision.
      if (
        c.state !== "failed" &&
        c.state !== "escalated" &&
        c.state !== "needs_review" &&
        c.state !== "pending_legal_approval"
      ) {
        return false;
      }
    }
    if (filter === "in_dialogue") {
      // Heuristic: paused or escalated tends to follow inbound replies
      // in the fixtures — keeps the filter honest without needing
      // per-case event data on the list payload.
      if (c.state !== "paused" && c.state !== "escalated") return false;
    }
    if (q !== "") {
      const haystack = [
        c.debtor_name ?? "",
        c.debtor_phone ?? "",
        c.invoice_reference ?? "",
        c.state,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

const NB_NUM_FMT = new Intl.NumberFormat("nb-NO", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

function formatKr(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  return `kr ${NB_NUM_FMT.format(n)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}
