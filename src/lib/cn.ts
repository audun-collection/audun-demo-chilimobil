import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Standard shadcn-flavoured className combiner: clsx for conditional
 * truthiness, twMerge to resolve Tailwind class conflicts so caller
 * overrides win predictably.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
