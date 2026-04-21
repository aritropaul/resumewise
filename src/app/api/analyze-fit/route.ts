// Single-shot resume-vs-JD analysis. Model returns one JSON object with fit,
// ATS, and discrete tailoring suggestions. No streaming; the client renders the
// whole payload at once.

import { NextRequest } from "next/server";
import { resolveProviderClient } from "@/lib/resolve-key";

interface AnalyzeFitRequestBody {
  apiKey?: string;
  markdown: string;
  jobDescription: string;
}

export interface AnalyzeFitResult {
  fitScore: number;
  fitNotes: string[];
  atsScore: number;
  atsBreakdown: {
    matchedKeywords: string[];
    missingKeywords: string[];
  };
  suggestions: Array<{
    kind: "bullet" | "summary" | "skill" | "title";
    location: string;
    before: string;
    after: string;
    reason: string;
  }>;
}

const SYSTEM_PROMPT = `You are an impartial resume reviewer and ATS simulator. Given a resume (markdown) and a target job description, compute a structured analysis.

Score rules:
- fitScore (0-100): overall qualitative match — experience relevance, seniority, domain, scope. Be honest; average real resumes land in the 55-75 range.
- atsScore (0-100): keyword/phrase coverage against the JD's must-have terms, synonym-aware (e.g. "React" matches "ReactJS", "AWS" matches "Amazon Web Services"). Prefer phrases over single tokens when the JD repeats a phrase.

Keyword rules:
- matchedKeywords: terms that appear in the JD AND are clearly reflected in the resume. Use the JD's phrasing. Max 20.
- missingKeywords: terms the JD emphasizes but the resume lacks. Rank by JD frequency / prominence (requirements section beats nice-to-haves). Max 15.

Suggestion rules — read twice before generating:
- 3 to 5 suggestions, NEVER more. Quality over quantity. A shorter, sharper list beats a long redundant one.
- Each suggestion must target a DIFFERENT item: one suggestion per work role, summary, or skills line. Never emit two suggestions for the same bullet or line.
- Each suggestion must add something concrete: a missing keyword, a quantified outcome, a sharper verb, a specific tool. If a bullet only needs a cosmetic rewrite, SKIP it — don't suggest.
- "before": the EXACT substring from the resume markdown to replace. Character-for-character, including any leading "- " or "## ". Do not paraphrase. If you can't find an exact span worth changing, omit the suggestion.
- "after": the replacement. Same shape as "before" (bullet stays a bullet, heading stays a heading). Must be ≤ 25 words for bullets, ≤ 30 for summary lines. One line only.
- "after" MUST differ from "before" by adding JD-specific content — not just reordering words or swapping synonyms. If the delta is stylistic, skip the suggestion.
- "location": short pointer like "Work › Acme › bullet 2" or "Summary" or "Skills". Max 50 chars.
- "reason": ONE short line, ≤ 15 words, naming the specific JD keyword or outcome this edit lands. No hedging, no "this improves alignment".
- Preserve facts. Never invent employers, dates, numbers, or tools the candidate didn't list.
- Humanizer: no "leverage", "spearheaded", "dynamic", "passionate", "robust", "cutting-edge", "proven track record". Concrete verbs. No em-dash pairs inside a sentence.

Output: a single JSON object matching this exact shape, no commentary, no code fences:
{
  "fitScore": number,
  "fitNotes": string[],   // 2-4 short bullets: strongest alignment + biggest gaps
  "atsScore": number,
  "atsBreakdown": {
    "matchedKeywords": string[],
    "missingKeywords": string[]
  },
  "suggestions": [
    { "kind": "bullet" | "summary" | "skill" | "title",
      "location": string, "before": string, "after": string, "reason": string }
  ]
}`;

function buildUserPrompt(markdown: string, jobDescription: string): string {
  return [
    "Resume markdown:",
    "```markdown",
    markdown,
    "```",
    "",
    "Target job description:",
    "```",
    jobDescription.trim(),
    "```",
    "",
    "Return the JSON object now.",
  ].join("\n");
}

