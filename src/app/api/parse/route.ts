// PDF → plain text via pdfjs-dist (in-memory, no filesystem).
// Extracts text, joins into lines. The LLM in /api/import handles structuring.

import { NextRequest, NextResponse } from "next/server";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { TextItem } from "pdfjs-dist/types/src/display/api";

interface ParseResponse {
  text: string;
  lines: string[];
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const buffer = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocument({ data: buffer, useSystemFonts: true }).promise;

    const pageLines: string[][] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const items = content.items.filter(
        (item): item is TextItem => "str" in item && item.str.length > 0
      );

      // Group by y-position (transform[5]). Items within 2px = same line.
      const lines: string[] = [];
      let curY = -Infinity;
      let cur: string[] = [];
      for (const item of items) {
        const y = item.transform[5];
        if (Math.abs(y - curY) > 2 && cur.length > 0) {
          lines.push(cur.join(" ").replace(/\s+/g, " ").trim());
          cur = [];
        }
        curY = y;
        cur.push(item.str);
      }
      if (cur.length > 0) lines.push(cur.join(" ").replace(/\s+/g, " ").trim());
      pageLines.push(lines.filter((l) => l.length > 0));
    }

    const lines = pageLines.flatMap((page, idx) =>
      idx === 0 ? page : ["", ...page]
    );
    const text = lines.join("\n");

    const response: ParseResponse = { text, lines };
    return NextResponse.json(response);
  } catch (err: unknown) {
    console.error("[parse]", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
