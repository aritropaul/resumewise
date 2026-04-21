@AGENTS.md

## Project Overview

ResumeWise is a multi-tenant resume editor SaaS with AI assistance. Users authenticate via email/password or Google OAuth (Better Auth). API keys are encrypted at rest (AES-256-GCM) per user. Dual deployment: local dev (better-sqlite3) and Cloudflare (D1).

A resume is structured markdown. The editor is a form bound to that markdown. Live preview is a `react-pdf` document. Export is a real PDF blob.

### Stack
- Next.js 16 (App Router) + React 19 + Tailwind 4 + shadcn (Base UI)
- Auth: Better Auth (email/password + Google OAuth)
- Persistence: Dual backend — better-sqlite3 (local), Cloudflare D1 (prod)
- PDF rendering: `@react-pdf/renderer`
- PDF text extraction: `pdfjs-dist` (server-side, in-memory)
- AI: Multi-provider via SSE streaming (`src/app/api/chat/route.ts`)
- BYOK: Encrypted API keys in DB, resolved server-side (`src/lib/resolve-key.ts`)

### Routing
- `/` — Landing page (public)
- `/login`, `/signup` — Auth pages
- `/app` — Main 3-panel editor (authenticated)
- `/app/settings` — API key management

### Layout (3-panel, `src/app/app/page.tsx`)
- **Left** — `DocSidebar`: document tree (base + variants), rename, duplicate, delete
- **Center** — `CenterTabs`: edit (markdown) / preview (react-pdf)
- **Right** — tabbed Design / AI (`AiPanel` with accept/reject) / Job (JD analysis)
- Mobile: sidebars collapse to overlays with backdrop

### Key Files
| File | Purpose |
|------|---------|
| `src/lib/providers.ts` | Shared provider config, model IDs, client factory |
| `src/lib/auth.ts` | Better Auth server instance |
| `src/lib/auth-client.ts` | Better Auth React client |
| `src/lib/resolve-key.ts` | Server-side key resolution: stored key → body fallback → env var |
| `src/lib/crypto.ts` | AES-256-GCM encrypt/decrypt via Web Crypto API |
| `src/lib/key-storage.ts` | Dual-backend CRUD for encrypted API keys |
| `src/lib/server-storage.ts` | Dual-backend document storage (sqlite + D1) |
| `src/lib/storage.ts` | Client-side storage helpers + document factories |
| `src/lib/ai.ts` | Provider types, detection, labels (client-side) |
| `src/lib/templates/` | react-pdf `<Document>` templates (classic, modern, business, editorial, mono) |
| `src/middleware.ts` | Auth middleware — redirects unauthenticated to /login |
| `src/app/api/chat/route.ts` | SSE streaming for Anthropic + OpenAI-compatible providers |
| `src/app/api/parse/route.ts` | PDF → plain text via pdfjs-dist (in-memory) |
| `src/app/api/import/route.ts` | Plain text → structured markdown via LLM |
| `src/app/api/keys/route.ts` | BYOK key management (list, save, delete) |
| `src/app/api/documents/route.ts` | Document CRUD (user-scoped) |
| `src/app/api/auth/[...all]/route.ts` | Better Auth catch-all |

## Storage

Dual backend via `StorageBackend` interface in `src/lib/server-storage.ts`:
- **Local dev**: better-sqlite3 at `~/.resumewise/resumewise.db`
- **Cloudflare**: D1 via `@opennextjs/cloudflare` bindings
- `getStorage()` detects environment at runtime
- All queries scoped by `user_id`
- D1 migration at `migrations/0001_initial.sql`

## BYOK (Bring Your Own Key)

- Keys encrypted with AES-256-GCM (Web Crypto API) using `ENCRYPTION_KEY` env var
- Stored in `api_keys` table: `{ user_id, provider, encrypted_key, iv, key_prefix }`
- `resolveProviderClient()` in `resolve-key.ts` handles key resolution:
  1. User's stored key from DB (preferred)
  2. Key from request body (backward compat)
  3. Server `OPENAI_API_KEY` env var (fallback)
- Settings UI at `/app/settings` for per-provider key management

## Auth

- Better Auth with email/password + Google OAuth
- Session cookie: `better-auth.session_token`
- Middleware at `src/middleware.ts` gates all `/app/*` and `/api/*` routes (except `/api/auth/*`)
- API routes extract userId via `auth.api.getSession()`

## PDF Import

1. `POST /api/parse` (multipart) → `{ text, lines }` via `pdfjs-dist` (in-memory, no temp files)
2. `POST /api/import` (text) → `{ markdown }` via LLM
3. Client saves new document

## Conventions

- Heavy components dynamically imported with `{ ssr: false }` in `page.tsx`
- Autosave: 600ms debounced `saveDocument(doc)` per mutation
- Date strings are free-form; never normalize
- Provider config centralized in `src/lib/providers.ts` (single source of truth for model IDs)

## Conventions for AI work in this repo

- The chat route's `HARD_RULES` constant carries the **humanizer** rules. Apply to any new prompt mode.
- Never invent a `format_text`-style tool — formatting belongs to the template.
- New AI tools must (a) be deterministic by id, (b) round-trip through `applyOp`, (c) have a `describeOp` line.

## Cloudflare Deployment

- `wrangler.toml` configured with D1 binding
- `@opennextjs/cloudflare` adapter
- Scripts: `cf:build`, `cf:preview`, `cf:deploy`, `d1:migrate`
- Secrets needed: `ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
