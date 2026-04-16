// Smoke: hit local /api/fonts, register JetBrains Mono in react-pdf, render
// the Mono template. Verifies the actual browser-equivalent flow end-to-end.
// Requires the dev server running on http://localhost:3000.
//
// run: npx tsx scripts/smoke-mono.ts

import * as React from "react";
import { Font } from "@react-pdf/renderer";
import ReactPDF from "@react-pdf/renderer";
import { MonoTemplate } from "../src/lib/templates/mono";
import { SAMPLE_MARKDOWN, parseResumeMarkdown } from "../src/lib/resume-md";
import { defaultTheme } from "../src/lib/resume-theme";

const ORIGIN = "http://localhost:3000";

interface Source {
  weight: number;
  style: "normal" | "italic";
  src: string;
}

async function preload(family: string) {
  const url = `${ORIGIN}/api/fonts?family=${encodeURIComponent(family)}&weights=400,500,600`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fonts api ${res.status}`);
  const body = (await res.json()) as { sources: Source[] };
  const lastByKey = new Map<string, Source>();
  for (const s of body.sources) lastByKey.set(`${s.weight}-${s.style}`, s);
  Font.register({
    family,
    fonts: Array.from(lastByKey.values()).map((s) => ({
      src: s.src,
      fontWeight: s.weight,
      fontStyle: s.style,
    })),
  });
  console.log(`[preload] registered ${family} with ${lastByKey.size} faces`);
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

async function main() {
  const family = process.argv[2] || "JetBrains Mono";
  const theme = { ...defaultTheme(), font: family };
  await preload(family);

  const ast = parseResumeMarkdown(SAMPLE_MARKDOWN);
  console.log(`[smoke] blocks=${ast.blocks.length} font=${theme.font}`);
  console.log(`[smoke] registered families:`, Font.getRegisteredFontFamilies());

  try {
    const stream = await ReactPDF.renderToStream(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      React.createElement(MonoTemplate, { ast, theme }) as any
    );
    const buf = await streamToBuffer(stream);
    console.log(`[smoke] PDF bytes=${buf.length} header=${buf.slice(0, 5).toString()}`);
    if (!buf.slice(0, 5).toString().startsWith("%PDF-")) {
      console.error("[smoke] FAILED: bad PDF header");
      process.exit(1);
    }
    console.log("[smoke] OK");
  } catch (err) {
    console.error("[smoke] FAILED:", err);
    process.exit(1);
  }
}

main();
