// @ts-expect-error — unused file, module path may not resolve
import { getDocument } from "react-pdf/node_modules/pdfjs-dist";
// @ts-expect-error — unused file, module path may not resolve
import type { TextItem as PdfTextItem } from "react-pdf/node_modules/pdfjs-dist/types/src/display/api";

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
}

interface TextLine {
  runs: TextRun[];
  y: number;
  fontSize: number;
}

export async function pdfToHtml(data: ArrayBuffer): Promise<string> {
  const doc = await getDocument({ data }).promise;
  const allLines: TextLine[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    await page.getOperatorList();

    // Extract runs with font info
    const runs: TextRun[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const ti = item as PdfTextItem;
      if (!ti.str) continue;

      const tx = ti.transform;
      const fontSize = Math.round(Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]) * 10) / 10;
      const x = tx[4];
      const y = viewport.height - tx[5];

      let fontFamily = "sans-serif";
      let isBold = false;
      let isItalic = false;
      let color = "#000000";

      try {
        const fontObj = page.commonObjs.get(ti.fontName) as any;
        if (fontObj?.name) {
          const name: string = fontObj.name.replace(/^[A-Z]{6}\+/, "");
          fontFamily = mapFont(name);
          isBold = /bold|heavy|black|semibold|demi/i.test(name);
          isItalic = /italic|oblique/i.test(name);
        }
      } catch {}

      // Also check ti.fontName
      if (!isBold) isBold = /bold/i.test(ti.fontName);
      if (!isItalic) isItalic = /italic|oblique/i.test(ti.fontName);

      const cleanedText = ti.str
        .replace(/[\u0000-\u001F\uFFFD]/g, "")
        .replace(/[\uE000-\uF8FF]/g, " ")
        .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, "");

      if (!cleanedText.trim() && !cleanedText.includes(" ")) continue;

      runs.push({
        text: cleanedText,
        fontSize,
        fontFamily,
        isBold,
        isItalic,
        color,
        x,
        y: y - fontSize,
        width: ti.width,
      });
    }

    // Group runs into lines by Y
    runs.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 3) return a.y - b.y;
      return a.x - b.x;
    });

    let currentLineRuns: TextRun[] = runs.length > 0 ? [runs[0]] : [];
    let currentY = runs[0]?.y ?? 0;

    for (let j = 1; j < runs.length; j++) {
      if (Math.abs(runs[j].y - currentY) < 3) {
        currentLineRuns.push(runs[j]);
      } else {
        if (currentLineRuns.length > 0) {
          allLines.push({
            runs: currentLineRuns.sort((a, b) => a.x - b.x),
            y: currentY,
            fontSize: currentLineRuns[0].fontSize,
          });
        }
        currentLineRuns = [runs[j]];
        currentY = runs[j].y;
      }
    }
    if (currentLineRuns.length > 0) {
      allLines.push({
        runs: currentLineRuns.sort((a, b) => a.x - b.x),
        y: currentY,
        fontSize: currentLineRuns[0].fontSize,
      });
    }
  }

  // Convert lines to HTML
  return linesToHtml(allLines);
}

function linesToHtml(lines: TextLine[]): string {
  let html = "";

  for (const line of lines) {
    const spans = line.runs.map((run, i) => {
      let text = run.text;

      // Add space between runs if there's a gap
      if (i > 0) {
        const prev = line.runs[i - 1];
        const gap = run.x - (prev.x + prev.width);
        if (gap > run.fontSize * 0.15) {
          text = " " + text;
        }
      }

      const escaped = escapeHtml(text);
      if (!escaped.trim()) return escaped;

      // Every run gets a span with all its styles — TipTap TextStyle handles these
      const styles: string[] = [];
      styles.push(`font-size: ${run.fontSize}pt`);
      if (run.fontFamily && run.fontFamily !== "sans-serif") {
        styles.push(`font-family: ${run.fontFamily}`);
      }
      if (run.color && run.color !== "#000000") {
        styles.push(`color: ${run.color}`);
      }

      let inner = escaped;
      if (run.isBold) inner = `<strong>${inner}</strong>`;
      if (run.isItalic) inner = `<em>${inner}</em>`;

      return `<span style="${styles.join("; ")}">${inner}</span>`;
    }).join("");

    html += `<p>${spans || "<br>"}</p>\n`;
  }

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function mapFont(name: string): string {
  const clean = name.replace(/[-]?(Bold|Italic|Oblique|Regular|Medium|Light|Heavy|Black|SemiBold|Demi|MT|PSMT)/gi, "").trim();
  const lower = clean.toLowerCase().replace(/[\s-]/g, "");
  const map: Record<string, string> = {
    arial: "Arial", helvetica: "Helvetica", helveticaneue: "Helvetica Neue",
    timesnewroman: "Times New Roman", times: "Times New Roman",
    courier: "Courier New", calibri: "Calibri", georgia: "Georgia",
    garamond: "Garamond", verdana: "Verdana", lato: "Lato", roboto: "Roboto",
    opensans: "Open Sans", montserrat: "Montserrat", poppins: "Poppins",
    inter: "Inter", raleway: "Raleway",
  };
  for (const [key, value] of Object.entries(map)) {
    if (lower.includes(key)) return value;
  }
  return clean || "sans-serif";
}
