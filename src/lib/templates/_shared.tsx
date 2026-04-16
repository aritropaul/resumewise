// Shared primitives. Inline-text rendering applies styles in the order:
// template defaults < theme knobs (linkBase) < inline directive overrides.

import React from "react";
import { Link, Text, View } from "@react-pdf/renderer";
import type { ResumeDoc } from "../resume-md";
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

export function isAstEmpty(doc: ResumeDoc): boolean {
  return doc.blocks.length === 0;
}

export type BlockAlign = "left" | "center" | "right";

// Layout directive extracted from a block's text. Three shapes:
//
//   "whole"   — whole block is wrapped: {center}My Name{/center}
//               render with textAlign on the single Text node.
//
//   "split"   — tail of the block is wrapped in {right}...{/right}:
//               ### Acme — Staff Engineer {right}Jan 2023 · Remote{/right}
//               render as a flex row: left part flows left, right part pinned
//               to the right edge. This is the dates-on-the-right pattern.
//
//   null      — no directive; render as a normal Text.
//
// `{left}` and `{center}` only work as whole-block wrappers. `{right}` works
// as either — wrap the entire block to right-align it, or wrap only the tail
// to split with left-and-right halves on one line.
export type SplitTag = "right" | "dates";

export type BlockLayout =
  | { mode: "whole"; align: BlockAlign; text: string }
  | { mode: "split"; tag: SplitTag; left: string; right: string }
  | { mode: "none"; text: string };

export function extractBlockLayout(raw: string): BlockLayout {
  const trimmed = raw.trim();
  const whole = trimmed.match(/^\{(left|center|right)\}([\s\S]*)\{\/\1\}$/);
  if (whole) {
    return { mode: "whole", align: whole[1] as BlockAlign, text: whole[2].trim() };
  }
  // {right}...{/right} or {dates}...{/dates} at the tail of a block → split.
  const splitM = trimmed.match(/^([\s\S]*?)\{(right|dates)\}([\s\S]*?)\{\/\2\}\s*$/);
  if (splitM && splitM[1].trim()) {
    return { mode: "split", tag: splitM[2] as SplitTag, left: splitM[1].trim(), right: splitM[3].trim() };
  }
  // Whole-block {dates}...{/dates} (no left text) → right-aligned block.
  const wholeDate = trimmed.match(/^\{dates\}([\s\S]*)\{\/dates\}$/);
  if (wholeDate) {
    return { mode: "whole", align: "right", text: wholeDate[1].trim() };
  }
  return { mode: "none", text: raw };
}

export function alignToJustify(a: BlockAlign): "flex-start" | "center" | "flex-end" {
  if (a === "center") return "center";
  if (a === "right") return "flex-end";
  return "flex-start";
}

export function withAlign<T extends Record<string, unknown>>(
  style: T,
  align: BlockAlign | null
): T | (T & { textAlign: BlockAlign }) {
  if (!align) return style;
  return { ...style, textAlign: align };
}

// Render a block split into left + right parts on one line. Pulls marginTop
// onto the outer row so vertical spacing stays intact while flex controls
// horizontal distribution. Both halves share the same text style.
export function SplitRow({
  left,
  right,
  style,
  rightStyle: rightOverride,
  tkns,
  linkBase,
}: {
  left: string;
  right: string;
  style: Record<string, string | number>;
  rightStyle?: Record<string, string | number>;
  tkns: TemplateTokens;
  linkBase?: LinkStyleProps;
}) {
  const outer: Record<string, string | number> = {
    flexDirection: "row",
    alignItems: "baseline",
  };
  if (typeof style.marginTop === "number") outer.marginTop = style.marginTop;
  if (typeof style.marginBottom === "number") outer.marginBottom = style.marginBottom;
  const inner: Record<string, string | number> = { ...style };
  delete inner.marginTop;
  delete inner.marginBottom;
  const leftStyle: Record<string, string | number> = { ...inner, flexGrow: 1, flexShrink: 1 };
  const rBase = rightOverride ?? inner;
  const rInner = { ...rBase };
  delete rInner.marginTop;
  delete rInner.marginBottom;
  const rightFinal: Record<string, string | number> = { ...rInner, flexShrink: 0, textAlign: "right" };
  return (
    <View style={outer}>
      <InlineText text={left} style={leftStyle} tkns={tkns} linkBase={linkBase} />
      <InlineText text={right} style={rightFinal} tkns={tkns} linkBase={linkBase} />
    </View>
  );
}
