// Shared primitives. Inline-text rendering applies styles in the order:
// template defaults < theme knobs (linkBase) < inline directive overrides.

import React from "react";
import { Link, Text } from "@react-pdf/renderer";
import type { ResumeAst } from "../resume-md";
import { parseInline, resolveColor, type InlineStyle } from "../resume-inline";
import { ensureFontSync } from "./fonts";
import type { LinkStyleProps, TemplateTokens } from "./_theme";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:\/\/|www\.|[a-z0-9-]+\.(com|dev|io|org|net|co|xyz|app|ai|me)(\/|$))/i;

export function contactHref(atom: string): string | null {
  if (EMAIL_RE.test(atom)) return `mailto:${atom}`;
  if (URL_RE.test(atom)) return atom.startsWith("http") ? atom : `https://${atom}`;
  return null;
}

export function normalizeHref(href: string): string {
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("#")) return href;
  if (EMAIL_RE.test(href)) return `mailto:${href}`;
  return `https://${href}`;
}

export function spanStyle(
  style: InlineStyle,
  t: TemplateTokens
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (style.bold) out.fontWeight = 600;
  if (style.italic) out.fontStyle = "italic";
  if (style.underline) out.textDecoration = "underline";
  if (style.code) {
    out.fontFamily = "Courier";
    out.backgroundColor = "#f4f4f5";
  }
  const color = resolveColor(style.color, { accent: t.accent, muted: t.muted, ink: t.ink });
  if (color) out.color = color;
  if (style.fontSize) out.fontSize = style.fontSize;
  if (style.fontWeight) out.fontWeight = Math.min(style.fontWeight, 600);
  if (style.fontFamily) {
    ensureFontSync(style.fontFamily);
    out.fontFamily = style.fontFamily;
  }
  return out;
}

export function InlineText({
  text,
  style,
  tkns,
  linkBase,
}: {
  text: string;
  style?: Record<string, string | number>;
  tkns: TemplateTokens;
  linkBase?: LinkStyleProps;
}) {
  const spans = parseInline(text);
  if (spans.length === 0) return <Text style={style}> </Text>;
  if (spans.length === 1 && Object.keys(spans[0].style).length === 0) {
    return <Text style={style}>{spans[0].text}</Text>;
  }
  return (
    <Text style={style}>
      {spans.map((s, i) => {
        const inlineSpanStyle = spanStyle(s.style, tkns);
        if (s.style.link) {
          // priority: inline > knob > template. linkBase (knob/template) is the
          // base; inlineSpanStyle (inline directives) overrides on top.
          const merged = { ...(linkBase ?? {}), ...inlineSpanStyle };
          return (
            <Link key={i} src={normalizeHref(s.style.link)} style={merged}>
              {s.text}
            </Link>
          );
        }
        return (
          <Text key={i} style={inlineSpanStyle}>
            {s.text}
          </Text>
        );
      })}
    </Text>
  );
}

export function isAstEmpty(ast: ResumeAst): boolean {
  const h = ast.header;
  const headerEmpty = !h.name && !h.label && h.contacts.length === 0;
  return headerEmpty && ast.sections.length === 0;
}
