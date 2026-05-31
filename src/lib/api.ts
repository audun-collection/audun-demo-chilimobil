/**
 * Helper for talking to the sms-mini API.
 *
 * Two modes:
 *  - Authenticated (preferred): pass `idToken` from
 *    [useAuth().getIdToken()](./auth-context.tsx). The token's
 *    `tenant_id` custom claim drives tenant scoping on the backend.
 *  - Dev fallback: omit `idToken`. The helper sends
 *    `NEXT_PUBLIC_DEMO_TENANT_ID` as the `x-tenant-id` header. The
 *    backend accepts this only while `AUTH_REQUIRED=false` (its
 *    default for local dev / tests).
 */

import {
  demoGetAgenticTimeline,
  demoGetCase,
  demoGetDraftForCase,
  demoListCases,
  demoListCreditors,
  isDemoMode,
} from "./demo-fixtures";

const API_BASE =
  process.env["NEXT_PUBLIC_API_URL"] ??
  process.env["NEXT_PUBLIC_BACKEND_URL"] ??
  "http://localhost:3001";

const DEMO_TENANT_ID = process.env["NEXT_PUBLIC_DEMO_TENANT_ID"] ?? "";

export interface CaseListItem {
  id: string;
  creditor: string;
  /**
   * Resolved server-side from `creditor_policies.policy_jsonb->>'display_name'`
   * for the Claim's `creditor` slug. Null when the slug isn't onboarded
   * or the policy stores no display name. The Creditor portal renders
   * this in its identity strip + table; falls back to slug when null.
   */
  creditor_display_name: string | null;
  debtor_name: string | null;
  /**
   * E.164 phone for the Debtor (e.g. `+4790203045`), or null when the
   * Claim was ingested without a deliverable number. Surfaced on the
   * list payload so `/cases` can search by phone — the comparison
   * reduces both query and target to digits-only, so formatted queries
   * like `+47 902 03 045` still match.
   */
  debtor_phone: string | null;
  /**
   * Creditor's own reference for the Claim — invoice number, dunning
   * letter id, internal case id, etc. Surfaced on the list payload so
   * `/cases` can search by ref ("Debtor mentioned 1407"). Null when
   * the source row didn't carry one.
   */
  invoice_reference: string | null;
  amount: string | null;
  currency: string | null;
  due_date: string | null;
  state: string;
  source_format: string;
  source_file_id: string | null;
  created_at: string;
}

export interface CaseSource {
  signed_url: string;
  mime_type: string;
  expires_in_seconds: number;
}

/**
 * Fetch a short-lived signed URL for the case's original uploaded
 * file. The frontend then `window.open`s the URL in a new tab so
 * PDFs render in the browser's native viewer and CSV / XLSX
 * download. Authentication uses the same Bearer token as every other
 * API call — we don't return a 302 from the backend because the
 * browser drops the Authorization header on redirect.
 */
export async function getCaseSource(
  id: string,
  idToken?: string | null,
): Promise<CaseSource | null> {
  return get<CaseSource>(
    `/api/cases/${encodeURIComponent(id)}/source`,
    idToken,
  );
}

export interface CaseListFacets {
  by_creditor: Array<{ creditor: string; count: number }>;
  by_status: Array<{ status: string; count: number }>;
  by_source: Array<{ source: string; count: number }>;
}

export interface CaseListResponse {
  items: CaseListItem[];
  next_cursor: string | null;
  total_count: number;
  facets: CaseListFacets;
}

export interface CaseListParams {
  /** 1..200, default 50. The backend caps anything higher. */
  limit?: number | undefined;
  /** Opaque base64 cursor from a prior response's `next_cursor`. */
  cursor?: string | null | undefined;
  /** Free-text search across debtor_name / invoice_reference / creditor. */
  q?: string | undefined;
  /** Multi-value: keep claims whose `state` is one of these. */
  status?: string[] | undefined;
  /** Multi-value: keep claims whose `creditor` slug is one of these. */
  creditor?: string[] | undefined;
  /** Multi-value: keep claims whose `source_format` is one of these. */
  source?: string[] | undefined;
  /** ISO `YYYY-MM-DD`. `c.due_date >= due_after`. */
  due_after?: string | null | undefined;
  /** ISO `YYYY-MM-DD`. `c.due_date <= due_before`. */
  due_before?: string | null | undefined;
  /** `c.amount >= outstanding_min`. */
  outstanding_min?: number | null | undefined;
  /** `c.amount <= outstanding_max`. */
  outstanding_max?: number | null | undefined;
}

