"use client";

/**
 * Demo — debtors view. Aggregates the demo case fixtures by phone
 * number so each row is one debtor with their open claim count +
 * total outstanding. Click a debtor to expand to their case list.
 */

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Card, CardContent } from "../../../components/ui/card";
import { type CaseListItem } from "../../../lib/api";
import { demoListCases } from "../../../lib/demo-fixtures";
import { demoStatusTone, tState } from "../../../lib/demo-i18n";

interface DebtorRow {
  key: string;
  name: string;
  phone: string;
  cases: CaseListItem[];
  totalOutstanding: number;
  openCount: number;
  resolvedCount: number;
  needsAttention: boolean;
}

export default function DemoDebtorsPage(): JSX.Element {
  const data = useMemo(() => demoListCases(), []);
  const debtors = useMemo(() => aggregateByDebtor(data.items), [data.items]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return debtors;
    return debtors.filter((d) => {
      const haystack = `${d.name} ${d.phone}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [debtors, query]);

  function toggle(key: string): void {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Skyldnere</p>
        <h1
          className="font-serif text-3xl font-light tracking-tight text-ink-900"
          style={{ fontVariationSettings: "'opsz' 60, 'SOFT' 80" }}
        >
          {debtors.length} unike skyldnere
        </h1>
        <p className="max-w-2xl text-sm text-ink-600">
          Skyldnerne i porteføljen din, gruppert etter mobilnummer. Klikk
          for å se kravene knyttet til hver skyldner.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Søk navn eller telefon…"
            className="w-72 rounded-md border border-ink-200 bg-paper-50 py-1.5 pl-7 pr-3 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
          />
        </div>
        <p className="ml-auto font-mono text-[11.5px] text-ink-500">
          {filtered.length} / {debtors.length}
        </p>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-ink-500">
            Ingen skyldnere matcher søket.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-paper-50">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-left font-mono text-[11px] uppercase tracking-[0.14em] text-ink-500">
              <tr>
                <th className="px-4 py-2 w-6"></th>
                <th className="px-4 py-2">Skyldner</th>
                <th className="px-4 py-2">Telefon</th>
                <th className="px-4 py-2 text-right">Åpne krav</th>
                <th className="px-4 py-2 text-right">Løst</th>
                <th className="px-4 py-2 text-right">Utestående</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const isOpen = open.has(d.key);
                return (
                  <Fragment key={d.key}>
                    <tr
                      className={`cursor-pointer border-t border-ink-100 ${
                        d.needsAttention ? "bg-amber-50/30" : ""
                      } hover:bg-ink-50/60`}
                      onClick={() => toggle(d.key)}
                    >
                      <td className="px-4 py-2.5 text-ink-500">
                        {isOpen ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-ink-900">{d.name}</td>
                      <td className="px-4 py-2.5 font-mono text-[12px] text-ink-700">
                        {d.phone}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[12.5px] text-ink-900">
                        {d.openCount}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[12.5px] text-ink-600">
                        {d.resolvedCount}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[12.5px] text-ink-900">
                        {formatKr(d.totalOutstanding)}
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr key={`${d.key}-detail`} className="bg-ink-50/50">
                        <td colSpan={6} className="px-6 py-3">
                          <ul className="space-y-1">
                            {d.cases.map((c) => (
                              <li key={c.id}>
                                <Link
                                  href={`/demo/saker/${c.id}`}
                                  className="flex items-baseline justify-between gap-3 rounded px-2 py-1 hover:bg-ink-100"
                                >
                                  <div className="flex items-baseline gap-3">
                                    <span className="font-mono text-[11.5px] text-ink-500">
                                      {c.invoice_reference}
                                    </span>
                                    <Badge tone={demoStatusTone(c.state)}>
                                      {tState(c.state)}
                                    </Badge>
                                  </div>
                                  <span className="font-mono text-[12.5px] text-ink-900">
                                    {c.amount ? formatKr(Number(c.amount)) : "—"}
                                  </span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function aggregateByDebtor(items: CaseListItem[]): DebtorRow[] {
  const map = new Map<string, DebtorRow>();
  for (const c of items) {
    const key = c.debtor_phone ?? c.id;
    let row = map.get(key);
    if (!row) {
      row = {
        key,
        name: c.debtor_name ?? "Ukjent",
        phone: c.debtor_phone ?? "—",
        cases: [],
        totalOutstanding: 0,
        openCount: 0,
        resolvedCount: 0,
        needsAttention: false,
      };
      map.set(key, row);
    }
    row.cases.push(c);
    if (c.state === "closed") {
      row.resolvedCount += 1;
    } else {
      row.openCount += 1;
      const amount = c.amount ? Number(c.amount) : 0;
      if (Number.isFinite(amount)) row.totalOutstanding += amount;
    }
    if (
      c.state === "escalated" ||
      c.state === "failed" ||
      c.state === "needs_review"
    ) {
      row.needsAttention = true;
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => b.totalOutstanding - a.totalOutstanding,
  );
}

const NB_NUM_FMT = new Intl.NumberFormat("nb-NO", {
  maximumFractionDigits: 0,
});

function formatKr(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  return `kr ${NB_NUM_FMT.format(Math.round(amount))}`;
}
