// Provider auth + identification only. The AI response format for markdown
// rewrites is handled inside /api/chat and /api/import, not via shared schemas.

const STORAGE_KEY = "rw-api-key";

export type Provider = "anthropic" | "openai" | "gemini" | "grok" | "openrouter";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function getApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function setApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key);
}

export function clearApiKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// Cached probe — server-key status doesn't change between requests in the same
// session, so we only hit /api/has-key once.
let serverKeyPromise: Promise<boolean> | null = null;
export function checkServerKey(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (!serverKeyPromise) {
    serverKeyPromise = fetch("/api/has-key")
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((j) => !!(j as { available?: boolean }).available)
      .catch(() => false);
  }
  return serverKeyPromise;
}

export function detectProvider(key: string): Provider {
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-or-")) return "openrouter";
  if (key.startsWith("xai-")) return "grok";
  if (key.startsWith("AIzaSy")) return "gemini";
  return "openai";
}

export function providerLabel(provider: Provider): string {
  const labels: Record<Provider, string> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    gemini: "Gemini",
    grok: "Grok",
    openrouter: "OpenRouter",
  };
  return labels[provider];
}

export interface ToolCallInfo {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
}
