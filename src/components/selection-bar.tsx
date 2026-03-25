"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Editor } from "@tiptap/react";
import { Sparkles, ArrowUp, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getApiKey, editorJsonToText } from "@/lib/ai";
import { executeToolCall } from "@/lib/editor-tools";

/** Safely get editor DOM — TipTap throws on destroyed editors */
function getEditorDom(ed: Editor): HTMLElement | null {
  try { return ed.view?.dom ?? null; } catch { return null; }
}

interface Props {
  allEditors: Editor[];
  collectEditorJson: (editors: Editor[]) => Record<string, unknown> | null;
  setFullContent: React.RefObject<((json: Record<string, unknown>) => void) | null>;
}

type Mode = "input" | "result";

export function SelectionBar({ allEditors, collectEditorJson, setFullContent }: Props) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [selectedText, setSelectedText] = useState("");
  const [activeEditorIndex, setActiveEditorIndex] = useState<number | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ from: number; to: number } | null>(null);
  const [mode, setMode] = useState<Mode>("input");
  const [askInput, setAskInput] = useState("");
  const [result, setResult] = useState("");
  const [isImproveResult, setIsImproveResult] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const resetState = useCallback(() => {
    setMode("input");
    setAskInput("");
    setResult("");
    setIsImproveResult(false);
    setIsLoading(false);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  // Show bar on mouseup (after selection is complete), not during selection
  useEffect(() => {
    if (allEditors.length === 0) return;

    const handleMouseUp = () => {
      // Small delay so the selection is finalized
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) return;

        const range = sel.getRangeAt(0);

        // Find which editor contains this selection
        let editorIdx = -1;
        for (let i = 0; i < allEditors.length; i++) {
          if (getEditorDom(allEditors[i])?.contains(range.startContainer)) {
            editorIdx = i;
            break;
          }
        }
        if (editorIdx === -1) return;

        const editor = allEditors[editorIdx];
        const { from, to } = editor.state.selection;
        if (from === to) return;

        const text = editor.state.doc.textBetween(from, to, " ");
        if (!text.trim()) return;

        setSelectedText(text);
        setActiveEditorIndex(editorIdx);
        setSelectionRange({ from, to });

        // Position above the selection
        const rect = range.getBoundingClientRect();
        const barWidth = 320;
        const left = Math.max(8, Math.min(rect.left + rect.width / 2 - barWidth / 2, window.innerWidth - barWidth - 8));
        const top = rect.top - 40;
        setPosition({ top: Math.max(8, top), left });
        setVisible(true);
      }, 10);
    };

    // Hide when clicking outside the bar (deselection)
    const handleMouseDown = (e: MouseEvent) => {
      if (barRef.current?.contains(e.target as Node)) return;
      // If clicking in an editor, wait for mouseup to potentially show again
      // If clicking elsewhere, hide
      const inEditor = allEditors.some((ed) => getEditorDom(ed)?.contains(e.target as Node));
      if (!inEditor) {
        setVisible(false);
        resetState();
      }
    };

    // Also hide on selectionchange when selection collapses
    const handleSelectionChange = () => {
      if (barRef.current?.contains(document.activeElement)) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setVisible(false);
        resetState();
      }
    };

    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [allEditors, resetState]);

  const callAI = useCallback(
    async (promptType: "improve" | "ask", question?: string) => {
      const apiKey = getApiKey();
      if (!apiKey) {
        toast.error("Set your API key in the AI panel first");
        return;
      }

      setIsLoading(true);
      setResult("");
      setIsImproveResult(promptType === "improve");
      setMode("result");

      const documentText = editorJsonToText(collectEditorJson(allEditors));
      const controller = new AbortController();
      abortRef.current = controller;

      // For "improve": use tools so AI can directly edit
      // For "ask": just get text response about the selection
      const useTools = promptType === "improve";
      const messages = promptType === "improve"
        ? [{ role: "user", content: `Improve this selected text from my resume: "${selectedText}". Use the replace_text tool to make the edit directly.` }]
        : [{ role: "user", content: question || "" }];

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey,
            messages,
            documentText,
            selectedText,
            mode: useTools ? "chat" : "selection",
            prompt: promptType,
            useTools,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          let errMsg = "Request failed";
          try { const err = await res.json(); errMsg = err.error || errMsg; } catch { errMsg = `HTTP ${res.status}`; }
          setResult(`Error: ${errMsg}`);
          setIsLoading(false);
          return;
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";
        let buffer = "";
        const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                accumulated += parsed.text;
                setResult(accumulated);
              }
              if (parsed.tool_call) {
                toolCalls.push(parsed.tool_call);
              }
            } catch { /* ignore */ }
          }
        }

        // Execute any tool calls
        if (toolCalls.length > 0) {
          const results = toolCalls.map((tc) =>
            executeToolCall(allEditors, tc.name, tc.args, setFullContent.current)
          );
          setResult(accumulated ? accumulated + "\n\n" + results.join("\n") : results.join("\n"));
          setIsImproveResult(false); // already applied via tools, no need for Apply button
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setResult(`Error: ${(err as Error).message}`);
        }
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [allEditors, collectEditorJson, selectedText]
  );

  const handleApply = useCallback(() => {
    if (!selectedText || !result) return;
    // Use the JSON-level replace tool — safe, no position mapping
    const res = executeToolCall(allEditors, "replace_text", { find: selectedText, replace: result }, setFullContent.current);
    setVisible(false);
    resetState();
    toast.success(res.startsWith("Text not found") ? res : "Applied");
  }, [activeEditorIndex, allEditors, result, selectionRange, resetState]);

  const handleDismiss = useCallback(() => {
    setMode("input");
    setResult("");
    setAskInput("");
    setIsLoading(false);
    if (abortRef.current) abortRef.current.abort();
  }, []);

  if (!visible) return null;

  return (
    <div
      ref={barRef}
      className="fixed z-50 bg-white rounded-xl shadow-lg shadow-black/[0.06] border border-black/[0.08] overflow-hidden"
      style={{ top: position.top, left: position.left }}
    >
      {mode === "input" && (
        <div className="flex items-center gap-1 p-1">
          <input
            value={askInput}
            onChange={(e) => setAskInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && askInput.trim()) {
                callAI("ask", askInput.trim());
              }
              if (e.key === "Escape") {
                setVisible(false);
                resetState();
              }
            }}
            placeholder="Ask about selection..."
            className="w-[160px] h-6 px-2 text-[11px] bg-transparent focus:outline-none placeholder:text-black/30"
          />
          <Button
            size="icon-xs"
            className="size-6 shrink-0"
            disabled={!askInput.trim()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => callAI("ask", askInput.trim())}
          >
            <ArrowUp className="size-3" />
          </Button>
          <div className="w-px h-4 bg-black/[0.08] shrink-0" />
          <Button
            variant="ghost"
            size="xs"
            className="text-[11px] gap-1 h-6 shrink-0"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => callAI("improve")}
          >
            <Sparkles className="size-3" />
            Improve
          </Button>
        </div>
      )}

      {mode === "result" && (
        <div className="w-[300px]">
          <div className="max-h-[140px] overflow-y-auto px-2.5 py-2 text-[11px] leading-relaxed whitespace-pre-wrap break-words text-black">
            {result || (
              <span className="inline-flex gap-1">
                <span className="size-1 rounded-full bg-black/20 animate-blink" />
                <span className="size-1 rounded-full bg-black/20 animate-blink [animation-delay:150ms]" />
                <span className="size-1 rounded-full bg-black/20 animate-blink [animation-delay:300ms]" />
              </span>
            )}
            {isLoading && result && (
              <span className="inline-block w-1 h-3 bg-black/40 ml-0.5 animate-blink align-middle" />
            )}
          </div>
          {!isLoading && result && (
            <div className="flex items-center gap-1 px-2 py-1.5 border-t border-black/[0.06]">
              {isImproveResult && (
                <Button size="xs" className="text-[10px] gap-1 h-6 flex-1" onClick={handleApply}>
                  <Check className="size-3" />
                  Apply
                </Button>
              )}
              <Button
                size="xs"
                variant="outline"
                className="text-[10px] gap-1 h-6 flex-1"
                onClick={handleDismiss}
              >
                <X className="size-3" />
                Dismiss
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
