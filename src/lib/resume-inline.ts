// Inline formatting parser. Turns a markdown-ish string into a flat list of
// styled spans that templates render with <Text> nodes.
//
// Supported syntax:
//   **bold**            strong
//   *italic*  _italic_  emphasis
//   `code`              inline monospace
//   {bold}...{/bold}    same as ** when nested with other directives
//   {italic}...{/italic}
//   {underline}...{/underline}
//   {red}... {/red}     color (named palette below, or `accent|muted|ink`)
//   {size:14}...{/size} explicit font size
//   {weight:600}...{/weight}  numeric font weight
//
// The parser is tolerant: unmatched closers/openers are emitted as literal
// text. Nesting works by pushing overlapping style frames on a stack.

export interface InlineStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  code?: boolean;
  color?: string;          // hex or a palette token like "accent"
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  link?: string;           // href; spans with a link render as <Link> in the template
}

export interface InlineSpan {
  text: string;
  style: InlineStyle;
}

// Named color map. Keep modest; this is a resume, not a rainbow.
export const NAMED_COLORS: Record<string, string> = {
  red: "#dc2626",
  orange: "#ea580c",
  amber: "#d97706",
  yellow: "#ca8a04",
  green: "#16a34a",
  emerald: "#059669",
  teal: "#0d9488",
  cyan: "#0891b2",
  blue: "#2563eb",
  indigo: "#4f46e5",
  purple: "#9333ea",
  pink: "#db2777",
  rose: "#e11d48",
  gray: "#6b7280",
  slate: "#475569",
  // Palette tokens — resolved per theme at render time, not here.
  accent: "accent",
  muted: "muted",
  ink: "ink",
};

function merge(base: InlineStyle, next: InlineStyle): InlineStyle {
  return { ...base, ...next };
}

function flatten(stack: InlineStyle[]): InlineStyle {
  return stack.reduce<InlineStyle>((acc, s) => merge(acc, s), {});
}

interface Frame {
  marker: string;   // `**`, `*`, `_`, `` ` ``, or directive name like `bold`, `red`, `size:14`
  style: InlineStyle;
}

function directiveStyle(name: string, value: string | null): InlineStyle | null {
  switch (name) {
    case "bold":
    case "b":
      return { bold: true };
    case "italic":
    case "i":
      return { italic: true };
    case "underline":
    case "u":
      return { underline: true };
    case "code":
      return { code: true };
    case "size": {
      if (!value) return null;
      const n = Number(value);
      if (!Number.isFinite(n)) return null;
      return { fontSize: n };
    }
    case "weight": {
      if (!value) return null;
      const n = Number(value);
      if (!Number.isFinite(n)) return null;
      return { fontWeight: n };
    }
    case "color": {
      // {color:#hex} or {color:accent} etc. Named tokens pass through to the
      // NAMED_COLORS lookup so we still get palette-aware resolution.
      if (!value) return null;
      if (value.startsWith("#") && /^#[0-9a-f]{3,8}$/i.test(value)) {
        return { color: value };
      }
      const named = NAMED_COLORS[value.toLowerCase()];
      if (named) return { color: named };
      return null;
    }
    case "font": {
      if (!value) return null;
      return { fontFamily: value };
    }
    default: {
      const color = NAMED_COLORS[name];
      if (color) return { color };
      return null;
    }
  }
}

// Match a directive opener like `{bold}` or `{size:14}`. Returns the matched
// length and the parsed name + optional value.
function matchOpener(input: string, pos: number): { len: number; name: string; value: string | null } | null {
  if (input[pos] !== "{") return null;
  const end = input.indexOf("}", pos + 1);
  if (end === -1) return null;
  const body = input.slice(pos + 1, end);
  if (body.startsWith("/") || body.length === 0) return null;
  const colon = body.indexOf(":");
  if (colon === -1) {
    if (!/^[a-z][a-z0-9-]*$/i.test(body)) return null;
    return { len: end - pos + 1, name: body.toLowerCase(), value: null };
  }
  const name = body.slice(0, colon).toLowerCase();
  const value = body.slice(colon + 1).trim();
  if (!/^[a-z][a-z0-9-]*$/i.test(name)) return null;
  return { len: end - pos + 1, name, value };
}

