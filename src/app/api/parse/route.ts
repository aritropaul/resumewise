// PDF → plain text. The v2 architecture doesn't try to preserve fonts /
// colors / positioning — it extracts content and lets the LLM structure it
// into a Resume JSON. ~50 LOC vs the v1 700-line styled-HTML reconstructor.

import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

interface ParseResponse {
  text: string;        // full document text, paragraph breaks preserved
  lines: string[];     // line-by-line for the importer to scan for headings
}

interface PdfTextRun {
  T?: string;
}

interface PdfText {
  x?: number;
  y?: number;
  R?: PdfTextRun[];
}

interface PdfPage {
  Texts?: PdfText[];
}

interface PdfData {
  Pages?: PdfPage[];
}

interface PdfParserInstance {
  on(event: "pdfParser_dataReady", handler: (data: PdfData) => void): void;
  on(event: "pdfParser_dataError", handler: (error: unknown) => void): void;
  loadPDF(path: string): void;
}

export async function POST(req: NextRequest) {
  let tmpPath = "";
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    tmpPath = join(tmpdir(), `rw-${Date.now()}.pdf`);
    writeFileSync(tmpPath, buffer);

    const PDFParser = (await import("pdf2json")).default as new (
      context: unknown,
      needRawText: boolean
    ) => PdfParserInstance;
    const data = await new Promise<PdfData>((resolve, reject) => {
      const parser = new PDFParser(null, true);
      parser.on("pdfParser_dataReady", (parsedData) => resolve(parsedData));
      parser.on("pdfParser_dataError", (error) =>
        reject(new Error(describePdfParserError(error)))
      );
      parser.loadPDF(tmpPath);
    });

    // Walk pages → texts → runs. Group runs by y so each visual line becomes
    // one output line. Pages are joined with a blank line.
    const pageLines: string[][] = [];
    for (const page of data.Pages || []) {
      type Run = { x: number; y: number; text: string };
      const runs: Run[] = [];
      for (const text of page.Texts || []) {
        for (const r of text.R || []) {
          let decoded = "";
          try {
            decoded = decodeURIComponent(r.T || "");
          } catch {
            decoded = r.T || "";
          }
          decoded = decoded.replace(/[\u0000-\u001F\uFFFD\uE000-\uF8FF]/g, "");
          if (!decoded) continue;
          runs.push({ x: text.x || 0, y: text.y || 0, text: decoded });
        }
      }
      // Sort by y then x; group close-y rows together as one line.
      runs.sort((a, b) => (Math.abs(a.y - b.y) > 0.3 ? a.y - b.y : a.x - b.x));
      const lines: string[] = [];
      let curY = -Infinity;
      let cur: string[] = [];
      for (const r of runs) {
        if (Math.abs(r.y - curY) > 0.3 && cur.length > 0) {
          lines.push(cur.join("").replace(/\s+/g, " ").trim());
          cur = [];
        }
        curY = r.y;
        cur.push(r.text + " ");
      }
      if (cur.length > 0) lines.push(cur.join("").replace(/\s+/g, " ").trim());
      pageLines.push(lines.filter((l) => l.length > 0));
    }

    const lines = pageLines.flatMap((page, idx) => (idx === 0 ? page : ["", ...page]));
    const text = lines.join("\n");

    const response: ParseResponse = { text, lines };
    return NextResponse.json(response);
  } catch (err: unknown) {
    console.error("[parse]", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (tmpPath) try { unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

function describePdfParserError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "parserError" in error) {
    const parserError = (error as { parserError?: unknown }).parserError;
    if (typeof parserError === "string") return parserError;
  }
  return String(error);
}
