import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";

import { cn } from "../lib/cn.ts";

/**
 * Dropdown menu root.
 */
export function DropdownMenu({
  children,
  ...props
}: DropdownMenuPrimitive.DropdownMenuProps) {
  return (
    <DropdownMenuPrimitive.Root {...props}>{children}</DropdownMenuPrimitive.Root>
  );
}

export function DropdownMenuTrigger({
  children,
  ...props
}: DropdownMenuPrimitive.DropdownMenuTriggerProps) {
  return (
    <DropdownMenuPrimitive.Trigger asChild {...props}>
      {children}
    </DropdownMenuPrimitive.Trigger>
  );
}

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: DropdownMenuPrimitive.DropdownMenuContentProps) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-44 overflow-hidden rounded-lg border border-border bg-bg-surface p-1 shadow-pop animate-fade-in",
          className,
        )}
        {...props}
      >
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  danger = false,
  children,
  ...props
}: DropdownMenuPrimitive.DropdownMenuItemProps & {
  readonly danger?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-40",
        danger
          ? "text-danger focus:bg-danger-muted"
          : "text-fg-muted focus:bg-white/[0.04] focus:text-fg",
        className,
      )}
      {...props}
    >
      {children}
    </DropdownMenuPrimitive.Item>
  );
}

export function DropdownMenuSeparator({
  className,
}: {
  readonly className?: string;
}) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn("my-1 h-px bg-border", className)}
    />
  );
}
