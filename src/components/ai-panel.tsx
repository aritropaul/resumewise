"use client";

import * as React from "react";
import { PaperPlaneTilt, Sparkle, Stop, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { BezelCard } from "@/components/ui/card";
import { AiDiffView } from "@/components/ai-diff-view";
import { useResumeStore } from "@/lib/resume-store";
import { getApiKey } from "@/lib/ai";
import type { SavedDocument } from "@/lib/storage";
import {
  applyDecisions,
  computeHunks,
  type DiffHunk,
  type HunkStatus,
} from "@/lib/resume-diff";
import { rewriteSelection, applyScopedReplacement } from "@/lib/scoped-rewrite";

interface AiPanelProps {
  markdown: string;
  activeFile: SavedDocument;
  jobDescription: string | null;
  onEnsureVariant: () => Promise<SavedDocument | null>;
  onEnsureAiFork: () => Promise<SavedDocument | null>;
}

type Mode = "idle" | "chat" | "analyze" | "tailor";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// Extract the markdown body inside ```markdown ... ``` fences. Tolerates
// partial fences while streaming.
function extractFencedMarkdown(raw: string): string | null {
  const match = raw.match(/```(?:markdown|md)?\n([\s\S]*?)(?:\n```|$)/i);
  if (!match) return null;
  return match[1];
}

