"use client";

import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50 focus-visible:ring-accent-500 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // Primary: navy on paper. Lightens a step on hover, deepens on
        // press — Audun palette collapses ink-900 and accent-500 to the
        // same navy, so the hover ramp lives inside the ink scale.
        primary:
          "bg-ink-900 text-ink-50 hover:bg-ink-800 active:bg-accent-700",
        secondary:
          "bg-ink-150 text-ink-600 hover:bg-ink-200 hover:text-ink-900",
        outline:
          "bg-ink-50 border-ink-300 text-ink-600 hover:bg-ink-150 hover:border-ink-400 hover:text-ink-900",
        ghost: "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
        danger:
          "text-clay-700 hover:bg-clay-50/70",
      },
      size: {
        sm: "h-7 px-2.5 text-[11.5px]",
        md: "h-8 px-3 text-[12.5px]",
        lg: "h-9 px-4 text-[13px]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant, size, ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...rest}
      />
    );
  },
);
