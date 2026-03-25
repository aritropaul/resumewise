import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const kColors = [
  "#000000","#ffffff","#4c4c4c","#808080","#999999","#c0c0c0","#cccccc",
  "#e5e5e5","#f2f2f2","#008000","#00ff00","#bfffa0","#ffd629","#ff99cc",
  "#004080","#9fc0e1","#5580ff","#a9c9fa","#ff0080","#800080","#ffbfff",
  "#e45b21","#ffbfaa","#008080","#ff0000","#fdc59f","#808000","#bfbf00",
  "#824100","#007256","#008000","#000080","#008080","#800080","#ff0000",
  "#0000ff","#008000","#000000",
];

const SCALE = 16;

const kFontFamilies: Record<number, string> = {
  0: "Helvetica, Arial, sans-serif",
  1: "Arial Narrow, sans-serif",
  2: "sans-serif",
  3: "Courier New, monospace",
  4: "Courier New, monospace",
  5: "Courier New, monospace",
};

interface TextRun {
  text: string;
  fontSize: number;
  fontFamily: string;
  isBold: boolean;
  isItalic: boolean;
  color: string;
  x: number;
  y: number;
  width: number;
  isGlyph?: boolean; // fontFace=2 empty run — could be bullet or separator
}

interface TextLine {
  runs: TextRun[];
  y: number;
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

    const PDFParser = (await import("pdf2json")).default;

    const pdfData = await new Promise<any>((resolve, reject) => {
      const parser = new PDFParser(null, true);
      parser.on("pdfParser_dataReady", (data: any) => resolve(data));
      parser.on("pdfParser_dataError", (err: any) => reject(new Error(String(err?.parserError || err))));
      parser.loadPDF(tmpPath);
    });

    const pages = pdfData.Pages || [];
    if (pages.length === 0) {
      return NextResponse.json({ error: "No pages" }, { status: 400 });
    }

    // Extract all text runs
    const allRuns: TextRun[] = [];

    for (const page of pages) {
      for (const text of page.Texts || []) {
        for (const run of text.R || []) {
          let decoded: string;
          try { decoded = decodeURIComponent(run.T); } catch { decoded = run.T || ""; }

          // Clean control chars but preserve visible special chars
          decoded = decoded
            .replace(/[\u0000-\u001F\uFFFD]/g, "")
            .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, "");

          const ts = run.TS || [0, 12, 0, 0];

          // fontFace=2 runs use a symbol font — the raw chars are PUA codepoints
          // that map to real glyphs. If we can't decode them, mark as glyph placeholder.
          let isGlyph = false;
          if (ts[0] === 2) {
            decoded = mapPiFont(decoded);
            if (!decoded) continue;
          } else {
            decoded = decoded.replace(/[\uE000-\uF8FF]/g, "");
          }

          if (!decoded) continue;
          const fontSize = ts[1] || 12;
          // pdf2json bold flag OR detect from style index (S field)
          // Style indices 6-11 are bold variants in pdf2json's style dictionary
          const styleIdx = run.S || 0;
          const isBold = ts[2] === 1 || (styleIdx >= 6 && styleIdx <= 11);
          const isItalic = ts[3] === 1;

          let color = "#000000";
          if (text.oc) {
            color = text.oc.startsWith("#") ? text.oc : `#${text.oc}`;
          } else if (text.clr !== undefined && text.clr < kColors.length) {
            color = kColors[text.clr];
          }

          allRuns.push({
            text: decoded,
            fontSize,
            fontFamily: kFontFamilies[ts[0]] || "sans-serif",
            isBold,
            isItalic,
            color,
            x: (text.x || 0) * SCALE,
            y: (text.y || 0) * SCALE,
            width: (text.w || 1) * SCALE,
            isGlyph,
          });
        }
      }
    }

    // Group into lines by Y
    allRuns.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 4) return a.y - b.y;
      return a.x - b.x;
    });

    const lines: TextLine[] = [];
    if (allRuns.length > 0) {
      let currentLine: TextRun[] = [allRuns[0]];
      let currentY = allRuns[0].y;

      for (let i = 1; i < allRuns.length; i++) {
        if (Math.abs(allRuns[i].y - currentY) < 4) {
          currentLine.push(allRuns[i]);
        } else {
          lines.push({ runs: currentLine.sort((a, b) => a.x - b.x), y: currentY });
          currentLine = [allRuns[i]];
          currentY = allRuns[i].y;
        }
      }
      lines.push({ runs: currentLine.sort((a, b) => a.x - b.x), y: currentY });
    }

    const html = linesToHtml(lines);
    return NextResponse.json({ html });
  } catch (err: any) {
    console.error("PDF parse error:", err);
    return NextResponse.json({ error: err?.message || "Failed" }, { status: 500 });
  } finally {
    if (tmpPath) try { unlinkSync(tmpPath); } catch {}
  }
}

