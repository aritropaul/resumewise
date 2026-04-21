"use client";

import * as React from "react";
import {
  ArrowsInLineVertical,
  ChartLineUp,
  Lightning,
  Check,
  PaperPlaneTilt,
  Spinner,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { useResumeStore } from "@/lib/resume-store";
import { rewriteSelection, applyScopedReplacement } from "@/lib/scoped-rewrite";
import type { SavedDocument } from "@/lib/storage";

interface SelectionPopoverProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onEnsureAiFork: () => Promise<SavedDocument | null>;
  onOpenAiTab: () => void;
}

type PresetId = "shorten" | "quantify" | "impactify" | "grammar";

const PRESETS: {
  id: PresetId;
  label: string;
  instruction: string;
  Icon: React.ComponentType<{ className?: string; weight?: "light" | "fill" | "regular" }>;
}[] = [
  {
    id: "shorten",
    label: "shorten",
    instruction:
      "Cut to roughly 60% length. Keep metrics and nouns. Drop filler words.",
    Icon: ArrowsInLineVertical,
  },
  {
    id: "quantify",
    label: "quantify",
    instruction:
      "Add concrete numbers or metrics where plausible. If none are plausible, mark a `[metric?]` placeholder. Do not invent figures.",
    Icon: ChartLineUp,
  },
  {
    id: "impactify",
    label: "impact",
    instruction:
      "Lead with the outcome or impact. Use strong verbs. Remove filler adjectives.",
    Icon: Lightning,
  },
  {
    id: "grammar",
    label: "grammar",
    instruction:
      "Fix grammar, punctuation, and clarity only. Preserve meaning, length, and tone.",
    Icon: Check,
  },
];

// Copy the textarea's layout-relevant styles into a hidden mirror div, measure
// the offset of a zero-width span at the selection start, then add that to the
// textarea's bounding rect (minus scroll) to get a viewport-anchored caret
// position. Standard technique for anchoring overlays to a textarea caret.
function getCaretCoords(
  el: HTMLTextAreaElement,
  pos: number
): { top: number; left: number; lineHeight: number } {
  const mirror = document.createElement("div");
  const style = window.getComputedStyle(el);
  const props: (keyof CSSStyleDeclaration)[] = [
    "direction",
    "boxSizing",
    "width",
    "height",
    "overflowX",
    "overflowY",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "borderStyle",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "fontStyle",
    "fontVariant",
    "fontWeight",
    "fontStretch",
    "fontSize",
    "fontSizeAdjust",
    "lineHeight",
    "fontFamily",
    "textAlign",
    "textTransform",
    "textIndent",
    "textDecoration",
    "letterSpacing",
    "wordSpacing",
    "tabSize",
  ];
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";
  for (const p of props) {
    const v = style.getPropertyValue(String(p).replace(/([A-Z])/g, "-$1").toLowerCase());
    if (v) mirror.style.setProperty(String(p).replace(/([A-Z])/g, "-$1").toLowerCase(), v);
  }
  mirror.textContent = el.value.substring(0, pos);
  const span = document.createElement("span");
  span.textContent = el.value.substring(pos) || ".";
  mirror.appendChild(span);
  document.body.appendChild(mirror);
  const spanRect = span.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  const localTop = spanRect.top - mirrorRect.top;
  const localLeft = spanRect.left - mirrorRect.left;
  const lineHeight = parseFloat(style.lineHeight || "18") || 18;
  document.body.removeChild(mirror);
  const elRect = el.getBoundingClientRect();
  return {
    top: elRect.top + localTop - el.scrollTop,
    left: elRect.left + localLeft - el.scrollLeft,
    lineHeight,
  };
}