export function AiPanel({
  markdown,
  activeFile,
  jobDescription,
  onEnsureVariant,
  onEnsureAiFork,
}: AiPanelProps) {
  const aiPrefill = useResumeStore((s) => s.aiPrefill);
  const setAiPrefill = useResumeStore((s) => s.setAiPrefill);
  const aiWorkflowMode = useResumeStore((s) => s.aiWorkflowMode);
  const setAiWorkflowMode = useResumeStore((s) => s.setAiWorkflowMode);
  const replaceMarkdown = useResumeStore((s) => s.replaceMarkdown);
  const setMarkdown = useResumeStore((s) => s.setMarkdown);
  const aiSelectionChip = useResumeStore((s) => s.aiSelectionChip);
  const setAiSelectionChip = useResumeStore((s) => s.setAiSelectionChip);

  const [input, setInput] = React.useState("");
  const [turns, setTurns] = React.useState<ChatTurn[]>([]);
  const [streamingText, setStreamingText] = React.useState<string>("");
  const [streaming, setStreaming] = React.useState(false);
  const [hunks, setHunks] = React.useState<DiffHunk[] | null>(null);
  const [decisions, setDecisions] = React.useState<Map<string, HunkStatus>>(
    new Map()
  );
  const [candidateMarkdown, setCandidateMarkdown] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  // Soak up any prefill the command palette or job panel queued.
  React.useEffect(() => {
    if (aiPrefill) {
      setInput(aiPrefill);
      setAiPrefill(null);
    }
  }, [aiPrefill, setAiPrefill]);

  // Reset state when active doc changes — but skip the reset when the change
  // was caused by an in-flight fork we initiated ourselves (fork-on-first-edit
  // swaps activeFile.id mid-stream and we'd otherwise lose the turn state).
  const lastResetIdRef = React.useRef<string>(activeFile.id);
  const expectedForkIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (lastResetIdRef.current === activeFile.id) return;
    if (expectedForkIdRef.current === activeFile.id) {
      lastResetIdRef.current = activeFile.id;
      expectedForkIdRef.current = null;
      return;
    }
    lastResetIdRef.current = activeFile.id;
    setTurns([]);
    setStreamingText("");
    setHunks(null);
    setDecisions(new Map());
    setCandidateMarkdown(null);
  }, [activeFile.id]);

  const runRequest = async (mode: Mode, prompt: string) => {
    if (streaming) return;
    const apiKey = getApiKey() || undefined;

    // Tailor mode creates/opens a job-matched variant (JD required).
    // Chat mode forks a plain variant on the first AI edit to protect the base.
    // Analyze is read-only critique — no fork.
    if (mode === "tailor") {
      const ok = await onEnsureVariant();
      if (!ok) return;
      expectedForkIdRef.current = ok.id;
    } else if (mode === "chat") {
      const ok = await onEnsureAiFork();
      if (!ok) return;
      expectedForkIdRef.current = ok.id;
    }

    const userTurn: ChatTurn = { role: "user", content: prompt };
    const nextTurns = [...turns, userTurn];
    setTurns(nextTurns);
    setInput("");
    setStreamingText("");
    setHunks(null);
    setDecisions(new Map());
    setCandidateMarkdown(null);
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          apiKey,
          messages: nextTurns,
          markdown,
          jobDescription,
          mode,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "request failed" }));
        throw new Error(err.error || `request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const eventLine = frame.split("\n").find((l) => l.startsWith("event:"));
          const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!eventLine || !dataLine) continue;
          const eventName = eventLine.slice("event:".length).trim();
          let payload: { text?: string; message?: string } = {};
          try {
            payload = JSON.parse(dataLine.slice("data:".length).trim());
          } catch {
            // ignore
          }
          if (eventName === "chunk" && payload.text) {
            accumulated += payload.text;
            setStreamingText(accumulated);
          } else if (eventName === "error") {
            throw new Error(payload.message || "stream error");
          } else if (eventName === "done") {
            // no-op; loop will exit naturally when reader is done.
          }
        }
      }

      setTurns([...nextTurns, { role: "assistant", content: accumulated }]);

      if (mode === "analyze") {
        // Pure critique — nothing to diff.
        return;
      }

      const extracted = extractFencedMarkdown(accumulated) ?? accumulated.trim();
      if (!extracted || extracted === markdown) {
        toast.message("no changes");
        return;
      }
      const next = computeHunks(markdown, extracted);
      setCandidateMarkdown(extracted);
      setHunks(next);
      setDecisions(new Map());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes("abort")) return;
      toast.error(message);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const runScopedRequest = async (instruction: string) => {
    if (streaming || !aiSelectionChip) return;
    const apiKey = getApiKey() || undefined;
    const chip = aiSelectionChip;

    const userTurn: ChatTurn = {
      role: "user",
      content: `rewrite selection: ${instruction}`,
    };
    const nextTurns = [...turns, userTurn];
    setTurns(nextTurns);
    setInput("");
    setStreamingText("");
    setHunks(null);
    setDecisions(new Map());
    setCandidateMarkdown(null);
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const forked = await onEnsureAiFork();
      if (!forked) return;
      expectedForkIdRef.current = forked.id;

      const replacement = await rewriteSelection({
        selection: chip.text,
        instruction,
        apiKey,
        signal: ctrl.signal,
        onChunk: (acc) => setStreamingText(acc),
      });

      if (!replacement) {
        toast.message("no change");
        return;
      }

      const currentMd = useResumeStore.getState().markdown;
      const next = applyScopedReplacement({
        markdown: currentMd,
        start: chip.start,
        end: chip.end,
        originalText: chip.text,
        replacement,
      });

      if (next.markdown === currentMd) {
        toast.error("couldn't find the original selection to replace");
        return;
      }

      setMarkdown(next.markdown);
      setAiSelectionChip(null);
      setTurns([
        ...nextTurns,
        { role: "assistant", content: `rewrote selection (${replacement.length} chars)` },
      ]);
      toast.success("selection rewritten");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes("abort")) return;
      toast.error(message);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (aiSelectionChip) {
      void runScopedRequest(trimmed);
      return;
    }
    void runRequest(aiWorkflowMode === "idle" ? "chat" : aiWorkflowMode, trimmed);
    setAiWorkflowMode("idle");
  };

  const stopStream = () => {
    abortRef.current?.abort();
  };

  const setAllDecisions = (status: HunkStatus) => {
    if (!hunks) return;
    const next = new Map<string, HunkStatus>();
    for (const h of hunks) next.set(h.id, status);
    setDecisions(next);
  };

  const applyHunks = () => {
    if (!hunks || !candidateMarkdown) return;
    const result = applyDecisions(markdown, candidateMarkdown, decisions);
    setMarkdown(result);
    replaceMarkdown(result);
    setHunks(null);
    setCandidateMarkdown(null);
    setDecisions(new Map());
    toast.success("applied AI changes");
  };

  const discardHunks = () => {
    setHunks(null);
    setCandidateMarkdown(null);
    setDecisions(new Map());
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {turns.length === 0 && !streaming && !hunks ? (
          <EmptyCoach onPick={(s) => setInput(s)} />
        ) : null}

        {turns.map((turn, i) => (
          <TurnBubble key={i} turn={turn} />
        ))}

        {streaming ? <StreamingIndicator charCount={streamingText.length} /> : null}

        {hunks ? (
          <div className="mt-2">
            <AiDiffView
              hunks={hunks}
              decisions={decisions}
              onDecide={(id, status) =>
                setDecisions((prev) => {
                  const next = new Map(prev);
                  next.set(id, status);
                  return next;
                })
              }
              onAcceptAll={() => setAllDecisions("accepted")}
              onRejectAll={() => setAllDecisions("rejected")}
              onApply={applyHunks}
              onDiscard={discardHunks}
            />
          </div>
        ) : null}
      </div>

      <div className="border-t border-border bg-background px-3 py-2">
        {aiSelectionChip ? (
          <SelectionChip
            text={aiSelectionChip.text}
            onClear={() => setAiSelectionChip(null)}
          />
        ) : null}
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={
              aiSelectionChip
                ? "describe how to rewrite the selection…"
                : "ask for a rewrite — tighten bullets, tailor to a jd, sharpen the summary."
            }
            className="min-h-[72px]"
            autoGrow
            maxHeight={200}
          />
          {streaming ? (
            <IconButton aria-label="stop" onClick={stopStream}>
              <Stop weight="fill" />
            </IconButton>
          ) : (
            <IconButton
              aria-label="send"
              onClick={handleSubmit}
              disabled={!input.trim()}
            >
              <PaperPlaneTilt weight="light" />
            </IconButton>
          )}
        </div>
        {jobDescription && !aiSelectionChip ? (
          <div className="mt-1 text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground">
            job description attached · {jobDescription.length} chars
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SelectionChip({ text, onClear }: { text: string; onClear: () => void }) {
  const preview = text.length > 120 ? `${text.slice(0, 120)}…` : text;
  return (
    <div className="mb-2 flex items-start gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
          selection · {text.length} chars
        </div>
        <div className="mt-0.5 truncate font-mono text-[11px] text-foreground/90">
          {preview}
        </div>
      </div>
      <button
        type="button"
        aria-label="clear selection"
        onClick={onClear}
        className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
      >
        <X weight="light" className="size-3.5" />
      </button>
    </div>
  );
}

function TurnBubble({ turn }: { turn: ChatTurn }) {
  // Assistant replies are full-document rewrites — too noisy to render in-line.
  // Show a compact summary instead; the diff view below holds the actual changes.
  const preview =
    turn.role === "assistant"
      ? (extractFencedMarkdown(turn.content)
          ? `rewrite · ${extractFencedMarkdown(turn.content)!.split("\n").length} lines`
          : firstLine(turn.content, 120))
      : turn.content;
  return (
    <BezelCard className="mb-2 px-3 py-2">
      <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
        {turn.role}
      </div>
      <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.55]">
        {preview}
      </pre>
    </BezelCard>
  );
}

function firstLine(text: string, max: number): string {
  const first = (text.split("\n").find((l) => l.trim()) ?? "").trim();
  return first.length > max ? `${first.slice(0, max)}…` : first;
}

function StreamingIndicator({ charCount }: { charCount: number }) {
  return (
    <div className="mb-2 flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2">
      <span className="relative inline-flex size-2 shrink-0">
        <span className="absolute inset-0 rounded-full bg-brand" />
        <span className="absolute inset-0 rounded-full bg-brand/60 animate-ping" />
      </span>
      <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
        rewriting
      </span>
      <span className="flex-1" />
      <span
        className="text-[10px] font-mono tabular text-muted-foreground"
        data-tabular
      >
        {charCount.toString().padStart(4, "0")} chars
      </span>
    </div>
  );
}

function EmptyCoach({ onPick }: { onPick: (s: string) => void }) {
  const suggestions = [
    "tighten my work bullets",
    "rewrite my summary to sound senior",
    "tailor to the attached job",
  ];
  return (
    <div className="flex flex-col items-center gap-3 px-4 pt-8 text-center">
      <Sparkle weight="light" className="size-6 text-muted-foreground" />
      <h2 className="text-sm font-medium text-foreground">AI rewrite</h2>
      <p className="max-w-[32ch] text-xs leading-relaxed text-muted-foreground">
        the assistant returns a full rewrite. you review each change as a hunk
        and accept or reject it before it lands.
      </p>
      <div className="flex flex-wrap justify-center gap-1.5 pt-2">
        {suggestions.map((s) => (
          <Button key={s} size="sm" variant="outline" onClick={() => onPick(s)}>
            {s}
          </Button>
        ))}
      </div>
    </div>
  );
}