// Match `[text](url)`. Returns the total consumed length, the inner text, and
// the raw URL. Tolerates `[` inside `text` when balanced. URL is taken up to
// the first unbalanced `)`. Returns null if the whole pattern doesn't match.
function matchLink(input: string, pos: number): { len: number; text: string; url: string } | null {
  if (input[pos] !== "[") return null;
  let depth = 1;
  let i = pos + 1;
  while (i < input.length && depth > 0) {
    const c = input[i];
    if (c === "\\" && i + 1 < input.length) {
      i += 2;
      continue;
    }
    if (c === "[") depth++;
    else if (c === "]") depth--;
    if (depth === 0) break;
    i++;
  }
  if (depth !== 0) return null;
  const textEnd = i; // points at `]`
  if (input[textEnd + 1] !== "(") return null;
  let j = textEnd + 2;
  let urlDepth = 1;
  while (j < input.length && urlDepth > 0) {
    const c = input[j];
    if (c === "(") urlDepth++;
    else if (c === ")") urlDepth--;
    if (urlDepth === 0) break;
    j++;
  }
  if (urlDepth !== 0) return null;
  const text = input.slice(pos + 1, textEnd);
  const url = input.slice(textEnd + 2, j).trim();
  if (!text || !url) return null;
  return { len: j - pos + 1, text, url };
}

// Match a closer like `{/bold}`.
function matchCloser(input: string, pos: number): { len: number; name: string } | null {
  if (input[pos] !== "{" || input[pos + 1] !== "/") return null;
  const end = input.indexOf("}", pos + 2);
  if (end === -1) return null;
  const name = input.slice(pos + 2, end).trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/i.test(name)) return null;
  return { len: end - pos + 1, name };
}

export function parseInline(input: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  const stack: Frame[] = [];
  let buffer = "";

  const flush = () => {
    if (!buffer) return;
    spans.push({ text: buffer, style: flatten(stack.map((f) => f.style)) });
    buffer = "";
  };

  const closeMatching = (markerOrName: string): boolean => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].marker === markerOrName) {
        flush();
        stack.splice(i, 1);
        return true;
      }
    }
    return false;
  };

  for (let i = 0; i < input.length; ) {
    const ch = input[i];

    // ---- markdown link: [text](url) ----
    if (ch === "[") {
      const link = matchLink(input, i);
      if (link) {
        flush();
        const linkSpans = parseInline(link.text);
        const linkStyle: InlineStyle = { link: link.url };
        for (const s of linkSpans) {
          spans.push({ text: s.text, style: merge(merge(flatten(stack.map((f) => f.style)), linkStyle), s.style) });
        }
        i += link.len;
        continue;
      }
    }

    // ---- directive open / close ----
    if (ch === "{") {
      const closer = matchCloser(input, i);
      if (closer) {
        // Aliases like {/b} close frames opened as {bold}; unify via the same
        // canonical name.
        const canonical =
          closer.name === "b" ? "bold" :
          closer.name === "i" ? "italic" :
          closer.name === "u" ? "underline" :
          closer.name;
        if (closeMatching(canonical)) {
          i += closer.len;
          continue;
        }
        // fallthrough: unmatched closer is treated as literal text
      }
      const opener = matchOpener(input, i);
      if (opener) {
        const style = directiveStyle(opener.name, opener.value);
        if (style) {
          flush();
          const canonical =
            opener.name === "b" ? "bold" :
            opener.name === "i" ? "italic" :
            opener.name === "u" ? "underline" :
            opener.name;
          stack.push({ marker: canonical, style });
          i += opener.len;
          continue;
        }
      }
    }

    // ---- inline code ----
    if (ch === "`") {
      if (closeMatching("`")) {
        i += 1;
        continue;
      }
      flush();
      stack.push({ marker: "`", style: { code: true } });
      i += 1;
      continue;
    }

    // ---- **bold** (must precede single *) ----
    if (ch === "*" && input[i + 1] === "*") {
      if (closeMatching("**")) {
        i += 2;
        continue;
      }
      flush();
      stack.push({ marker: "**", style: { bold: true } });
      i += 2;
      continue;
    }

    // ---- *italic* ----
    if (ch === "*") {
      if (closeMatching("*")) {
        i += 1;
        continue;
      }
      // Only treat as italic opener if the next char is not a space (feels
      // closer to CommonMark behavior).
      if (input[i + 1] && input[i + 1] !== " " && input[i + 1] !== "*") {
        flush();
        stack.push({ marker: "*", style: { italic: true } });
        i += 1;
        continue;
      }
    }

    // ---- _italic_ ----
    if (ch === "_") {
      if (closeMatching("_")) {
        i += 1;
        continue;
      }
      if (input[i + 1] && input[i + 1] !== " " && input[i + 1] !== "_") {
        flush();
        stack.push({ marker: "_", style: { italic: true } });
        i += 1;
        continue;
      }
    }

    // ---- literal char ----
    buffer += ch;
    i += 1;
  }

  flush();
  // Drop any unclosed frames — their content already sits in spans with the
  // style applied via flatten() at flush time, which is the right behavior.
  return spans;
}

// Render-friendly: resolve theme-bound color tokens to concrete hex.
export function resolveColor(
  color: string | undefined,
  tokens: { accent: string; muted: string; ink: string }
): string | undefined {
  if (!color) return undefined;
  if (color === "accent") return tokens.accent;
  if (color === "muted") return tokens.muted;
  if (color === "ink") return tokens.ink;
  return color;
}
