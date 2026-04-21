// Convert raw resume text → structured markdown via the configured AI provider.
// Non-streaming: blocks until the LLM finishes. Returns { markdown }.

import { NextRequest, NextResponse } from "next/server";
import { getProviderClient, resolveApiKey } from "@/lib/providers";

const SYSTEM = `You are a resume importer. Convert raw resume text into a single structured markdown document following this exact convention:

# Full Name
Job title or tagline (optional)
email · phone · city, region
personal-site · linkedin · github

## Summary
One or two short paragraphs of summary prose, if present.

## Experience

### Company Name — Role Title
Start Date – End Date · Location
- Bullet highlight (use the candidate's exact wording).
- Another bullet.

### Previous Company — Previous Role
...

## Education

### Institution — Degree or Field
Start Year – End Year
- Any notes, honors, coursework.

## Skills
- Category: item, item, item
- Another Category: item, item

## Projects

### Project Name — Short subtitle
Year · url
- Bullet highlight.

## Awards

### Award Title
Year · Awarder
- Optional note.

Rules:
- Output ONLY the markdown body. No code fences, no commentary.
- Preserve the candidate's exact wording, bullets, dates, role titles.
- Dates are free-form strings (e.g. "Jan 2023", "Present"). Do not normalize.
- Separate title and subtitle inside \`###\` using an em-dash (—). Use spaces around it.
- The first line under each \`###\` is the dates line (plus optional \` · Location\` suffix).
- Bullets use \`- \` (hyphen + space). Strip any incoming bullet glyphs (•, ·, *).
- Skip sections that don't appear in the resume. Don't invent content.
- Keep the contact row under the H1 on one or two lines, atoms separated by " · ".
`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { apiKey: userKey, text } = body as { apiKey?: string; text?: string };

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const apiKey = resolveApiKey(userKey);
    if (!apiKey) return NextResponse.json({ error: "API key required" }, { status: 401 });

    const client = getProviderClient(apiKey);
    const userMsg = `Resume text:\n\n${text.slice(0, 20000)}`;

    let raw = "";
    if (client.provider === "anthropic") {
      const res = await client.anthropic.messages.create({
        model: client.model,
        max_tokens: 8000,
        system: SYSTEM,
        messages: [{ role: "user", content: userMsg }],
      });
      raw = res.content
        .map((contentBlock) => (contentBlock.type === "text" ? contentBlock.text : ""))
        .join("");
    } else {
      const res = await client.openai.chat.completions.create({
        model: client.model,
        max_completion_tokens: 8000,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userMsg },
        ],
      });
      raw = res.choices[0]?.message?.content || "";
    }

    const markdown = raw
      .trim()
      .replace(/^```(?:markdown|md)?\s*\n/i, "")
      .replace(/\n```\s*$/i, "")
      .trim();

    if (!markdown.startsWith("#")) {
      return NextResponse.json(
        { error: "Importer did not return markdown", sample: markdown.slice(0, 200) },
        { status: 502 }
      );
    }

    return NextResponse.json({ markdown });
  } catch (err: unknown) {
    console.error("[import]", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
