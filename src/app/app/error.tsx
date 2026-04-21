"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-sm text-center flex flex-col gap-4">
        <h1 className="font-serif text-2xl tracking-tight">Editor crashed</h1>
        <p className="text-sm text-muted-foreground">
          {error.message || "Something went wrong in the editor."}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="bg-foreground text-background px-4 py-2 rounded-md text-sm hover:opacity-90 transition-opacity"
          >
            try again
          </button>
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            go home
          </Link>
        </div>
      </div>
    </div>
  );
}
