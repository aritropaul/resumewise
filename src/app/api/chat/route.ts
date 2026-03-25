import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { Provider } from "@/lib/ai";
import { toolsForAnthropic, toolsForOpenAI } from "@/lib/ai";

function detectProvider(key: string): Provider {
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-or-")) return "openrouter";
  if (key.startsWith("xai-")) return "grok";
  if (key.startsWith("AIzaSy")) return "gemini";
  return "openai";
}

function buildSystemPrompt(
  documentText: string,
  mode: string,
  selectedText?: string,
  prompt?: string
): string {
  if (mode === "selection") {
    return [
      "You are an expert resume writer and career coach embedded in a resume editor.",
      "You have deep knowledge of what hiring managers and ATS systems look for.",
      "",
      "## The user's full resume (for context):",
      "```",
      documentText,
      "```",
      "",
      "## Selected text the user is asking about:",
      `"${selectedText}"`,
      "",
      prompt === "improve"
        ? [
            "## Your task:",
            "Rewrite and improve ONLY the selected text. Return ONLY the replacement text.",
            "- Use strong action verbs (Led, Designed, Shipped, Drove, Increased)",
            "- Quantify impact wherever possible (%, $, time saved, users served)",
            "- Be concise — no filler words",
            "- Match the tone and style of the rest of the resume",
            "- Do NOT add any explanation, preamble, quotes, or markdown — just the improved text",
          ].join("\n")
        : [
            "## Your task:",
            "Answer the user's question about the selected text.",
            "- Be concise and actionable",
            "- If suggesting changes, explain why briefly",
            "- Reference specific parts of the text when relevant",
          ].join("\n"),
    ].join("\n");
  }
  return [
    "You are an expert resume writer and career coach embedded in a resume editor called ResumeWise.",
    "You have deep knowledge of what hiring managers, recruiters, and ATS systems look for.",
    "You have tools to directly edit the resume.",
    "",
    "## The user's resume:",
    "```",
    documentText,
    "```",
    "",
    "## Guidelines:",
    "- ALWAYS start by explaining your analysis and what you plan to change BEFORE using any tools",
    "- First give your thoughts, feedback, or suggestions as text",
    "- Only use tools when the user explicitly asks you to make changes (e.g. 'improve this', 'fix that', 'rewrite my bullets')",
    "- For general questions like 'what do you think?' or 'review this' — just give text feedback, don't edit anything",
    "- When using replace_text, the 'find' parameter must EXACTLY match text from the resume",
    "- After making edits, briefly explain what you changed and why",
    "- Be concise — short paragraphs, bullet points",
    "- Focus on impact, metrics, and strong action verbs",
    "- Don't use markdown headers (the chat panel is small) — use bold and bullets instead",
  ].join("\n");
}

const PROVIDER_MODELS: Record<Provider, string> = {
  anthropic: "claude-sonnet-4-6-20250627",
  openai: "gpt-5.4-mini",
  gemini: "gemini-3.1-flash-lite-preview",
  grok: "grok-4.20",
  openrouter: "anthropic/claude-sonnet-4-6-20250627",
};

