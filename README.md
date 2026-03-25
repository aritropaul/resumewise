# ResumeWise

A local-first resume editor that lets you import, edit, and enhance PDF resumes with AI — all in your browser.

## Features

- **PDF Import** — Upload any PDF resume; text, fonts, colors, and layout are preserved
- **Rich Text Editing** — Full formatting: font family (1600+ Google Fonts), weight (100–900), size, color, alignment, bold/italic/underline/strikethrough, links
- **Real Pagination** — Each page is a separate editor; content automatically reflows between pages
- **AI Assistance** — Chat panel and inline selection bar powered by your own API key
  - Supports Anthropic, OpenAI, Gemini, Grok, and OpenRouter
  - AI can directly edit your resume via tool calls (find/replace, insert, delete, format)
- **Document Management** — Multiple documents, duplicates, and variants in a sidebar tree
- **Local-First** — Everything stored in IndexedDB. No accounts, no server-side storage. Your API key stays in `localStorage`
- **Export** — Print to PDF via `Cmd+P` / `Ctrl+P`

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. **Upload a PDF** or create a blank document
2. **Edit** text directly in the paginated editor
3. **Format** using the right sidebar (Text panel) — fonts, sizes, weights, colors, alignment
4. **Use AI** by switching to the AI tab in the right sidebar:
   - Enter your API key (auto-detected provider)
   - Chat about your resume; ask for improvements
   - AI uses tools to edit your resume directly
5. **Quick AI** — Select text to see the floating bar: ask a question or click "Improve"
6. **Export** — Click Export or `Cmd+S` to save, `Cmd+P` to print/PDF

## Tech Stack

- [Next.js 16](https://nextjs.org/) + [React 19](https://react.dev/)
- [TipTap](https://tiptap.dev/) (ProseMirror) for rich text editing
- [Tailwind CSS 4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- [pdf2json](https://github.com/nickolasburr/pdf2json) for PDF parsing
- IndexedDB for persistence

## License

Private.
