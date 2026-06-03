/**
 * Dummy data for `NEXT_PUBLIC_DEMO_MODE=true`. When that flag is on,
 * `lib/api.ts`'s `listCases` / `getCase` / `getPortfolio` short-circuit
 * to the values produced here instead of fetching the backend, so the
 * existing `/portal`, `/portal/[id]`, and `/portfolio` pages render
 * with realistic content against zero infrastructure.
 *
 * Dates are recomputed relative to "now" at module load so the
 * portfolio always looks fresh.
 *
 * DEMO PROFILE: Chilimobil AS (telekom-MVNO). Krav er mobilabonnement
 * — små beløp (199–899 kr på de fleste), vektet mot 0–60 dager fordi
 * de fleste sakene løses tidlig og vennlig. Fire "helt-saker" (Emma,
 * Jonas, Astrid, Kristian) viser AI + menneske-i-loop: proaktiv
 * påminnelse, betalingsplan med operatørgodkjenning, sårbar-flagg som
 * ruter til saksbehandler, og skånsom eskalering.
 */

import type {
  AgenticTimelineActor,
  AgenticTimelineKind,
  AgenticTimelineResponse,
  AgenticTimelineStep,
  AuditEntry,
  CaseDetail,
  CaseListItem,
  CaseListResponse,
  CaseStageTransition,
  CreditorListResponse,
  DraftDetail,
  LedgerInvoice,
  LedgerLine,
  LedgerView,
} from "./api";
import {
  FORLIKSRAD_GEBYR_NOK,
  INKASSOVARSEL_GEBYR_NOK,
  PURREGEBYR_NOK,
  accruedInterestNok,
  inkassosalaerNok,
} from "./demo-rates";

const CREDITOR_SLUG = "chilimobil";
const CREDITOR_NAME = "Chilimobil AS";
const TENANT_ID = "33333333-3333-3333-3333-333333333333";

const NOW = Date.now();
const hoursAgo = (h: number): string => new Date(NOW - h * 3600 * 1000).toISOString();
const daysAgo = (d: number): string => hoursAgo(d * 24);
const dueIn = (d: number): string => {
  const dt = new Date(NOW + d * 24 * 3600 * 1000);
  return dt.toISOString().slice(0, 10);
};

interface DummyCase {
  id: string;
  invoice_reference: string;
  debtor_name: string;
  debtor_phone: string;
  product: string;
  amount: number;
  due_offset_days: number;
  state: string;
  dunning_stage: string | null;
  age_hours: number;
  debtor_email?: string | null;
  debtor_street?: string | null;
  debtor_postcode?: string | null;
  debtor_city?: string | null;
  conversation: Array<{
    h: number;
    actor: string;
    event_type: string;
    payload: Record<string, unknown>;
  }>;
  stages?: Array<{ stage: string; daysAgo: number; fee: number }>;
}

// Warm, folkelig ChiliMobil-tone — "Norges mest fornøyde kunder".
// Betaling skjer via chilimobil.no/betal (orkestrert av Audun).
const SMS_PURRING = (
  firstName: string,
  _ref: string,
  amount: number,
  due: string,
  product: string,
): string =>
  `Hei ${firstName}! Liten påminnelse: mobilregningen din hos ChiliMobil (${product}) på kr ${amount.toLocaleString(
    "nb-NO",
  )} forfalt ${due}. Du fikser den enkelt her: chilimobil.no/betal 🙌 Hilsen ChiliMobil`;

const SMS_INKASSO = (firstName: string, ref: string, amount: number): string =>
  `Hei ${firstName}. Faktura ${ref} på kr ${amount.toLocaleString(
    "nb-NO",
  )} er forfalt. Dette er et inkassovarsel – betal innen 14 dager for å unngå inkassosalær: chilimobil.no/betal. Ta kontakt hvis noe er uklart. Mvh Audun for ChiliMobil`;

const SMS_BETALING = (firstName: string, ref: string, amount: number): string =>
  `${firstName}, dette er en betalingsoppfordring på faktura ${ref} (kr ${amount.toLocaleString(
    "nb-NO",
  )}). Beløpet må betales nå for å unngå rettslig inkasso: chilimobil.no/betal. Mvh Audun`;

