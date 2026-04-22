"use client";

import * as React from "react";
import { Check, X } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { DiffHunk, HunkStatus } from "@/lib/resume-diff";
import { formatHunkSummary } from "@/lib/resume-diff";

interface AiDiffViewProps {
  hunks: DiffHunk[];
  decisions: Map<string, HunkStatus>;
  onDecide: (id: string, status: HunkStatus) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onApply: () => void;
  onDiscard: () => void;
}

export function AiDiffView({
  hunks,
  decisions,
  onDecide,
  onAcceptAll,
  onRejectAll,
  onApply,
  onDiscard,
}: AiDiffViewProps) {
  if (hunks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
        <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
          no changes
        </span>
        <p className="text-xs text-muted-foreground">
          the rewrite matches your current resume.
        </p>
        <button
          type="button"
          onClick={onDiscard}
          className="mt-2 h-7 rounded-sm border border-border px-3 text-[11px] font-mono uppercase tracking-[0.12em] hover:bg-muted"
        >
          dismiss
        </button>
      </div>
    );
  }

  const accepted = Array.from(decisions.values()).filter((s) => s === "accepted").length;
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2">
        <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-muted-foreground">
          {hunks.length} change{hunks.length === 1 ? "" : "s"} · {accepted} accepted
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onRejectAll}
            className="h-6 rounded-sm border border-border px-2 text-[10px] font-mono uppercase tracking-[0.12em] hover:bg-muted"
          >
            reject all
          </button>
          <button
            type="button"
            onClick={onAcceptAll}
            className="h-6 rounded-sm border border-border px-2 text-[10px] font-mono uppercase tracking-[0.12em] hover:bg-muted"
          >
            accept all
          </button>
        </div>
      </div>

      {hunks.map((h, i) => {
        const status = decisions.get(h.id) ?? "pending";
        return (
          <motion.div
            key={h.id}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1], delay: Math.min(i, 8) * 0.04 }}
          >
            <HunkCard hunk={h} status={status} onDecide={onDecide} />
          </motion.div>
        );
      })}

      <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border bg-background pt-2">
        <button
          type="button"
          onClick={onDiscard}
          className="h-7 rounded-sm border border-border px-3 text-[11px] font-mono uppercase tracking-[0.12em] hover:bg-muted"
        >
          discard
        </button>
        <button
          type="button"
          onClick={onApply}
          className="h-7 rounded-sm bg-foreground px-3 text-[11px] font-mono uppercase tracking-[0.12em] text-background hover:opacity-90"
        >
          apply {accepted} / {hunks.length}
        </button>
      </div>
    </div>
  );
}

function HunkCard({
  hunk,
  status,
  onDecide,
}: {
  hunk: DiffHunk;
  status: HunkStatus;
  onDecide: (id: string, status: HunkStatus) => void;
}) {
  return (
    <div
      className={cn(
        "rounded-md border bg-background",
        status === "accepted" && "border-emerald-500/50",
        status === "rejected" && "border-destructive/40 opacity-70",
        status === "pending" && "border-border"
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground tabular" data-tabular>
          {formatHunkSummary(hunk)}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="reject hunk"
            onClick={() =>
              onDecide(hunk.id, status === "rejected" ? "pending" : "rejected")
            }
            className={cn(
              "inline-flex size-5 items-center justify-center rounded-sm border",
              status === "rejected"
                ? "border-destructive bg-destructive/10 text-destructive"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            <X weight="bold" className="size-3" />
          </button>
          <button
            type="button"
            aria-label="accept hunk"
            onClick={() =>
              onDecide(hunk.id, status === "accepted" ? "pending" : "accepted")
            }
            className={cn(
              "inline-flex size-5 items-center justify-center rounded-sm border",
              status === "accepted"
                ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            <Check weight="bold" className="size-3" />
          </button>
        </div>
      </div>

      <pre className="overflow-x-auto px-3 py-2 font-mono text-[11.5px] leading-[1.55]">
        {hunk.context.map((line, i) => (
          <div key={`c${i}`} className="text-muted-foreground/70">
            {"  "}
            {line || "\u00A0"}
          </div>
        ))}
        {hunk.removed.map((line, i) => (
          <div key={`r${i}`} className="bg-destructive/10 text-destructive">
            {"- "}
            {line || "\u00A0"}
          </div>
        ))}
        {hunk.added.map((line, i) => (
          <div
            key={`a${i}`}
            className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          >
            {"+ "}
            {line || "\u00A0"}
          </div>
        ))}
      </pre>
    </div>
  );
}
