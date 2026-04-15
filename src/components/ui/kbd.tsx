import * as React from "react";
import { cn } from "@/lib/utils";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-border bg-muted px-1.5 h-5 text-[10px] font-mono font-medium text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

export { Kbd };
