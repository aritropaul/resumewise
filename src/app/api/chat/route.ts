// Chat route — full-document markdown rewrite. The model sees the user's
// current markdown, any prior turns, and (optionally) a target job description.
// It returns an updated, complete markdown resume. The client diffs the result
// against the original and presents hunk-level accept/reject UI.

import { NextRequest } from "next/server";
import { getProviderClient, resolveApiKey } from "@/lib/providers";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequestBody {
  apiKey?: string;
  messages: ChatMessage[];
  markdown?: string;
  jobDescription?: string | null;
  mode?: "chat" | "analyze" | "tailor" | "rewrite_selection";
  // Scoped rewrite (mode === "rewrite_selection"): the span the model should
  // rewrite and the user's instruction for how to rewrite it.
  selection?: string;
  instruction?: string;
}

// Humanizer rules. These constrain the model away from the cliches that make
// LLM-written resumes obvious. Keep verbatim across prompt modes.
const HARD_RULES = `Humanizer rules (non-negotiable):
- No filler adjectives: "dynamic", "passionate", "driven", "seasoned", "robust", "cutting-edge", "proven track record".
- No corporate verbs: "leverage", "spearheaded", "synergize", "orchestrate".
- No em-dash pairs inside a sentence.
- Prefer concrete verbs + numbers. "Shipped v2 API; cut p99 from 22m to 6m" beats "improved performance significantly".
- Keep the candidate's voice and specific facts. Don't invent employers, dates, or numbers.
- Dates stay exact. Never normalize "Present" or "Jan 2023" to another form.`;

const STRUCTURE_NOTES = `Markdown convention the document follows:
- Exactly one \`#\` for the candidate's name.
- Lines below it (before the first \`##\`) are label + contact atoms separated by \` · \`.
- \`##\` introduces a section (Summary, Experience, Education, Skills, Projects, Awards, etc.).
- \`###\` introduces an item inside a section, in the form \`Title — Subtitle\` (em-dash).
- The first non-bullet line under a \`###\` is the dates line (plus optional \` · Location\`).
- Bullets use \`- \`. Preserve this convention exactly in your output.

Inline formatting (use sparingly; preserve what exists):
- \`**bold**\`, \`*italic*\`, \`_italic_\`, \`\\\`code\\\`\` work as in standard markdown.
- Directive pairs: \`{bold}text{/bold}\`, \`{italic}text{/italic}\`, \`{underline}text{/underline}\`.
- Named colors: \`{red}...{/red}\`, \`{green}\`, \`{blue}\`, \`{amber}\`, \`{purple}\`, \`{gray}\`, etc.
- Palette tokens: \`{accent}...{/accent}\`, \`{muted}...{/muted}\`, \`{ink}...{/ink}\`.
- Sizing: \`{size:12}...{/size}\`. Weight: \`{weight:600}...{/weight}\`.
- Do NOT introduce new inline formatting unless the user asked. Preserve any
  existing directives the user added.`;

function buildSystemPrompt(mode: ChatRequestBody["mode"]): string {
  if (mode === "rewrite_selection") {
    return `You are a resume copy editor. Rewrite only the span the user highlighted, following their instruction. Return ONLY the replacement text — no code fences, no commentary, no quotes, no markdown headings, no leading bullet marker unless the original span started with one.

${HARD_RULES}

Output rules:
- Preserve the original span's leading/trailing whitespace and line breaks (the replacement is spliced in verbatim).
- If the original span was a single bullet line starting with "- ", keep that "- " prefix.
- If the original was plain prose, stay plain prose.
- Keep length reasonable relative to the original unless the instruction asks otherwise.`;
  }

  const goal =
    mode === "analyze"
      ? "You are a resume reviewer. Analyze the resume against the target job and return a short critique — strongest alignment, biggest gaps, top three edits worth making. Do NOT rewrite the resume."
      : mode === "tailor"
        ? "You are a resume tailor. Produce a complete rewritten resume in the convention below, tuned to the target job. Change only what's needed; preserve the candidate's facts and voice."
        : "You are a resume editor. Produce a complete rewritten resume in the convention below that incorporates the user's request. Change only what's needed; preserve untouched sections as-is.";

  const output =
    mode === "analyze"
      ? "Output: plain prose critique. Do NOT wrap in code fences."
      : "Output: a single, complete markdown resume, wrapped in triple backticks fenced with the word `markdown`. Emit nothing outside the fenced block.";

  return `${goal}

${STRUCTURE_NOTES}

${HARD_RULES}

${output}`;
}

function buildUserPreamble(body: ChatRequestBody): string {
  const parts: string[] = [];
  parts.push("Current resume markdown:");
  parts.push("```markdown");
  parts.push(body.markdown ?? "");
  parts.push("```");
  if (body.jobDescription && body.jobDescription.trim()) {
    parts.push("");
    parts.push("Target job description:");
    parts.push("```");
    parts.push(body.jobDescription.trim());
    parts.push("```");
  }
  return parts.join("\n");
}

function buildSelectionPrompt(selection: string, instruction: string): string {
  return [
    "Original span to rewrite:",
    "```",
    selection,
    "```",
    "",
    `Instruction: ${instruction}`,
    "",
    "Return only the replacement text.",
  ].join("\n");
}

export async function POST(req: NextRequest) {
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const isSelection = body.mode === "rewrite_selection";

  if (!isSelection && (!body.markdown || typeof body.markdown !== "string")) {
    return new Response(JSON.stringify({ error: "markdown required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  if (isSelection && (!body.selection || !body.instruction)) {
    return new Response(
      JSON.stringify({ error: "selection and instruction required" }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      }
    );
  }

  const apiKey = resolveApiKey(body.apiKey);
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API key required" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const client = getProviderClient(apiKey);
  const system = buildSystemPrompt(body.mode);

  let userMessages: ChatMessage[];
  if (isSelection) {
    userMessages = [
      {
        role: "user",
        content: buildSelectionPrompt(body.selection!, body.instruction!),
      },
    ];
  } else {
    const history: ChatMessage[] = [
      ...(body.messages ?? []).filter(
        (m) => (m.role === "user" || m.role === "assistant") && m.content
      ),
    ];
    const preamble = buildUserPreamble(body);
    const lastUser = history[history.length - 1];
    userMessages =
      lastUser && lastUser.role === "user"
        ? [
            ...history.slice(0, -1),
            { role: "user" as const, content: `${preamble}\n\nRequest: ${lastUser.content}` },
          ]
        : [...history, { role: "user" as const, content: `${preamble}\n\nRequest: rewrite as needed.` }];
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        if (client.provider === "anthropic") {
          const s = await client.anthropic.messages.stream({
            model: client.model,
            max_tokens: 8000,
            system,
            messages: userMessages,
          });
          for await (const event of s) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              send("chunk", { text: event.delta.text });
            }
          }
          send("done", {});
        } else {
          const s = await client.openai.chat.completions.create({
            model: client.model,
            max_completion_tokens: 8000,
            stream: true,
            messages: [
              { role: "system", content: system },
              ...userMessages,
            ],
          });
          for await (const chunk of s) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) send("chunk", { text: delta });
          }
          send("done", {});
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        send("error", { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