// Map QuickTypePi / Symbol font PUA codepoints to real Unicode characters
// pdf2json encodes symbol font glyphs as PUA chars (U+E000–U+F8FF)
// The mapping follows the Symbol/ZapfDingbats encoding where the low byte
// corresponds to the original character code
function mapPiFont(text: string): string {
  let result = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0xE000 && cp <= 0xF8FF) {
      // Low byte is the original char code in the symbol encoding
      const low = cp & 0xFF;
      const mapped = piCharMap[low];
      if (mapped) {
        result += mapped;
      }
      // unmapped PUA chars are dropped
    } else {
      result += ch;
    }
  }
  return result.trim();
}

// QuickTypePi PUA codepoint (low byte) → Unicode mapping
// Mapped by cross-referencing x-positions in log with known PDF content:
//   header: "aritro paul  |  443 531 0121 · hello@aritro.xyz · aritro.xyz"
//   E081 x=22 (between name and number) → |
//   E09D x=mid (between contact items) → ·
//   E087 x=~7-15 (start of indented lines) → • (bullet)
//   E088 x=~29-33 (end of lines, after dates) → – (dash)
//   E08C x=2 (left margin, bullet lines) → • (bullet)
//   E082 → unknown, probably decorative — skip
const piCharMap: Record<number, string> = {
  0x81: "(",         // left parenthesis — "(443)"
  0x82: ")",         // right parenthesis — "(443)"
  0x87: "@",         // at sign — "Designer @ Company"
  0x88: "–",         // en-dash — "Aug '24 – Present"
  0x8C: "•",         // bullet point — start of bullet lines
  0x9D: "·",         // middle dot — "item · item"
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function linesToHtml(lines: TextLine[]): string {
  let html = "";
  let prevY = 0;
  const pageLeftMargin = lines.length > 0 ? Math.min(...lines.map(l => l.runs[0]?.x ?? 999)) : 32;
  // Average line spacing (most common gap between consecutive lines)
  const lineGaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const g = lines[i].y - lines[i - 1].y;
    if (g > 0 && g < 50) lineGaps.push(g);
  }
  lineGaps.sort((a, b) => a - b);
  const normalGap = lineGaps[Math.floor(lineGaps.length / 2)] || 14;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const runs = line.runs;
    if (runs.length === 0 || runs.every(r => !r.text.trim())) continue;

    // Vertical spacing
    const gap = li > 0 ? line.y - prevY : 0;
    prevY = line.y;

    // Section break: gap is larger than normal line spacing
    if (gap > normalGap * 1.5 && li > 0) {
      const extraSpace = Math.round(gap - normalGap);
      html += `<p style="margin: 0; margin-top: ${extraSpace}px; line-height: 0px"><br></p>\n`;
    }

    // Indentation from left margin
    const lineX = runs[0].x;
    const indent = Math.round(lineX - pageLeftMargin);

    // Build paragraph styles
    const pStyles: string[] = [];
    pStyles.push("margin: 0");
    pStyles.push(`line-height: ${Math.round(normalGap * 1.1)}px`);

    if (indent > 3) pStyles.push(`padding-left: ${indent}px`);

    const spans = runs.map((run, i) => {
      let text = run.text;

      // Space between fragments based on x gap
      if (i > 0) {
        const prev = runs[i - 1];
        const gapX = run.x - (prev.x + prev.width);
        if (gapX > run.fontSize * 3) {
          // Very large gap — tab stop (right-aligned dates)
          const nbsps = Math.max(2, Math.round(gapX / (run.fontSize * 0.5)));
          text = "\u00A0".repeat(nbsps) + text;
        } else if (gapX > run.fontSize * 0.15) {
          text = " " + text;
        }
      }

      // Convert whitespace-only text to non-breaking spaces so they don't collapse
      let escaped = esc(text);
      if (!escaped.trim() && escaped.length > 0) {
        escaped = "\u00A0".repeat(escaped.length);
      }

      const styles: string[] = [];
      styles.push(`font-size: ${run.fontSize}px`);
      if (run.fontFamily !== "sans-serif") styles.push(`font-family: ${run.fontFamily}`);
      if (run.color !== "#000000") styles.push(`color: ${run.color}`);

      // Wrap URLs in <a> tags
      let inner = escaped.replace(
        /(https?:\/\/[^\s<]+)/g,
        (url) => `<a href="${url}">${url}</a>`
      );
      if (run.isBold && run.isItalic) inner = `<strong><em>${inner}</em></strong>`;
      else if (run.isBold) inner = `<strong>${inner}</strong>`;
      else if (run.isItalic) inner = `<em>${inner}</em>`;

      return `<span style="${styles.join("; ")}">${inner}</span>`;
    }).join("");

    html += `<p style="${pStyles.join("; ")}">${spans}</p>\n`;
  }

  return html;
}
