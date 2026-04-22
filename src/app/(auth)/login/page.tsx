"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { track } from "@/lib/analytics";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/app";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await authClient.signIn.email({ email, password });
      if (error) {
        toast.error(error.message || "Sign in failed");
        return;
      }
      track("login");
      router.push(redirect);
    } catch {
      toast.error("Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    track("login_google");
    await authClient.signIn.social({
      provider: "google",
      callbackURL: redirect,
    });
  }

  return (
    <div className="w-full max-w-sm flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-200" style={{ animationFillMode: "both" }}>
      <div className="text-center">
        <h1 className="font-serif text-2xl tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sign in to your ResumeWise account
        </p>
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        className="w-full flex items-center justify-center gap-2 border border-border rounded-md px-4 py-2 text-sm hover:bg-muted/50 transition-colors"
      >
        <svg className="size-4" viewBox="0 0 24 24">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        Continue with Google
      </button>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-foreground/20"
        />
        <input
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-foreground/20"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-foreground text-background rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? "signing in..." : "sign in"}
        </button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        No account?{" "}
        <Link href="/signup" className="text-foreground hover:underline">
          sign up
        </Link>
      </p>
    </div>
  );
}