export interface AuditEntry {
  id: string;
  case_id: string | null;
  actor: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

/**
 * One Stage Transition row. Per ADR 019 §Decision 1 — the Dunning
 * Stage is still a typed attribute on the Claim (SOL-64, already
 * merged). The transition history continues to drive the Sakens
 * forløp stepper in the Workbench, independent of the new Claim
 * Ledger projection.
 */
export interface CaseStageTransition {
  stage: string;
  fee_applied_nok: string;
  policy_set_id: string;
  entered_at: string;
}

/**
 * Claim Ledger read shape — per the Payment Workflow and Claim
 * Ledger feature spec at
 * `docs/architecture/features/payment-workflow-ledger.md` (Henrik,
 * PR #303). Mirrors the `currentLedger` query published by the
 * per-Claim Payment Workflow.
 *
 * Every monetary value is an integer in **minor units (øre)** —
 * the UI never does decimal arithmetic; formatting to a string
 * like `"kr 658,00"` happens at render time via
 * `lib/format-currency.ts`.
 *
 * The ledger is event-sourced upstream: each line's `event_id`
 * anchors the audit-log row the line was derived from. The Workbench
 * is a read-only consumer; mutations flow through the Claim Payment
 * Workflow via signals (`paymentReceived`, `operatorAdjustment`).
 */
export interface LedgerLine {
  amount_minor: number;
  recorded_at: string;
  event_id: string;
  label?: string | null;
  tier?: string | null;
  accrued_through_date?: string | null;
}

export interface LedgerPaymentAllocations {
  fees: number;
  interest: number;
  principal: number;
}

export type LedgerPaymentSource =
  | "payment_link"
  | "bank_transfer"
  | "operator_assigned"
  | "refund";

export interface LedgerPayment {
  payment_id: string;
  amount_minor: number;
  received_at: string;
  source: LedgerPaymentSource;
  allocations: LedgerPaymentAllocations;
  bank_ref?: string | null;
  note?: string | null;
}

export type LedgerAdjustmentKind =
  | "fee_waive"
  | "interest_waive"
  | "manual_credit"
  | "correction";

export interface LedgerAdjustment {
  adjustment_id: string;
  kind: LedgerAdjustmentKind;
  amount_minor: number;
  reason: string;
  operator_id: string;
  rule_evaluation_id: string;
  applied_at: string;
}

export interface LedgerView {
  principal: LedgerLine;
  fees: LedgerLine[];
  interest: LedgerLine;
  payments: LedgerPayment[];
  adjustments: LedgerAdjustment[];
  outstanding_minor: number;
  currency: string;
  as_of: string;
}

export interface LedgerInvoiceLineItem {
  label: string;
  amount_minor: number;
  line_type: "principal" | "fee" | "interest";
}

export interface LedgerInvoicePaymentLink {
  provider: string;
  url: string;
  expires_at: string;
}

export interface LedgerInvoice {
  invoice_id: string;
  issued_at: string;
  line_items: LedgerInvoiceLineItem[];
  payment_link: LedgerInvoicePaymentLink | null;
  html_url?: string | null;
}

export interface CaseDetail {
  case: CaseListItem & {
    language: string | null;
    updated_at: string;
    /**
     * Set when the Debtor opted out of further SMS for this case
     * (STOP keyword). NULL = active; non-NULL = terminal for
     * outbound, surfaced by `OptOutBanner` and reversible via
     * `POST /api/cases/:id/restore-communication`. Per
     * `docs/features/sms-opt-out-detection.md` +
     * `operator-opt-out-affordances.md`.
     */
    opted_out_at: string | null;
    /**
     * Dunning Stage (denormalised current). The transition history
     * lives in `CaseDetail.stage_transitions` and continues to drive
     * the Sakens forløp stepper. Per SOL-64 (already merged).
     */
    dunning_stage?: string | null;
    /**
     * Debtor postal address — per SOL-65 (already merged). Used by
     * the Debtor banner card and by future Inkassovarsel letter
     * generation.
     */
    debtor_email?: string | null;
    debtor_street?: string | null;
    debtor_postcode?: string | null;
    debtor_city?: string | null;
    debtor_country_code?: string | null;
  };
  audit: AuditEntry[];
  /** Dunning Stage transition history (SOL-64, already merged). */
  stage_transitions?: CaseStageTransition[];
  /**
   * Claim Ledger read shape from the Claim Payment Workflow's
   * `currentLedger` query. Null until Henrik's projection table +
   * `GET /api/cases/:id/ledger` endpoint land — the Workbench
   * degrades each section to em-dash in that case. Per the feature
   * spec `docs/features/case-view-claim-ledger.md`.
   */
  ledger?: LedgerView | null;
  /**
   * Latest Invoice from the Claim Payment Workflow's `lastInvoice`
   * query. Null when no Invoice has been issued for the Claim yet.
   * Per the feature spec `docs/features/case-view-claim-ledger.md`.
   */
  last_invoice?: LedgerInvoice | null;
}

export interface Draft {
  id: string;
  case_id: string;
  template_slug: string;
  body: string;
  state: string;
  approval_required: boolean;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Communication {
  id: string;
  draft_id: string;
  channel: string;
  provider: string | null;
  provider_message_id: string | null;
  to_address: string;
  body: string;
  status: string;
  delivery_status: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
}

export interface DraftDetail {
  draft: Draft;
  communications: Communication[];
}

async function get<T>(path: string, idToken?: string | null): Promise<T | null> {
  const headers: Record<string, string> = {};
  if (idToken) {
    headers["authorization"] = `Bearer ${idToken}`;
  } else if (DEMO_TENANT_ID) {
    headers["x-tenant-id"] = DEMO_TENANT_ID;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`API ${res.status} on ${path}`);
  }
  return (await res.json()) as T;
}

export interface CreditorOption {
  id?: string;
  creditor_slug: string;
  policy_set_id: string;
  display_name?: string | null;
  created_at?: string;
}

export interface CreditorListResponse {
  creditors: CreditorOption[];
  /**
   * Claim.creditor values under this tenant that have no matching
   * creditor_policies row. Empty when every Claim's Creditor is
   * onboarded. The /creditors page renders these as an amber banner
   * so the Operator can fix the stuck slugs.
   */
  unonboarded_slugs?: string[];
}

/**
 * Lists the creditor slugs the agentic layer can resolve a
 * PolicyContext for under the calling Operator's tenant. Drives the
 * datalist on the Ingest page's Creditor inputs so Operators pick a
 * known slug instead of free-typing a display name that breaks the
 * policy loader.
 */
export async function listCreditors(
  idToken?: string | null,
): Promise<CreditorListResponse | null> {
  if (isDemoMode()) return demoListCreditors();
  return get<CreditorListResponse>("/api/creditors", idToken);
}

export interface PolicySetOption {
  id: string;
  status: string;
  action_catalogue_version: string;
}

export interface PolicySetListResponse {
  policy_sets: PolicySetOption[];
}

export async function listPolicySets(
  idToken?: string | null,
): Promise<PolicySetListResponse | null> {
  return get<PolicySetListResponse>("/api/policy-sets", idToken);
}

export interface RegisterCreditorInput {
  creditor_slug: string;
  display_name: string;
  policy_set_id: string;
  /**
   * Clone-from-template path. Mutually exclusive with
   * `custom_policy_jsonb` — the API returns 400 if both or neither
   * are present.
   */
  template_creditor_slug?: string;
  /**
   * Custom paste path. Operator pastes a full creditor_policy JSON
   * payload (matching the shape `code/policies/*.creditor.json`
   * use). Mutually exclusive with `template_creditor_slug`.
   */
  custom_policy_jsonb?: Record<string, unknown>;
  /**
   * Optional country code (ISO 3166-1 alpha-2). When present, the
   * backend verifies a `jurisdiction_policies` row exists for
   * `(country_code, policy_set_id)` before inserting the Creditor.
   */
  country_code?: string;
}

export interface RegisterCreditorResponse {
  creditor: {
    id: string;
    creditor_slug: string;
    policy_set_id: string;
    display_name: string | null;
    created_at: string;
  };
}

export async function registerCreditor(
  input: RegisterCreditorInput,
  idToken?: string | null,
): Promise<RegisterCreditorResponse> {
  return post<RegisterCreditorResponse>("/api/creditors", input, idToken);
}

export interface CreditorDetailResponse {
  creditor: {
    id: string;
    creditor_slug: string;
    policy_set_id: string;
    display_name: string | null;
    policy_jsonb: Record<string, unknown>;
    created_at: string;
  };
  policy_set: {
    id: string;
    status: string;
    action_catalogue_version: string;
    claim_state_policy_summary: {
      allowed_actions_by_state: Record<string, unknown>;
    } | null;
  } | null;
  jurisdiction: {
    id: string;
    country_code: string;
    policy_set_id: string;
    policy_jsonb: Record<string, unknown>;
    created_at: string;
  } | null;
}

/**
 * Operator-facing inspection endpoint. Returns the full
 * creditor_policies row plus a joined snapshot of the policy_set and
 * the matching jurisdiction. Per peter@ 2026-05-13.
 */
export async function getCreditor(
  id: string,
  idToken?: string | null,
): Promise<CreditorDetailResponse | null> {
  return get<CreditorDetailResponse>(
    `/api/creditors/${encodeURIComponent(id)}`,
    idToken,
  );
}

export interface JurisdictionPolicyOption {
  id: string;
  country_code: string;
  policy_set_id: string;
  created_at: string;
}

export interface JurisdictionPolicyListResponse {
  jurisdiction_policies: JurisdictionPolicyOption[];
}

/**
 * Lists registered Jurisdiction Policies. After migration 029
 * jurisdiction_policies is keyed by country_code only, so calling
 * without `policySetId` returns every registered country (the
 * canonical list for /onboarding/policies). When the creditor
 * onboarding wizard wants to filter by which Policy Set originally
 * registered each country (provenance), it can still pass policySetId.
 */
export async function listJurisdictionPolicies(
  policySetId: string | null = null,
  idToken?: string | null,
): Promise<JurisdictionPolicyListResponse | null> {
  const url = policySetId
    ? `/api/jurisdiction-policies?policy_set_id=${encodeURIComponent(policySetId)}`
    : "/api/jurisdiction-policies";
  return get<JurisdictionPolicyListResponse>(url, idToken);
}

export interface JurisdictionPolicyDetailResponse {
  jurisdiction_policy: {
    id: string;
    country_code: string;
    policy_set_id: string;
    policy_jsonb: Record<string, unknown>;
    created_at: string;
  };
}

/**
 * Single Jurisdiction Policy with the full policy_jsonb document.
 * Drives the inspect detail page at
 * `/onboarding/policies/jurisdictions/<id>`.
 */
export async function getJurisdictionPolicy(
  id: string,
  idToken?: string | null,
): Promise<JurisdictionPolicyDetailResponse | null> {
  return get<JurisdictionPolicyDetailResponse>(
    `/api/jurisdiction-policies/${encodeURIComponent(id)}`,
    idToken,
  );
}

// ----- Per-row Delete affordances (PR B follow-up to authoring) -----

async function del(
  path: string,
  idToken?: string | null,
): Promise<{ ok: true } | { ok: false; status: number; body: unknown }> {
  const headers: Record<string, string> = {};
  if (idToken) {
    headers["authorization"] = `Bearer ${idToken}`;
  } else if (DEMO_TENANT_ID) {
    headers["x-tenant-id"] = DEMO_TENANT_ID;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers,
    cache: "no-store",
  });
  if (res.ok || res.status === 204) return { ok: true };
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { ok: false, status: res.status, body };
}

