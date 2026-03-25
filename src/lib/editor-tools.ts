import type { Editor } from "@tiptap/react";

type JsonNode = Record<string, unknown>;

/** Collect merged ProseMirror JSON from all editors */
function collectJson(editors: Editor[]): JsonNode | null {
  if (editors.length === 0) return null;
  const allContent = editors.flatMap((e) => {
    try { if (!e.view?.dom) return []; } catch { return []; }
    const json = e.getJSON();
    return (json.content as JsonNode[]) || [];
  });
  return { type: "doc", content: allContent };
}

/** Deep-clone a JSON node */
function cloneJson(node: JsonNode): JsonNode {
  return JSON.parse(JSON.stringify(node));
}

/** Extract all text from a node (recursive) */
function nodeText(node: JsonNode): string {
  if (node.type === "text") return (node.text as string) || "";
  const content = node.content as JsonNode[] | undefined;
  if (!content) return "";
  return content.map(nodeText).join("");
}

/** Normalize text for fuzzy matching: collapse special unicode to ASCII equivalents */
function normalize(text: string): string {
  return text
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, " ")
    .replace(/[\u2013\u2014\u2015]/g, "-")
    .replace(/[\u2018\u2019\u201A\u201B`]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u00B7\u2022\u2023\u25E6\u2043\u2219]/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

/** Check if `haystack` contains `needle` using normalized comparison */
function normalizedContains(haystack: string, needle: string): boolean {
  const h = normalize(haystack).toLowerCase();
  const n = normalize(needle).toLowerCase();
  return n.length > 0 && h.includes(n);
}

/**
 * Find `find` text within a flat string using normalized matching.
 * Returns { start, end } indices in the ORIGINAL string.
 */
function fuzzyIndexOf(originalText: string, find: string): { start: number; end: number } | null {
  const normFind = normalize(find).toLowerCase();
  if (!normFind) return null;

  // Build a char-by-char map from original positions to normalized string
  const normChars: string[] = [];
  const origIndices: number[] = []; // origIndices[i] = original index that produced normChars[i]

  for (let oi = 0; oi < originalText.length; oi++) {
    const ch = originalText[oi];
    const normCh = normalize(ch);
    if (normCh === "" || normCh === " ") {
      // Whitespace: add a single space if last norm char wasn't already a space
      if (normChars.length > 0 && normChars[normChars.length - 1] !== " ") {
        normChars.push(" ");
        origIndices.push(oi);
      }
    } else {
      for (const c of normCh) {
        normChars.push(c);
        origIndices.push(oi);
      }
    }
  }

  const normStr = normChars.join("").toLowerCase();
  const idx = normStr.indexOf(normFind);
  if (idx === -1) return null;

  const origStart = origIndices[idx] ?? 0;
  const endNormIdx = idx + normFind.length;
  // origEnd: the char AFTER the last matched char
  const origEnd = endNormIdx < origIndices.length
    ? origIndices[endNormIdx] ?? originalText.length
    : originalText.length;

  return { start: origStart, end: origEnd };
}

/**
 * Walk all text nodes in a JSON doc and perform a find/replace.
 * Uses normalized matching to handle special unicode chars (nbsp, smart quotes, etc).
 */
function replaceInJson(
  doc: JsonNode,
  find: string,
  replace: string
): { doc: JsonNode; found: boolean } {
  const cloned = cloneJson(doc);
  const content = cloned.content as JsonNode[];
  if (!content) return { doc: cloned, found: false };

  for (const para of content) {
    // Use recursive nodeText to get ALL text including nested spans
    const paraFullText = nodeText(para);
    if (!normalizedContains(paraFullText, find)) continue;

    const children = (para.content as JsonNode[]) || [];
    if (children.length === 0) continue;

    // Flatten: get text from each direct child (they should all be text nodes)
    const flatText = children.map((c) => (c.text as string) || "").join("");
    const match = fuzzyIndexOf(flatText, find);
    if (!match) {
      // Fallback: if flatText doesn't match but nodeText did, rebuild from nodeText
      const fullMatch = fuzzyIndexOf(paraFullText, find);
      if (!fullMatch) continue;
      const newText = paraFullText.slice(0, fullMatch.start) + replace + paraFullText.slice(fullMatch.end);
      const marks = children[0]?.marks;
      para.content = newText
        ? [{ type: "text", text: newText, ...(marks ? { marks } : {}) }]
        : [];
      return { doc: cloned, found: true };
    }

    // Apply replacement on the flat text
    const newText = flatText.slice(0, match.start) + replace + flatText.slice(match.end);

    // Rebuild: single text node preserving marks from the first child
    const marks = children[0]?.marks;
    para.content = newText
      ? [{ type: "text", text: newText, ...(marks ? { marks } : {}) }]
      : [];

    return { doc: cloned, found: true };
  }

  return { doc: cloned, found: false };
}

function insertAfterInJson(
  doc: JsonNode,
  after: string,
  text: string
): { doc: JsonNode; found: boolean } {
  return replaceInJson(doc, after, after + text);
}

function deleteInJson(
  doc: JsonNode,
  text: string
): { doc: JsonNode; found: boolean } {
  return replaceInJson(doc, text, "");
}

/** Execute a tool call. Returns result description. */
export function executeToolCall(
  editors: Editor[],
  toolName: string,
  args: Record<string, unknown>,
  setFullContent: ((json: JsonNode) => void) | null
): string {
  const doc = collectJson(editors);
  if (!doc) return "No document content";

  let result: { doc: JsonNode; found: boolean };
  let description: string;

  switch (toolName) {
    case "replace_text": {
      const find = args.find as string;
      const replace = args.replace as string;
      result = replaceInJson(doc, find, replace);
      description = result.found
        ? `Replaced "${find.slice(0, 40)}" → "${replace.slice(0, 40)}"`
        : `Text not found: "${find.slice(0, 50)}"`;
      break;
    }
    case "insert_text_after": {
      const after = args.after as string;
      const text = args.text as string;
      result = insertAfterInJson(doc, after, text);
      description = result.found
        ? `Inserted "${text.slice(0, 40)}" after "${after.slice(0, 40)}"`
        : `Text not found: "${after.slice(0, 50)}"`;
      break;
    }
    case "delete_text": {
      const text = args.text as string;
      result = deleteInJson(doc, text);
      description = result.found
        ? `Deleted "${text.slice(0, 50)}"`
        : `Text not found: "${text.slice(0, 50)}"`;
      break;
    }
    case "format_text": {
      const text = args.text as string;
      const cloned = cloneJson(doc);
      const content = cloned.content as JsonNode[];
      let found = false;

      if (content) {
        for (const para of content) {
          const paraFullText = nodeText(para);
          if (!normalizedContains(paraFullText, text)) continue;

          const children = (para.content as JsonNode[]) || [];
          if (children.length === 0) continue;
          const fullText = children.map((c) => (c.text as string) || "").join("");
          const match = fuzzyIndexOf(fullText.length > 0 ? fullText : paraFullText, text);
          if (!match) continue;

          // Build new children: split text nodes so only the matched range gets formatted
          const newChildren: JsonNode[] = [];
          let charPos = 0;

          for (const child of children) {
            if (child.type !== "text") { newChildren.push(cloneJson(child)); charPos++; continue; }
            const childText = (child.text as string) || "";
            const childStart = charPos;
            const childEnd = charPos + childText.length;
            const existingMarks = child.marks ? cloneJson({ m: child.marks }).m as JsonNode[] : [];

            // Case: child is entirely before or after the match
            if (childEnd <= match.start || childStart >= match.end) {
              newChildren.push(cloneJson(child));
              charPos = childEnd;
              continue;
            }

            // Case: child overlaps with match — split into up to 3 parts
            // Part 1: before match
            if (childStart < match.start) {
              const beforeText = childText.slice(0, match.start - childStart);
              newChildren.push({ type: "text", text: beforeText, ...(existingMarks.length ? { marks: cloneJson({ m: existingMarks }).m } : {}) });
            }

            // Part 2: the matched portion — apply new marks
            const matchStartInChild = Math.max(0, match.start - childStart);
            const matchEndInChild = Math.min(childText.length, match.end - childStart);
            const matchedText = childText.slice(matchStartInChild, matchEndInChild);
            const formattedMarks = existingMarks.length ? (cloneJson({ m: existingMarks }).m as JsonNode[]) : [];

            // Apply requested formatting

            // Helper to set a textStyle attribute
            const setTextStyleAttr = (key: string, value: unknown) => {
              let ts = formattedMarks.find((m) => m.type === "textStyle") as JsonNode | undefined;
              if (ts) {
                (ts.attrs as JsonNode) = { ...((ts.attrs as JsonNode) || {}), [key]: value };
              } else {
                ts = { type: "textStyle", attrs: { [key]: value } };
                formattedMarks.push(ts);
              }
            };

            if (args.bold === true && !formattedMarks.some((m) => m.type === "bold")) {
              formattedMarks.push({ type: "bold" });
            }
            if (args.bold === false) {
              const idx = formattedMarks.findIndex((m) => m.type === "bold");
              if (idx !== -1) formattedMarks.splice(idx, 1);
            }
            if (args.italic === true && !formattedMarks.some((m) => m.type === "italic")) {
              formattedMarks.push({ type: "italic" });
            }
            if (args.italic === false) {
              const idx = formattedMarks.findIndex((m) => m.type === "italic");
              if (idx !== -1) formattedMarks.splice(idx, 1);
            }
            if (args.font_weight) {
              setTextStyleAttr("fontWeight", args.font_weight as string);
            }
            if (args.font_size_pt) {
              const px = `${Math.round((args.font_size_pt as number) / 0.75 * 10) / 10}px`;
              setTextStyleAttr("fontSize", px);
            }
            if (args.font_family) {
              setTextStyleAttr("fontFamily", args.font_family as string);
            }
            if (args.color) {
              setTextStyleAttr("color", args.color as string);
            }

            newChildren.push({ type: "text", text: matchedText, ...(formattedMarks.length ? { marks: formattedMarks } : {}) });

            // Part 3: after match
            if (childEnd > match.end) {
              const afterText = childText.slice(match.end - childStart);
              newChildren.push({ type: "text", text: afterText, ...(existingMarks.length ? { marks: cloneJson({ m: existingMarks }).m } : {}) });
            }

            charPos = childEnd;
          }

          para.content = newChildren;
          found = true;
          break;
        }
      }

      result = { doc: cloned, found };
      const changes = Object.entries(args)
        .filter(([k, v]) => k !== "text" && v !== undefined)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      description = found
        ? `Formatted "${text.slice(0, 30)}": ${changes}`
        : `Text not found: "${text.slice(0, 50)}"`;
      break;
    }
    default:
      return `Unknown tool: ${toolName}`;
  }

  if (result.found && setFullContent) {
    setFullContent(result.doc);
  }

  return description;
}
