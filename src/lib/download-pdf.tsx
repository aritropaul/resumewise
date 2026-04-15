"use client";

import type { ResumeTheme } from "@/lib/resume-theme";
import type { ResumeAst } from "@/lib/resume-md";

/**
 * Client-only helper. Kept out of resume-preview.tsx so that page.tsx can
 * import it without dragging pdfjs-dist into the SSR bundle.
 */
export async function downloadResumePdf(
  args: { markdown: string; theme: ResumeTheme; template: string },
  filename: string
) {
  const [
    { pdf },
    { getTemplate, getTemplateFonts },
    { ensureFont },
    { parseResumeMarkdown },
  ] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/lib/templates"),
    import("@/lib/templates/fonts"),
    import("@/lib/resume-md"),
  ]);
  const Template = getTemplate(args.template);
  const declared = getTemplateFonts(args.template);
  const themeFont = args.theme.font;
  const extra = themeFont && !declared.includes(themeFont) ? [themeFont] : [];
  await Promise.all([...declared, ...extra].map((f) => ensureFont(f)));
  const ast: ResumeAst = parseResumeMarkdown(args.markdown);
  const blob = await pdf(<Template ast={ast} theme={args.theme} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
