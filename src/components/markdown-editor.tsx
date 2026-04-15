"use client";

import * as React from "react";
import { useResumeStore } from "@/lib/resume-store";

// Plain-textarea markdown editor with two quality-of-life helpers plus
// selection sync:
//  - Tab inserts two spaces.
//  - Enter on a bullet line continues the list (or ends it if empty).
//  - Current selection range is published to the store so the right-panel
//    Design controls can wrap it in directives. External selection-apply
//    requests from the store (after a wrap edit) are honored by re-selecting
//    the same range in the textarea.

interface MarkdownEditorProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
}

const BULLET_RE = /^(\s*)([-*])(\s+)(.*)$/;

export const MarkdownEditor = React.forwardRef<
  HTMLTextAreaElement,
  MarkdownEditorProps
>(function MarkdownEditor(
  { value, onChange, placeholder, className },
  forwardedRef
) {
  const localRef = React.useRef<HTMLTextAreaElement>(null);
  const ref = localRef;
  React.useImperativeHandle(
    forwardedRef,
    () => localRef.current as HTMLTextAreaElement,
    []
  );
  const setEditorSelection = useResumeStore((s) => s.setEditorSelection);
  const editorSelection = useResumeStore((s) => s.editorSelection);
  const lastAppliedRevision = React.useRef<number>(-1);

  const publishSelection = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const sel = { start, end, value: el.value.slice(start, end) };
    setEditorSelection(sel);
  }, [setEditorSelection]);

  // Apply externally-requested selection changes (the panel wrapped a range
  // and wants the textarea to re-highlight it).
  React.useEffect(() => {
    const el = ref.current;
    if (!el || !editorSelection) return;
    if (editorSelection.revision === lastAppliedRevision.current) return;
    // Only apply when the store's range differs from the textarea's live one,
    // which is the case after a `requestSelectionApply` call.
    if (
      el.selectionStart !== editorSelection.start ||
      el.selectionEnd !== editorSelection.end
    ) {
      el.focus();
      el.setSelectionRange(editorSelection.start, editorSelection.end);
    }
    lastAppliedRevision.current = editorSelection.revision;
  }, [editorSelection]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = event.currentTarget;

    if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      const { selectionStart, selectionEnd, value: v } = el;
      const next = v.slice(0, selectionStart) + "  " + v.slice(selectionEnd);
      onChange(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = selectionStart + 2;
      });
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      const { selectionStart, value: v } = el;
      const lineStart = v.lastIndexOf("\n", selectionStart - 1) + 1;
      const line = v.slice(lineStart, selectionStart);
      const match = line.match(BULLET_RE);
      if (match) {
        const [, indent, marker, space, rest] = match;
        if (!rest.trim()) {
          event.preventDefault();
          const before = v.slice(0, lineStart);
          const after = v.slice(selectionStart);
          const next = before + "\n" + after;
          onChange(next);
          requestAnimationFrame(() => {
            el.selectionStart = el.selectionEnd = before.length + 1;
          });
          return;
        }
        event.preventDefault();
        const insert = `\n${indent}${marker}${space}`;
        const next = v.slice(0, selectionStart) + insert + v.slice(selectionStart);
        onChange(next);
        requestAnimationFrame(() => {
          el.selectionStart = el.selectionEnd = selectionStart + insert.length;
        });
      }
    }
  };

  return (
    <textarea
      ref={ref}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
      onKeyUp={publishSelection}
      onMouseUp={publishSelection}
      onSelect={publishSelection}
      onBlur={publishSelection}
      spellCheck={false}
      className={
        "h-full w-full resize-none bg-background font-mono text-[13px] leading-[1.65] text-foreground " +
        "px-8 py-6 outline-none focus-visible:ring-0 " +
        "placeholder:text-muted-foreground/50 " +
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden " +
        (className ?? "")
      }
    />
  );
});