export interface DeleteBlockedError {
  status: number;
  message: string;
  payload: unknown;
}

export async function deleteCreditor(
  id: string,
  idToken?: string | null,
): Promise<{ ok: true } | { ok: false; error: DeleteBlockedError }> {
  const r = await del(
    `/api/creditors/${encodeURIComponent(id)}`,
    idToken,
  );
  if (r.ok) return { ok: true };
  const body = (r.body ?? {}) as { message?: string };
  return {
    ok: false,
    error: {
      status: r.status,
      message: body.message ?? `Delete failed (HTTP ${r.status}).`,
      payload: r.body,
    },
  };
}

export interface UpdateCreditorDisplayNameResponse {
  creditor_slug: string;
  display_name: string;
}

/**
 * SOL-127 follow-up: rename a Creditor's display_name without
 * tearing down the Creditor (which would lose portal users +
 * Claims). Operator-only on the backend.
 */
export async function updateCreditorDisplayName(
  id: string,
  displayName: string,
  idToken?: string | null,
): Promise<UpdateCreditorDisplayNameResponse> {
  return patch<UpdateCreditorDisplayNameResponse>(
    `/api/creditors/${encodeURIComponent(id)}`,
    { display_name: displayName },
    idToken,
  );
}

export async function deletePolicySet(
  id: string,
  idToken?: string | null,
): Promise<{ ok: true } | { ok: false; error: DeleteBlockedError }> {
  const r = await del(
    `/api/policy-sets/${encodeURIComponent(id)}`,
    idToken,
  );
  if (r.ok) return { ok: true };
  const body = (r.body ?? {}) as { message?: string };
  return {
    ok: false,
    error: {
      status: r.status,
      message: body.message ?? `Delete failed (HTTP ${r.status}).`,
      payload: r.body,
    },
  };
}

export async function deleteJurisdictionPolicy(
  id: string,
  idToken?: string | null,
): Promise<{ ok: true } | { ok: false; error: DeleteBlockedError }> {
  const r = await del(
    `/api/jurisdiction-policies/${encodeURIComponent(id)}`,
    idToken,
  );
  if (r.ok) return { ok: true };
  const body = (r.body ?? {}) as { message?: string };
  return {
    ok: false,
    error: {
      status: r.status,
      message: body.message ?? `Delete failed (HTTP ${r.status}).`,
      payload: r.body,
    },
  };
}

// ----- Creditor onboarding wizard -----

export interface JurisdictionTemplate {
  country_code: string;
  country_name: string;
  flag_emoji: string;
  description: string;
  requires_legal_review: boolean;
  wizard_defaults: {
    cooling_off_days?: number;
    max_reminders_before_legal?: number;
    required_languages?: string[];
  };
  policy: Record<string, unknown>;
}

export interface JurisdictionTemplateListResponse {
  jurisdiction_templates: JurisdictionTemplate[];
}

export async function listJurisdictionTemplates(
  idToken?: string | null,
): Promise<JurisdictionTemplateListResponse | null> {
  return get<JurisdictionTemplateListResponse>(
    "/api/jurisdiction-templates",
    idToken,
  );
}

export type BusinessPolicyChoice =
  | { kind: "existing"; policy_set_id: string }
  | {
      kind: "new";
      id: string;
      action_catalogue_version: string;
      allowed_actions_by_state?: Record<string, string[]>;
      // Only `payment_deferral_max_days` is consumed by the v1 Rules
      // Engine. The pre-cleanup type also carried
      // payment_plan_max_installments / fee_waiver_reminder_enabled /
      // settlement_discount_enabled / principal_reduction_requires_review;
      // those gated v1-excluded action types and were stripped
      // alongside migration 033.
      payment_deferral_max_days?: number;
      mandatory_human_escalation?: string[];
      custom_policy_jsonb?: Record<string, unknown>;
    };

export type JurisdictionChoice =
  | { kind: "existing"; id: string }
  | {
      kind: "new";
      country_code: string;
      cooling_off_days?: number;
      max_reminders_before_legal?: number;
      required_languages?: string[];
      custom_policy_jsonb?: Record<string, unknown>;
    };

export type CreditorPolicyChoice =
  | {
      kind: "from_template";
      template_creditor_slug: string;
    }
  | {
      kind: "custom";
      custom_policy_jsonb: Record<string, unknown>;
    }
  | {
      kind: "from_questionnaire";
      questionnaire: {
        risk_tolerance: "low" | "medium" | "high";
        retention_priority: "low" | "medium" | "high";
        // payment_deferral.* feeds the Rules Engine's deferral cap.
        // risk_tolerance / retention_priority / hardship_preferred_actions
        // are surfaced to the Decision Agent prompt as named soft
        // guidance (decision-agent.ts buildUserPrompt). The pre-cleanup
        // type also had payment_plan_enabled, payment_plan_max_installments,
        // and fee_waiver_enabled; those referenced v1-excluded action
        // types and were stripped.
        payment_deferral_enabled: boolean;
        payment_deferral_max_days: number;
        hardship_preferred_actions: string[];
      };
    };

export interface OnboardCreditorInput {
  creditor: { creditor_slug: string; display_name: string };
  business_policy: BusinessPolicyChoice;
  jurisdiction: JurisdictionChoice;
  creditor_policy: CreditorPolicyChoice;
}

export interface OnboardCreditorResponse {
  creditor: {
    id: string;
    creditor_slug: string;
    display_name: string | null;
    policy_set_id: string;
    created_at: string;
  };
  policy_set: { id: string; status: string };
  jurisdiction_policy: {
    id: string;
    country_code: string;
    policy_set_id: string;
  };
}

export async function onboardCreditor(
  input: OnboardCreditorInput,
  idToken?: string | null,
): Promise<OnboardCreditorResponse> {
  return post<OnboardCreditorResponse>(
    "/api/onboard-creditor",
    input,
    idToken,
  );
}

export interface PolicySetDetailResponse {
  policy_set: {
    id: string;
    status: string;
    legal_review_status: string;
    action_catalogue_version: string;
    claim_state_policy: Record<string, unknown>;
    conduct_policy: Record<string, unknown>;
    communication_review_policy: Record<string, unknown>;
    audit_policy: Record<string, unknown>;
    created_at: string;
  };
  jurisdictions: JurisdictionPolicyOption[];
  creditor_count: number;
}

export async function getPolicySet(
  id: string,
  idToken?: string | null,
): Promise<PolicySetDetailResponse | null> {
  return get<PolicySetDetailResponse>(
    `/api/policy-sets/${encodeURIComponent(id)}`,
    idToken,
  );
}

export interface AuthorPolicySetInput {
  id: string;
  status?: "draft" | "active" | "superseded";
  legal_review_status?: "not_reviewed" | "reviewed" | "approved";
  action_catalogue_version: string;
  claim_state_policy: Record<string, unknown>;
  conduct_policy: Record<string, unknown>;
  communication_review_policy: Record<string, unknown>;
  audit_policy: Record<string, unknown>;
}

export interface AuthorPolicySetResponse {
  policy_set: {
    id: string;
    status: string;
    legal_review_status: string;
    action_catalogue_version: string;
    created_at: string;
  };
}

/**
 * Operator-authored Policy Set. Posts the four-facet bundle to
 * `POST /api/policy-sets`; the backend refuses an id that already
 * exists (409). Dev-only authoring path tracked for graduation in
 * GitHub issue #167.
 */
export async function authorPolicySet(
  input: AuthorPolicySetInput,
  idToken?: string | null,
): Promise<AuthorPolicySetResponse> {
  return post<AuthorPolicySetResponse>("/api/policy-sets", input, idToken);
}

