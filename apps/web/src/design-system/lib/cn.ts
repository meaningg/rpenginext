import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind class names with conflict resolution.
 *
 * @param inputs - class tokens
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
