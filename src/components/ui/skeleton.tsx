import * as React from "react";
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-muted animate-pulse rounded-md", className)}
      {...props}
    />
  );
}

export function ResumePageSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-full w-full items-start justify-center p-6 bg-muted/30",
        className
      )}
    >
      <div className="w-full max-w-[612px] aspect-[612/792] bg-card rounded-md shadow-[var(--shadow-md)] border border-border p-10 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-2/5" />
          <Skeleton className="h-3 w-3/5" />
          <Skeleton className="h-3 w-2/5" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-2 w-11/12" />
          <Skeleton className="h-2 w-10/12" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-2 w-4/5" />
          <Skeleton className="h-2 w-9/12" />
          <Skeleton className="h-2 w-3/5" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-2 w-11/12" />
        </div>
      </div>
    </div>
  );
}

export { Skeleton };
