// Structured-markdown resume parser. The markdown string is the canonical
// content representation; templates consume the ResumeAst produced here.
//
// Convention:
//   # Name                               — H1 → header.name
//   Label line (optional)                — first non-contact line after H1
//   email · phone · location             — contact atoms split on " · " / " | "
//   url · url                            — urls classify as contact atoms
//
//   ## Section                           — section heading
//   ### Title — Subtitle                 — item; em/en-dash or " - " separator
//   Dates line · Location                — first non-bullet line under ###
//   - bullet                             — highlights
//
// Skills bullets of form "Label: a, b, c" become items with title=Label and
// bullets=[a, b, c]. Unknown sections pass through with their original heading.
// The parser never throws; malformed input yields a best-effort AST.

import { marked, type Tokens } from "marked";

export interface ResumeAstItem {
  title?: string;
  subtitle?: string;
  dates?: string;
  location?: string;
  paragraphs?: string[]; // plain text paragraphs under the item (non-bullets)
  bullets: string[];
}

export interface ResumeAstSection {
  key: string;          // canonical slug (e.g. "experience")
  heading: string;      // original ## text
  items: ResumeAstItem[];
  paragraphs?: string[];
  bullets?: string[];   // bullet lines at section level (no enclosing H3 item)
}

export interface ResumeAstHeader {
  name: string;
  label?: string;
  contacts: string[];
  location?: string;
}

export interface ResumeAst {
  header: ResumeAstHeader;
  sections: ResumeAstSection[];
}

const CANONICAL_SLUGS: Record<string, string> = {
  summary: "summary",
  about: "summary",
  profile: "summary",
  experience: "experience",
  work: "experience",
  employment: "experience",
  education: "education",
  skills: "skills",
  projects: "projects",
  awards: "awards",
  honors: "awards",
  publications: "publications",
  languages: "languages",
  interests: "interests",
  hobbies: "interests",
  references: "references",
};

function slugify(text: string): string {
  const clean = text.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  return CANONICAL_SLUGS[clean] ?? clean.replace(/\s+/g, "-");
}

// Split a line like "Acme Corp — Staff Engineer" into {title, subtitle}.
// Accepts em-dash (—), en-dash (–), or " - ".
function splitTitle(line: string): { title: string; subtitle?: string } {
  const patterns = [
    /\s+—\s+/,
    /\s+–\s+/,
    /\s+-\s+/,
  ];
  for (const re of patterns) {
    const m = line.match(re);
    if (m && m.index !== undefined) {
      return {
        title: line.slice(0, m.index).trim(),
        subtitle: line.slice(m.index + m[0].length).trim() || undefined,
      };
    }
  }
  return { title: line.trim() };
}

// Split "Jan 2023 – Present · Remote" into dates + optional location.
function splitDatesLocation(line: string): { dates: string; location?: string } {
  const sepRe = /\s+·\s+|\s+\|\s+/;
  const parts = line.split(sepRe).map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return { dates: line.trim() };
  // First part is dates; last non-empty part is location. Middle parts (rare)
  // are glued back into dates to keep the original intent.
  const dates = parts.slice(0, -1).join(" · ");
  return { dates, location: parts[parts.length - 1] };
}

function splitContactAtoms(line: string): string[] {
  return line.split(/\s+·\s+|\s+\|\s+/).map((s) => s.trim()).filter(Boolean);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:\/\/|www\.|[a-z0-9-]+\.(com|dev|io|org|net|co|xyz|app|ai|me)(\/|$))/i;
const PHONE_RE = /[\d()+\-.\s]{7,}/;

function isContactAtom(s: string): boolean {
  if (!s) return false;
  if (EMAIL_RE.test(s)) return true;
  if (URL_RE.test(s)) return true;
  if (PHONE_RE.test(s) && /\d/.test(s) && s.replace(/\D/g, "").length >= 7) return true;
  return false;
}

function tokenText(token: Tokens.Generic): string {
  if ("text" in token && typeof token.text === "string") return token.text;
  if ("raw" in token && typeof token.raw === "string") return token.raw;
  return "";
}

function bulletsFromList(list: Tokens.List): string[] {
  return list.items
    .map((item) => {
      // `item.text` is the markdown of the bullet contents; prefer the parsed
      // inline tokens rendered as plain text when possible.
      const txt = (item.text ?? "").trim();
      // Strip leading bullet char if it leaked through.
      return txt.replace(/^[-*]\s+/, "").replace(/\n+/g, " ").trim();
    })
    .filter(Boolean);
}

function newItem(): ResumeAstItem {
  return { bullets: [] };
}

function newSection(heading: string): ResumeAstSection {
  return { key: slugify(heading), heading: heading.trim(), items: [] };
}

