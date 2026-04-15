"use client";

import * as React from "react";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const TabsRoot = TabsPrimitive.Root;

/** Panels stay mounted by default — preserves scroll + stream state across tabs. */
function TabsPanel({
  className,
  keepMounted = true,
  ...props
}: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      keepMounted={keepMounted}
      className={cn(
        "data-[hidden]:hidden animate-in fade-in duration-200",
        className
      )}
      {...props}
    />
  );
}

const tabsListVariants = cva("relative inline-flex items-center", {
  variants: {
    variant: {
      line: "h-8 gap-4 border-b border-border",
      pill: "h-8 gap-1 rounded-md bg-muted/80 p-1",
    },
  },
  defaultVariants: { variant: "line" },
});

function TabsList({
  className,
  variant,
  children,
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  const v = variant ?? "line";
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={v}
      className={cn(tabsListVariants({ variant: v }), className)}
      {...props}
    >
      <TabsIndicator variant={v} />
      {children}
    </TabsPrimitive.List>
  );
}

const tabVariants = cva(
  "relative z-10 inline-flex items-center justify-center gap-1.5 outline-none select-none cursor-pointer text-[11px] font-mono uppercase tracking-[0.12em] font-medium transition-[color,background-color,box-shadow,border-color,transform] duration-150 ease-[var(--ease-quart)] focus-visible:ring-2 focus-visible:ring-brand/40 rounded-sm disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        line: "h-8 px-0 pb-2 text-muted-foreground hover:text-foreground hover:shadow-[inset_0_-1px_0_0_color-mix(in_oklch,var(--brand)_25%,transparent)] data-[selected]:text-foreground",
        pill: "h-6 flex-1 px-2.5 text-muted-foreground hover:bg-background/70 hover:text-foreground data-[selected]:text-foreground rounded-[4px]",
      },
    },
    defaultVariants: { variant: "line" },
  }
);

function TabsTab({
  className,
  variant,
  ...props
}: TabsPrimitive.Tab.Props & VariantProps<typeof tabVariants>) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(tabVariants({ variant }), className)}
      {...props}
    />
  );
}

const indicatorVariants = cva(
  "absolute z-0 transition-[left,width,transform] duration-300 ease-[var(--ease-ios)] w-[var(--active-tab-width)] translate-x-[var(--active-tab-left)]",
  {
    variants: {
      variant: {
        line: "bottom-0 left-0 h-[2px] bg-brand rounded-full",
        pill: "top-0.5 bottom-0.5 left-0 h-auto bg-background rounded-[3px] shadow-[var(--shadow-sm)]",
      },
    },
    defaultVariants: { variant: "line" },
  }
);

function TabsIndicator({
  className,
  variant,
  ...props
}: TabsPrimitive.Indicator.Props & VariantProps<typeof indicatorVariants>) {
  return (
    <TabsPrimitive.Indicator
      data-slot="tabs-indicator"
      className={cn(indicatorVariants({ variant }), className)}
      {...props}
    />
  );
}

export { TabsRoot as Tabs, TabsList, TabsTab, TabsIndicator, TabsPanel };
