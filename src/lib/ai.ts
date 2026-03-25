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

/** Detect provider from API key prefix */
export function detectProvider(key: string): Provider {
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-or-")) return "openrouter";
  if (key.startsWith("xai-")) return "grok";
  if (key.startsWith("AIzaSy")) return "gemini";
  // OpenAI keys start with sk- (but not sk-ant- or sk-or-)
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

/** Tool definitions for resume editing — shared schema used by both Anthropic and OpenAI */
export const RESUME_TOOLS_SCHEMA = [
  {
    name: "replace_text",
    description: "Find text in the resume and replace it with new text. The 'find' string should closely match the text in the resume — special characters and extra spaces are handled automatically. Use short, distinctive phrases rather than full paragraphs for more reliable matching.",
    parameters: {
      type: "object" as const,
      properties: {
        find: { type: "string", description: "The exact text to find in the resume" },
        replace: { type: "string", description: "The replacement text" },
      },
      required: ["find", "replace"],
    },
  },
  {
    name: "insert_text_after",
    description: "Insert new text immediately after a matched string in the resume.",
    parameters: {
      type: "object" as const,
      properties: {
        after: { type: "string", description: "The exact text to find (new text will be inserted after this)" },
        text: { type: "string", description: "The text to insert" },
      },
      required: ["after", "text"],
    },
  },
  {
    name: "delete_text",
    description: "Delete matched text from the resume.",
    parameters: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "The exact text to delete" },
      },
      required: ["text"],
    },
  },
  {
    name: "format_text",
    description: "Apply formatting to matched text. Only specified properties will be changed.",
    parameters: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "The exact text to format" },
        bold: { type: "boolean", description: "Set bold (font-weight 700)" },
        italic: { type: "boolean", description: "Set italic" },
        font_weight: { type: "string", description: "Font weight: 100 (Thin), 200 (ExtraLight), 300 (Light), 400 (Regular), 500 (Medium), 600 (SemiBold), 700 (Bold), 800 (ExtraBold), 900 (Black)" },
        font_size_pt: { type: "number", description: "Font size in points (e.g. 12, 14)" },
        font_family: { type: "string", description: "Font family name (e.g. Helvetica, Inter, Georgia)" },
        color: { type: "string", description: "Text color as hex (e.g. #000000)" },
        align: { type: "string", enum: ["left", "center", "right", "justify"], description: "Text alignment" },
      },
      required: ["text"],
    },
  },
];

/** Convert tool schema to Anthropic format */
export function toolsForAnthropic() {
  return RESUME_TOOLS_SCHEMA.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

/** Convert tool schema to OpenAI format */
export function toolsForOpenAI() {
  return RESUME_TOOLS_SCHEMA.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export interface ToolCallInfo {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
}

/** Walk ProseMirror JSON and extract plain text, one line per paragraph */
export function editorJsonToText(json: Record<string, unknown> | null): string {
  if (!json) return "";
  const content = json.content as Array<Record<string, unknown>> | undefined;
  if (!content) return "";

  const lines: string[] = [];
  for (const node of content) {
    if (node.type === "paragraph") {
      lines.push(extractText(node));
    }
  }
  return lines.join("\n");
}

function extractText(node: Record<string, unknown>): string {
  const content = node.content as Array<Record<string, unknown>> | undefined;
  if (!content) return "";
  return content
    .map((child) => {
      if (child.type === "text") return (child.text as string) || "";
      return extractText(child);
    })
    .join("");
}
