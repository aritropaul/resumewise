// Compact structured summary of a raw job description. One LLM call returns a
// JSON object with a short blurb, responsibilities, requirements, nice-to-haves,
// and compensation — rendered inline in the Job panel so users don't squint at
// raw HTML-stripped paste.

import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { Provider } from "@/lib/ai";
import type { JobSummary } from "@/lib/storage";

interface RequestBody {
  apiKey?: string;
  jobDescription: string;
}

function detectProvider(key: string): Provider {
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-or-")) return "openrouter";
  if (key.startsWith("xai-")) return "grok";
  if (key.startsWith("AIzaSy")) return "gemini";
  return "openai";
}

const PROVIDER_MODELS: Record<Provider, string> = {
  anthropic: "claude-sonnet-4-6-20250627",
  openai: "gpt-5.4",
  gemini: "gemini-3.1-pro-preview",
  grok: "grok-4-1-fast-reasoning",
  openrouter: "anthropic/claude-sonnet-4.6",
};

const OPENAI_COMPATIBLE_BASES: Record<string, string> = {
  grok: "https://api.x.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
};

const SYSTEM_PROMPT = `You are a recruiter condensing a job posting into a scannable brief.

Style — this is a scan card, not prose. Telegraphic, not sentences.
- Drop articles (a/an/the) and filler verbs.
- Fragment form: verb-first or noun-first phrases.
- GOOD: "Ship end-to-end design", "5+ yrs product design", "LLM prototyping workflows", "Financial services background"
- BAD: "You will be responsible for shipping designs from concept to launch"

Rules:
- "summary": ONE fragment, ≤ 15 words. Role + scope + domain. No "you will", no marketing.
- "responsibilities": 3-5 fragments, each ≤ 8 words. What they do.
- "requirements": 3-5 fragments, each ≤ 8 words. Must-haves.
- "niceToHave": 0-3 fragments, each ≤ 8 words.
- "compensation": terse range only. Strip filler ("+ bonus opportunities + equity" becomes "+ bonus + equity"). Abbreviate: "$166k-$195k + equity". Null if not stated.
- Drop legal boilerplate, DEI statements, benefits, perks, "about us".
- Never invent. Empty array if a section has nothing.

Output: a single JSON object matching exactly:
{
  "summary": string,
  "responsibilities": string[],
  "requirements": string[],
  "niceToHave": string[],
  "compensation": string | null
}
No commentary, no code fences.`;

function buildUserPrompt(jd: string): string {
  return [
    "Job description:",
    "```",
    jd.trim(),
    "```",
    "",
    "Return the JSON object now.",
  ].join("\n");
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.jobDescription?.trim()) {
    return Response.json({ error: "jobDescription required" }, { status: 400 });
  }

  const apiKey =
    (typeof body.apiKey === "string" && body.apiKey) ||
    process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "API key required" }, { status: 401 });
  }

  const provider = detectProvider(apiKey);
  const model = PROVIDER_MODELS[provider];
  const userPrompt = buildUserPrompt(body.jobDescription);

  try {
    let raw: string;
    if (provider === "anthropic") {
      const client = new Anthropic({ apiKey });
      const msg = await client.messages.create({
        model,
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: userPrompt },
          { role: "assistant", content: "{" },
        ],
      });
      const block = msg.content.find((c) => c.type === "text");
      const text = block && block.type === "text" ? block.text : "";
      raw = `{${text}`;
    } else {
      const baseURL = OPENAI_COMPATIBLE_BASES[provider];
      const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
      const completion = await client.chat.completions.create({
        model,
        max_completion_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      });
      raw = completion.choices[0]?.message?.content ?? "";
    }

    const parsed = extractJson(raw);
    if (!parsed) {
      return Response.json(
        { error: "model returned non-JSON response" },
        { status: 502 }
      );
    }
    const summary = validateShape(parsed);
    if (!summary) {
      return Response.json(
        { error: "summary shape invalid" },
        { status: 502 }
      );
    }
    return Response.json(summary satisfies JobSummary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 502 });
  }
}

function extractJson(text: string): unknown | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(trimmed.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function validateShape(value: unknown): JobSummary | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.summary !== "string") return null;
  return {
    summary: v.summary,
    responsibilities: stringArray(v.responsibilities).slice(0, 5),
    requirements: stringArray(v.requirements).slice(0, 5),
    niceToHave: stringArray(v.niceToHave).slice(0, 3),
    compensation: typeof v.compensation === "string" ? v.compensation : null,
  };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}
