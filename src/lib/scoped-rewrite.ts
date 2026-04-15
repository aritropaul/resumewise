// Client-side helper for the `/api/chat` rewrite_selection mode. Streams a
// plain-text replacement for a highlighted span and resolves to the final
// string. No fence extraction; no diffing. The caller decides how to splice.

interface RewriteSelectionArgs {
  selection: string;
  instruction: string;
  apiKey?: string;
  signal?: AbortSignal;
  onChunk?: (accumulated: string) => void;
}

export async function rewriteSelection({
  selection,
  instruction,
  apiKey,
  signal,
  onChunk,
}: RewriteSelectionArgs): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      apiKey,
      messages: [],
      mode: "rewrite_selection",
      selection,
      instruction,
    }),
    signal,
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
        // ignore malformed frame
      }
      if (eventName === "chunk" && payload.text) {
        accumulated += payload.text;
        onChunk?.(accumulated);
      } else if (eventName === "error") {
        throw new Error(payload.message || "stream error");
      }
    }
  }

  return accumulated.trim();
}

// Splice a replacement into a markdown string at a known range. If the live
// range no longer matches the captured text (user edited during the stream),
// fall back to a first-occurrence replacement, then to an append if the
// original text is no longer present at all.
export function applyScopedReplacement(opts: {
  markdown: string;
  start: number;
  end: number;
  originalText: string;
  replacement: string;
}): { markdown: string; start: number; end: number } {
  const { markdown, start, end, originalText, replacement } = opts;
  if (markdown.slice(start, end) === originalText) {
    return {
      markdown: markdown.slice(0, start) + replacement + markdown.slice(end),
      start,
      end: start + replacement.length,
    };
  }
  const idx = markdown.indexOf(originalText);
  if (idx !== -1) {
    return {
      markdown:
        markdown.slice(0, idx) +
        replacement +
        markdown.slice(idx + originalText.length),
      start: idx,
      end: idx + replacement.length,
    };
  }
  return { markdown, start, end };
}
