import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border font-medium whitespace-nowrap [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border bg-transparent text-foreground",
        brand: "border-transparent bg-brand/15 text-brand dark:text-brand-foreground dark:bg-brand/30",
        destructive:
          "border-transparent bg-destructive/15 text-destructive dark:bg-destructive/25",
        success:
          "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 dark:bg-emerald-500/20",
      },
      size: {
        sm: "px-1.5 py-0.5 text-[10px] [&_svg:not([class*='size-'])]:size-3",
        md: "px-2 py-0.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "sm",
    },
  }
);

function Badge({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
