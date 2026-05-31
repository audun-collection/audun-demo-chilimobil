# solvva-website-blue

Solvva marketing demo. A self-contained Next.js app that serves a
walk-through of the creditor portal — portfolio dashboard, claims
list, debtors view, and per-claim conversation timeline — against
static fixture data. No backend. No database. No auth.

Designed to ship at `solvva.no/demo`.

## Pages

| Route | Norwegian label | Purpose |
|---|---|---|
| `/demo` | Portefølje | Greeting, KPI tiles, aging exposure bar, status distribution, attention + recent activity panels |
| `/demo/saker` | Saker | Filterable + searchable claims table |
| `/demo/saker/[id]` | Sak detalj | Workbench-style case view: stage stepper, conversation timeline, status cards, action banners |
| `/demo/skyldnere` | Skyldnere | Debtors grouped by phone; expandable to their claims |

## Run locally

```bash
pnpm install
pnpm dev
# → http://localhost:3000/demo
```

## Build

```bash
pnpm build
pnpm start
```

## Deploy to Vercel

1. Import this repo at vercel.com
2. Framework preset auto-detects Next.js
3. **No env vars required** — the demo mode is hard-coded
4. Add `solvva.no` (or any subdomain) under Domains
5. Push to `main`

## Update the fixtures

All dummy data lives in `src/lib/demo-fixtures.ts`. Cases, debtors,
SMS bodies, audit events are inline arrays — edit and the demo
updates on the next build.

Norwegian copy lives in `src/lib/demo-i18n.ts`.
