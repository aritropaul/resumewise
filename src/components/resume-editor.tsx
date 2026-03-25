"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { usePagedEditors } from "@/lib/use-paged-editors";

const PAGE_W = 612;
const PAGE_H = 792;

interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface Props {
  content: string | Record<string, unknown>;
  margins?: Margins;
  onActiveEditorChange?: (editor: Editor | null) => void;
  onAllEditorsChange?: (editors: Editor[]) => void;
  onSetFullContent?: (fn: (json: Record<string, unknown>) => void) => void;
}

const DEFAULT_MARGINS: Margins = { top: 48, right: 56, bottom: 48, left: 56 };

export function ResumeEditor({
  content,
  margins = DEFAULT_MARGINS,
  onActiveEditorChange,
  onAllEditorsChange,
  onSetFullContent,
}: Props) {
  const { editors, activeEditor, pageCount, setFullContent } = usePagedEditors({
    content,
    margins,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Calculate scale to fill viewport
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateScale = () => {
      const availH = container.clientHeight - 96; // subtract vertical padding
      const availW = container.clientWidth - 64;  // subtract horizontal padding
      const scaleH = availH / PAGE_H;
      const scaleW = availW / PAGE_W;
      setScale(Math.min(scaleH, scaleW, 1.5)); // cap at 1.5x
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    onActiveEditorChange?.(activeEditor);
  }, [activeEditor, onActiveEditorChange]);

  useEffect(() => {
    onAllEditorsChange?.(editors);
  }, [editors, onAllEditorsChange]);

  useEffect(() => {
    onSetFullContent?.(setFullContent);
  }, [setFullContent, onSetFullContent]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;

      if (e.key === "a") {
        e.preventDefault();
        editors.forEach((ed) => ed.commands.selectAll());
      }

      if (e.key === "c" || e.key === "x") {
        const selected = editors.filter((ed) => {
          const { from, to } = ed.state.selection;
          return from !== to;
        });
        if (selected.length > 1) {
          e.preventDefault();
          const text = selected
            .map((ed) => {
              const { from, to } = ed.state.selection;
              return ed.state.doc.textBetween(from, to, "\n");
            })
            .join("\n");
          navigator.clipboard.writeText(text);
        }
      }
    },
    [editors]
  );

  // Click on empty canvas area → clear all selections
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    // Only if clicking directly on the container or the flex wrapper, not on a page
    const target = e.target as HTMLElement;
    if (target === containerRef.current || target === containerRef.current?.firstElementChild) {
      editors.forEach((ed) => {
        try {
          const { from, to } = ed.state.selection;
          if (from !== to) {
            const tr = ed.state.tr.setSelection(
              TextSelection.create(ed.state.doc, 0)
            );
            tr.setMeta("addToHistory", false);
            tr.setMeta("clearSelectionHighlight", true);
            ed.view.dispatch(tr);
          }
        } catch { /* editor may be destroyed */ }
      });
      window.getSelection()?.removeAllRanges();
    }
  }, [editors]);

  const scaledPageW = PAGE_W * scale;
  const scaledPageH = PAGE_H * scale;

  return (
    <div ref={containerRef} className="h-full overflow-auto bg-[#f6f6f6]" onKeyDown={handleKeyDown} onClick={handleCanvasClick}>
      <div className="flex flex-col items-center py-12 px-8 gap-6">
        {editors.map((editor, i) => (
          <div
            key={`page-${i}`}
            className="shrink-0"
            style={{ width: scaledPageW, height: scaledPageH }}
          >
            <div
              data-print-page
              className="bg-white rounded-lg origin-top-left"
              style={{
                width: PAGE_W,
                height: PAGE_H,
                transform: `scale(${scale})`,
                padding: `${margins.top}px ${margins.right}px ${margins.bottom}px ${margins.left}px`,
                boxShadow:
                  "0 1px 3px rgba(0,0,0,0.08), 0 0 12px rgba(0,0,0,0.03)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: PAGE_H - margins.top - margins.bottom,
                  overflow: "hidden",
                }}
              >
                <EditorContent editor={editor} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
