"use client";

import { useEffect } from "react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[root error]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-sm text-center flex flex-col gap-4">
        <h1 className="font-serif text-2xl tracking-tight">Something broke</h1>
        <p className="text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={reset}
          className="mx-auto bg-foreground text-background px-4 py-2 rounded-md text-sm hover:opacity-90 transition-opacity"
        >
          try again
        </button>
      </div>
    </div>
  );
}
