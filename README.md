# ResumeWise

Local-first, browser-based resume editor with AI assistance. No auth, no server-side persistence — everything lives in IndexedDB. Bring your own API key.

A resume is **structured JSON** (JSON Resume v1.0.0 superset). The editor is a form bound to that JSON. Live preview is a real `react-pdf` document. Export is a real PDF blob, not `window.print()`.

## Features

- **PDF Import** — Drop a PDF, extract plain text server-side (`pdf2json`), convert to structured JSON via LLM
- **Structured Editing** — Typed form per section (Basics, Summary, Work, Education, Skills, Projects, Awards) bound to the resume JSON
- **Live PDF Preview** — `react-pdf` renders the document as you edit; what you see is what exports
- **Templates** — Swappable `<Document>` components (Classic, Modern, Business, Editorial, Mono); pick per-resume
- **AI Assistance** — Chat panel with typed-op tool calls and accept/reject UI
  - Providers: Anthropic, OpenAI, Gemini, Grok, OpenRouter (auto-detected from key format)
  - Optional server fallback via `OPENAI_API_KEY`
  - Five deterministic ops: `set_field`, `add_item`, `remove_item`, `move_item`, `rewrite_bullet` — every target resolved by stable id, no fuzzy matching
- **JD-Aware Variants** — Paste a job description; spawn a tailored variant with company/title inferred from ATS URLs (Greenhouse, Ashby) or pasted text
- **Fit Analyzer** — Scores the active variant against the JD
- **Document Tree** — Base resumes + nested variants in the sidebar; rename, duplicate, delete
- **Command Palette** — `Cmd+K` for quick navigation and actions
- **Local-First** — IndexedDB v2 (`resumewise` DB). API keys stay in `localStorage`
- **Export** — Real PDF blob from `react-pdf`, downloadable as a file

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Optional: set `OPENAI_API_KEY` in your environment to enable server-side fallback when users haven't entered a key.

## Usage

1. **Import a PDF** or create a blank resume
2. **Edit** via the right-panel form — every change autosaves (600ms debounce) to IndexedDB
3. **Switch templates** from the center preview toolbar
4. **Paste a JD** in the Job tab; create a variant tailored to that role
5. **Chat with AI** in the AI tab; review queued edits and accept/reject individually or in bulk
6. **Download** — Click Export for a real PDF file

## Architecture

### Layout (3-panel, `src/app/page.tsx`)

- **Left** — `DocSidebar`: document tree (base + variants)
- **Center** — `ResumePreview`: `react-pdf` PDFViewer + template picker
- **Right** — tabbed Edit / AI / Job

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/resume-schema.ts` | TS types for `Resume` + per-section item factories (stable ids) |
| `src/lib/resume-ops.ts` | Pure typed-op application |
| `src/lib/resume-ai-tools.ts` | AI tool schemas + tool-call → op converter |
| `src/lib/templates/*` | `react-pdf` `<Document>` templates + registry |
| `src/lib/variant-workflow.ts` | JD parsing, variant naming, ATS metadata extraction |
| `src/lib/fit-analyzer.ts` | JD-to-resume fit scoring |
| `src/lib/storage.ts` | IndexedDB v2 CRUD |
| `src/lib/ai.ts` | Provider detection, key management |
| `src/app/api/chat/route.ts` | SSE streaming (Anthropic + OpenAI-compatible) |
| `src/app/api/parse/route.ts` | PDF → plain text |
| `src/app/api/import/route.ts` | Plain text → `Resume` JSON |
| `src/app/api/analyze-fit/route.ts` | JD vs resume fit scoring |

### AI Tool Surface

| Tool | Purpose |
|------|---------|
| `set_field` | Set any scalar by JSON path |
| `add_item` | Append to a section array |
| `remove_item` | Remove an item by id |
| `move_item` | Reorder within a section |
| `rewrite_bullet` | Rewrite a single highlight |

Tool calls round-trip through `toolCallToOp` → `applyOp`. Every op is deterministic: an id either resolves or returns a structured error. No "text not found" failure mode.

## Tech Stack

- [Next.js 16](https://nextjs.org/) (App Router) + [React 19](https://react.dev/)
- [@react-pdf/renderer](https://react-pdf.org/) for preview + export
- [pdf2json](https://github.com/modesty/pdf2json) for server-side PDF text extraction
- [Tailwind CSS 4](https://tailwindcss.com/) + shadcn (Base UI)
- IndexedDB for persistence

## License

Private.
