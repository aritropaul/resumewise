// Shared AI provider configuration. Single source of truth for model IDs,
// base URLs, and client construction. All API routes import from here.

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { Provider } from "@/lib/ai";

export const PROVIDER_MODELS: Record<Provider, string> = {
  anthropic: "claude-sonnet-4-6-20250627",
  openai: "gpt-4.1",
  gemini: "gemini-2.5-flash",
  grok: "grok-3-fast",
  openrouter: "anthropic/claude-sonnet-4.6",
};

export const OPENAI_COMPATIBLE_BASES: Record<string, string> = {
  grok: "https://api.x.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
};

export function detectProvider(key: string): Provider {
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-or-")) return "openrouter";
  if (key.startsWith("xai-")) return "grok";
  if (key.startsWith("AIzaSy")) return "gemini";
  return "openai";
}

interface AnthropicClient {
  provider: "anthropic";
  model: string;
  anthropic: Anthropic;
}

interface OpenAIClient {
  provider: Exclude<Provider, "anthropic">;
  model: string;
  openai: OpenAI;
}

export type ProviderClient = AnthropicClient | OpenAIClient;

export function getProviderClient(apiKey: string): ProviderClient {
  const provider = detectProvider(apiKey);
  const model = PROVIDER_MODELS[provider];

  if (provider === "anthropic") {
    return { provider, model, anthropic: new Anthropic({ apiKey }) };
  }

  const baseURL = OPENAI_COMPATIBLE_BASES[provider];
  return {
    provider,
    model,
    openai: new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) }),
  };
}

export function resolveApiKey(
  bodyKey: unknown,
  envKey = process.env.OPENAI_API_KEY
): string | null {
  return (typeof bodyKey === "string" && bodyKey) || envKey || null;
}
