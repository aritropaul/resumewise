"use client";

import { Toaster } from "sonner";
import { CheckCircle, XCircle, Info } from "@phosphor-icons/react";

export function CustomToaster() {
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex items-center gap-2 px-4 py-2.5 rounded-full bg-popover/90 backdrop-blur-xl shadow-[var(--shadow-md)] border border-border text-sm text-popover-foreground max-w-[420px]",
          title: "text-sm font-medium text-foreground truncate",
          description: "text-xs text-muted-foreground truncate",
          icon: "shrink-0",
          success: "text-emerald-600 dark:text-emerald-400",
          error: "text-destructive",
        },
      }}
      icons={{
        success: (
          <CheckCircle
            weight="fill"
            className="size-4 text-emerald-600 dark:text-emerald-400"
          />
        ),
        error: <XCircle weight="fill" className="size-4 text-destructive" />,
        info: <Info weight="light" className="size-4 text-muted-foreground" />,
      }}
    />
  );
}
