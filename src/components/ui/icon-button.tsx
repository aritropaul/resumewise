"use client";

import * as React from "react";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const iconButtonVariants = cva(
  "relative inline-flex items-center justify-center rounded-md outline-none transition-[background-color,color,transform] duration-150 ease-[var(--ease-quart)] focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-40 disabled:pointer-events-none active:scale-[0.96] [&_svg]:shrink-0 before:absolute before:inset-0 before:-m-1",
  {
    variants: {
      variant: {
        ghost: "text-muted-foreground hover:text-foreground hover:bg-muted",
        outline:
          "border border-border bg-background hover:bg-muted text-foreground",
        brand:
          "bg-brand text-brand-foreground hover:bg-brand/90",
      },
      size: {
        xs: "size-6 [&_svg]:size-3.5",
        sm: "size-7 [&_svg]:size-4",
        md: "size-8 [&_svg]:size-4",
        lg: "size-9 [&_svg]:size-[18px]",
      },
    },
    defaultVariants: { variant: "ghost", size: "md" },
  }
);

type IconButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof iconButtonVariants> & {
    "aria-label": string;
  };

function IconButton({
  className,
  variant,
  size,
  ...props
}: IconButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="icon-button"
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { IconButton, iconButtonVariants };