export async function POST(req: NextRequest) {
  let body: AnalyzeFitRequestBody;
  try {
    body = (await req.json()) as AnalyzeFitRequestBody;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.markdown?.trim()) {
    return Response.json({ error: "markdown required" }, { status: 400 });
  }
  if (!body.jobDescription?.trim()) {
    return Response.json({ error: "jobDescription required" }, { status: 400 });
  }

  const resolved = await resolveProviderClient(body.apiKey);
  if ("error" in resolved) {
    return Response.json({ error: resolved.error }, { status: resolved.status });
  }
  const { client } = resolved;
  const userPrompt = buildUserPrompt(body.markdown, body.jobDescription);

  try {
    let raw: string;
    if (client.provider === "anthropic") {
      const msg = await client.anthropic.messages.create({
        model: client.model,
        max_tokens: 4000,
        temperature: 0.2,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: userPrompt },
          // Prefill ensures the response starts inside the JSON object.
          { role: "assistant", content: "{" },
        ],
      });
      const block = msg.content.find((c) => c.type === "text");
      const text = block && block.type === "text" ? block.text : "";
      raw = `{${text}`;
    } else {
      const completion = await client.openai.chat.completions.create({
        model: client.model,
        max_completion_tokens: 4000,
        temperature: 0.2,
        // gemini's OpenAI-compatible endpoint ignores this; harmless.
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

    const result = validateShape(parsed);
    if (!result) {
      return Response.json(
        { error: "model response missing required fields" },
        { status: 502 }
      );
    }

    return Response.json(result satisfies AnalyzeFitResult);
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
    // Fallback: first {...} block.
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

function validateShape(value: unknown): AnalyzeFitResult | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const fitScore = clampScore(v.fitScore);
  const atsScore = clampScore(v.atsScore);
  if (fitScore === null || atsScore === null) return null;

  const fitNotes = Array.isArray(v.fitNotes)
    ? v.fitNotes.filter((x): x is string => typeof x === "string")
    : [];

  const ats = v.atsBreakdown as Record<string, unknown> | undefined;
  const matchedKeywords = Array.isArray(ats?.matchedKeywords)
    ? ats!.matchedKeywords.filter((x): x is string => typeof x === "string")
    : [];
  const missingKeywords = Array.isArray(ats?.missingKeywords)
    ? ats!.missingKeywords.filter((x): x is string => typeof x === "string")
    : [];

  const rawSuggestions = Array.isArray(v.suggestions)
    ? v.suggestions.flatMap((s): AnalyzeFitResult["suggestions"] => {
        if (!s || typeof s !== "object") return [];
        const row = s as Record<string, unknown>;
        const kind = row.kind;
        if (
          kind !== "bullet" &&
          kind !== "summary" &&
          kind !== "skill" &&
          kind !== "title"
        )
          return [];
        if (
          typeof row.before !== "string" ||
          typeof row.after !== "string" ||
          typeof row.location !== "string" ||
          typeof row.reason !== "string"
        )
          return [];
        const before = row.before.trim();
        const after = row.after.trim();
        // Drop no-ops and pure whitespace rewrites.
        if (!before || !after) return [];
        if (normalizeForCompare(before) === normalizeForCompare(after))
          return [];
        return [
          {
            kind,
            location: row.location.slice(0, 80),
            before: row.before,
            after: row.after,
            reason: row.reason.slice(0, 200),
          },
        ];
      })
    : [];

  // Dedupe: same `before`, or near-identical `after` targeting the same item.
  const seenBefore = new Set<string>();
  const seenAfter = new Set<string>();
  const suggestions: AnalyzeFitResult["suggestions"] = [];
  for (const s of rawSuggestions) {
    const beforeKey = s.before.trim();
    const afterKey = normalizeForCompare(s.after).slice(0, 60);
    if (seenBefore.has(beforeKey)) continue;
    if (seenAfter.has(afterKey)) continue;
    seenBefore.add(beforeKey);
    seenAfter.add(afterKey);
    suggestions.push(s);
    if (suggestions.length >= 5) break;
  }

  return {
    fitScore,
    fitNotes,
    atsScore,
    atsBreakdown: { matchedKeywords, missingKeywords },
    suggestions,
  };
}

function clampScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
