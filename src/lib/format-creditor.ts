import type { CreditorOption } from "./api";

/**
 * Renders a Creditor's display name from the onboarded list, falling
 * back to the slug if the Creditor hasn't been registered yet (or
 * registration is still loading). Used everywhere a `cases.creditor`
 * slug needs to become operator-readable prose ("Island Fitness"
 * rather than `island_fitness`).
 *
 * Per peter@audun.no's 2026-05-13 feedback: "creditor slug is hard
 * to interpret".
 */
export function creditorDisplayName(
  slug: string | null | undefined,
  creditors: ReadonlyArray<Pick<CreditorOption, "creditor_slug" | "display_name">>,
): string {
  if (!slug) return "—";
  const match = creditors.find((c) => c.creditor_slug === slug);
  if (match && match.display_name && match.display_name.trim().length > 0) {
    return match.display_name;
  }
  return slug;
}
