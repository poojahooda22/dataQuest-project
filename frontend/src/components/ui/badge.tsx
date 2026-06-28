import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

// Ported from the rare-design-system Badge (variant/size/color/icon/dot/dismiss API preserved),
// restyled onto this app's theme. The rare version detected dark mode via a `data-theme` MutationObserver
// + inline `--rare-*` color styles; here colors are plain Tailwind classes keyed to our tokens, so
// dark mode flows through the app's existing `.dark` class with no extra hook. success/error use the
// shared chart-up/chart-down tokens (CVD-safe blue/orange), not red/green.

export type BadgeVariant = "pill" | "badge" | "modern";
export type BadgeSize = "sm" | "md" | "lg";
export type BadgeColor =
  | "gray" | "brand" | "error" | "warning" | "success"
  | "blueLight" | "blue" | "indigo" | "purple" | "pink" | "orange";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
  /** @default 'pill' */
  variant?: BadgeVariant;
  /** @default 'md' */
  size?: BadgeSize;
  /** No effect when variant is 'modern'. @default 'gray' */
  color?: BadgeColor;
  /** Only renders on 'modern' variant. @default true (modern), false (pill/badge) */
  dot?: boolean;
  /** Notification pulse animation. @default false */
  pulse?: boolean;
  icon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  onIconClick?: () => void;
  onTrailingIconClick?: () => void;
  onDismiss?: () => void;
}

const colorClass: Record<BadgeColor, string> = {
  gray: "bg-muted text-muted-foreground border-border",
  brand: "bg-primary/10 text-primary border-primary/20",
  success: "bg-[var(--chart-up)]/10 text-[var(--chart-up)] border-[var(--chart-up)]/25",
  error: "bg-[var(--chart-down)]/10 text-[var(--chart-down)] border-[var(--chart-down)]/25",
  warning: "bg-amber-500/10 text-amber-600 border-amber-500/25 dark:text-amber-400",
  blueLight: "bg-sky-500/10 text-sky-600 border-sky-500/25 dark:text-sky-400",
  blue: "bg-blue-500/10 text-blue-600 border-blue-500/25 dark:text-blue-400",
  indigo: "bg-indigo-500/10 text-indigo-600 border-indigo-500/25 dark:text-indigo-400",
  purple: "bg-purple-500/10 text-purple-600 border-purple-500/25 dark:text-purple-400",
  pink: "bg-pink-500/10 text-pink-600 border-pink-500/25 dark:text-pink-400",
  orange: "bg-orange-500/10 text-orange-600 border-orange-500/25 dark:text-orange-400",
};

const dotClass: Record<BadgeColor, string> = {
  gray: "bg-muted-foreground",
  brand: "bg-primary",
  success: "bg-[var(--chart-up)]",
  error: "bg-[var(--chart-down)]",
  warning: "bg-amber-500",
  blueLight: "bg-sky-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
  orange: "bg-orange-500",
};

const sizeClass: Record<BadgeSize, string> = {
  sm: "py-0.5 px-1.5 text-xs leading-none gap-1",
  md: "py-0.5 px-2 text-xs leading-none gap-1.5",
  lg: "py-1 px-2.5 text-sm leading-none gap-2",
};

const variantClass: Record<BadgeVariant, string> = {
  pill: "rounded-full border",
  badge: "rounded-md border",
  modern: "rounded-md border border-border bg-card text-foreground shadow-sm",
};

export const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  (
    {
      asChild = false,
      variant = "pill",
      size = "md",
      color = "gray",
      dot: dotProp,
      pulse = false,
      icon,
      trailingIcon,
      onIconClick,
      onTrailingIconClick,
      onDismiss,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const dot = variant === "modern" ? (dotProp ?? true) : false;
    const Comp = asChild ? Slot : "div";

    return (
      <Comp
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap font-medium transition-colors",
          sizeClass[size],
          variantClass[variant],
          variant !== "modern" && colorClass[color],
          pulse && "animate-pulse motion-reduce:animate-none",
          className,
        )}
        {...props}
      >
        {dot && (
          <span
            className={cn("size-1.5 rounded-full", variant === "modern" ? dotClass[color] : "bg-current")}
            aria-hidden="true"
          />
        )}
        {icon &&
          (onIconClick ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onIconClick();
              }}
              className="flex items-center text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-full"
            >
              {icon}
            </button>
          ) : (
            <span className="flex items-center" aria-hidden="true">
              {icon}
            </span>
          ))}
        {children}
        {trailingIcon &&
          (onTrailingIconClick ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTrailingIconClick();
              }}
              className="flex items-center text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-full"
            >
              {trailingIcon}
            </button>
          ) : (
            <span className="flex items-center" aria-hidden="true">
              {trailingIcon}
            </span>
          ))}
        {onDismiss && (
          <button
            type="button"
            className="ml-0.5 flex items-center justify-center rounded-full p-0.5 text-current opacity-70 transition-opacity hover:bg-accent hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            aria-label="Dismiss"
          >
            <X size={size === "sm" ? 12 : 14} />
          </button>
        )}
      </Comp>
    );
  },
);
Badge.displayName = "Badge";