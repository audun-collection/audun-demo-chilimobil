"use client";

import Link from "next/link";

/**
 * Marketing-demo header. Pill nav across the top with the
 * customer-facing tabs (Oversikt / Fakturering / Portefølje / Saker /
 * Skyldnere).
 * All operator chrome from the production app is intentionally absent
 * — this repo only serves /demo/*.
 */
export function Header(): JSX.Element {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-6 pt-5">
      <div className="nav-pill pointer-events-auto flex w-full max-w-6xl items-center justify-between gap-8 rounded-full py-2.5 pl-5 pr-3.5">
        <div className="flex items-center gap-8">
          <Link href="/demo" className="flex items-center gap-2.5 text-ink-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/solvva-logo.svg" alt="" width={22} height={22} />
            <span className="wordmark">Solvva</span>
          </Link>
          <nav className="flex items-center gap-0.5 text-sm">
            <NavLink href="/demo">Oversikt</NavLink>
            <NavLink href="/demo/fakturering">Fakturering</NavLink>
            <NavLink href="/demo/portefolje">Portefølje</NavLink>
            <NavLink href="/demo/saker">Saker</NavLink>
            <NavLink href="/demo/skyldnere">Skyldnere</NavLink>
          </nav>
        </div>
        <span className="rounded-full border border-ink-300/40 bg-ink-200/45 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-500">
          Demo
        </span>
      </div>
    </header>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <Link
      href={href}
      className="glass-hover rounded-full border border-transparent px-4 py-1.5 text-ink-600 hover:text-ink-900"
    >
      {children}
    </Link>
  );
}
