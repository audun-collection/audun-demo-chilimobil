# Overlevering – ChiliMobil-demo (solvva-demo-site)

*Skrevet 31. mai 2026. Kontekst for Claude Code / neste utvikler som tar over.*

## Hva dette er

En frittstående Next.js-app (ingen backend, statiske fixtures) som server en
creditor-portal-walkthrough på `solvva.no/demo`. Skal brukes i en **demo for
Caroline (CFO i Chilimobil AS)** denne uken. Vinkelen er **cash, ikke AI**:
ChiliMobil har anstrengt likviditet (likviditetsgrad 0,12, negativ EK,
factoring hos Svea), så alt knyttes til kontantstrøm og lavere
finansieringskostnad.

Full strategi/innhold ligger i hovedmappa `All Solvva/`:
- `07_chilimobil_demo_plan.md` – møte-/demoplan, run of show, innvendinger
- `09_demo_innholdspakke.md` – de 4 helt-sakene ordrett, dashboard-spec, faktura-ramme
- `10_demo_edits.md` – konkret endringsliste (status-tracker)

## Repo-situasjon

- **`solvva-demo-site-chilimobil/`** ← arbeidskopien (DENNE mappa). Alle endringer er her.
- **`solvva-demo-site-master/`** ← uendret original (Nordic Energy-versjonen), kun referanse.
- Ikke et git-klon med remote satt opp lokalt ennå — originalt repo: `github.com/solvva/solvva-demo-site`.

## Hva er gjort (verifisert ved å eksekvere data-logikken med Node, IKKE full build)

Alle endringer i `src/`:

1. **`src/lib/demo-fixtures.ts`** (omskrevet)
   - `CREDITOR_SLUG = "chilimobil"`, `CREDITOR_NAME = "Chilimobil AS"`
   - Fakturareferanser `NE-2026-*` → `CM-2026-*`; actor `creditor@nordic-energy` → `creditor@chilimobil`
   - SMS-maler skrevet om til ChiliMobil-tone (varm, folkelig, `chilimobil.no/betal`)
   - Beløp skalert til telekom-realistiske (199–899 kr på de fleste; større akkumulerte krav i rettslig spor)
   - Nytt `product`-felt per sak (Fri Data / Familie / Fri Tale / Fri+ / Student)
   - **De 4 helt-sakene** med fulle samtale-tidslinjer:
     - **Emma Lie** (Fri Data, 399) – glemsom god kunde → betalt, INGEN gebyr (state `closed`)
     - **Jonas Aas** (Familie, 649) – betalingsvansker → AI foreslår betalingsplan → **`plan_approved` av saksbehandler** → state `paused`
     - **Astrid Bø** (Fri Tale, 412) – sykmeldt → **`needs_review_flagged` (sårbar-flagg)** → automatikk pauset → `routed_to_agent` → state `needs_review`
     - **Kristian Solli** (Fri Tale, 549) – unngående → skånsom eskalering → inkassovarsel (state `sent`)
   - Nye event-typer lagt til i `KIND_BY_EVENT`/`ACTOR_BY_EVENT`: `plan_approved`, `payment_plan_active`, `routed_to_agent` (mapper til eksisterende gyldige actor/kind-verdier)
   - Ny eksport **`demoCashMetrics()`** + `DemoCashMetrics`-type: regner ekte cash-tall fra fixturene (hentet inn, løst uten inkasso %, snitt dager til betaling, sårbare håndtert, utestående)

2. **`src/app/demo/page.tsx`** (dashboard)
   - `CREDITOR_NAME` → `"Chilimobil AS"`
   - Ny **`CashImpactPanel`** øverst ("Likviditetseffekt"): Hentet inn / Lavere finansieringskostnad (est.) / Frigjort arbeidskapital (est.)
   - `StatsRow` byttet til CFO-tiles: Aktivt utestående, Løst uten inkasso %, Snitt dager til betaling, Sårbare flagget, Krever oppmerksomhet
   - Estimat-konstanter (ILLUSTRATIVE — byttes med Carolines tall):
     ```ts
     const FACTORING_RATE_ANNUAL = 0.09;        // antatt finansieringskostnad p.a.
     const DAYS_FASTER = 4;                       // antatt forbedring i dager-til-betaling
     const ASSUMED_AVG_OUTSTANDING_KR = 6_000_000; // representativt utestående
     ```

Nåværende dashboard-tall (ekte fra fixtures): Hentet inn kr 1 697 · Løst uten inkasso 50 % ·
Snitt 36 dager · Sårbare 1 · Utestående kr 18 981. Estimater: finanskostnad ≈ kr 71 014/år ·
frigjort AK ≈ kr 800 000.

## Hva GJENSTÅR (oppgaver for Claude Code)

1. **`pnpm install` → `pnpm typecheck` → `pnpm build`** og fiks evt. feil.
   - `page.tsx` er IKKE build-testet (kun statisk gjennomgått: alle imports brukt/gyldige, lucide-react 1.16.0 har alle ikonene). Mest sannsynlige feilkilde hvis noe smeller.
   - `tsconfig` har `noUnusedLocals`/`noUnusedParameters` = true — pass på ubrukte variabler.
2. **Kjør `pnpm dev`** og klikk gjennom hele flyten på `/demo`, særlig de 4 helt-sakene under `/demo/saker`.
3. **Les meldingstonen** i de 4 sakene én gang til — sitter den 100 %?
4. **Verifiser estimat-tallene** med Carolines faktiske utestående + factoring-rente (bytt de 3 konstantene i `page.tsx`).
5. **Logo + farge**: ChiliMobil-logo mangler (trenger fil). Fargevalg: anbefaling er å beholde Solvva-navy (jf. `10_demo_edits.md`). Lilla = `#7E4181` hvis ønsket.
6. **Deploy** til delbar URL (Vercel — se README) og test på staging kvelden før møtet.
7. **Faktura-beslutningskort** (kassekreditt + Fair/Logiq + Solvva inkasso) — eget dokument Caroline tar i styret, IKKE bygget ennå. Innhold ligger ferdig i `07`/`09`.

## Kjørekommandoer (på Mac)

```bash
cd "/Users/magnusnjolstadvonen/All Solvva/solvva-demo-site-chilimobil"
corepack enable        # aktiverer pnpm (følger med Node). Evt: npm install -g pnpm
pnpm install
pnpm typecheck         # fang kompileringsfeil først
pnpm dev               # → http://localhost:3000/demo
```

## Designbeslutninger tatt (kan reverseres)

- **Menneske-i-loop synliggjort** (ikke skjult): operatørgodkjenning (Jonas) og
  sårbar-flagg → saksbehandler (Astrid) vises eksplisitt i tidslinjen. Dette står
  litt i spenn med den opprinnelige "fullautomatisk"-fremstillingen i `demo-i18n.ts`
  — bevisst valg for å støtte "ekte AI-native byrå med mennesker"-budskapet.
- **Faktura** posisjonert som orkestrering: Solvva eier oppfølgingen fra faktura til
  løst sak; distribusjon via partner (Fair/Logiq) eller på sikt selv. Faktura vises
  som original-faktura på hver sak (`buildOriginalInvoice`).
- Beholdt Solvva-navy-palett (ikke byttet til ChiliMobil-lilla).
