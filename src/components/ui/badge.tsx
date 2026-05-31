"use client";

import { type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] leading-[1.5]",
  {
    variants: {
      tone: {
        neutral: "bg-ink-200/70 text-ink-600",
        info: "bg-accent-100 text-amber-700",
        warn: "bg-amber-50 text-amber-700",
        success: "bg-sage-50 text-sage-700",
        danger: "bg-clay-50 text-clay-700",
        accent: "bg-accent-50 text-accent-700",
        // Quiet chrome — dev/non-prod tags that should sit in the
        // background, not shout. Soft frosted ink, no warning colour.
        muted: "bg-ink-200/45 text-ink-500 border border-ink-300/40",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...rest }: BadgeProps): JSX.Element {
  return <span className={cn(badgeVariants({ tone }), className)} {...rest} />;
}

/**
 * Map a case state (or comparable string) to a tone. Centralised so
 * every surface that renders status uses the same colour language.
 */
export function statusTone(
  state: string,
): NonNullable<VariantProps<typeof badgeVariants>["tone"]> {
  switch (state) {
    case "parsed":
    case "queued":
      return "info";
    case "drafting":
      // Transient — the LLM drafter has the row claimed. Tone-coded as
      // `info` (same as `parsed`) so the badge reads as "still moving
      // toward drafted" rather than the warning amber of needs_review.
      return "info";
    case "needs_review":
      return "warn";
    case "drafted":
    case "pending":
      return "accent";
    case "approved":
    case "sent":
      return "success";
    case "failed":
    case "rejected":
      return "danger";
    default:
      return "neutral";
  }
}

/**
 * Operator-facing label for a case state. Same set of states as the
 * backend enum, but with friendly copy ("Ready to draft" not
 * "parsed"). Keep in sync with the friendlyState() in
 * `app/ingest/page.tsx` until one of them is fully retired.
 */
export function friendlyState(state: string): string {
  switch (state) {
    case "parsed":
      return "Ready to draft";
    case "drafting":
      return "Drafting…";
    case "needs_review":
      return "Needs review";
    case "drafted":
      return "Drafted";
    case "pending":
      return "Pending";
    case "approved":
      return "Approved";
    case "queued":
      return "Queued";
    case "sent":
      return "Sent";
    case "failed":
      return "Failed";
    case "rejected":
      return "Rejected";
    default:
      // Fall back to a Title-Cased version of the raw state so
      // unknown values still read tolerably.
      return state
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
