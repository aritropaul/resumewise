"use client";

import Link from "next/link";
import {
  FileText,
  Sparkle,
  ShieldCheck,
  ArrowRight,
} from "@phosphor-icons/react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <span className="font-serif text-xl tracking-tight">ResumeWise</span>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            log in
          </Link>
          <Link
            href="/signup"
            className="text-sm bg-foreground text-background px-4 py-1.5 rounded-md hover:opacity-90 transition-opacity"
          >
            sign up
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center max-w-2xl mx-auto gap-6">
        <h1 className="font-serif text-4xl md:text-5xl tracking-tight leading-tight">
          Resumes that land interviews
        </h1>
        <p className="text-muted-foreground text-lg max-w-md">
          AI-powered editor that tailors your resume for every application.
          Bring your own API key. Your data stays yours.
        </p>
        <Link
          href="/signup"
          className="inline-flex items-center gap-2 bg-foreground text-background px-6 py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          get started
          <ArrowRight weight="bold" className="size-4" />
        </Link>
      </main>

      {/* Features */}
      <section className="border-t border-border px-6 py-16">
        <div className="max-w-3xl mx-auto grid md:grid-cols-3 gap-8">
          <div className="flex flex-col gap-2">
            <FileText weight="light" className="size-6 text-muted-foreground" />
            <h3 className="font-medium text-sm">5 PDF templates</h3>
            <p className="text-sm text-muted-foreground">
              Classic, Modern, Business, Editorial, Mono. Live preview, instant PDF export.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Sparkle weight="light" className="size-6 text-muted-foreground" />
            <h3 className="font-medium text-sm">AI that rewrites, not regurgitates</h3>
            <p className="text-sm text-muted-foreground">
              Tailored edits with job-fit scoring. Anthropic, OpenAI, Gemini, Grok, OpenRouter.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <ShieldCheck weight="light" className="size-6 text-muted-foreground" />
            <h3 className="font-medium text-sm">Bring your own key</h3>
            <p className="text-sm text-muted-foreground">
              Your API keys, encrypted at rest. No middleman. No markup on tokens.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-4 text-center text-xs text-muted-foreground">
        ResumeWise
      </footer>
    </div>
  );
}