export interface AuthorJurisdictionPolicyInput {
  country_code: string;
  policy_set_id: string;
  policy: Record<string, unknown>;
}

export interface AuthorJurisdictionPolicyResponse {
  jurisdiction_policy: {
    id: string;
    country_code: string;
    policy_set_id: string;
    created_at: string;
  };
}

/**
 * Operator-authored jurisdiction policy. The referenced
 * `policy_set_id` must already exist (404 otherwise). The backend
 * refuses a duplicate `(country_code, policy_set_id)` (409).
 */
export async function authorJurisdictionPolicy(
  input: AuthorJurisdictionPolicyInput,
  idToken?: string | null,
): Promise<AuthorJurisdictionPolicyResponse> {
  return post<AuthorJurisdictionPolicyResponse>(
    "/api/jurisdiction-policies",
    input,
    idToken,
  );
}

// Server-side search + cursor pagination + facet counts per
// `docs/decisions/026-cases-list-query-contract.md`. `params`
// accepts `{ limit, cursor, q, status, creditor }`; everything is
// optional and the backend supplies sensible defaults. Pass `null`
// or omit to leave any axis disabled.
//
// Supersedes the `?limit=200` hotfix (PR #392) — pagination is now
// cursor-driven so we no longer need to over-fetch.
export async function listCases(
  idToken?: string | null,
  params?: CaseListParams,
): Promise<CaseListResponse> {
  if (isDemoMode()) return demoListCases();
  const search = new URLSearchParams();
  if (params?.limit !== undefined) search.set("limit", String(params.limit));
  if (params?.cursor) search.set("cursor", params.cursor);
  if (params?.q !== undefined && params.q !== "") search.set("q", params.q);
  // Multi-value params: repeat the key for each value
  // (`?status=parsed&status=drafted`). Fastify's default querystring
  // parser surfaces this as an array on the server.
  for (const value of params?.status ?? []) search.append("status", value);
  for (const value of params?.creditor ?? []) search.append("creditor", value);
  for (const value of params?.source ?? []) search.append("source", value);
  if (params?.due_after) search.set("due_after", params.due_after);
  if (params?.due_before) search.set("due_before", params.due_before);
  if (params?.outstanding_min !== undefined && params.outstanding_min !== null) {
    search.set("outstanding_min", String(params.outstanding_min));
  }
  if (params?.outstanding_max !== undefined && params.outstanding_max !== null) {
    search.set("outstanding_max", String(params.outstanding_max));
  }
  const qs = search.toString();
  const path = qs === "" ? "/api/cases" : `/api/cases?${qs}`;
  const result = await get<CaseListResponse>(path, idToken);
  return (
    result ?? {
      items: [],
      next_cursor: null,
      total_count: 0,
      facets: { by_creditor: [], by_status: [], by_source: [] },
    }
  );
}

// --- Portfolio (operator landing page) ----------------------------------
//
// One round-trip pulls every figure on `/portfolio`: outstanding +
// SMS-sent-this-week + active-debtors + needs-review tiles, the
// aging-and-exposure bucket data, the "needs your attention" list,
// the "resolutions today" list, and the Creditor-chip data. The
// optional `creditors` filter narrows every aggregate except the
// chip list itself.

export interface PortfolioOutstanding {
  amount: string;
  claims: number;
  currency: "NOK";
}

export interface PortfolioAgingBucket {
  bucket: "0-30" | "31-60" | "61-90" | "90+";
  exposure: string;
  claims: number;
}

export interface PortfolioAttentionItem {
  id: string;
  creditor: string;
  debtor_name: string | null;
  amount: string | null;
  currency: string | null;
  due_date: string | null;
  state: string;
  updated_at: string;
}

export interface PortfolioResolutionItem {
  id: string;
  creditor: string;
  debtor_name: string | null;
  amount: string | null;
  currency: string | null;
  state: "closed";
  updated_at: string;
}

export interface PortfolioCreditorChip {
  name: string;
  active_claims: number;
}

export interface PortfolioPipelineSegment {
  state:
    | "parsed"
    | "drafted"
    | "approved"
    | "sent"
    | "paused"
    | "closed"
    | "failed";
  claims: number;
}

export type PortfolioAiSurface =
  | "extract"
  | "draft"
  | "decision"
  | "input_safety";

export interface PortfolioAiSpend {
  today_usd: string;
  last_7d_usd: string;
  by_surface_today: Array<{ surface: PortfolioAiSurface; usd: string }>;
  sparkline_7d_usd: string[];
  by_creditor_today: Array<{ creditor: string; usd: string }>;
}

export interface PortfolioAiSpendReconciliation {
  day: string;
  actual_usd: string;
  estimated_usd: string;
  divergence_pct: number | null;
}

/**
 * Lifetime totals across every Claim the Creditor has ever uploaded
 * — open + closed. Counterpart to `outstanding` (active-only).
 * Surfaces "of N total uploads, M are now resolved" without making
 * the operator flip into a closed-Claims view.
 */
export interface PortfolioLifetime {
  total_claimed_amount: string;
  total_claims: number;
  closed_claims: number;
  currency: "NOK";
}

export interface PortfolioResponse {
  outstanding: PortfolioOutstanding;
  lifetime: PortfolioLifetime;
  sms_sent_this_week: number;
  active_debtors: number;
  needs_review: number;
  drafts_pending: number;
  inbound_this_week: number;
  aging: PortfolioAgingBucket[];
  pipeline_today: PortfolioPipelineSegment[];
  attention: PortfolioAttentionItem[];
  resolutions_today: PortfolioResolutionItem[];
  creditors: PortfolioCreditorChip[];
  ai_spend: PortfolioAiSpend;
  ai_spend_reconciliation: PortfolioAiSpendReconciliation | null;
}

export async function getPortfolio(
  options?: { creditors?: string[]; idToken?: string | null },
): Promise<PortfolioResponse> {
  const params = new URLSearchParams();
  for (const c of options?.creditors ?? []) {
    params.append("creditor", c);
  }
  const qs = params.toString();
  const path = `/api/portfolio${qs.length > 0 ? `?${qs}` : ""}`;
  const result = await get<PortfolioResponse>(path, options?.idToken);
  if (!result) {
    throw new Error("Portfolio response was empty");
  }
  return result;
}

export async function getCase(
  id: string,
  idToken?: string | null,
): Promise<CaseDetail | null> {
  if (isDemoMode()) return demoGetCase(id);
  return get<CaseDetail>(`/api/cases/${encodeURIComponent(id)}`, idToken);
}

export async function getDraftForCase(
  caseId: string,
  idToken?: string | null,
): Promise<DraftDetail | null> {
  if (isDemoMode()) return demoGetDraftForCase(caseId);
  return get<DraftDetail>(
    `/api/cases/${encodeURIComponent(caseId)}/draft`,
    idToken,
  );
}