export function parseResumeMarkdown(md: string): ResumeAst {
  const header: ResumeAstHeader = { name: "", contacts: [] };
  const sections: ResumeAstSection[] = [];

  let tokens: Tokens.Generic[];
  try {
    tokens = marked.lexer(md ?? "") as Tokens.Generic[];
  } catch {
    return { header, sections };
  }

  let section: ResumeAstSection | null = null;
  let item: ResumeAstItem | null = null;
  let sawName = false;
  // Track whether we've recorded anything under the current item yet, so we
  // know whether a fresh paragraph is "dates line" or overflow.
  let itemHasDates = false;

  const pushItem = () => {
    if (!section || !item) return;
    section.items.push(item);
    item = null;
    itemHasDates = false;
  };

  const pushSection = () => {
    pushItem();
    if (section) sections.push(section);
    section = null;
  };

  const addParagraphToSection = (text: string) => {
    if (!section) return;
    if (!section.paragraphs) section.paragraphs = [];
    section.paragraphs.push(text);
  };

  for (const token of tokens) {
    if (token.type === "space") continue;

    if (token.type === "heading") {
      const h = token as Tokens.Heading;
      const text = (h.text ?? "").trim();
      if (h.depth === 1) {
        pushSection();
        header.name = text;
        sawName = true;
        continue;
      }
      if (h.depth === 2) {
        pushSection();
        section = newSection(text);
        continue;
      }
      if (h.depth === 3) {
        pushItem();
        item = newItem();
        const { title, subtitle } = splitTitle(text);
        item.title = title;
        item.subtitle = subtitle;
        continue;
      }
      // h4+ — treat as an inline paragraph within the current item.
      if (item) {
        if (!item.paragraphs) item.paragraphs = [];
        item.paragraphs.push(text);
      } else if (section) {
        addParagraphToSection(text);
      }
      continue;
    }

    if (token.type === "paragraph") {
      const raw = tokenText(token as Tokens.Paragraph).trim();
      if (!raw) continue;
      const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);

      // Under the H1, before the first ##: fill the header.
      if (sawName && !section) {
        for (const line of lines) {
          const atoms = splitContactAtoms(line);
          const anyContact = atoms.some(isContactAtom);
          if (anyContact) {
            // Multi-atom line with at least one email/url/phone → all atoms are
            // contacts. Atoms that aren't email/url/phone (e.g. city name) are
            // still treated as contact chips; first such atom also sets location.
            for (const a of atoms) {
              if (!isContactAtom(a) && !header.location) header.location = a;
              header.contacts.push(a);
            }
          } else if (!header.label) {
            header.label = line;
          } else {
            if (!header.location) header.location = line;
            else header.contacts.push(line);
          }
        }
        continue;
      }

      // Inside an item: first paragraph is the dates line (+ optional location).
      if (item && !itemHasDates) {
        const first = lines.shift()!;
        const { dates, location } = splitDatesLocation(first);
        item.dates = dates;
        if (location) item.location = location;
        itemHasDates = true;
        // Any extra lines in the same paragraph stay as paragraphs.
        if (lines.length) {
          if (!item.paragraphs) item.paragraphs = [];
          for (const extra of lines) item.paragraphs.push(extra);
        }
        continue;
      }

      // Inside an item but dates already captured → prose paragraph, not bullets.
      if (item) {
        if (!item.paragraphs) item.paragraphs = [];
        item.paragraphs.push(lines.join(" "));
        continue;
      }

      // Inside a section but outside any item → section paragraph (Summary-like).
      if (section) {
        addParagraphToSection(lines.join(" "));
        continue;
      }
      // Outside any section with no header yet: use as label.
      if (!header.name) {
        header.name = lines[0];
        for (let i = 1; i < lines.length; i++) header.contacts.push(...splitContactAtoms(lines[i]));
      }
      continue;
    }

    if (token.type === "list") {
      const list = token as Tokens.List;
      const bullets = bulletsFromList(list);
      if (item) {
        // Ensure dates placeholder is stable even when bullets come first.
        itemHasDates = true;
        item.bullets.push(...bullets);
        continue;
      }
      if (section) {
        // Section-level bullets (e.g. skills list). Pass through verbatim.
        if (!section.bullets) section.bullets = [];
        section.bullets.push(...bullets);
        continue;
      }
      // List outside any section: fold into header contacts.
      header.contacts.push(...bullets);
      continue;
    }

    if (token.type === "hr" || token.type === "code" || token.type === "blockquote") {
      // Ignore structural noise.
      continue;
    }

    // Anything else: attach raw text as a paragraph on whatever we're in.
    const raw = tokenText(token).trim();
    if (!raw) continue;
    if (item) {
      if (!item.paragraphs) item.paragraphs = [];
      item.paragraphs.push(raw);
    } else if (section) {
      addParagraphToSection(raw);
    }
  }

  pushSection();
  return { header, sections };
}

// Look up a section by canonical key, with a fallback list of aliases.
export function findSection(ast: ResumeAst, ...keys: string[]): ResumeAstSection | undefined {
  for (const k of keys) {
    const match = ast.sections.find((s) => s.key === k);
    if (match) return match;
  }
  return undefined;
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

### Acme Engineering Award
2023 · Awarded for leading the billing rewrite.
`;