export function SelectionPopover({
  textareaRef,
  onEnsureAiFork,
  onOpenAiTab,
}: SelectionPopoverProps) {
  const editorSelection = useResumeStore((s) => s.editorSelection);
  const setMarkdown = useResumeStore((s) => s.setMarkdown);
  const setAiSelectionChip = useResumeStore((s) => s.setAiSelectionChip);

  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(
    null
  );
  const [busyPreset, setBusyPreset] = React.useState<PresetId | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  // When a preset fires, the ensureFork callback swaps the active doc and
  // clears the selection — we want to keep the toolbar visible (with the
  // spinner) until the stream resolves, so we freeze the last known pos.
  const frozenPosRef = React.useRef<{ top: number; left: number } | null>(null);

  const hasSelection =
    !!editorSelection &&
    editorSelection.end > editorSelection.start &&
    editorSelection.value.trim().length > 0;

  // Reposition after mount, on window resize, and when the selection changes.
  React.useEffect(() => {
    if (!hasSelection || !editorSelection) {
      if (!busyPreset) setPos(null);
      return;
    }
    const el = textareaRef.current;
    if (!el) return;

    const recompute = () => {
      const coords = getCaretCoords(el, editorSelection.start);
      const elRect = el.getBoundingClientRect();
      // Anchor popover above the line where the selection starts, clamp into
      // the textarea's horizontal bounds so it never floats off into the gutter.
      const top = coords.top - 8;
      const rawLeft = coords.left;
      const clampedLeft = Math.min(
        Math.max(rawLeft, elRect.left + 12),
        elRect.right - 240
      );
      const next = { top, left: clampedLeft };
      setPos(next);
      frozenPosRef.current = next;
    };

    recompute();
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
  }, [hasSelection, editorSelection, textareaRef, busyPreset]);

  React.useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    []
  );

  const renderPos = pos ?? frozenPosRef.current;
  const shouldRender = (hasSelection && !!editorSelection && !!pos) || busyPreset !== null;
  if (!shouldRender || !renderPos) return null;

  const runPreset = async (preset: (typeof PRESETS)[number]) => {
    if (busyPreset) return;
    if (!editorSelection) return;
    const snapshot = {
      text: editorSelection.value,
      start: editorSelection.start,
      end: editorSelection.end,
    };

    setBusyPreset(preset.id);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const forked = await onEnsureAiFork();
      if (!forked) return;

      const replacement = await rewriteSelection({
        selection: snapshot.text,
        instruction: preset.instruction,
        signal: ctrl.signal,
      });

      if (!replacement.trim()) {
        toast.message("no change");
        return;
      }

      const currentMd = useResumeStore.getState().markdown;
      const next = applyScopedReplacement({
        markdown: currentMd,
        start: snapshot.start,
        end: snapshot.end,
        originalText: snapshot.text,
        replacement,
      });

      if (next.markdown === currentMd) {
        toast.error("couldn't find the original text to replace");
        return;
      }

      setMarkdown(next.markdown);
      toast.success(`${preset.label} applied`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes("abort")) return;
      toast.error(message);
    } finally {
      setBusyPreset(null);
      abortRef.current = null;
    }
  };

  const sendToAi = () => {
    if (!editorSelection) return;
    setAiSelectionChip({
      text: editorSelection.value,
      start: editorSelection.start,
      end: editorSelection.end,
    });
    onOpenAiTab();
  };

  return (
    <div
      role="toolbar"
      aria-label="ai actions for selection"
      className="fixed z-40 -translate-y-full rounded-md border border-border bg-background/95 backdrop-blur-sm shadow-md flex items-center gap-0.5 px-1 py-1 animate-panel-in"
      style={{ top: renderPos.top, left: renderPos.left }}
      onMouseDown={(e) => {
        // Prevent textarea from losing selection when clicking a toolbar button.
        e.preventDefault();
      }}
    >
      {PRESETS.map((preset) => {
        const isBusy = busyPreset === preset.id;
        const anyBusy = busyPreset !== null;
        const Icon = preset.Icon;
        return (
          <button
            key={preset.id}
            type="button"
            disabled={anyBusy}
            onClick={() => runPreset(preset)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-[11px] font-mono uppercase tracking-[0.08em] text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isBusy ? (
              <Spinner weight="light" className="size-3.5 animate-spin" />
            ) : (
              <Icon weight="light" className="size-3.5" />
            )}
            <span>{preset.label}</span>
          </button>
        );
      })}
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
      <button
        type="button"
        disabled={busyPreset !== null}
        onClick={sendToAi}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-[11px] font-mono uppercase tracking-[0.08em] text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
      >
        <PaperPlaneTilt weight="light" className="size-3.5" />
        <span>send to ai</span>
      </button>
    </div>
  );
}
