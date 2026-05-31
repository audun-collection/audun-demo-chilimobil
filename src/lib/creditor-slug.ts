// Mirror of `apps/api/src/services/creditor-slug.ts`. Both
// implementations MUST produce identical output for any input —
// divergence reintroduces the floating-Claim bug class this feature
// exists to eliminate (see
// `features/ingest-creditor-slug-validation.md`).
//
// Kept as a tiny copy rather than a shared package because (a) the
// helper is six lines, (b) the @sms-mini/shared package requires a
// `tsc` build step that isn't wired into the dev loop, and (c) the
// risk-cost of one stale duplicate is lower than the risk-cost of an
// untested build-graph dependency between two apps that ship
// independently. See the matching note in apps/api.

export const SLUG_REGEX = /^[a-z][a-z0-9_]*$/;

export function slugifyCreditorName(input: string): string {
  return input
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/Ø/g, "o")
    .replace(/å/g, "a")
    .replace(/Å/g, "a")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
}

export function isLegalCreditorSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug);
}
