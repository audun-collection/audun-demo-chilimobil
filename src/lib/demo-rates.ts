/**
 * Norwegian debt-collection rate constants — 2026.
 *
 * Real figures, sourced from the official rates in force from
 * 1 January 2026:
 *   - Rettsgebyret (R):            kr 1 345   (rettsgebyrloven)
 *   - Forliksrådet behandling:     1,54 × R = kr 2 071  (sak innkommet etter 01.07.2024)
 *   - Forsinkelsesrente:           12,00 % p.a. (forsinkelsesrenteloven, 1. halvår 2026)
 *   - Inkassosats:                 kr 750     (inkassoforskriften)
 *   - Purregebyr / inkassovarsel:  kr 38      (1/20 av inkassosats)
 *   - Betalingsoppfordring:        kr 113
 *
 * Sources:
 *   domstol.no/rettsgebyr-og-kostnader, virke.no nøkkelsatser,
 *   skatteetaten court-fees, lovdata forsinkelsesrente.
 */

export const RETTSGEBYR_NOK = 1345;
export const FORLIKSRAD_MULTIPLIER = 1.54;
export const FORLIKSRAD_GEBYR_NOK = Math.round(
  RETTSGEBYR_NOK * FORLIKSRAD_MULTIPLIER,
); // 2 071
export const FORSINKELSESRENTE = 0.12; // 12 % p.a.
export const INKASSOSATS_NOK = 750;
export const PURREGEBYR_NOK = 38;
export const INKASSOVARSEL_GEBYR_NOK = 38;

/**
 * Light collection fee (enkelt salær, inkassoforskriften) charged once
 * a Claim enters professional collection at the betalingsoppfordring
 * stage. Tiered in multiples of the inkassosats by principal size.
 */
export function inkassosalaerNok(principalNok: number): number {
  let mult: number;
  if (principalNok <= 2500) mult = 0.5;
  else if (principalNok <= 10000) mult = 1;
  else if (principalNok <= 50000) mult = 2;
  else mult = 3;
  return Math.round(INKASSOSATS_NOK * mult);
}

/**
 * Accrued late-payment interest (forsinkelsesrente) on the principal,
 * simple interest from the due date to "now".
 */
export function accruedInterestNok(
  principalNok: number,
  daysOverdue: number,
): number {
  if (daysOverdue <= 0) return 0;
  return (
    Math.round(principalNok * FORSINKELSESRENTE * (daysOverdue / 365) * 100) /
    100
  );
}
