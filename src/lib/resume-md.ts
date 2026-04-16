// Faithful markdown → block-tree parser. The markdown string is the canonical
// content representation; templates walk ResumeDoc.blocks in source order.
//
// The parser does NOT synthesize semantic fields. No label, no dates/location
// split, no title/subtitle split, no canonical section-slug remap, no h4+
// demotion. A heading is a heading; a paragraph is a paragraph. The single
// exception: a paragraph line where any atom (split on " · " / " | ") looks
// like an email, url, or phone becomes a `contacts` block — that detection is
// safe and reversible (every atom is preserved verbatim).

import { marked, type Tokens } from "marked";

export type ResumeBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "contacts"; atoms: string[] };

export interface ResumeDoc {
  blocks: ResumeBlock[];
}

// Re-export under the old name so consumers that still import `ResumeAst`
// (there are a few) resolve to the new shape without a codemod.
export type ResumeAst = ResumeDoc;

function tokenText(token: Tokens.Generic): string {
  if ("text" in token && typeof token.text === "string") return token.text;
  if ("raw" in token && typeof token.raw === "string") return token.raw;
  return "";
}

function splitContactAtoms(line: string): string[] {
  return line.split(/\s+·\s+|\s+\|\s+/).map((s) => s.trim()).filter(Boolean);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:\/\/|www\.|[a-z0-9-]+\.(com|dev|io|org|net|co|xyz|app|ai|me)(\/|$))/i;
const PHONE_RE = /[\d()+\-.\s]{7,}/;

function isContactAtom(s: string): boolean {
  if (!s) return false;
  // Strip markdown link wrapper before testing: `[text](url)` → test `url`.
  const linkMatch = s.match(/^\[[^\]]*\]\(([^)]+)\)$/);
  const probe = linkMatch ? linkMatch[1] : s;
  if (EMAIL_RE.test(probe)) return true;
  if (URL_RE.test(probe)) return true;
  if (PHONE_RE.test(probe) && /\d/.test(probe) && probe.replace(/\D/g, "").length >= 7) return true;
  return false;
}

function bulletsFromList(list: Tokens.List): string[] {
  return list.items
    .map((item) => {
      const txt = (item.text ?? "").trim();
      return txt.replace(/^[-*]\s+/, "").replace(/\n+/g, " ").trim();
    })
    .filter(Boolean);
}

function clampLevel(depth: number): 1 | 2 | 3 | 4 | 5 | 6 {
  if (depth <= 1) return 1;
  if (depth >= 6) return 6;
  return depth as 2 | 3 | 4 | 5;
}

export function parseResumeMarkdown(md: string): ResumeDoc {
  const blocks: ResumeBlock[] = [];

  let tokens: Tokens.Generic[];
  try {
    tokens = marked.lexer(md ?? "") as Tokens.Generic[];
  } catch {
    return { blocks };
  }

  for (const token of tokens) {
    if (token.type === "space") continue;

    if (token.type === "heading") {
      const h = token as Tokens.Heading;
      const text = (h.text ?? "").trim();
      if (!text) continue;
      blocks.push({ kind: "heading", level: clampLevel(h.depth), text });
      continue;
    }

    if (token.type === "paragraph") {
      const raw = tokenText(token as Tokens.Paragraph).trim();
      if (!raw) continue;
      // Preserve author's line breaks. Each non-blank line inside the
      // paragraph token becomes its own block — a contact row if it contains
      // at least one email/url/phone atom, a paragraph otherwise.
      const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const atoms = splitContactAtoms(line);
        const anyContact = atoms.some(isContactAtom);
        if (anyContact) {
          blocks.push({ kind: "contacts", atoms });
        } else {
          blocks.push({ kind: "paragraph", text: line });
        }
      }
      continue;
    }

    if (token.type === "list") {
      const list = token as Tokens.List;
      const items = bulletsFromList(list);
      if (items.length) blocks.push({ kind: "list", items });
      continue;
    }

    if (token.type === "hr" || token.type === "code" || token.type === "blockquote") {
      // Structural noise: drop rather than misclassify.
      continue;
    }

    const raw = tokenText(token).trim();
    if (raw) blocks.push({ kind: "paragraph", text: raw });
  }

  return { blocks };
}

// Sample markdown shown for brand-new resumes and used as a test fixture.
export const SAMPLE_MARKDOWN = `# Jane Doe
Senior Product Engineer
jane@doe.com · +1 555 0100 · San Francisco, CA
https://janedoe.dev · github.com/jane

## Summary
Product-minded engineer with 8 years building developer tools and internal platforms. Shipped the billing pipeline rewrite at Acme and mentored a team of four.

## Experience

### Acme Corp — Staff Engineer
Jan 2023 – Present · Remote
- Led the rewrite of the billing pipeline; cut p99 latency 40%.
- Mentored 4 engineers; established the platform RFC process.
- Shipped a customer-facing usage API used by 120+ tenants.

### Acme Corp — Senior Engineer
Aug 2021 – Jan 2023
- Shipped the v2 API; migrated 400k users with zero downtime.
- Reduced CI wall time from 22m to 6m.

### Northwind — Software Engineer
2018 – 2021
- Owned the ingestion pipeline powering the reporting product.
- Built a real-time dedup layer that cut storage cost 35%.

## Education

### Stanford University — BS Computer Science
2014 – 2018

## Skills
- Languages: TypeScript, Go, Python, Rust
- Frameworks: React, Next.js, Node, FastAPI
- Infra: Postgres, Redis, Kafka, Kubernetes, AWS

## Projects

### Thumbs — Code review bot
2024 · github.com/jane/thumbs
- Static-analysis PR reviewer for TypeScript monorepos; 600+ stars.

### Paperclip — CLI bookmarking
2022 · github.com/jane/paperclip
- Offline-first bookmark manager with fuzzy search.

## Awards
`;
