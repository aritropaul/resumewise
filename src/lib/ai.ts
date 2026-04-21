// Provider types and client-side utilities.
// API key storage moved to server-side encrypted storage (/api/keys).

export type Provider = "anthropic" | "openai" | "gemini" | "grok" | "openrouter";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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
