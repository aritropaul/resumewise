@AGENTS.md

## Project Overview

ResumeWise is a local-first, browser-based resume editor with AI assistance. No auth, no server-side persistence — everything lives in IndexedDB. Users bring their own API key (Anthropic, OpenAI, Gemini, Grok, OpenRouter), with optional server-env fallback (`OPENAI_API_KEY`).

A resume is **structured JSON** (JSON Resume v1.0.0 superset). The editor is a form bound to that JSON. Live preview is a `react-pdf` document. Export is a real PDF blob, not `window.print()`.

### Stack
- Next.js 16 (App Router) + React 19 + Tailwind 4 + shadcn (Base UI)
- Persistence: IndexedDB v2 (`src/lib/storage.ts`)
- PDF rendering: `@react-pdf/renderer`
- PDF text extraction: `pdf2json` (server-side, plain text only)
- AI: Multi-provider via SSE streaming (`src/app/api/chat/route.ts`)

### Layout (3-panel, `src/app/page.tsx`)
- **Left** — `DocSidebar`: document tree (base + variants), rename, duplicate, delete
- **Center** — `ResumePreview`: live `react-pdf` PDFViewer + template picker
- **Right** — tabbed Edit (`ResumeForm`) / AI (`AiPanel` with accept/reject) / Job (JD textarea)

### Key Files
| File | Purpose |
|------|---------|
| `src/lib/resume-schema.ts` | TS types for `Resume` + per-section item factories (every item has a stable `id`) |
| `src/lib/resume-ops.ts` | Pure typed-op application: `set_field`, `add_item`, `remove_item`, `move_item`, `rewrite_bullet` |
| `src/lib/resume-ai-tools.ts` | AI tool schemas + tool-call → typed-op converter |
| `src/lib/templates/classic.tsx` | First react-pdf `<Document>` template |
| `src/lib/templates/index.ts` | Template registry keyed by `Resume.meta.template` |
| `src/lib/ai.ts` | Provider detection, API-key management, server-key probe |
| `src/lib/storage.ts` | IndexedDB v2 CRUD for `SavedDocument { resume: Resume }` |
| `src/components/resume-form/*` | One controlled form per section (Basics/Summary/Work/Education/Skills/Projects/Awards) |
| `src/components/resume-preview.tsx` | `PDFViewer` wrapper + `downloadResumePdf` helper |
| `src/components/ai-panel.tsx` | Chat with typed-op accept/reject UI |
| `src/components/doc-sidebar.tsx` | Document tree view |
| `src/app/api/chat/route.ts` | SSE streaming for Anthropic + OpenAI-compatible providers |
| `src/app/api/parse/route.ts` | PDF → plain text (heading hints in `lines[]`) |
| `src/app/api/import/route.ts` | Plain text → `Resume` JSON via LLM (`response_format: json_object`) |
| `src/app/api/has-key/route.ts` | Reports whether server has `OPENAI_API_KEY` set |

## Editing Model

The user's resume is structured JSON. Every array item carries a stable `id` so AI ops (and the form) can target items without positional coupling.

### AI tool surface — five typed ops

| Tool | Purpose |
|------|---------|
| `set_field` | Set any scalar by JSON path (`basics.email`, `work.<id>.position`, `work.<id>.highlights.0`) |
| `add_item` | Append to a section array; new id generated server-side |
| `remove_item` | Remove an item by id |
| `move_item` | Reorder within a section |
| `rewrite_bullet` | Rewrite a single highlight (most common edit) |

Tool calls round-trip through `resume-ai-tools.ts:toolCallToOp` → `resume-ops.ts:applyOp`. There is no fuzzy text matching, no "Text not found" failure mode, no mark-preservation hacks. Every op is deterministic: an id either resolves or returns a structured error.

### AI panel UX

Tool calls from the model are queued as **pending edits**. The user reviews each (Accept / Reject) or hits **Accept all**. Applied ops feed back through the same `applyOp` path that the form uses, so undo / autosave behave identically for human and AI edits.

## Templates

Templates are react-pdf `<Document>` components in `src/lib/templates/`. Each takes `{ resume: Resume }` and renders one or more `<Page>`s. Pagination is handled by react-pdf's flow layout (no measurement code in app layer).

To add a template:
1. Create `src/lib/templates/<name>.tsx` exporting `<NameTemplate>`.
2. Register in `templates/index.ts:TEMPLATES`.
3. The template picker in `page.tsx` reads from `templateOptions()` automatically.

## PDF Import

1. `POST /api/parse` (multipart) → `{ text, lines }` extracted via `pdf2json`.
2. `POST /api/import` (text) → `{ partial }` Resume-shaped JSON via LLM.
3. Client merges `partial` into a full `Resume` via `mergePartialIntoResume` in `page.tsx` — every item gets an id, unknown fields are dropped.
4. New doc saved to IndexedDB.

## Storage

- IndexedDB DB name `resumewise`, store `documents`, version **2**.
- v1 docs (with `htmlContent` / `editorJson`) are dropped on upgrade. The UI shows a one-time toast (`consumeDroppedLegacyCount`) suggesting re-import.
- `SavedDocument`: `{ id, name, date, resume, parentId?, collapsed?, documentType? }`.

## Conventions

- Heavy components (`ResumePreview`, `DocSidebar`, `AiPanel`) are dynamically imported with `{ ssr: false }` in `page.tsx`.
- Forms are controlled — every `onChange` produces a new `Resume` object via spread + slice (no mutation).
- Autosave is a 600ms debounced `saveDocument(doc)` per resume mutation.
- Bullets are plain text. Markdown emphasis is allowed where the template renders it.
- Date strings are free-form (e.g. "Jan 2023", "Present"); never normalize.
- Item ids are UUIDs assigned at creation; preserved across edits and across stored sessions.

## Conventions for AI work in this repo

- The chat route's `HARD_RULES` constant carries the **humanizer** rules (banned vocab, banned phrasings, banned structural patterns). Apply them to any new prompt mode.
- Never invent a `format_text`-style tool — formatting belongs to the template.
- New AI tools must (a) be deterministic by id, (b) round-trip through `applyOp`, (c) have a `describeOp` line so the accept/reject UI shows something readable.
