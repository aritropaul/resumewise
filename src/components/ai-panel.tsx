"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Editor } from "@tiptap/react";
import { ArrowUp, Square, KeyRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tool, type ToolPart } from "@/components/ui/tool";
import { Loader } from "@/components/ui/loader";
import {
  getApiKey,
  setApiKey as storeApiKey,
  clearApiKey,
  detectProvider,
  providerLabel,
  editorJsonToText,
  type ChatMessage,
  type ToolCallInfo,
} from "@/lib/ai";
import { executeToolCall } from "@/lib/editor-tools";

interface DisplayMessage {
  role: "user" | "assistant" | "tool-results";
  content: string;
  toolCalls?: ToolCallInfo[];
}

interface Props {
  allEditors: Editor[];
  collectEditorJson: (editors: Editor[]) => Record<string, unknown> | null;
  documentId: string | undefined;
  setFullContent: React.RefObject<((json: Record<string, unknown>) => void) | null>;
}

export function AiPanel({ allEditors, collectEditorJson, documentId, setFullContent }: Props) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingToolCalls, setStreamingToolCalls] = useState<ToolCallInfo[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevDocId = useRef(documentId);

  useEffect(() => { setApiKey(getApiKey()); }, []);

  useEffect(() => {
    if (prevDocId.current !== documentId) {
      setMessages([]);
      setStreamingContent("");
      setStreamingToolCalls([]);
      setIsStreaming(false);
      if (abortRef.current) abortRef.current.abort();
      prevDocId.current = documentId;
    }
  }, [documentId]);

  // Auto-scroll messages — only scroll within the messages container, not the whole page
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, streamingContent, streamingToolCalls]);

  const handleSaveKey = useCallback(() => {
    if (keyInput.trim()) {
      storeApiKey(keyInput.trim());
      setApiKey(keyInput.trim());
      setKeyInput("");
    }
  }, [keyInput]);

  const handleClearKey = useCallback(() => {
    clearApiKey();
    setApiKey(null);
    setMessages([]);
  }, []);

  /** Stream a request and handle text + tool_call events. Returns the accumulated state. */
  const streamRequest = useCallback(
    async (
      body: Record<string, unknown>,
      signal: AbortSignal
    ): Promise<{
      text: string;
      toolCalls: ToolCallInfo[];
      needsToolResults: boolean;
    }> => {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });

      if (!res.ok) {
        let errMsg = "Request failed";
        try { const err = await res.json(); errMsg = err.error || errMsg; } catch { errMsg = `HTTP ${res.status}`; }
        throw new Error(errMsg);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      const toolCalls: ToolCallInfo[] = [];
      let needsToolResults = false;

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
              setStreamingContent(accumulated);
            }
            if (parsed.tool_call) {
              toolCalls.push(parsed.tool_call);
              setStreamingToolCalls([...toolCalls]);
            }
            if (parsed.stop_reason === "tool_use") {
              needsToolResults = true;
            }
            if (parsed.error) {
              accumulated += `\nError: ${parsed.error}`;
              setStreamingContent(accumulated);
            }
          } catch { /* ignore */ }
        }
      }

      return { text: accumulated, toolCalls, needsToolResults };
    },
    []
  );

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !apiKey || isStreaming) return;

    const userMessage: DisplayMessage = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);
    setStreamingContent("");
    setStreamingToolCalls([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const documentText = editorJsonToText(collectEditorJson(allEditors));
    const controller = new AbortController();
    abortRef.current = controller;

    // Build the raw message history for the API (just role + content strings)
    const apiMessages: ChatMessage[] = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    apiMessages.push({ role: "user", content: input.trim() });

    try {
      let result = await streamRequest(
        { apiKey, messages: apiMessages, documentText, mode: "chat", useTools: true },
        controller.signal
      );

      // Tool calling loop — max 3 rounds to prevent infinite loops
      let toolRound = 0;
      const MAX_TOOL_ROUNDS = 3;
      while (result.needsToolResults && result.toolCalls.length > 0 && toolRound < MAX_TOOL_ROUNDS) {
        toolRound++;

        // Execute tool calls against the editors (JSON-level, atomic)
        const toolResults = result.toolCalls.map((tc) => ({
          id: tc.id,
          result: executeToolCall(allEditors, tc.name, tc.args, setFullContent.current),
        }));

        // Wait for reflow to settle after content change
        await new Promise((r) => setTimeout(r, 300));

        // Build tool calls with results attached
        const executedToolCalls = result.toolCalls.map((tc, i) => ({
          ...tc,
          result: toolResults[i].result,
        }));

        // Add assistant message with completed tool calls + results summary
        setMessages((prev) => [
          ...prev,
          // Assistant text + tool calls (with results already populated)
          { role: "assistant" as const, content: result.text, toolCalls: executedToolCalls },
          // Green results summary
          { role: "tool-results" as const, content: toolResults.map((r) => r.result).join("\n"), toolCalls: executedToolCalls },
        ]);

        // Reset streaming state for follow-up
        setStreamingContent("");
        setStreamingToolCalls([]);

        // Build follow-up — include the assistant's tool_use calls so the server can
        // construct the proper message format for each provider
        const followUpMessages = [
          ...apiMessages,
          // Special marker: assistant message with tool calls embedded
          {
            role: "assistant" as const,
            content: result.text || "",
            _toolCalls: result.toolCalls, // server uses this to build tool_use blocks
          },
        ];

        result = await streamRequest(
          {
            apiKey,
            messages: followUpMessages as any,
            documentText: editorJsonToText(collectEditorJson(allEditors)),
            mode: "chat",
            useTools: toolRound < MAX_TOOL_ROUNDS, // disable tools on last round
            toolResults,
          },
          controller.signal
        );
      }

      // Final text-only response
      if (result.text) {
        setMessages((prev) => [...prev, { role: "assistant", content: result.text, toolCalls: result.toolCalls.length > 0 ? result.toolCalls : undefined }]);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${(err as Error).message}` }]);
      }
    } finally {
      setStreamingContent("");
      setStreamingToolCalls([]);
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, apiKey, isStreaming, messages, collectEditorJson, allEditors, streamRequest]);

  const handleStop = useCallback(() => { if (abortRef.current) abortRef.current.abort(); }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }, [sendMessage]);

  const handleTextareaInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 72) + "px";
  }, []);

  // ── No API key ──
  if (!apiKey) {
    return (
      <div className="px-4 py-6 flex flex-col items-center gap-3">
        <KeyRound className="size-5 text-black/20" />
        <p className="text-[11px] text-black/60 text-center">Enter your API key to use AI features</p>
        <p className="text-[10px] text-black/30 text-center">OpenAI, Anthropic, Gemini, Grok, OpenRouter</p>
        <Input type="password" placeholder="Paste API key..." value={keyInput} onChange={(e) => setKeyInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSaveKey()} className="h-7 text-[11px] md:text-[11px] font-mono" />
        <Button size="xs" className="w-full text-[10px]" onClick={handleSaveKey}>Save key</Button>
        <p className="text-[10px] text-black/30 text-center">Stored locally, never sent to our servers</p>
      </div>
    );
  }

  // ── Chat ──
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1.5 flex items-center justify-between border-b border-black/[0.06]">
        <span className="text-[10px] text-black/40 truncate">{providerLabel(detectProvider(apiKey))}</span>
        <button onClick={handleClearKey} className="text-[10px] text-black/30 hover:text-black/60 transition-colors"><X className="size-3" /></button>
      </div>

      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <p className="text-[11px] text-black/30">Ask anything about your resume</p>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === "user") {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[220px] px-2.5 py-1.5 rounded-lg text-[11px] leading-relaxed whitespace-pre-wrap break-words bg-black text-white">
                  {msg.content}
                </div>
              </div>
            );
          }
          if (msg.role === "tool-results") {
            return (
              <div key={i} className="text-[10px] text-green-700 bg-green-50 rounded-lg px-2.5 py-1.5 space-y-0.5">
                {msg.content.split("\n").map((line, j) => (
                  <div key={j}>✓ {line}</div>
                ))}
              </div>
            );
          }
          // assistant
          return (
            <div key={i} className="space-y-1">
              {msg.content && (
                <div className="max-w-[240px] px-2.5 py-1.5 rounded-lg text-[11px] leading-relaxed whitespace-pre-wrap break-words bg-black/[0.04] text-black">
                  {msg.content}
                </div>
              )}
              {msg.toolCalls?.map((tc) => (
                <Tool
                  key={tc.id}
                  className="max-w-[240px]"
                  toolPart={{
                    type: tc.name,
                    state: tc.result ? "output-available" : "input-streaming",
                    input: tc.args,
                    output: tc.result ? { result: tc.result } : undefined,
                  } as ToolPart}
                />
              ))}
            </div>
          );
        })}

        {/* Streaming text */}
        {isStreaming && streamingContent && (
          <div className="max-w-[240px] px-2.5 py-1.5 rounded-lg text-[11px] leading-relaxed whitespace-pre-wrap break-words bg-black/[0.04] text-black">
            {streamingContent}
            <span className="inline-block w-1 h-3 bg-black/40 ml-0.5 animate-blink align-middle" />
          </div>
        )}

        {/* Streaming tool calls */}
        {isStreaming && streamingToolCalls.map((tc) => (
          <Tool
            key={tc.id}
            className="max-w-[240px]"
            toolPart={{
              type: tc.name,
              state: "input-streaming",
              input: tc.args,
            } as ToolPart}
          />
        ))}

        {/* Loading dots */}
        {isStreaming && !streamingContent && streamingToolCalls.length === 0 && (
          <div className="flex justify-start">
            <Loader variant="dots" size="sm" />
          </div>
        )}

        {/* scroll anchor */}
      </div>

      <div className="px-3 py-2 border-t border-black/[0.06]">
        <div className="flex items-end gap-1.5">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your resume..."
            disabled={isStreaming}
            rows={1}
            className="flex-1 resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-[11px] leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          />
          {isStreaming ? (
            <Button size="icon-xs" variant="outline" onClick={handleStop}><Square className="size-3" /></Button>
          ) : (
            <Button size="icon-xs" onClick={sendMessage} disabled={!input.trim()}><ArrowUp className="size-3" /></Button>
          )}
        </div>
      </div>
    </div>
  );
}