// All cases are owned by the same demo creditor (CHILIMOBIL AS).
// The conversation array carries the audit events the portal detail
// page will render; the timeline is sorted newest-first at render time.
const CASES: DummyCase[] = [
  // ═════════════════════════════════════════════════════════════════
  // PURRING (5) — first reminder stage. Holds the four hero cases.
  // ═════════════════════════════════════════════════════════════════

  // ── HELT-SAK A: Emma — den glemsomme gode kunden ──────────────────
  // Proaktiv heads-up før forfall + én vennlig nudge → betalt, INGEN
  // gebyr. Kunden beholdt og glad. (state: closed / ingen dunning-fee.)
  {
    id: "11111111-0000-0000-0000-000000000001",
    invoice_reference: "CM-2026-04812",
    debtor_name: "Emma Lie",
    debtor_phone: "+4748112233",
    debtor_email: "emma.lie@example.no",
    debtor_street: "Storgata 12",
    debtor_postcode: "0184",
    debtor_city: "Oslo",
    product: "Fri Data",
    amount: 399,
    due_offset_days: -6,
    state: "closed",
    dunning_stage: null,
    age_hours: 48,
    stages: [],
    conversation: [
      { h: 9 * 24, actor: "ingest@audun.ai", event_type: "case_ingested", payload: { invoice_reference: "CM-2026-04812", source_format: "csv", note: "Opprettet fra ChiliMobil-faktura (Fri Data)" } },
      { h: 8 * 24, actor: "agent@audun.ai", event_type: "sms_sent", payload: { to: "+4748112233", body: "Hei Emma! Liten påminnelse: mobilregningen din (Fri Data, kr 399) forfaller om to dager. Betal enkelt her: chilimobil.no/betal 🙌 Hilsen ChiliMobil" } },
      { h: 8 * 24 - 0.2, actor: "twilio-webhook", event_type: "sms_delivered", payload: {} },
      { h: 3 * 24, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: "Hei igjen Emma 🙂 Regningen på 399 kr har gått litt over forfall – skjer den beste! Du fikser den her: chilimobil.no/betal" } },
      { h: 3 * 24 - 2, actor: "twilio-inbound", event_type: "inbound_sms", payload: { from: "+4748112233", body: "Oi, helt glemt! Fikser det nå 🙏" } },
      { h: 3 * 24 - 2.5, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: "Helt supert, ingen stress! Si fra om du trenger noe. Ha en fin dag, Emma 🧡" } },
      { h: 48, actor: "agent@audun.ai", event_type: "case_closed", payload: { reason: "Betalt – løst uten gebyr", source: "agent" } },
    ],
  },

  // ── HELT-SAK B: Jonas — betalingsvansker → betalingsplan ──────────
  // AI foreslår en delt betalingsplan; en SAKSBEHANDLER godkjenner før
  // den sendes. Kunden beholdt OG pengene sikret. (state: paused.)
  {
    id: "11111111-0000-0000-0000-000000000002",
    invoice_reference: "CM-2026-04845",
    debtor_name: "Jonas Aas",
    debtor_phone: "+4748112255",
    debtor_email: "jonas.aas@example.no",
    product: "Familie",
    amount: 649,
    due_offset_days: -12,
    state: "paused",
    dunning_stage: "purring",
    age_hours: 96,
    stages: [],
    conversation: [
      { h: 12 * 24, actor: "ingest@audun.ai", event_type: "case_ingested", payload: { note: "Opprettet fra ChiliMobil-faktura (Familie)" } },
      { h: 7 * 24, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: SMS_PURRING("Jonas", "CM-2026-04845", 649, "19.05.2026", "Familie") } },
      { h: 5 * 24, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: "Hei Jonas! Vi ser at regningen på 649 kr (Familie) ikke er betalt ennå. Trenger du å ordne den på en annen måte? Svar gjerne her, så finner vi en løsning sammen. – ChiliMobil" } },
      { h: 5 * 24 - 3, actor: "twilio-inbound", event_type: "inbound_sms", payload: { from: "+4748112255", body: "Det har vært en tøff måned, får ikke betalt alt på en gang akkurat nå." } },
      { h: 5 * 24 - 5, actor: "agent@audun.ai", event_type: "draft_created", payload: { note: "AI foreslår betalingsplan: kr 325 nå + kr 324 om 14 dager", template_slug: "betalingsplan" } },
      { h: 5 * 24 - 6, actor: "creditor@chilimobil", event_type: "plan_approved", payload: { note: "Betalingsplan godkjent av saksbehandler før utsending", source: "creditor_portal" } },
      { h: 5 * 24 - 6.5, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: "Det skjønner vi godt, Jonas – takk for at du sier fra. Vil det hjelpe å dele beløpet i to: 325 kr nå og 324 kr om to uker? Da er du i rute og slipper gebyrer." } },
      { h: 5 * 24 - 20, actor: "twilio-inbound", event_type: "inbound_sms", payload: { from: "+4748112255", body: "Ja, det funker fint. Tusen takk." } },
      { h: 5 * 24 - 21, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: "Så bra! Da er planen satt 👍 Første del her: chilimobil.no/betal · Vi minner deg vennlig om del to. Ta vare på deg selv, Jonas." } },
      { h: 4 * 24, actor: "agent@audun.ai", event_type: "payment_plan_active", payload: { reason: "Betalingsplan aktiv – automatikk pauset til del to forfaller", source: "agent" } },
    ],
  },

  // ── HELT-SAK C: Astrid — sårbar debitor → sårbar-flagg ────────────
  // AI fanger nødsignal (sykmeldt), pauser ALL automatikk og gebyr-
  // eskalering, sender en mild holde-melding, og ruter saken til et
  // MENNESKE. Dette beskytter brandet/EPSI. (state: needs_review.)
  {
    id: "11111111-0000-0000-0000-000000000003",
    invoice_reference: "CM-2026-04777",
    debtor_name: "Astrid Bø",
    debtor_phone: "+4748114444",
    product: "Fri Tale",
    amount: 412,
    due_offset_days: -15,
    state: "needs_review",
    dunning_stage: "purring",
    age_hours: 60,
    stages: [],
    conversation: [
      { h: 15 * 24, actor: "ingest@audun.ai", event_type: "case_ingested", payload: { note: "Opprettet fra ChiliMobil-faktura (Fri Tale)" } },
      { h: 9 * 24, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: SMS_PURRING("Astrid", "CM-2026-04777", 412, "16.05.2026", "Fri Tale") } },
      { h: 5 * 24, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: "Hei igjen Astrid 🙂 Regningen på 412 kr har gått litt over forfall. Si gjerne fra om noe er uklart, så hjelper vi deg. chilimobil.no/betal" } },
      { h: 5 * 24 - 2, actor: "twilio-inbound", event_type: "inbound_sms", payload: { from: "+4748114444", body: "Jeg er sykmeldt og har regninger overalt om dagen, jeg orker nesten ikke å åpne posten lenger." } },
      { h: 5 * 24 - 2.1, actor: "rules-engine@audun.ai", event_type: "needs_review_flagged", payload: { reason: "Sårbarhetssignal oppdaget (sykdom / økonomisk belastning) → automatikk pauset", signal: "vulnerability" } },
      { h: 5 * 24 - 2.2, actor: "agent@audun.ai", event_type: "case_paused", payload: { reason: "Sårbar-flagg utløst – all automatikk og gebyr-eskalering stoppet", source: "rules_engine" } },
      { h: 5 * 24 - 2.5, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: "Takk for at du forteller, Astrid. Det viktigste nå er at du har det greit. Vi setter denne på vent og en av oss tar kontakt for å finne en løsning som passer for deg – helt uten ekstra kostnader. Du skal slippe å bekymre deg for dette." } },
      { h: 4 * 24, actor: "creditor@chilimobil", event_type: "routed_to_agent", payload: { note: "Rutet til menneskelig saksbehandler hos Audun for personlig oppfølging", source: "audun_ops" } },
    ],
  },

  // ── Vanlig purring: betalingsløfte mottatt ────────────────────────
  {
    id: "11111111-0000-0000-0000-000000000004",
    invoice_reference: "CM-2026-04861",
    debtor_name: "Ola Hansen",
    debtor_phone: "+4748112277",
    debtor_email: "ola.hansen@example.no",
    product: "Fri Data",
    amount: 329,
    due_offset_days: -9,
    state: "sent",
    dunning_stage: "purring",
    age_hours: 18,
    stages: [{ stage: "purring", daysAgo: 11, fee: PURREGEBYR_NOK }],
    conversation: [
      { h: 11 * 24, actor: "ingest@audun.ai", event_type: "case_ingested", payload: {} },
      { h: 18, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: SMS_PURRING("Ola", "CM-2026-04861", 329, "22.05.2026", "Fri Data") } },
      { h: 17.8, actor: "twilio-webhook", event_type: "sms_delivered", payload: {} },
      { h: 6, actor: "twilio-inbound", event_type: "inbound_sms", payload: { from: "+4748112277", body: "Skal betale i morgen, beklager forsinkelsen." } },
    ],
  },

  // ── Purring: SMS bounced — uten kontakt, krever oppmerksomhet ─────
  {
    id: "11111111-0000-0000-0000-000000000005",
    invoice_reference: "CM-2026-04790",
    debtor_name: "Maja Birkeland",
    debtor_phone: "+4748114422",
    product: "Student",
    amount: 249,
    due_offset_days: -20,
    state: "failed",
    dunning_stage: "purring",
    age_hours: 72,
    stages: [{ stage: "purring", daysAgo: 23, fee: PURREGEBYR_NOK }],
    conversation: [
      { h: 23 * 24, actor: "ingest@audun.ai", event_type: "case_ingested", payload: {} },
      { h: 72, actor: "agent@audun.ai", event_type: "sms_sent", payload: { to: "+4748114422", body: SMS_PURRING("Maja", "CM-2026-04790", 249, "11.05.2026", "Student") } },
      { h: 71.9, actor: "agent@audun.ai", event_type: "sms_failed", payload: { error_code: "30005", error_message: "Unknown destination handset", to: "+4748114422" } },
      { h: 71, actor: "agent@audun.ai", event_type: "case_escalated", payload: { reason: "Fikk ikke kontakt med kunde – krever gjennomgang." } },
    ],
  },

  // ═════════════════════════════════════════════════════════════════
  // INKASSOVARSEL (5) — second-stage notice
  // ═════════════════════════════════════════════════════════════════

  // ── HELT-SAK D: Kristian — unngående / gjentatt mislighold ────────
  // To vennlige påminnelser ubesvart → tonen strammes gradvis →
  // inkassovarsel, alt etter boka, men alltid med en enkel vei ut.
  {
    id: "11111111-0000-0000-0000-000000000006",
    invoice_reference: "CM-2026-04612",
    debtor_name: "Kristian Solli",
    debtor_phone: "+4748112288",
    product: "Fri Tale",
    amount: 549,
    due_offset_days: -28,
    state: "sent",
    dunning_stage: "inkassovarsel",
    age_hours: 72,
    stages: [
      { stage: "purring", daysAgo: 21, fee: PURREGEBYR_NOK },
      { stage: "inkassovarsel", daysAgo: 3, fee: INKASSOVARSEL_GEBYR_NOK },
    ],
    conversation: [
      { h: 28 * 24, actor: "ingest@audun.ai", event_type: "case_ingested", payload: {} },
      { h: 21 * 24, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: SMS_PURRING("Kristian", "CM-2026-04612", 549, "03.05.2026", "Fri Tale") } },
      { h: 14 * 24, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: "Hei Kristian 🙂 Vi har ikke hørt fra deg om regningen på 549 kr. Alt ok? Du fikser den enkelt her: chilimobil.no/betal" } },
      { h: 7 * 24, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: "Hei Kristian. Regningen på 549 kr er nå over forfall og vi har ikke hørt fra deg. Betal innen 3 dager for å unngå inkassovarsel og ekstra kostnader: chilimobil.no/betal" } },
      { h: 3 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "inkassovarsel" } },
      { h: 3 * 24 - 1, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: "Inkassovarsel: Utestående kr 549 (faktura CM-2026-04612). Betales innen 14 dager (jf. inkassoloven). Betaler du nå, stopper prosessen og du unngår salær: chilimobil.no/betal. Ta kontakt hvis noe er uklart." } },
      { h: 3 * 24 - 1.2, actor: "twilio-webhook", event_type: "sms_delivered", payload: {} },
    ],
  },
  {
    id: "11111111-0000-0000-0000-000000000007",
    invoice_reference: "CM-2026-04645",
    debtor_name: "Marit Eriksen",
    debtor_phone: "+4748112299",
    debtor_email: "m.eriksen@example.no",
    product: "Familie",
    amount: 749,
    due_offset_days: -35,
    state: "sent",
    dunning_stage: "inkassovarsel",
    age_hours: 24,
    stages: [
      { stage: "purring", daysAgo: 38, fee: PURREGEBYR_NOK },
      { stage: "inkassovarsel", daysAgo: 22, fee: INKASSOVARSEL_GEBYR_NOK },
    ],
    conversation: [
      { h: 38 * 24, actor: "ingest@audun.ai", event_type: "case_ingested", payload: {} },
      { h: 36 * 24, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: SMS_PURRING("Marit", "CM-2026-04645", 749, "26.04.2026", "Familie") } },
      { h: 22 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "inkassovarsel" } },
      { h: 24, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: SMS_INKASSO("Marit", "CM-2026-04645", 749) } },
      { h: 23.8, actor: "twilio-webhook", event_type: "sms_delivered", payload: {} },
    ],
  },
  {
    id: "11111111-0000-0000-0000-000000000008",
    invoice_reference: "CM-2026-04588",
    debtor_name: "Liv Pedersen",
    debtor_phone: "+4748113300",
    debtor_email: "liv.pedersen@example.no",
    product: "Fri+",
    amount: 899,
    due_offset_days: -39,
    state: "sent",
    dunning_stage: "inkassovarsel",
    age_hours: 30,
    stages: [
      { stage: "purring", daysAgo: 42, fee: PURREGEBYR_NOK },
      { stage: "inkassovarsel", daysAgo: 26, fee: INKASSOVARSEL_GEBYR_NOK },
    ],
    conversation: [
      { h: 42 * 24, actor: "ingest@audun.ai", event_type: "case_ingested", payload: {} },
      { h: 40 * 24, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: SMS_PURRING("Liv", "CM-2026-04588", 899, "22.04.2026", "Fri+") } },
      { h: 26 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "inkassovarsel" } },
      { h: 30, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: SMS_INKASSO("Liv", "CM-2026-04588", 899) } },
      { h: 29.8, actor: "twilio-webhook", event_type: "sms_delivered", payload: {} },
    ],
  },
  {
    id: "11111111-0000-0000-0000-000000000009",
    invoice_reference: "CM-2026-04620",
    debtor_name: "Trond Bakke",
    debtor_phone: "+4748112266",
    product: "Fri Data",
    amount: 449,
    due_offset_days: -42,
    state: "paused",
    dunning_stage: "inkassovarsel",
    age_hours: 24,
    stages: [
      { stage: "purring", daysAgo: 45, fee: PURREGEBYR_NOK },
      { stage: "inkassovarsel", daysAgo: 29, fee: INKASSOVARSEL_GEBYR_NOK },
    ],
    conversation: [
      { h: 45 * 24, actor: "ingest@audun.ai", event_type: "case_ingested", payload: {} },
      { h: 43 * 24, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: SMS_PURRING("Trond", "CM-2026-04620", 449, "19.04.2026", "Fri Data") } },
      { h: 29 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "inkassovarsel" } },
      { h: 48, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: SMS_INKASSO("Trond", "CM-2026-04620", 449) } },
      { h: 47.7, actor: "twilio-webhook", event_type: "sms_delivered", payload: {} },
      { h: 30, actor: "twilio-inbound", event_type: "inbound_sms", payload: { from: "+4748112266", body: "Hei, jeg er på reise denne uka. Kan jeg betale neste mandag?" } },
      { h: 24, actor: "creditor@chilimobil", event_type: "case_paused", payload: { reason: "Kunde i aktiv dialog – pauset til neste mandag", source: "creditor_portal" } },
    ],
  },
  {
    id: "11111111-0000-0000-0000-000000000010",
    invoice_reference: "CM-2026-04420",
    debtor_name: "Sara Engen",
    debtor_phone: "+4748113344",
    product: "Fri Tale",
    amount: 549,
    due_offset_days: -44,
    state: "escalated",
    dunning_stage: "inkassovarsel",
    age_hours: 60,
    stages: [
      { stage: "purring", daysAgo: 47, fee: PURREGEBYR_NOK },
      { stage: "inkassovarsel", daysAgo: 31, fee: INKASSOVARSEL_GEBYR_NOK },
    ],
    conversation: [
      { h: 47 * 24, actor: "ingest@audun.ai", event_type: "case_ingested", payload: {} },
      { h: 45 * 24, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: SMS_PURRING("Sara", "CM-2026-04420", 549, "17.04.2026", "Fri Tale") } },
      { h: 31 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "inkassovarsel" } },
      { h: 4 * 24, actor: "twilio-inbound", event_type: "inbound_sms", payload: { from: "+4748113344", body: "Dette beløpet stemmer ikke. Jeg sa opp abonnementet i mars." } },
      { h: 4 * 24 - 1, actor: "agent@audun.ai", event_type: "case_escalated", payload: { reason: "Innsigelse oppdaget – purringer stoppet i påvente av gjennomgang hos kreditor." } },
    ],
  },

  // ═════════════════════════════════════════════════════════════════
  // BETALINGSOPPFORDRING (5) — third-stage payment demand.
  // Akkumulerte krav (flere måneder + gebyrer) → noe større beløp.
  // ═════════════════════════════════════════════════════════════════
  {
    id: "11111111-0000-0000-0000-000000000011",
    invoice_reference: "CM-2026-04412",
    debtor_name: "Knut Strand",
    debtor_phone: "+4748113333",
    debtor_email: "knut.strand@example.no",
    product: "Familie",
    amount: 1297,
    due_offset_days: -68,
    state: "sent",
    dunning_stage: "betalingsoppfordring",
    age_hours: 12,
    stages: [
      { stage: "purring", daysAgo: 71, fee: PURREGEBYR_NOK },
      { stage: "inkassovarsel", daysAgo: 55, fee: INKASSOVARSEL_GEBYR_NOK },
      { stage: "betalingsoppfordring", daysAgo: 41, fee: inkassosalaerNok(1297) },
    ],
    conversation: [
      { h: 71 * 24, actor: "ingest@audun.ai", event_type: "case_ingested", payload: {} },
      { h: 69 * 24, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: SMS_PURRING("Knut", "CM-2026-04412", 1297, "24.03.2026", "Familie") } },
      { h: 55 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "inkassovarsel" } },
      { h: 55 * 24 - 1, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: SMS_INKASSO("Knut", "CM-2026-04412", 1297) } },
      { h: 41 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "betalingsoppfordring" } },
      { h: 12, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: SMS_BETALING("Knut", "CM-2026-04412", 1297) } },
      { h: 6, actor: "twilio-inbound", event_type: "inbound_sms", payload: { from: "+4748113333", body: "Jeg bestrider dette, har allerede betalt." } },
      { h: 5.9, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: "Hei Knut, takk for tilbakemelding. Vi finner ingen registrert betaling. Kan du sende kvittering til dokument@audun.no? Mvh Audun." } },
    ],
  },
  {
    id: "11111111-0000-0000-0000-000000000012",
    invoice_reference: "CM-2026-04490",
    debtor_name: "Hanne Foss",
    debtor_phone: "+4748113366",
    product: "Fri+",
    amount: 1798,
    due_offset_days: -71,
    state: "sent",
    dunning_stage: "betalingsoppfordring",
    age_hours: 30,
    stages: [
      { stage: "purring", daysAgo: 74, fee: PURREGEBYR_NOK },
      { stage: "inkassovarsel", daysAgo: 58, fee: INKASSOVARSEL_GEBYR_NOK },
      { stage: "betalingsoppfordring", daysAgo: 44, fee: inkassosalaerNok(1798) },
    ],
    conversation: [
      { h: 74 * 24, actor: "ingest@audun.ai", event_type: "case_ingested", payload: {} },
      { h: 72 * 24, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: SMS_PURRING("Hanne", "CM-2026-04490", 1798, "21.03.2026", "Fri+") } },
      { h: 58 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "inkassovarsel" } },
      { h: 44 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "betalingsoppfordring" } },
      { h: 30, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: SMS_BETALING("Hanne", "CM-2026-04490", 1798) } },
      { h: 29.8, actor: "twilio-webhook", event_type: "sms_delivered", payload: {} },
    ],
  },
  {
    id: "11111111-0000-0000-0000-000000000013",
    invoice_reference: "CM-2026-04388",
    debtor_name: "Petter Aas",
    debtor_phone: "+4748114477",
    product: "Fri Tale",
    amount: 1098,
    due_offset_days: -88,
    state: "sent",
    dunning_stage: "betalingsoppfordring",
    age_hours: 18,
    stages: [
      { stage: "purring", daysAgo: 91, fee: PURREGEBYR_NOK },
      { stage: "inkassovarsel", daysAgo: 75, fee: INKASSOVARSEL_GEBYR_NOK },
      { stage: "betalingsoppfordring", daysAgo: 61, fee: inkassosalaerNok(1098) },
    ],
    conversation: [
      { h: 91 * 24, actor: "ingest@audun.ai", event_type: "case_ingested", payload: {} },
      { h: 89 * 24, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: SMS_PURRING("Petter", "CM-2026-04388", 1098, "04.03.2026", "Fri Tale") } },
      { h: 75 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "inkassovarsel" } },
      { h: 61 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "betalingsoppfordring" } },
      { h: 18, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: SMS_BETALING("Petter", "CM-2026-04388", 1098) } },
      { h: 17.8, actor: "twilio-webhook", event_type: "sms_delivered", payload: {} },
    ],
  },
  {
    id: "11111111-0000-0000-0000-000000000014",
    invoice_reference: "CM-2026-04461",
    debtor_name: "Erik Sand",
    debtor_phone: "+4748113355",
    debtor_email: "erik.sand@example.no",
    product: "Fri Data",
    amount: 798,
    due_offset_days: -82,
    state: "paused",
    dunning_stage: "betalingsoppfordring",
    age_hours: 72,
    stages: [
      { stage: "purring", daysAgo: 85, fee: PURREGEBYR_NOK },
      { stage: "inkassovarsel", daysAgo: 69, fee: INKASSOVARSEL_GEBYR_NOK },
      { stage: "betalingsoppfordring", daysAgo: 55, fee: inkassosalaerNok(798) },
    ],
    conversation: [
      { h: 85 * 24, actor: "ingest@audun.ai", event_type: "case_ingested", payload: {} },
      { h: 83 * 24, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: SMS_PURRING("Erik", "CM-2026-04461", 798, "10.03.2026", "Fri Data") } },
      { h: 69 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "inkassovarsel" } },
      { h: 55 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "betalingsoppfordring" } },
      { h: 72, actor: "creditor@chilimobil", event_type: "case_paused", payload: { reason: "Kunde innvilget 30 dagers utsettelse – bekreftet skriftlig", source: "creditor_portal" } },
    ],
  },
  {
    id: "11111111-0000-0000-0000-000000000015",
    invoice_reference: "CM-2026-04220",
    debtor_name: "Solveig Vik",
    debtor_phone: "+4748113388",
    debtor_email: "solveig.vik@example.no",
    product: "Familie",
    amount: 1298,
    due_offset_days: -78,
    state: "closed",
    dunning_stage: "betalingsoppfordring",
    age_hours: 240,
    stages: [
      { stage: "purring", daysAgo: 81, fee: PURREGEBYR_NOK },
      { stage: "inkassovarsel", daysAgo: 65, fee: INKASSOVARSEL_GEBYR_NOK },
      { stage: "betalingsoppfordring", daysAgo: 51, fee: inkassosalaerNok(1298) },
    ],
    conversation: [
      { h: 81 * 24, actor: "ingest@audun.ai", event_type: "case_ingested", payload: {} },
      { h: 79 * 24, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: SMS_PURRING("Solveig", "CM-2026-04220", 1298, "14.03.2026", "Familie") } },
      { h: 65 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "inkassovarsel" } },
      { h: 51 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "betalingsoppfordring" } },
      { h: 12 * 24, actor: "twilio-inbound", event_type: "inbound_sms", payload: { from: "+4748113388", body: "Beklager — har betalt nå, sjekk konto." } },
      { h: 240, actor: "creditor@chilimobil", event_type: "case_closed", payload: { reason: "Betaling bekreftet av kreditor – sak løst", source: "creditor_portal" } },
    ],
  },

  // ═════════════════════════════════════════════════════════════════
  // RETTSLIG INKASSO (5) — legal collection track
  // ═════════════════════════════════════════════════════════════════
  {
    id: "11111111-0000-0000-0000-000000000016",
    invoice_reference: "CM-2026-04212",
    debtor_name: "Geir Tveit",
    debtor_phone: "+4748113377",
    product: "Fri+",
    amount: 2396,
    due_offset_days: -102,
    state: "pending_legal_approval",
    dunning_stage: "rettslig_inkasso",
    age_hours: 36,
    stages: [
      { stage: "purring", daysAgo: 105, fee: PURREGEBYR_NOK },
      { stage: "inkassovarsel", daysAgo: 89, fee: INKASSOVARSEL_GEBYR_NOK },
      { stage: "betalingsoppfordring", daysAgo: 75, fee: inkassosalaerNok(2396) },
      { stage: "rettslig_inkasso", daysAgo: 45, fee: 0 },
    ],
    conversation: [
      { h: 105 * 24, actor: "ingest@audun.ai", event_type: "case_ingested", payload: {} },
      { h: 103 * 24, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: SMS_PURRING("Geir", "CM-2026-04212", 2396, "18.02.2026", "Fri+") } },
      { h: 89 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "inkassovarsel" } },
      { h: 75 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "betalingsoppfordring" } },
      { h: 45 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "rettslig_inkasso" } },
      { h: 36, actor: "agent@audun.ai", event_type: "pending_legal_approval", payload: { note: "Purreløp uttømt – avventer kreditors beslutning: forliksrådet vs. langtidsovervåkning." } },
    ],
  },
  {
    id: "11111111-0000-0000-0000-000000000017",
    invoice_reference: "CM-2026-04261",
    debtor_name: "Bjørn Dahl",
    debtor_phone: "+4748113399",
    product: "Familie",
    amount: 3290,
    due_offset_days: -118,
    state: "pending_legal_approval",
    dunning_stage: "rettslig_inkasso",
    age_hours: 18,
    stages: [
      { stage: "purring", daysAgo: 121, fee: PURREGEBYR_NOK },
      { stage: "inkassovarsel", daysAgo: 105, fee: INKASSOVARSEL_GEBYR_NOK },
      { stage: "betalingsoppfordring", daysAgo: 91, fee: inkassosalaerNok(3290) },
      { stage: "rettslig_inkasso", daysAgo: 61, fee: 0 },
    ],
    conversation: [
      { h: 121 * 24, actor: "ingest@audun.ai", event_type: "case_ingested", payload: {} },
      { h: 119 * 24, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: SMS_PURRING("Bjørn", "CM-2026-04261", 3290, "02.02.2026", "Familie") } },
      { h: 105 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "inkassovarsel" } },
      { h: 91 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "betalingsoppfordring" } },
      { h: 61 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "rettslig_inkasso" } },
      { h: 5 * 24, actor: "twilio-inbound", event_type: "inbound_sms", payload: { from: "+4748113399", body: "Jeg har ikke penger nå." } },
      { h: 18, actor: "agent@audun.ai", event_type: "pending_legal_approval", payload: { note: "Kunde oppgir manglende betalingsevne – avventer kreditors beslutning om rettslig steg." } },
    ],
  },
  {
    id: "11111111-0000-0000-0000-000000000018",
    invoice_reference: "CM-2026-04290",
    debtor_name: "Nora Lund",
    debtor_phone: "+4748114400",
    debtor_email: "nora.lund@example.no",
    product: "Fri Tale",
    amount: 1980,
    due_offset_days: -118,
    state: "sent_to_enforcement",
    dunning_stage: "rettslig_inkasso",
    age_hours: 96,
    stages: [
      { stage: "purring", daysAgo: 121, fee: PURREGEBYR_NOK },
      { stage: "inkassovarsel", daysAgo: 105, fee: INKASSOVARSEL_GEBYR_NOK },
      { stage: "betalingsoppfordring", daysAgo: 91, fee: inkassosalaerNok(1980) },
      { stage: "rettslig_inkasso", daysAgo: 60, fee: FORLIKSRAD_GEBYR_NOK },
    ],
    conversation: [
      { h: 121 * 24, actor: "ingest@audun.ai", event_type: "case_ingested", payload: {} },
      { h: 119 * 24, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: SMS_PURRING("Nora", "CM-2026-04290", 1980, "02.02.2026", "Fri Tale") } },
      { h: 105 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "inkassovarsel" } },
      { h: 91 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "betalingsoppfordring" } },
      { h: 60 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "rettslig_inkasso" } },
      { h: 45 * 24, actor: "creditor@chilimobil", event_type: "sent_to_forliksradet", payload: { note: "Kreditor godkjente eskalering til forliksrådet", source: "creditor_portal" } },
      { h: 14 * 24, actor: "system", event_type: "forliksradet_judgment", payload: { note: "Forliksrådet ga kreditor medhold – dom mottatt." } },
      { h: 96, actor: "system", event_type: "sent_to_enforcement", payload: { note: "Sak overført til namsmannen for tvangsinnkreving." } },
    ],
  },
  {
    id: "11111111-0000-0000-0000-000000000019",
    invoice_reference: "CM-2026-04112",
    debtor_name: "Henrik Moe",
    debtor_phone: "+4748114411",
    product: "Fri Data",
    amount: 1490,
    due_offset_days: -155,
    state: "long_term_monitoring",
    dunning_stage: "rettslig_inkasso",
    age_hours: 480,
    stages: [
      { stage: "purring", daysAgo: 158, fee: PURREGEBYR_NOK },
      { stage: "inkassovarsel", daysAgo: 142, fee: INKASSOVARSEL_GEBYR_NOK },
      { stage: "betalingsoppfordring", daysAgo: 128, fee: inkassosalaerNok(1490) },
      { stage: "rettslig_inkasso", daysAgo: 98, fee: 0 },
    ],
    conversation: [
      { h: 158 * 24, actor: "ingest@audun.ai", event_type: "case_ingested", payload: {} },
      { h: 156 * 24, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: SMS_PURRING("Henrik", "CM-2026-04112", 1490, "27.12.2025", "Fri Data") } },
      { h: 142 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "inkassovarsel" } },
      { h: 128 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "betalingsoppfordring" } },
      { h: 98 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "rettslig_inkasso" } },
      { h: 480, actor: "creditor@chilimobil", event_type: "placed_under_monitoring", payload: { reason: "Kreditor valgte langtidsovervåkning fremfor forliksrådet", source: "creditor_portal" } },
    ],
  },
  {
    id: "11111111-0000-0000-0000-000000000020",
    invoice_reference: "CM-2026-04085",
    debtor_name: "Joakim Hagen",
    debtor_phone: "+4748114455",
    product: "Fri+",
    amount: 2890,
    due_offset_days: -172,
    state: "closed",
    dunning_stage: "rettslig_inkasso",
    age_hours: 600,
    stages: [
      { stage: "purring", daysAgo: 175, fee: PURREGEBYR_NOK },
      { stage: "inkassovarsel", daysAgo: 159, fee: INKASSOVARSEL_GEBYR_NOK },
      { stage: "betalingsoppfordring", daysAgo: 145, fee: inkassosalaerNok(2890) },
      { stage: "rettslig_inkasso", daysAgo: 115, fee: 0 },
    ],
    conversation: [
      { h: 175 * 24, actor: "ingest@audun.ai", event_type: "case_ingested", payload: {} },
      { h: 173 * 24, actor: "agent@audun.ai", event_type: "sms_sent", payload: { body: SMS_PURRING("Joakim", "CM-2026-04085", 2890, "10.12.2025", "Fri+") } },
      { h: 159 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "inkassovarsel" } },
      { h: 145 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "betalingsoppfordring" } },
      { h: 115 * 24, actor: "agent@audun.ai", event_type: "stage_advanced", payload: { to_stage: "rettslig_inkasso" } },
      { h: 600, actor: "creditor@chilimobil", event_type: "case_withdrawn", payload: { reason: "Kunde slått konkurs – trekker saken", source: "creditor_portal" } },
    ],
  },
];

