/**
 * Currency formatting for the Workbench Case View.
 *
 * Henrik's Claim Ledger (per
 * `docs/architecture/features/payment-workflow-ledger.md`) carries
 * every monetary value as an integer in **minor units (øre)** — no
 * decimal arithmetic on the UI side. The two helpers below are the
 * single render-time conversion to a human-readable string.
 *
 * `formatMinorAsKr` is the v1 default — Norwegian convention
 * (`kr 1 248,50`, non-breaking-space thousands, comma decimal). When
 * multi-currency Claims land (out of scope for v1 per the upstream
 * spec §"Out of scope"), `formatMinor` takes an explicit currency
 * code.
 */

/**
 * Format an integer øre amount as a Norwegian-conventional
 * `"kr 1 248,50"` string. Negative inputs surface as `"−kr X"` —
 * used to render `unallocated_credit` (overpayment) and refund
 * Payments without breaking the layout.
 */
export function formatMinorAsKr(amountMinor: number): string {
  if (!Number.isFinite(amountMinor)) return "—";
  const major = amountMinor / 100;
  const formatted = new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(major));
  return major < 0 ? `−kr ${formatted}` : `kr ${formatted}`;
}

/**
 * Format an integer minor-unit amount with an explicit currency
 * code. v1 supports NOK only — other currencies fall back to the
 * ISO code prefix until a follow-up spec defines per-currency
 * conventions.
 */
export function formatMinor(amountMinor: number, currency: string): string {
  if (!Number.isFinite(amountMinor)) return "—";
  if (currency === "NOK") return formatMinorAsKr(amountMinor);
  const major = amountMinor / 100;
  const formatted = new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(major));
  const prefix = `${currency} `;
  return major < 0 ? `−${prefix}${formatted}` : `${prefix}${formatted}`;
}