const OPENAI_COMPATIBLE_BASES: Record<string, string> = {
  grok: "https://api.x.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
};

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { apiKey, messages, documentText, mode, selectedText, prompt, toolResults, useTools } = body;

    if (!apiKey || typeof apiKey !== "string") {
      return Response.json({ error: "API key required" }, { status: 401 });
    }

    const provider = detectProvider(apiKey);
    const systemPrompt = buildSystemPrompt(documentText, mode, selectedText, prompt);
    const model = PROVIDER_MODELS[provider];
    const enableTools = useTools && mode === "chat";

    if (provider === "anthropic") {
      return streamAnthropic(apiKey, systemPrompt, messages, model, enableTools, toolResults);
    }
    const baseURL = OPENAI_COMPATIBLE_BASES[provider];
    return streamOpenAICompatible(apiKey, systemPrompt, messages, model, baseURL, enableTools, toolResults);
  } catch (err: unknown) {
    console.error("[chat route error]", err);
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("authentication") || message.includes("API key") || message.includes("Incorrect API")) {
      return Response.json({ error: "Invalid API key" }, { status: 401 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}

// ─── Anthropic ───

async function streamAnthropic(
  apiKey: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: unknown }>,
  model: string,
  enableTools: boolean,
  toolResults?: Array<{ id: string; result: string }>
) {
  const client = new Anthropic({ apiKey });

  // Build messages — handle _toolCalls and tool results
  const apiMessages: Anthropic.MessageParam[] = [];
  for (const m of messages as Array<any>) {
    if (m.role === "assistant" && m._toolCalls?.length > 0) {
      // Build assistant content with text + tool_use blocks
      const content: any[] = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const tc of m._toolCalls) {
        content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.args });
      }
      apiMessages.push({ role: "assistant", content });
    } else if (m.role === "user" && typeof m.content === "string") {
      apiMessages.push({ role: "user", content: m.content });
    } else if (m.role === "assistant" && typeof m.content === "string") {
      apiMessages.push({ role: "assistant", content: m.content });
    } else {
      apiMessages.push(m as Anthropic.MessageParam);
    }
  }

  // Append tool results as a user message with tool_result blocks
  if (toolResults && toolResults.length > 0) {
    apiMessages.push({
      role: "user",
      content: toolResults.map((tr) => ({
        type: "tool_result" as const,
        tool_use_id: tr.id,
        content: tr.result,
      })),
    });
  }

  const stream = await client.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: apiMessages,
    ...(enableTools ? { tools: toolsForAnthropic() as any } : {}),
    stream: true,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        let currentToolId = "";
        let currentToolName = "";
        let currentToolInput = "";

        for await (const event of stream) {
          if (event.type === "content_block_start") {
            const block = (event as any).content_block;
            if (block?.type === "tool_use") {
              currentToolId = block.id;
              currentToolName = block.name;
              currentToolInput = "";
            }
          } else if (event.type === "content_block_delta") {
            if (event.delta.type === "text_delta") {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
              );
            } else if ((event.delta as any).type === "input_json_delta") {
              currentToolInput += (event.delta as any).partial_json || "";
            }
          } else if (event.type === "content_block_stop") {
            if (currentToolName) {
              let args = {};
              try { args = JSON.parse(currentToolInput); } catch { /* empty */ }
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  tool_call: { id: currentToolId, name: currentToolName, args },
                })}\n\n`)
              );
              currentToolId = "";
              currentToolName = "";
              currentToolInput = "";
            }
          } else if (event.type === "message_delta") {
            const stopReason = (event as any).delta?.stop_reason;
            if (stopReason === "tool_use") {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ stop_reason: "tool_use" })}\n\n`));
            }
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(readable, { headers: SSE_HEADERS });
}

// ─── OpenAI-Compatible ───

async function streamOpenAICompatible(
  apiKey: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: unknown }>,
  model: string,
  baseURL: string | undefined,
  enableTools: boolean,
  toolResults?: Array<{ id: string; result: string }>
) {
  const client = new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  });

  // Build messages — handle _toolCalls for proper tool_calls format
  const apiMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const m of messages as Array<any>) {
    if (m.role === "assistant" && m._toolCalls?.length > 0) {
      // Assistant message with tool_calls
      apiMessages.push({
        role: "assistant",
        content: m.content || null,
        tool_calls: m._toolCalls.map((tc: any) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      });
    } else if (m.role === "assistant" && typeof m.content === "string") {
      apiMessages.push({ role: "assistant", content: m.content });
    } else if (m.role === "user" && typeof m.content === "string") {
      apiMessages.push({ role: "user", content: m.content });
    } else {
      apiMessages.push(m as any);
    }
  }

  // Append tool results
  if (toolResults && toolResults.length > 0) {
    for (const tr of toolResults) {
      apiMessages.push({
        role: "tool",
        tool_call_id: tr.id,
        content: tr.result,
      });
    }
  }

  const stream = await client.chat.completions.create({
    model,
    max_completion_tokens: 4096,
    messages: apiMessages,
    ...(enableTools ? { tools: toolsForOpenAI() } : {}),
    stream: true,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        // Accumulate tool calls across chunks
        const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();
        let hasToolCalls = false;

        for await (const chunk of stream) {
          const choice = chunk.choices[0];
          if (!choice) continue;

          // Text content
          const text = choice.delta?.content;
          if (text) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
          }

          // Tool calls
          const deltaToolCalls = choice.delta?.tool_calls;
          if (deltaToolCalls) {
            hasToolCalls = true;
            for (const tc of deltaToolCalls) {
              const existing = toolCalls.get(tc.index);
              if (!existing) {
                toolCalls.set(tc.index, {
                  id: tc.id || "",
                  name: tc.function?.name || "",
                  arguments: tc.function?.arguments || "",
                });
              } else {
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name += tc.function.name;
                existing.arguments += tc.function?.arguments || "";
              }
            }
          }

          // Check finish reason
          if (choice.finish_reason === "tool_calls" || (choice.finish_reason === "stop" && hasToolCalls)) {
            // Emit all accumulated tool calls
            for (const [, tc] of toolCalls) {
              let args = {};
              try { args = JSON.parse(tc.arguments); } catch { /* empty */ }
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  tool_call: { id: tc.id, name: tc.name, args },
                })}\n\n`)
              );
            }
            if (hasToolCalls) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ stop_reason: "tool_use" })}\n\n`));
            }
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(readable, { headers: SSE_HEADERS });
}