async function post<T>(
  path: string,
  body: unknown,
  idToken?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (idToken) {
    headers["authorization"] = `Bearer ${idToken}`;
  } else if (DEMO_TENANT_ID) {
    headers["x-tenant-id"] = DEMO_TENANT_ID;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = `API ${res.status} on ${path}`;
    try {
      const errBody = (await res.json()) as { error?: string; message?: string };
      if (errBody?.message) detail = errBody.message;
    } catch {
      // fall through
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

async function put<T>(
  path: string,
  body: unknown,
  idToken?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (idToken) {
    headers["authorization"] = `Bearer ${idToken}`;
  } else if (DEMO_TENANT_ID) {
    headers["x-tenant-id"] = DEMO_TENANT_ID;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = `API ${res.status} on ${path}`;
    try {
      const errBody = (await res.json()) as { error?: string; message?: string };
      if (errBody?.message) detail = errBody.message;
    } catch {
      // fall through
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export interface CreateCaseInput {
  creditor: string;
  debtor_name?: string;
  debtor_phone?: string;
  amount?: string;
  currency?: string;
  due_date?: string;
  invoice_reference?: string;
  language?: string;
}

export interface CreateCaseResult {
  id: string;
  state: string;
  missing_fields: string[];
}

export async function createCase(
  input: CreateCaseInput,
  idToken?: string | null,
): Promise<CreateCaseResult> {
  return post<CreateCaseResult>("/api/cases", input, idToken);
}

/**
 * Editable subset of a Claim. Mirrors `PATCH /api/cases/:id` on the
 * backend: only fields the operator or creditor can correct
 * post-ingest. The creditor slug is intentionally NOT patchable here
 * — reassigning a Claim to a different creditor is a different
 * workflow that needs its own audit + scope re-checks.
 */
export interface UpdateCaseInput {
  debtor_name?: string | undefined;
  debtor_phone?: string | undefined;
  debtor_email?: string | undefined;
  debtor_street?: string | undefined;
  debtor_postcode?: string | undefined;
  debtor_city?: string | undefined;
  debtor_country_code?: string | undefined;
  amount?: string | undefined;
  currency?: string | undefined;
  due_date?: string | undefined;
  invoice_reference?: string | undefined;
  language?: string | undefined;
}

export interface UpdateCaseResult {
  id: string;
  state: string;
  missing_fields: string[];
  updated_fields: string[];
}

export async function updateCase(
  caseId: string,
  input: UpdateCaseInput,
  idToken?: string | null,
): Promise<UpdateCaseResult> {
  return patch<UpdateCaseResult>(
    `/api/cases/${encodeURIComponent(caseId)}`,
    input,
    idToken,
  );
}

export async function generateDraft(
  caseId: string,
  idToken?: string | null,
): Promise<DraftDetail> {
  return post<DraftDetail>(
    `/api/cases/${encodeURIComponent(caseId)}/draft`,
    {},
    idToken,
  );
}

export async function approveDraft(
  draftId: string,
  idToken?: string | null,
): Promise<DraftDetail> {
  return post<DraftDetail>(
    `/api/drafts/${encodeURIComponent(draftId)}/approve`,
    {},
    idToken,
  );
}

async function patch<T>(
  path: string,
  body: unknown,
  idToken?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (idToken) {
    headers["authorization"] = `Bearer ${idToken}`;
  } else if (DEMO_TENANT_ID) {
    headers["x-tenant-id"] = DEMO_TENANT_ID;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = `API ${res.status} on ${path}`;
    try {
      const errBody = (await res.json()) as { error?: string; message?: string };
      if (errBody?.message) detail = errBody.message;
    } catch {
      // fall through
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export async function editDraftBody(
  draftId: string,
  body: string,
  idToken?: string | null,
): Promise<{ draft: Draft }> {
  return patch<{ draft: Draft }>(
    `/api/drafts/${encodeURIComponent(draftId)}`,
    { body },
    idToken,
  );
}

export async function rejectDraft(
  draftId: string,
  reason: string,
  idToken?: string | null,
): Promise<DraftDetail> {
  return post<DraftDetail>(
    `/api/drafts/${encodeURIComponent(draftId)}/reject`,
    { reason },
    idToken,
  );
}

export async function sendDraft(
  draftId: string,
  idToken?: string | null,
): Promise<DraftDetail> {
  return post<DraftDetail>(
    `/api/drafts/${encodeURIComponent(draftId)}/send`,
    {},
    idToken,
  );
}

export interface IngestRejectedRow {
  row_index: number;
  supplied: string;
  candidate_slug: string;
  reason: string;
}

export interface IngestResult {
  ingested: number;
  parsed: number;
  needs_review: number;
  rejected: number;
  rejected_rows: IngestRejectedRow[];
}

// Back-compat alias for existing callers.
export type IngestCsvResult = IngestResult;

function ingestEndpointFor(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || file.type.includes("spreadsheet")) {
    return "/api/cases/ingest/xlsx";
  }
  return "/api/cases/ingest";
}

async function ingestFile(
  file: File,
  idToken?: string | null,
): Promise<IngestResult> {
  const headers: Record<string, string> = {};
  if (idToken) {
    headers["authorization"] = `Bearer ${idToken}`;
  } else if (DEMO_TENANT_ID) {
    headers["x-tenant-id"] = DEMO_TENANT_ID;
  }
  const form = new FormData();
  form.append("file", file);
  const path = ingestEndpointFor(file);
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: form,
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = `API ${res.status} on ${path}`;
    try {
      const errBody = (await res.json()) as {
        error?: string;
        message?: string;
      };
      if (errBody?.message) detail = errBody.message;
    } catch {
      // fall through
    }
    throw new Error(detail);
  }
  return (await res.json()) as IngestResult;
}

export const ingestCsv = ingestFile;
export const ingestSpreadsheet = ingestFile;

export interface IngestPdfResult {
  id: string;
  state: string;
  missing_fields: string[];
  extraction_status: "ok" | "failed" | "no_text";
}

export async function ingestPdf(
  file: File,
  options?: { creditorSlug?: string; idToken?: string | null },
): Promise<IngestPdfResult> {
  const headers: Record<string, string> = {};
  const idToken = options?.idToken;
  if (idToken) {
    headers["authorization"] = `Bearer ${idToken}`;
  } else if (DEMO_TENANT_ID) {
    headers["x-tenant-id"] = DEMO_TENANT_ID;
  }
  const form = new FormData();
  form.append("file", file);
  if (options?.creditorSlug) {
    form.append("creditor_slug", options.creditorSlug);
  }
  const res = await fetch(`${API_BASE}/api/cases/ingest/pdf`, {
    method: "POST",
    headers,
    body: form,
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = `API ${res.status} on /api/cases/ingest/pdf`;
    try {
      const errBody = (await res.json()) as {
        error?: string;
        message?: string;
      };
      if (errBody?.message) detail = errBody.message;
    } catch {
      // fall through
    }
    throw new Error(detail);
  }
  return (await res.json()) as IngestPdfResult;
}

// --- Smart Ingest v2 (SOL-100) ----------------------------------------
//
// Two-step preview-then-commit flow with diff-as-mark-paid. See
// `apps/api/src/routes/smart-ingest.ts` for the contract.

export interface SmartIngestPreviewRow {
  row_index: number;
  creditor: string | null;
  debtor_name: string | null;
  debtor_phone: string | null;
  amount: string | null;
  currency: string | null;
  due_date: string | null;
  invoice_reference: string | null;
  debtor_email: string | null;
  debtor_street: string | null;
  debtor_postcode: string | null;
  debtor_city: string | null;
  debtor_country_code: string | null;
  language: string | null;
  debtor_company_name: string | null;
  debtor_org_no: string | null;
  match: "new" | "continuing" | "amount_changed";
  existing_case_id: string | null;
  missing_fields: string[];
}

export interface SmartIngestPreviewError {
  row_index: number;
  reason: string;
  message: string;
  supplied?: string | null;
}

export interface SmartIngestWillBeMarkedPaid {
  case_id: string;
  creditor: string;
  invoice_reference: string;
  debtor_name: string | null;
  debtor_company_name: string | null;
  amount: string | null;
  currency: string | null;
}

export interface SmartIngestDiff {
  newCount: number;
  continuingCount: number;
  willBeMarkedPaidCount: number;
  currentlyOpenCount: number;
  willBeMarkedPaidPreview: SmartIngestWillBeMarkedPaid[];
}

export interface SmartIngestPreviewResult {
  parsedRows: SmartIngestPreviewRow[];
  errors: SmartIngestPreviewError[];
  diff: SmartIngestDiff;
}

export interface SmartIngestCommitResult {
  createdCaseIds: string[];
  updatedCaseIds: string[];
  markedPaidCaseIds: string[];
  parsed: number;
  needs_review: number;
}

export interface SmartIngestGuardrailResponse {
  requires_confirmation: true;
  willBeMarkedPaidCount: number;
  currently_open_count: number;
  threshold: number;
  message: string;
}

function isGuardrailResponse(
  body: unknown,
): body is SmartIngestGuardrailResponse {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as Record<string, unknown>)["requires_confirmation"] === true
  );
}

export async function smartIngestPreview(
  file: File,
  idToken?: string | null,
): Promise<SmartIngestPreviewResult> {
  const headers: Record<string, string> = {};
  if (idToken) headers["authorization"] = `Bearer ${idToken}`;
  else if (DEMO_TENANT_ID) headers["x-tenant-id"] = DEMO_TENANT_ID;
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/ingest/preview`, {
    method: "POST",
    headers,
    body: form,
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = `API ${res.status} on /api/ingest/preview`;
    try {
      const errBody = (await res.json()) as {
        error?: string;
        message?: string;
      };
      if (errBody?.message) detail = errBody.message;
    } catch {
      // fall through
    }
    throw new Error(detail);
  }
  return (await res.json()) as SmartIngestPreviewResult;
}

export async function smartIngestCommit(
  rows: SmartIngestPreviewRow[],
  options: {
    idToken?: string | null;
    confirmedAt?: string;
    confirmDestructive?: boolean;
  } = {},
): Promise<SmartIngestCommitResult | SmartIngestGuardrailResponse> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options.idToken) headers["authorization"] = `Bearer ${options.idToken}`;
  else if (DEMO_TENANT_ID) headers["x-tenant-id"] = DEMO_TENANT_ID;
  const payload = {
    rows: rows.map((r) => ({
      creditor: r.creditor,
      invoice_reference: r.invoice_reference,
      debtor_name: r.debtor_name,
      debtor_phone: r.debtor_phone,
      amount: r.amount,
      currency: r.currency,
      due_date: r.due_date,
      debtor_email: r.debtor_email,
      debtor_street: r.debtor_street,
      debtor_postcode: r.debtor_postcode,
      debtor_city: r.debtor_city,
      debtor_country_code: r.debtor_country_code,
      language: r.language,
      debtor_company_name: r.debtor_company_name,
      debtor_org_no: r.debtor_org_no,
    })),
    confirmedAt: options.confirmedAt,
    confirmDestructive: options.confirmDestructive,
  };
  const res = await fetch(`${API_BASE}/api/ingest/commit`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  // 409 carries the guardrail body; let the caller pivot to a confirm
  // modal instead of treating it as an error.
  if (res.status === 409) {
    const body = (await res.json()) as unknown;
    if (isGuardrailResponse(body)) return body;
  }
  if (!res.ok) {
    let detail = `API ${res.status} on /api/ingest/commit`;
    try {
      const errBody = (await res.json()) as {
        error?: string;
        message?: string;
      };
      if (errBody?.message) detail = errBody.message;
    } catch {
      // fall through
    }
    throw new Error(detail);
  }
  return (await res.json()) as SmartIngestCommitResult;
}

// --- Agentic timeline (slice 7 of the agentic-layer v1 plan) ------------
//
// The backend response shape mirrors `routes/agentic.ts`. Until slices
// 4–6 land and start emitting real Decision Agent / Rules Engine /
// Action Executor rows, this endpoint just returns the pre-existing
// audit_log rows in TimelineStep shape.

export type AgenticTimelineKind =
  | "case.ingested"
  | "case.reminder_window_elapsed"
  | "debtor.reply_received"
  | "input_safety.classified"
  | "decision.proposed"
  | "rule.evaluated"
  | "decision.approved"
  | "decision.rejected"
  | "action.executed"
  | "communication.sent"
  | "draft.generated"
  | "draft.approved"
  | "draft.rejected"
  | "draft.sent";

export type AgenticTimelineActor =
  | "system"
  | "timer"
  | "inbound"
  | "decision_agent"
  | "input_safety_agent"
  | "rules_engine"
  | "operator"
  | "action_executor";

export interface AgenticTimelineStep {
  id: string;
  kind: AgenticTimelineKind;
  at: string;
  actor: AgenticTimelineActor;
  payload: Record<string, unknown>;
  correlation_id: string | null;
}

export interface AgenticRuleEvaluation {
  verdict: string;
  approval_tier: string;
  ruleset_version: string;
  fired_rules: Array<{ rule_id: string; explanation: string }>;
  blocked_rules: Array<{ rule_id: string; explanation: string }>;
  explanation: string;
  evaluated_at: string;
}

export interface AgenticPendingProposal {
  id: string;
  case_id: string;
  proposed_action_type: string;
  proposed_action_payload: Record<string, unknown>;
  rationale: string;
  confidence: string;
  model: string;
  prompt_version: string;
  policy_set_id: string;
  triggering_event_id: string;
  created_at: string;
  rule_evaluation: AgenticRuleEvaluation | null;
  resolved_by_operator: boolean;
  resolution: "approved" | "rejected" | null;
  communication_text: string | null;
}

export interface AgenticTimelineResponse {
  steps: AgenticTimelineStep[];
  pending_proposal: AgenticPendingProposal | null;
}

export async function getAgenticTimeline(
  caseId: string,
  idToken?: string | null,
): Promise<AgenticTimelineResponse | null> {
  if (isDemoMode()) return demoGetAgenticTimeline(caseId);
  return get<AgenticTimelineResponse>(
    `/api/cases/${encodeURIComponent(caseId)}/agentic-timeline`,
    idToken,
  );
}

export async function approveDecisionProposal(
  proposalId: string,
  options: { editedCommunicationText?: string },
  idToken?: string | null,
): Promise<void> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (idToken) {
    headers["authorization"] = `Bearer ${idToken}`;
  } else if (DEMO_TENANT_ID) {
    headers["x-tenant-id"] = DEMO_TENANT_ID;
  }
  const res = await fetch(
    `${API_BASE}/api/decisions/${encodeURIComponent(proposalId)}/approve`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(
        options.editedCommunicationText !== undefined
          ? { edited_communication_text: options.editedCommunicationText }
          : {},
      ),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    throw new Error(`API ${res.status} on POST /api/decisions/${proposalId}/approve`);
  }
}

/**
 * Operator-simulated inbound debtor reply. Wraps the slice 5
 * `POST /api/cases/:id/simulate-reply` route. Used by the dev
 * Simulate-reply panel on `/cases/:id` so the operator can drop in
 * a synthetic debtor reply without waiting for real Twilio inbound
 * (roadmap step 7).
 */
export interface SimulateReplyResponse {
  kind:
    | "orchestrated"
    | "routed_to_operator"
    | "dropped"
    | "classifier_failed";
  classification?: string;
  mandatory_human_escalation_triggered?: boolean;
  event_id: string;
  error_kind?: string;
  orchestrator_result?: unknown;
}

/**
 * Structured error thrown by `simulateInboundReply` when the backend
 * returns a 422 `kind: "policy_missing"` response. The Debtor phone
 * panel matches on the `kind` field to render a friendly "Creditor
 * isn't onboarded" message instead of the generic HTTP error string.
 */
export class SimulateReplyError extends Error {
  readonly kind: "policy_missing" | "other";
  readonly status: number;

  constructor(
    message: string,
    options: { kind: "policy_missing" | "other"; status: number },
  ) {
    super(message);
    this.name = "SimulateReplyError";
    this.kind = options.kind;
    this.status = options.status;
  }
}

export async function simulateInboundReply(
  caseId: string,
  body: string,
  idToken?: string | null,
  senderPhone?: string,
): Promise<SimulateReplyResponse> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (idToken) {
    headers["authorization"] = `Bearer ${idToken}`;
  } else if (DEMO_TENANT_ID) {
    headers["x-tenant-id"] = DEMO_TENANT_ID;
  }
  const payload: Record<string, string> = { body };
  if (senderPhone) payload["sender_phone"] = senderPhone;
  const res = await fetch(
    `${API_BASE}/api/cases/${encodeURIComponent(caseId)}/simulate-reply`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    let errBody: { error?: string; kind?: string; message?: string } = {};
    try {
      errBody = (await res.json()) as typeof errBody;
    } catch {
      // non-JSON error body
    }
    if (res.status === 422 && errBody.kind === "policy_missing") {
      throw new SimulateReplyError(
        errBody.message ??
          "Creditor isn't onboarded. Register a policy at /creditors first.",
        { kind: "policy_missing", status: 422 },
      );
    }
    throw new SimulateReplyError(
      errBody.message ??
        `API ${res.status} on POST /api/cases/${caseId}/simulate-reply`,
      { kind: "other", status: res.status },
    );
  }
  return (await res.json()) as SimulateReplyResponse;
}

/**
 * Operator-authored outbound reply. The composer at the bottom of
 * the Conversation panel calls this when the operator types a
 * message and presses Send. Bypasses the Decision Agent entirely;
 * the body is what the operator typed, pre-approved, dispatched via
 * the mock Twilio adapter in one round-trip.
 */
export interface OperatorReplyResponse {
  draft_id: string;
  job_id: string;
  delivery_status: string;
  provider_message_id: string | null;
  body: string;
}

// ----- Admin (dev-only — see GitHub issue #167 for removal plan) -----

export interface AdminCapabilities {
  /** True iff the Cloud Run env permits + the operator role grants it. */
  tenant_wipe: boolean;
  env_allows: boolean;
  role_allows: boolean;
}

export async function getAdminCapabilities(
  idToken?: string | null,
): Promise<AdminCapabilities> {
  const r = await get<AdminCapabilities>("/api/admin/capabilities", idToken);
  return r ?? { tenant_wipe: false, env_allows: false, role_allows: false };
}

export type TwilioSendMode = "mock" | "real";

export interface TwilioModeState {
  /** The persisted operator choice. */
  mode: TwilioSendMode;
  /** Whether the active provider's *_REAL_ENABLED permits real on this environment. */
  env_ceiling_enabled: boolean;
  /** What the backend actually uses now (mock when the ceiling is off). */
  effective_mode: TwilioSendMode;
}

/**
 * Operator-only. Reads the SMS send mode (issue #250). The mode is
 * provider-agnostic since ADR 025 — flipping affects whichever
 * provider is active (Sveve / Twilio / LINK Mobility). The endpoint
 * path keeps the legacy `twilio-mode` name; same for the underlying
 * `twilio_send_mode` settings key. Returns null when the caller is
 * not an operator (the server replies 403) or the endpoint is
 * unreachable, so the UI can simply hide the control.
 */
export async function getTwilioMode(
  idToken?: string | null,
): Promise<TwilioModeState | null> {
  return get<TwilioModeState>("/api/admin/twilio-mode", idToken).catch(
    () => null,
  );
}

/**
 * Operator-only. Flips the SMS send mode for the active provider
 * (ADR 025; legacy endpoint name retained). Switching to `real`
 * requires confirm = "REAL"; the server rejects it with an error when
 * the active provider's *_REAL_ENABLED env ceiling is off.
 */
export async function setTwilioMode(
  mode: TwilioSendMode,
  idToken?: string | null,
): Promise<TwilioModeState> {
  const body: { mode: TwilioSendMode; confirm?: string } = { mode };
  if (mode === "real") body.confirm = "REAL";
  return put<TwilioModeState>("/api/admin/twilio-mode", body, idToken);
}

export interface WipeAllClaimsResponse {
  deleted_count: number;
}

/**
 * Dev-only. Hard-deletes every Claim under the calling Operator's
 * tenant. Server gates this by ALLOW_TENANT_WIPE env + operator role.
 * Returns the count of deleted Claims. Backed by the legacy
 * `/api/admin/wipe-claims` alias so external tooling that depends on
 * the older path keeps working.
 */
export async function wipeAllClaims(
  idToken?: string | null,
): Promise<WipeAllClaimsResponse> {
  return post<WipeAllClaimsResponse>(
    "/api/admin/wipe-claims",
    { confirm: "WIPE" },
    idToken,
  );
}

export type WipeScope = "claims_only" | "everything";

export interface WipeTenantDataResponse {
  scope: WipeScope;
  deleted_count: {
    cases: number;
    decision_proposals: number;
    rule_evaluations: number;
    action_executions: number;
    creditors: number;
    jurisdictions: number;
    policy_sets: number;
  };
}

/**
 * Dev-only. Hard-deletes Claim data (and, when scope = "everything",
 * the per-tenant Creditor policies plus the shared Jurisdiction and
 * Policy Set registry rows) under the calling Operator's tenant. The
 * "everything" scope gives the Operator a true blank slate to author
 * their own Policy Set / Jurisdiction / Creditor policies from
 * scratch. Server gates this by ALLOW_TENANT_WIPE env + operator role
 * + typed `confirm=WIPE`.
 */
export async function wipeTenantData(
  scope: WipeScope,
  idToken?: string | null,
): Promise<WipeTenantDataResponse> {
  return post<WipeTenantDataResponse>(
    "/api/admin/wipe-tenant-data",
    { confirm: "WIPE", scope },
    idToken,
  );
}

export interface WipeCreditorClaimsResponse {
  creditor_slug: string;
  deleted_count: number;
}

/**
 * Dev-only. Surgical alternative to `wipeTenantData("claims_only")`
 * — hard-deletes only the Claims under one Creditor slug, preserving
 * the Creditor's policy + the rest of the tenant's Claim data. Used
 * by the per-row "Wipe claims" affordance on /creditors so pilot
 * resets don't require nuking the whole tenant. Same triple-gate as
 * the tenant-wide wipe (ALLOW_TENANT_WIPE env + operator role +
 * `confirm: "WIPE"`).
 */
export async function wipeCreditorClaims(
  creditorSlug: string,
  idToken?: string | null,
): Promise<WipeCreditorClaimsResponse> {
  return post<WipeCreditorClaimsResponse>(
    "/api/admin/wipe-creditor-claims",
    { confirm: "WIPE", creditor_slug: creditorSlug },
    idToken,
  );
}

/**
 * Hand a previously-escalated Claim back to the Decision Agent.
 * Per docs/features/resume-agent-after-escalation.md, this
 * route flips `cases.state` from `escalated` back to `sent` — the
 * state in which the Decision Agent's inbound-reply path already
 * runs, so future Debtor replies trigger an agentic turn again. 409
 * surfaces as a thrown Error whose message embeds the actual
 * `current_state` so the UI can refresh.
 */
export interface ResumeAgentResponse {
  state: string;
}

export async function resumeAgent(
  caseId: string,
  idToken?: string | null,
): Promise<ResumeAgentResponse> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (idToken) {
    headers["authorization"] = `Bearer ${idToken}`;
  } else if (DEMO_TENANT_ID) {
    headers["x-tenant-id"] = DEMO_TENANT_ID;
  }
  const res = await fetch(
    `${API_BASE}/api/cases/${encodeURIComponent(caseId)}/resume-agent`,
    {
      method: "POST",
      headers,
      cache: "no-store",
    },
  );
  if (!res.ok) {
    let errBody: { error?: string; current_state?: string } = {};
    try {
      errBody = (await res.json()) as {
        error?: string;
        current_state?: string;
      };
    } catch {
      /* non-JSON error */
    }
    const detail = errBody.current_state
      ? `${errBody.error ?? "error"} (current_state=${errBody.current_state})`
      : (errBody.error ?? `HTTP ${res.status}`);
    throw new Error(`Resume Agent failed: ${detail}`);
  }
  return (await res.json()) as ResumeAgentResponse;
}

/**
 * Reverse a STOP-induced opt-out on a Claim. Per
 * `docs/features/operator-opt-out-affordances.md` (SOL-45).
 * Operator-driven action: clears `cases.opted_out_at` back to NULL
 * and writes one `communication.opt_out_reversed` audit row. The
 * 409 `case_not_opted_out` and 404 `case_not_found` responses
 * surface as thrown Errors whose message includes the backend
 * `error` code so the UI can decide whether to refresh or hide the
 * banner.
 */
export interface RestoreCommunicationResponse {
  opted_out_at: null;
  prior_opted_out_at: string | null;
}

export async function restoreCommunication(
  caseId: string,
  reason: string,
  idToken?: string | null,
): Promise<RestoreCommunicationResponse> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (idToken) {
    headers["authorization"] = `Bearer ${idToken}`;
  } else if (DEMO_TENANT_ID) {
    headers["x-tenant-id"] = DEMO_TENANT_ID;
  }
  const res = await fetch(
    `${API_BASE}/api/cases/${encodeURIComponent(caseId)}/restore-communication`,
    {
      method: "POST",
      headers,
      cache: "no-store",
      body: JSON.stringify({ reason }),
    },
  );
  if (!res.ok) {
    let errBody: { error?: string; message?: string } = {};
    try {
      errBody = (await res.json()) as { error?: string; message?: string };
    } catch {
      /* non-JSON error */
    }
    const detail =
      errBody.message ?? errBody.error ?? `HTTP ${res.status}`;
    throw new Error(`Restore communication failed: ${detail}`);
  }
  return (await res.json()) as RestoreCommunicationResponse;
}

/**
 * Acknowledge an Input Safety alert (per
 * `docs/features/input-safety-drop-alerts-operator.md`).
 * The Operator clicks **Acknowledge** on the alert banner; this
 * writes one `input_safety.alert_acknowledged` audit row carrying
 * the original `dropped_event_id` so the banner can match
 * ack-to-drop pairs without a backend join. Resume Agent is a
 * separate affordance — both ack the alert and exit the
 * `escalated` state independently.
 */
export async function acknowledgeInputSafetyAlert(
  caseId: string,
  droppedEventId: string,
  idToken?: string | null,
): Promise<{ ok: true }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (idToken) {
    headers["authorization"] = `Bearer ${idToken}`;
  } else if (DEMO_TENANT_ID) {
    headers["x-tenant-id"] = DEMO_TENANT_ID;
  }
  const res = await fetch(
    `${API_BASE}/api/cases/${encodeURIComponent(caseId)}/acknowledge-input-safety-alert`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ dropped_event_id: droppedEventId }),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    let errBody: { error?: string; message?: string } = {};
    try {
      errBody = (await res.json()) as { error?: string; message?: string };
    } catch {
      /* non-JSON error */
    }
    throw new Error(
      `Acknowledge alert failed: ${errBody.message ?? errBody.error ?? `HTTP ${res.status}`}`,
    );
  }
  return { ok: true };
}

export async function sendOperatorReply(
  caseId: string,
  body: string,
  idToken?: string | null,
): Promise<OperatorReplyResponse> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (idToken) {
    headers["authorization"] = `Bearer ${idToken}`;
  } else if (DEMO_TENANT_ID) {
    headers["x-tenant-id"] = DEMO_TENANT_ID;
  }
  const res = await fetch(
    `${API_BASE}/api/cases/${encodeURIComponent(caseId)}/operator-reply`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ body }),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    let errBody: { error?: string } = {};
    try {
      errBody = (await res.json()) as { error?: string };
    } catch {
      /* non-JSON error */
    }
    throw new Error(
      errBody.error
        ? `Operator reply failed: ${errBody.error}`
        : `Operator reply failed (HTTP ${res.status})`,
    );
  }
  return (await res.json()) as OperatorReplyResponse;
}

export async function rejectDecisionProposal(
  proposalId: string,
  reason: string,
  idToken?: string | null,
): Promise<void> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (idToken) {
    headers["authorization"] = `Bearer ${idToken}`;
  } else if (DEMO_TENANT_ID) {
    headers["x-tenant-id"] = DEMO_TENANT_ID;
  }
  const res = await fetch(
    `${API_BASE}/api/decisions/${encodeURIComponent(proposalId)}/reject`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ reason }),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    throw new Error(`API ${res.status} on POST /api/decisions/${proposalId}/reject`);
  }
}

export async function deleteCase(
  id: string,
  idToken?: string | null,
): Promise<void> {
  const headers: Record<string, string> = {};
  if (idToken) {
    headers["authorization"] = `Bearer ${idToken}`;
  } else if (DEMO_TENANT_ID) {
    headers["x-tenant-id"] = DEMO_TENANT_ID;
  }
  const res = await fetch(`${API_BASE}/api/cases/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers,
    cache: "no-store",
  });
  if (res.status === 404) {
    throw new Error("Case not found (already deleted?).");
  }
  if (!res.ok) {
    let detail = `API ${res.status} on DELETE /api/cases/${id}`;
    try {
      const errBody = (await res.json()) as { message?: string };
      if (errBody?.message) detail = errBody.message;
    } catch {
      // fall through
    }
    throw new Error(detail);
  }
}

// ----- Operator invitation whitelist (PR #189 backend) -----

export type InvitationKind = "email" | "domain";
export type InvitationRole = "creditor" | "operator" | "auditor";
export type InvitationStatus =
  | "active"
  | "accepted"
  | "revoked"
  | "expired";

export interface Invitation {
  id: string;
  kind: InvitationKind;
  email: string | null;
  domain: string | null;
  role: InvitationRole;
  status: InvitationStatus;
  invited_by: string;
  accepted_by_firebase_uid: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
  created_at: string;
  /**
   * Per-Creditor portal scope (slice 2a). Non-NULL pins this email
   * invitation to one Creditor; NULL = legacy tenant-wide row.
   */
  creditor_slug: string | null;
}

export interface InvitationListResponse {
  invitations: Invitation[];
}

export async function listInvitations(
  idToken?: string | null,
  filter?: { creditor_slug?: string },
): Promise<InvitationListResponse> {
  const qs = filter?.creditor_slug
    ? `?creditor_slug=${encodeURIComponent(filter.creditor_slug)}`
    : "";
  const r = await get<InvitationListResponse>(
    `/api/invitations${qs}`,
    idToken,
  );
  return r ?? { invitations: [] };
}

// ----- Onboarding activity feed (rail footer) -----

export type OnboardingActivityKind =
  | "creditor"
  | "policy_set"
  | "jurisdiction"
  | "invitation";

export interface OnboardingActivityEvent {
  kind: OnboardingActivityKind;
  event_type: string;
  actor: string;
  summary: string;
  ref: Record<string, string | null>;
  created_at: string;
}

export interface OnboardingActivityResponse {
  events: OnboardingActivityEvent[];
}

export async function listOnboardingActivity(
  limit: number,
  idToken?: string | null,
): Promise<OnboardingActivityResponse> {
  const r = await get<OnboardingActivityResponse>(
    `/api/onboarding/activity?limit=${encodeURIComponent(String(limit))}`,
    idToken,
  );
  return r ?? { events: [] };
}

export interface CreateInvitationInput {
  kind: InvitationKind;
  email?: string | null;
  domain?: string | null;
  role: InvitationRole;
  expires_at?: string | null;
  /**
   * Required when kind='email' AND role='creditor' (slice 2b). The
   * Creditor detail page sets this from the route; the global
   * Whitelist form omits it (and so cannot issue Creditor portal
   * invitations).
   */
  creditor_slug?: string | null;
}

export async function createInvitation(
  input: CreateInvitationInput,
  idToken?: string | null,
): Promise<{ id: string }> {
  return post<{ id: string }>("/api/invitations", input, idToken);
}

export async function revokeInvitation(
  id: string,
  idToken?: string | null,
): Promise<{ ok: true } | { ok: false; error: DeleteBlockedError }> {
  const r = await del(`/api/invitations/${encodeURIComponent(id)}`, idToken);
  if (r.ok) return { ok: true };
  const body = (r.body ?? {}) as { message?: string };
  return {
    ok: false,
    error: {
      status: r.status,
      message: body.message ?? `Revoke failed (HTTP ${r.status}).`,
      payload: r.body,
    },
  };
}
