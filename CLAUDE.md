@AGENTS.md

## Project Overview

ResumeWise is a local-first, browser-based PDF resume editor with AI assistance. No auth, no server-side persistence — everything lives in IndexedDB. Users bring their own API key (Anthropic, OpenAI, Gemini, Grok, OpenRouter).

### Stack
- Next.js 16 + React 19 + TipTap/ProseMirror + Tailwind 4 + shadcn (Base UI)
- Persistence: IndexedDB (`src/lib/storage.ts`)
- AI: Multi-provider via SSE streaming (`src/app/api/chat/route.ts`)

### Layout (3-panel, `src/app/page.tsx`)
- **Left sidebar** — `DocSidebar`: document tree (base docs + variants), rename, duplicate, delete
- **Center** — `ResumeEditor`: paginated TipTap editors + floating `SelectionBar` for quick AI
- **Right sidebar** — tabbed `TextPanel` (formatting) / `AiPanel` (chat with tool calling)

### Key Files
| File | Purpose |
|------|---------|
| `src/lib/use-paged-editors.ts` | Multi-editor pagination engine (reflow algorithm) |
| `src/lib/tiptap-extensions.ts` | Custom ProseMirror extensions (paragraph styles, selection highlight, font weight) |
| `src/lib/editor-tools.ts` | AI tool execution — JSON-level find/replace/format on document |
| `src/lib/ai.ts` | Tool schemas, provider detection, API key management |
| `src/app/api/chat/route.ts` | SSE streaming endpoint for Anthropic + OpenAI-compatible providers |
| `src/app/api/parse/route.ts` | PDF → styled HTML conversion via pdf2json |
| `src/app/api/fonts/route.ts` | Google Fonts metadata proxy |
| `src/lib/storage.ts` | IndexedDB CRUD for `SavedDocument` |
| `src/lib/google-fonts.ts` | Client-side font loading + caching |

## Pagination Rules

- NEVER use tiptap-pagination-plus or any CSS-based page splitting trick.
- Each page MUST be a separate div with its own separate TipTap editor instance.
- Content overflow from one page must spill into the next page's editor.
- Page height is real (measured against the actual div), not simulated by CSS floats/decorations.
- Always make a plan before implementing pagination changes.

## AI Tool System

- 4 tools: `replace_text`, `insert_text_after`, `delete_text`, `format_text`
- Tools operate on **JSON-level document manipulation** (not ProseMirror transactions) to avoid corruption
- Uses fuzzy Unicode-normalized text matching (`normalize()`, `fuzzyIndexOf()` in `editor-tools.ts`)
- `setFullContent()` atomically replaces all editor content and re-paginates
- Tool calling loop: max 3 rounds, client-side execution, results sent back to provider

## Editor Architecture

- TipTap `Bold` extension is reconfigured to only match `<strong>`/`<b>` tags — CSS `font-weight` is handled by custom `FontWeight` extension via `textStyle` mark
- `SelectionHighlight` persists selection decorations across editor blur (multi-editor environment)
- `ParagraphStyles` preserves PDF line-height/padding/margin + auto hanging-indent for bullet lines
- Auto-save writes to IndexedDB only (no React state update) to prevent editor recreation

## Conventions

- All components are dynamically imported in `page.tsx` with `{ ssr: false }`
- Page dimensions: 612×792px (US Letter at 72dpi)
- Font sizes stored as px internally, displayed as pt in the UI (`pxToPt`/`ptToPx`)
- Print/export uses `window.print()` with CSS `@media print` rules
- Documents support parent/variant relationships (tree structure in sidebar)
