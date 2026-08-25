import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";

import { cn } from "../lib/cn.ts";
import { Spinner } from "./Spinner.tsx";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-fg hover:bg-accent-hover shadow-[0_0_0_1px_rgb(232_184_109_/_0.25)]",
        secondary:
          "bg-bg-muted text-fg border border-border hover:bg-bg-hover hover:border-border-strong",
        outline:
          "bg-transparent text-fg border border-border hover:bg-white/[0.03] hover:border-border-strong",
        ghost: "bg-transparent text-fg-muted hover:bg-white/[0.04] hover:text-fg",
        danger:
          "bg-danger-muted text-danger border border-danger/25 hover:bg-danger/20",
      },
      size: {
        sm: "h-8 rounded-md px-3 text-xs",
        md: "h-9 rounded-lg px-3.5 text-sm",
        lg: "h-10 rounded-lg px-4 text-sm",
        icon: "h-9 w-9 rounded-lg",
        "icon-sm": "h-8 w-8 rounded-md",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  readonly asChild?: boolean;
  readonly loading?: boolean;
  readonly children?: ReactNode;
}

/**
 * Product button with amber-forward variants.
 *
 * When `asChild` is set, only a single React element child is allowed
 * (Radix Slot constraint). Loading spinner is disabled in that mode.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      disabled,
      children,
      type = "button",
      ...rest
    },
    ref,
  ) {
    const classes = cn(buttonVariants({ variant, size }), className);

    // Slot requires exactly one element child — never inject spinner/null beside it.
    if (asChild) {
      return (
        <Slot className={classes} ref={ref} {...rest}>
          {children as ReactElement}
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={classes}
        {...rest}
      >
        {loading ? <Spinner className="h-3.5 w-3.5 border-current" /> : null}
        {children}
      </button>
    );
  },
);

export { buttonVariants };
