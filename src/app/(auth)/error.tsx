"use client";

import Link from "next/link";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="w-full max-w-sm text-center flex flex-col gap-4">
      <h1 className="font-serif text-2xl tracking-tight">Auth error</h1>
      <p className="text-sm text-muted-foreground">
        {error.message || "Something went wrong during authentication."}
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
  );
}