function toListItem(c: DummyCase): CaseListItem {
  return {
    id: c.id,
    creditor: CREDITOR_SLUG,
    creditor_display_name: CREDITOR_NAME,
    debtor_name: c.debtor_name,
    debtor_phone: c.debtor_phone,
    invoice_reference: c.invoice_reference,
    amount: c.amount.toFixed(2),
    currency: "NOK",
    due_date: dueIn(c.due_offset_days),
    state: c.state,
    source_format: "csv",
    source_file_id: null,
    created_at: hoursAgo(Math.max(c.age_hours, c.due_offset_days * -24 + 24)),
  };
}

function toAudit(c: DummyCase): AuditEntry[] {
  return c.conversation
    .map((e, idx) => ({
      id: `${c.id}-${idx}`,
      case_id: c.id,
      actor: e.actor,
      event_type: e.event_type,
      payload: e.payload,
      created_at: hoursAgo(e.h),
    }))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

/** Per-stage fee at real 2026 rates, so the stepper matches the
 *  Gebyrer breakdown on the balance card. The rettslig_inkasso court
 *  fee (Forliksrådet) is only *charged* once the Claim is actually
 *  filed — for a Claim still awaiting the creditor's decision it
 *  reports 0 here and shows up instead as the estimate on the
 *  decision card. */
function stageFeeNok(stage: string, principalNok: number, state: string): number {
  switch (stage) {
    case "purring":
      return PURREGEBYR_NOK;
    case "inkassovarsel":
      return INKASSOVARSEL_GEBYR_NOK;
    case "betalingsoppfordring":
      return inkassosalaerNok(principalNok);
    case "rettslig_inkasso":
      return state === "sent_to_enforcement" ? FORLIKSRAD_GEBYR_NOK : 0;
    default:
      return 0;
  }
}

function toStageTransitions(c: DummyCase): CaseStageTransition[] {
  return (c.stages ?? []).map((s) => ({
    stage: s.stage,
    fee_applied_nok: stageFeeNok(s.stage, c.amount, c.state).toFixed(2),
    policy_set_id: "no-b2c-subscription-v0",
    entered_at: daysAgo(s.daysAgo),
  }));
}

export const DEMO_TENANT_ID = TENANT_ID;
export const DEMO_CREDITOR_SLUG = CREDITOR_SLUG;
export const DEMO_CREDITOR_NAME = CREDITOR_NAME;

export function isDemoMode(): boolean {
  // This whole repo IS the demo — every API call short-circuits to
  // the fixtures below regardless of build env. Kept as a function
  // so the production-derived components that read it still
  // typecheck unchanged.
  return true;
}

/**
 * URL-slug → human creditor name.
 *
 *   chilimobil           → Chilimobil
 *   nordic_energy        → Nordic Energy
 *   nordic_energy_as     → Nordic Energy AS
 *
 * Two-letter trailing tokens (AS, AB, BV, …) get fully upper-cased
 * because those are Nordic company-form suffixes, not words.
 */
export function creditorNameFromSlug(slug: string): string {
  const tokens = slug.split("_").filter((t) => t.length > 0);
  return tokens
    .map((tok, i) => {
      if (i === tokens.length - 1 && tok.length === 2) return tok.toUpperCase();
      return tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Returns the same CaseListResponse as demoListCases but every row's
 * creditor + creditor_display_name are rebound to the supplied
 * override. Lets /demo/[creditor]/page.tsx tailor the dummy
 * portfolio to any prospect by URL.
 */
export function demoListCasesFor(
  overrideSlug: string,
  overrideDisplay: string,
): CaseListResponse {
  const base = demoListCases();
  return {
    ...base,
    items: base.items.map((it) => ({
      ...it,
      creditor: overrideSlug,
      creditor_display_name: overrideDisplay,
    })),
    facets: {
      ...base.facets,
      by_creditor: [{ creditor: overrideSlug, count: base.items.length }],
    },
  };
}

/**
 * Same as demoGetCase but rebinds creditor + creditor_display_name on
 * the returned case. Used by /demo/[creditor]/[id].
 */
export function demoGetCaseFor(
  id: string,
  overrideSlug: string,
  overrideDisplay: string,
): CaseDetail | null {
  const detail = demoGetCase(id);
  if (!detail) return null;
  return {
    ...detail,
    case: {
      ...detail.case,
      creditor: overrideSlug,
      creditor_display_name: overrideDisplay,
    },
  };
}

export function demoListCases(): CaseListResponse {
  const items = CASES.map(toListItem);
  // Newest activity first — mirrors the production sort.
  items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const by_status: Record<string, number> = {};
  for (const it of items) by_status[it.state] = (by_status[it.state] ?? 0) + 1;
  return {
    items,
    next_cursor: null,
    total_count: items.length,
    facets: {
      by_creditor: [{ creditor: CREDITOR_SLUG, count: items.length }],
      by_status: Object.entries(by_status)
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
      by_source: [{ source: "csv", count: items.length }],
    },
  };
}

// ── CFO cash-metrics ────────────────────────────────────────────────
// Avledet fra full saksdata (CASES) — derfor bor det her, ikke i
// dashboard-komponenten som bare ser CaseListItem. Alt under er REELT
// regnet fra fixturene; factoring-/likviditetsestimatet i dashbordet
// bygger oppå `outstandingKr` med antakelser som byttes mot Carolines
// faktiske tall (utestående + factoring-rente) i discovery.
export interface DemoCashMetrics {
  recoveredKr: number; // hentet inn (faktisk betalte saker, ekskl. konkurs/avskrevet)
  resolvedCount: number; // antall løste saker (betalt)
  resolvedWithoutInkasso: number; // betalt før inkassovarsel påløp
  resolvedWithoutInkassoPct: number; // andel av betalte saker løst tidlig
  avgDaysToPay: number; // snitt dager fra forfall til betaling (DSO-proxy)
  vulnerableHandled: number; // sårbar-flagg fanget og rutet til menneske
  outstandingKr: number; // aktivt utestående hovedstol
}

export function demoCashMetrics(): DemoCashMetrics {
  let recoveredKr = 0;
  let resolvedCount = 0;
  let resolvedWithoutInkasso = 0;
  let outstandingKr = 0;
  let vulnerableHandled = 0;
  const daysToPay: number[] = [];

  for (const c of CASES) {
    const paid = c.conversation.some(
      (e) =>
        e.event_type === "case_closed" &&
        typeof e.payload.reason === "string" &&
        /betal/i.test(e.payload.reason),
    );
    const reachedInkasso = (c.stages ?? []).some(
      (s) => s.stage !== "purring",
    );
    const isVulnerable = c.conversation.some(
      (e) => e.event_type === "needs_review_flagged",
    );
    if (isVulnerable) vulnerableHandled += 1;

    if (paid) {
      recoveredKr += c.amount;
      resolvedCount += 1;
      if (!reachedInkasso) resolvedWithoutInkasso += 1;
      // Dager fra forfall til betaling: forfall = NOW + due_offset_days,
      // betaling = NOW - closeEvent.h. dager = -close_h/24 - due_offset.
      const closeEvent = c.conversation.find(
        (e) => e.event_type === "case_closed",
      );
      if (closeEvent) {
        const d = -(closeEvent.h / 24) - c.due_offset_days;
        if (Number.isFinite(d) && d >= 0) daysToPay.push(d);
      }
    } else if (c.state !== "closed") {
      outstandingKr += c.amount;
    }
  }

  const avgDaysToPay =
    daysToPay.length > 0
      ? Math.round(daysToPay.reduce((s, d) => s + d, 0) / daysToPay.length)
      : 0;
  const resolvedWithoutInkassoPct =
    resolvedCount > 0
      ? Math.round((resolvedWithoutInkasso / resolvedCount) * 100)
      : 0;

  return {
    recoveredKr,
    resolvedCount,
    resolvedWithoutInkasso,
    resolvedWithoutInkassoPct,
    avgDaysToPay,
    vulnerableHandled,
    outstandingKr,
  };
}

// ── Verdikjede-/billing-oversikt (overordnet landingsside) ──────────
// Tallene for "Audun eier hele løpet"-oversikten på /demo. I denne
// demoen fremstiller vi Audun som eier av HELE faktureringen selv
// (ikke via partner) — fra abonnement til innkrevd. En MVNO som
// ChiliMobil kjører titusenvis av små abonnementsfakturaer per syklus;
// kanal-miksen + autotrekk-andelen er den sterkeste cash-spaken
// (mer autotrekk → færre purreløp → lavere DSO → mindre factoring-
// behov). Alt under er ILLUSTRATIVT og byttes med ChiliMobils egne tall
// i discovery, akkurat som factoring-estimatene på dashbordet.
export interface DemoBillingChannel {
  channel: string;
  pct: number;
  /** Autotrekk: AvtaleGiro / eFaktura m/autobetaling / Vipps faste betalinger. */
  autodebit: boolean;
}
export interface DemoBillingIntegration {
  key: "crm" | "nett" | "bank" | "erp";
  system: string;
  detail: string;
}
export interface DemoBillingOverview {
  /** Illustrativt: fakturaer i inneværende faktureringssyklus. */
  invoicesThisCycle: number;
  /** Andel av fakturaer per betalingskanal (%). Summerer til 100. */
  channelMix: DemoBillingChannel[];
  /** Sum av autotrekk-kanalene (avledet fra channelMix). */
  autotrekkPct: number;
  /** Illustrativ DSO — snitt dager til betaling for hele abonnentbasen. */
  dsoDays: number;
  /** Endring i DSO siste tre sykluser (negativ = forbedring). */
  dsoTrendDays: number;
  /** Systemene Audun plugger inn i hos ChiliMobil. */
  integrations: DemoBillingIntegration[];
}

export function demoBillingOverview(): DemoBillingOverview {
  const channelMix: DemoBillingChannel[] = [
    { channel: "AvtaleGiro", pct: 39, autodebit: true },
    { channel: "eFaktura", pct: 22, autodebit: true },
    { channel: "Vipps", pct: 11, autodebit: true },
    { channel: "EHF", pct: 7, autodebit: false },
    { channel: "Print / papir", pct: 21, autodebit: false },
  ];
  const autotrekkPct = channelMix
    .filter((c) => c.autodebit)
    .reduce((s, c) => s + c.pct, 0);
  return {
    invoicesThisCycle: 18_400,
    channelMix,
    autotrekkPct,
    dsoDays: 21,
    dsoTrendDays: -6,
    integrations: [
      { key: "crm", system: "CRM / abonnement", detail: "Kunde- og abonnementsdata" },
      { key: "nett", system: "Telia / nett", detail: "Sperre og åpne abonnement" },
      { key: "bank", system: "Bank", detail: "AvtaleGiro og avstemming" },
      { key: "erp", system: "Regnskap / ERP", detail: "Hovedbok og bilag" },
    ],
  };
}

// ── Fakturakjøring (billing run) — /demo/fakturering ────────────────
// Speiler hvordan en MVNO faktisk fakturerer: én kjøring sveiper ALLE
// abonnement (ikke én faktura av gangen). AI lager utkast + fanger
// avvik, et menneske godkjenner unntakene, resten distribueres
// automatisk — vi påstår ikke uovervåket full autonomi. Tallene er
// ILLUSTRATIVE, men konsistente med demoBillingOverview() (18 400
// abonnement, kanal-miks, 72 % autotrekk, DSO 21).
export type BillingExceptionCategory =
  | "cancelled"
  | "high_amount"
  | "proration"
  | "missing_usage";

export interface BillingException {
  id: string;
  category: BillingExceptionCategory;
  categoryLabel: string;
  customer: string;
  reference: string;
  plan: string;
  amount: number;
  note: string;
  recommendation: string;
  recommendedDecision: "approve" | "reject";
}

export interface BillingDistributionLine {
  channel: string;
  pct: number;
  count: number;
  autodebit: boolean;
  note: string;
}

export interface BillingFlowItem {
  label: string;
  detail: string;
}

// Mottak-steget: et konkret utdrag av fila/feeden Audun mottar fra
// ChiliMobil. Kolonnene speiler de tre tingene vi MÅ ha inn før vi kan
// fakturere: beløp (hva), abonnement+status (hvem), AvtaleGiro+KID (hvordan).
export interface BillingIntakeRow {
  customer: string;
  plan: string;
  status: "aktiv" | "sperret" | "oppsagt";
  baseAmount: number | null; // fast avgift
  extraAmount: number | null; // overforbruk/roaming
  extraLabel: string | null; // "data" / "roam"
  paymentMethod: string | null;
  kid: string | null;
  billed: boolean;
}

export interface BillingInvoiceLine {
  label: string;
  amount: number;
}

export interface BillingSampleInvoice {
  customer: string;
  plan: string;
  reference: string;
  lines: BillingInvoiceLine[]; // eks. MVA
  vatPct: number;
  vatAmount: number;
  total: number;
  dueDays: number;
  paymentMethod: string;
  kid: string;
}

export interface PaymentFunnelStep {
  key: string;
  label: string;
  pct: number;
  note: string;
  tone: "paid" | "reminder" | "notice" | "inkasso";
}

export interface DemoBillingRun {
  cycleLabel: string;
  activeSubscriptions: number; // 18 400
  prorations: number; // proratering: nye/oppsagte midt i syklus
  blockedExcluded: number; // sperrede abonnement ekskludert
  vatPct: number; // MVA
  dueDays: number; // forfallsfrist
  reviewedDrafts: number; // utkast AI gjennomgikk
  autoFixedCount: number; // avvik AI fikset selv
  autoFixedNote: string;
  flaggedCount: number; // til menneskelig godkjenning
  exceptions: BillingException[];
  sendCount: number; // aktive − flaggede
  distribution: BillingDistributionLine[]; // avledet fra kanal-miksen
  autotrekkPct: number;
  autotrekkCount: number;
  dsoDays: number;
  upstreamSteps: BillingFlowItem[]; // gjort av ChiliMobil før oss (nett→mediation→rating)
  receivedItems: BillingFlowItem[]; // det Audun mottar (steg 1 — Mottak)
  intakeRows: BillingIntakeRow[]; // konkret fil-/feed-utdrag i Mottak
  sampleInvoice: BillingSampleInvoice; // fakturaen Audun lager av Emmas rad
  industryLeakagePct: number; // bransjesnitt inntektslekkasje (TM Forum)
  paymentFunnel: PaymentFunnelStep[]; // sluttpanel — fra faktura til betalt
  resolvedBeforeInkassoPct: number; // betalt før inkasso (forfall + påminnelse)
  reachesInkassoPct: number; // andel som når et inkassoløp
}

const BILLING_CHANNEL_NOTES: Record<string, string> = {
  AvtaleGiro:
    "Autotrekk på forfall — ingen kundehandling. KID gir automatisk avstemming.",
  eFaktura:
    "Levert til nettbanken; kunden godkjenner — med mindre kombinert med AvtaleGiro. KID på alt.",
  Vipps:
    "Levert i Vipps-appen — kunden godkjenner, med mindre kombinert med AvtaleGiro.",
  EHF: "Peppol BIS Billing 3.0 til bedriftskunder.",
  "Print / papir": "Print og e-post til kunder uten digital kanal — KID for avstemming.",
};

function buildBillingExceptions(): BillingException[] {
  // 9 oppsagte abonnement som likevel ble fakturert → holdes tilbake.
  const cancelled = [
    { customer: "Mariann Holt", reference: "CM-2026-05133", plan: "Fri Data", amount: 399 },
    { customer: "Ola Nygård", reference: "CM-2026-05210", plan: "Familie", amount: 649 },
    { customer: "Ingrid Sæther", reference: "CM-2026-05288", plan: "Fri Tale", amount: 549 },
    { customer: "Sondre Aune", reference: "CM-2026-05301", plan: "Student", amount: 249 },
    { customer: "Kaja Ruud", reference: "CM-2026-05377", plan: "Fri Data", amount: 399 },
    { customer: "Vegard Holm", reference: "CM-2026-05402", plan: "Fri+", amount: 899 },
    { customer: "Linnea Berg", reference: "CM-2026-05455", plan: "Fri Tale", amount: 412 },
    { customer: "Markus Dahl", reference: "CM-2026-05478", plan: "Familie", amount: 649 },
    { customer: "Elise Nordby", reference: "CM-2026-05502", plan: "Fri Data", amount: 399 },
  ];
  // 5 uvanlig høye beløp (overforbruk/roaming) → verifiseres.
  const highAmount = [
    { customer: "Camilla Strøm", reference: "CM-2026-05140", plan: "Fri+", amount: 1240, reason: "Roaming utenfor EØS" },
    { customer: "Robert Vold", reference: "CM-2026-05199", plan: "Familie", amount: 1685, reason: "Overforbruk data" },
    { customer: "Nadia Karlsen", reference: "CM-2026-05244", plan: "Fri Tale", amount: 1120, reason: "Utenlandssamtaler" },
    { customer: "Pål Ingebrigtsen", reference: "CM-2026-05312", plan: "Fri+", amount: 1850, reason: "Roaming utenfor EØS" },
    { customer: "Tuva Eide", reference: "CM-2026-05390", plan: "Fri Data", amount: 1320, reason: "Ekstra datapakke" },
  ];
  // 4 prorateringsavvik — abonnement endret midt i syklus, proratering
  // avviker fra forventet → korrigeres.
  const proration = [
    { customer: "Yngve Solheim", reference: "CM-2026-05221", plan: "Familie", amount: 487 },
    { customer: "Hedda Lie", reference: "CM-2026-05266", plan: "Fri Data", amount: 213 },
    { customer: "Trygve Moen", reference: "CM-2026-05344", plan: "Fri+", amount: 612 },
    { customer: "Ada Berg", reference: "CM-2026-05411", plan: "Fri Tale", amount: 298 },
  ];
  // 2 med manglende forventet forbruk → mulig inntektslekkasje.
  const missingUsage = [
    { customer: "Sigrid Aas", reference: "CM-2026-05480", plan: "Fri+", amount: 899 },
    { customer: "Leif Karlsen", reference: "CM-2026-05519", plan: "Familie", amount: 649 },
  ];

  const out: BillingException[] = [];
  cancelled.forEach((r, i) =>
    out.push({
      id: `exc-c-${i}`,
      category: "cancelled",
      categoryLabel: "Oppsagt abonnement",
      customer: r.customer,
      reference: r.reference,
      plan: r.plan,
      amount: r.amount,
      note: `Sagt opp ${r.plan} forrige syklus — likevel fakturert`,
      recommendation: "Hold tilbake — abonnementet er avsluttet",
      recommendedDecision: "reject",
    }),
  );
  highAmount.forEach((r, i) =>
    out.push({
      id: `exc-h-${i}`,
      category: "high_amount",
      categoryLabel: "Uvanlig høyt beløp",
      customer: r.customer,
      reference: r.reference,
      plan: r.plan,
      amount: r.amount,
      note: `${r.reason} — kr ${r.amount.toLocaleString("nb-NO")} mot snitt kr 399`,
      recommendation: "Verifiser før utsending",
      recommendedDecision: "approve",
    }),
  );
  proration.forEach((r, i) =>
    out.push({
      id: `exc-p-${i}`,
      category: "proration",
      categoryLabel: "Prorateringsavvik",
      customer: r.customer,
      reference: r.reference,
      plan: r.plan,
      amount: r.amount,
      note: "Proratering avviker fra forventet — abonnement endret midt i syklus",
      recommendation: "Korriger proratering og send",
      recommendedDecision: "approve",
    }),
  );
  missingUsage.forEach((r, i) =>
    out.push({
      id: `exc-u-${i}`,
      category: "missing_usage",
      categoryLabel: "Mulig inntektslekkasje",
      customer: r.customer,
      reference: r.reference,
      plan: r.plan,
      amount: r.amount,
      note: "Mangler forventet forbruk denne syklusen — mulig inntektslekkasje",
      recommendation: "Verifiser før utsending — mulig tapt inntekt",
      recommendedDecision: "reject",
    }),
  );
  return out;
}

export function demoBillingRun(): DemoBillingRun {
  const overview = demoBillingOverview();
  const activeSubscriptions = overview.invoicesThisCycle; // 18 400
  const exceptions = buildBillingExceptions();
  const flaggedCount = exceptions.length; // 20
  const sendCount = activeSubscriptions - flaggedCount; // 18 380
  const prorations = 142;

  // Kanal-fordelingen avledes fra kanal-miksen på oversikten, så tallene
  // alltid henger sammen. Siste linje får resten, så summen blir nøyaktig
  // lik sendCount (unngår avrundingsavvik).
  let allocated = 0;
  const distribution: BillingDistributionLine[] = overview.channelMix.map(
    (c, i, arr) => {
      const count =
        i === arr.length - 1
          ? sendCount - allocated
          : Math.round((sendCount * c.pct) / 100);
      allocated += count;
      return {
        channel: c.channel,
        pct: c.pct,
        count,
        autodebit: c.autodebit,
        note: BILLING_CHANNEL_NOTES[c.channel] ?? "",
      };
    },
  );
  const autotrekkCount = distribution
    .filter((d) => d.autodebit)
    .reduce((s, d) => s + d.count, 0);

  const nb = (n: number): string => n.toLocaleString("nb-NO");

  // Gjort av ChiliMobil FØR oss — i deres egne systemer. Audun rører
  // verken nettet eller rating-motoren; vi tar over fra ferdig beløp.
  const upstreamSteps: BillingFlowItem[] = [
    { label: "Telia / nett", detail: "Logger forbruk (CDR-er)" },
    { label: "Mediation", detail: "Rydder og normaliserer forbruket" },
    {
      label: "Rating",
      detail: "Priser mot hver kundes abonnement → ferdig beløp per kunde",
    },
  ];

  // Det Audun MOTTAR ved overlevering (steg 1 — Mottak). Fil via SFTP
  // eller API. Vi synker ikke mediation/rating selv.
  const receivedItems: BillingFlowItem[] = [
    {
      label: "Ferdig-priset beløp per kunde",
      detail: "Fast avgift + evt. overforbruk/roaming",
    },
    {
      label: "Abonnementsstatus",
      detail: `Aktiv / sperret / oppsagt · ${nb(prorations)} endringer i syklusen`,
    },
    {
      label: "AvtaleGiro-mandat / KID",
      detail: `${nb(autotrekkCount)} på autotrekk — hvem som betaler automatisk`,
    },
  ];

  // Konkret utdrag av fila/feeden Audun mottar. Siste rad (oppsagt)
  // faktureres ikke — binder sammen med avvikssjekken senere.
  const intakeRows: BillingIntakeRow[] = [
    { customer: "Emma Lie", plan: "Fri Data", status: "aktiv", baseAmount: 399, extraAmount: 50, extraLabel: "data", paymentMethod: "AvtaleGiro", kid: "1004230526", billed: true },
    { customer: "Jonas Aas", plan: "Familie", status: "aktiv", baseAmount: 649, extraAmount: null, extraLabel: null, paymentMethod: "eFaktura", kid: "1005170526", billed: true },
    { customer: "Bjørn Dahl", plan: "Fri+", status: "aktiv", baseAmount: 899, extraAmount: 240, extraLabel: "roam", paymentMethod: "AvtaleGiro", kid: "1006440526", billed: true },
    { customer: "Lars Holm", plan: "Fri Tale", status: "oppsagt", baseAmount: null, extraAmount: null, extraLabel: null, paymentMethod: null, kid: null, billed: false },
  ];

  // Fakturaen Audun lager av Emmas rad — hovedstol + overforbruk, så MVA.
  const invoiceLines: BillingInvoiceLine[] = [
    { label: "Månedsavgift Fri Data", amount: 399 },
    { label: "Data utover inkludert", amount: 50 },
  ];
  const invoiceNet = invoiceLines.reduce((s, l) => s + l.amount, 0);
  const invoiceVat = Math.round(invoiceNet * 0.25 * 100) / 100;
  const sampleInvoice: BillingSampleInvoice = {
    customer: "Emma Lie",
    plan: "Fri Data",
    reference: "CM-2026-05101",
    lines: invoiceLines,
    vatPct: 25,
    vatAmount: invoiceVat,
    total: invoiceNet + invoiceVat,
    dueDays: 14,
    paymentMethod: "AvtaleGiro",
    kid: "1004230526",
  };

  // Sluttpanel — fra faktura til betalt. ILLUSTRATIVE andeler per syklus.
  const paymentFunnel: PaymentFunnelStep[] = [
    { key: "forfall", label: "Betalt på forfall", pct: 78, note: "De fleste automatisk via AvtaleGiro — ingen purring", tone: "paid" },
    { key: "paaminnelse", label: "Betalt etter vennlig påminnelse", pct: 16, note: "Før purregebyr/salær", tone: "reminder" },
    { key: "inkassovarsel", label: "Betalt etter inkassovarsel", pct: 4, note: "Siste steg før salær", tone: "notice" },
    { key: "inkasso", label: "Til inkasso / rettslig", pct: 2, note: "Det dyre løpet — få saker", tone: "inkasso" },
  ];

  return {
    cycleLabel: "mai 2026",
    activeSubscriptions,
    prorations,
    blockedExcluded: 37,
    vatPct: 25,
    dueDays: 14,
    reviewedDrafts: activeSubscriptions,
    autoFixedCount: 3,
    autoFixedNote: "3 dupliserte fakturalinjer fjernet",
    flaggedCount,
    exceptions,
    sendCount,
    distribution,
    autotrekkPct: overview.autotrekkPct,
    autotrekkCount,
    dsoDays: overview.dsoDays,
    upstreamSteps,
    receivedItems,
    intakeRows,
    sampleInvoice,
    industryLeakagePct: 0.52,
    paymentFunnel,
    resolvedBeforeInkassoPct: 94,
    reachesInkassoPct: 2,
  };
}

// ── Additional mocks needed by Peter's v2 workbench ─────────────────

export function demoGetDraftForCase(_id: string): DraftDetail | null {
  // The demo doesn't surface a pending operator-reviewable draft on
  // any case — keeps the conversation panel clean of internal
  // approval flows, which aren't part of the creditor story.
  return null;
}

export function demoListCreditors(): CreditorListResponse {
  return {
    creditors: [
      {
        creditor_slug: CREDITOR_SLUG,
        policy_set_id: "no-b2c-subscription-v0",
        display_name: CREDITOR_NAME,
      },
    ],
    unonboarded_slugs: [],
  };
}

/**
 * Synthesise an AgenticTimelineResponse from a case's audit
 * conversation. The v2 workbench's ConversationPanel reads this to
 * render bubbles for outbound/inbound SMS, debtor identity rows,
 * agent reasoning notes, etc. Keeping the mapping here means every
 * fixture case automatically gets a rich timeline without restating
 * it in agentic-shape.
 */
const KIND_BY_EVENT: Record<string, AgenticTimelineKind> = {
  case_ingested: "case.ingested",
  draft_created: "draft.generated",
  sms_sent: "communication.sent",
  sms_delivered: "communication.sent",
  sms_failed: "communication.sent",
  inbound_sms: "debtor.reply_received",
  stage_advanced: "action.executed",
  case_paused: "action.executed",
  case_withdrawn: "action.executed",
  case_escalated: "action.executed",
  case_closed: "action.executed",
  needs_review_flagged: "action.executed",
  plan_approved: "action.executed",
  payment_plan_active: "action.executed",
  routed_to_agent: "action.executed",
  pending_legal_approval: "action.executed",
  sent_to_forliksradet: "action.executed",
  forliksradet_judgment: "action.executed",
  sent_to_enforcement: "action.executed",
  placed_under_monitoring: "action.executed",
};

const ACTOR_BY_EVENT: Record<string, AgenticTimelineActor> = {
  case_ingested: "system",
  draft_created: "decision_agent",
  sms_sent: "action_executor",
  sms_delivered: "system",
  sms_failed: "system",
  inbound_sms: "inbound",
  stage_advanced: "action_executor",
  case_paused: "operator",
  case_withdrawn: "operator",
  case_escalated: "decision_agent",
  case_closed: "operator",
  needs_review_flagged: "rules_engine",
  plan_approved: "operator",
  payment_plan_active: "action_executor",
  routed_to_agent: "operator",
  pending_legal_approval: "decision_agent",
  sent_to_forliksradet: "operator",
  forliksradet_judgment: "system",
  sent_to_enforcement: "system",
  placed_under_monitoring: "operator",
};

export function demoGetAgenticTimeline(id: string): AgenticTimelineResponse | null {
  const c = CASES.find((x) => x.id === id);
  if (!c) return null;
  const steps: AgenticTimelineStep[] = c.conversation
    .map((e, idx) => ({
      id: `${id}-step-${idx}`,
      kind: KIND_BY_EVENT[e.event_type] ?? "action.executed",
      at: hoursAgo(e.h),
      actor: ACTOR_BY_EVENT[e.event_type] ?? "system",
      payload: { event_type: e.event_type, ...e.payload },
      correlation_id: null,
    }))
    .sort((a, b) => (a.at < b.at ? -1 : 1));
  return {
    steps,
    pending_proposal: null,
  };
}

/**
 * The original creditor invoice that started the Claim. Principal
 * only (fees accrue later as separate inkasso line items), issued
 * ~14 days before the original due date — standard Norwegian payment
 * terms. Every Claim has one, so the case detail always shows it.
 */
function buildOriginalInvoice(c: DummyCase): LedgerInvoice {
  const principalMinor = Math.round(c.amount * 100);
  const issuedDaysAgo =
    c.due_offset_days < 0 ? Math.abs(c.due_offset_days) + 14 : 14;
  // Payment link stays open for active Claims; resolved Claims show a
  // closed link so the demo doesn't imply you can still pay a closed
  // case.
  const resolved = c.state === "closed";
  return {
    invoice_id: c.invoice_reference,
    issued_at: daysAgo(issuedDaysAgo),
    line_items: [
      { label: "Hovedstol", amount_minor: principalMinor, line_type: "principal" },
    ],
    payment_link: resolved
      ? null
      : {
          provider: "vipps",
          url: `https://betal.audun.no/${c.invoice_reference.toLowerCase()}`,
          // Expires a week out from "now".
          expires_at: new Date(NOW + 7 * 24 * 3600 * 1000).toISOString(),
        },
  };
}

/**
 * Builds the live claim ledger — Hovedstol (principal), Gebyrer (the
 * stage fees accrued so far, at real 2026 rates) and Renter
 * (forsinkelsesrente at 12% p.a. from the due date). Every Claim gets
 * a ledger so the balance card shows real numbers, not em-dashes —
 * important for legal-stage Claims where the creditor is deciding
 * whether the exposure justifies Forliksrådet.
 */
function buildLedger(c: DummyCase): LedgerView {
  const nowIso = new Date(NOW).toISOString();
  const principalNok = c.amount;
  const principalMinor = Math.round(principalNok * 100);

  const reached = new Set((c.stages ?? []).map((s) => s.stage));
  const feeLines: LedgerLine[] = [];
  const pushFee = (label: string, nok: number, idx: number): void => {
    feeLines.push({
      amount_minor: Math.round(nok * 100),
      recorded_at: nowIso,
      event_id: `${c.id}-fee-${idx}`,
      label,
    });
  };
  if (reached.has("purring")) pushFee("Purregebyr", PURREGEBYR_NOK, 0);
  if (reached.has("inkassovarsel"))
    pushFee("Inkassovarsel", INKASSOVARSEL_GEBYR_NOK, 1);
  if (reached.has("betalingsoppfordring"))
    pushFee("Inkassosalær", inkassosalaerNok(principalNok), 2);
  // The Forliksrådet court fee only lands on the ledger once the Claim
  // has actually been filed (enforcement track). For the two
  // pending_legal_approval Claims it's still just an *estimate* shown
  // on the decision card, so it stays off the running balance.
  if (c.state === "sent_to_enforcement")
    pushFee("Rettsgebyr (Forliksrådet)", FORLIKSRAD_GEBYR_NOK, 3);

  const daysOverdue = c.due_offset_days < 0 ? Math.abs(c.due_offset_days) : 0;
  const interestNok = accruedInterestNok(principalNok, daysOverdue);
  const interestMinor = Math.round(interestNok * 100);
  const dueDateIso = dueIn(c.due_offset_days);

  const feesMinor = feeLines.reduce((s, l) => s + l.amount_minor, 0);
  const outstandingMinor = principalMinor + feesMinor + interestMinor;

  return {
    principal: {
      amount_minor: principalMinor,
      recorded_at: nowIso,
      event_id: `${c.id}-principal`,
      label: "Hovedstol",
    },
    fees: feeLines,
    interest: {
      amount_minor: interestMinor,
      recorded_at: nowIso,
      event_id: `${c.id}-interest`,
      label: "Forsinkelsesrente",
      accrued_through_date: nowIso.slice(0, 10),
    },
    payments: [],
    adjustments: [],
    outstanding_minor: outstandingMinor,
    currency: "NOK",
    as_of: dueDateIso,
  };
}

export function demoGetCase(id: string): CaseDetail | null {
  const c = CASES.find((x) => x.id === id);
  if (!c) return null;
  const list = toListItem(c);
  return {
    case: {
      ...list,
      language: "nb-NO",
      updated_at: hoursAgo(c.age_hours),
      opted_out_at: null,
      dunning_stage: c.dunning_stage,
      debtor_email: c.debtor_email ?? null,
      debtor_street: c.debtor_street ?? null,
      debtor_postcode: c.debtor_postcode ?? null,
      debtor_city: c.debtor_city ?? null,
      debtor_country_code: c.debtor_email ? "NO" : null,
    },
    audit: toAudit(c),
    stage_transitions: toStageTransitions(c),
    ledger: buildLedger(c),
    last_invoice: buildOriginalInvoice(c),
  };
}
