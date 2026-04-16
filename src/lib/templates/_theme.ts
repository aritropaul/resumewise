// Shared theme helper consumed by every template. Only place in templates/
// that reads hex values or maps theme knobs to concrete style fragments.

import {
  normalizeTheme,
  resolveFontBold,
  THEME_DEFAULTS,
  type BulletMarker,
  type HeadingCase,
  type HeadingWeight,
  type LinkStyle,
  type NodeFontWeight,
  type NodeKind,
  type NodeStyle,
  type NodeStyleMap,
  type ResumeTheme,
  type SectionDivider,
  type TextCase,
} from "../resume-theme";

export interface TemplateTokens {
  // colors
  ink: string;
  accent: string;
  muted: string;
  faint: string;
  rule: string;
  // typography
  font: string;
  boldFont: string;
  bodySize: number;
  lineHeight: number;
  nameSize: number;
  headingSize: number;
  headingCase: HeadingCase;
  headingWeight: HeadingWeight;
  // structure
  margins: { top: number; right: number; bottom: number; left: number };
  sectionSpacing: number;
  sectionDivider: SectionDivider;
  bulletMarker: BulletMarker;
  linkStyle: LinkStyle;
}

export function tokens(theme: Partial<ResumeTheme> | undefined | null): TemplateTokens {
  const t = normalizeTheme(theme);
  const bodySize = t.fontSize ?? THEME_DEFAULTS.fontSize;
  return {
    ink: t.palette.ink,
    accent: t.palette.accent,
    muted: t.palette.muted,
    faint: mixHex(t.palette.muted, "#ffffff", 0.5),
    rule: mixHex(t.palette.muted, "#ffffff", 0.65),
    font: t.font,
    boldFont: resolveFontBold(t.font),
    bodySize,
    lineHeight: t.lineHeight ?? THEME_DEFAULTS.lineHeight,
    nameSize: bodySize * (t.nameScale ?? THEME_DEFAULTS.nameScale),
    headingSize: bodySize + 0.5,
    headingCase: t.headingCase ?? THEME_DEFAULTS.headingCase,
    headingWeight: t.headingWeight ?? THEME_DEFAULTS.headingWeight,
    margins: t.margins ? { ...t.margins } : { ...THEME_DEFAULTS.margins },
    sectionSpacing: t.sectionSpacing ?? THEME_DEFAULTS.sectionSpacing,
    sectionDivider: t.sectionDivider ?? THEME_DEFAULTS.sectionDivider,
    bulletMarker: t.bulletMarker ?? THEME_DEFAULTS.bulletMarker,
    linkStyle: t.linkStyle ?? THEME_DEFAULTS.linkStyle,
  };
}

export function bulletGlyph(marker: BulletMarker): string {
  switch (marker) {
    case "dot": return "\u2022";
    case "dash": return "\u2013";
    case "arrow": return "\u2192";
    case "square": return "\u25AA";
    case "none": return "";
  }
}

export interface HeadingStyleProps {
  textTransform?: "uppercase" | "lowercase" | "capitalize" | "none";
  letterSpacing: number;
  fontWeight: 400 | 500 | 600;
}

// react-pdf has no smallcaps primitive. Map smallcaps to uppercase with tighter
// tracking so it reads as a distinct mode without misrendering.
export function headingStyleProps(
  headingCase: HeadingCase,
  headingWeight: HeadingWeight
): HeadingStyleProps {
  const weight: 400 | 500 | 600 =
    headingWeight === "regular" ? 400 :
    headingWeight === "medium" ? 500 : 600;
  if (headingCase === "uppercase") {
    return { textTransform: "uppercase", letterSpacing: 1.4, fontWeight: weight };
  }
  if (headingCase === "smallcaps") {
    return { textTransform: "uppercase", letterSpacing: 0.4, fontWeight: weight };
  }
  return { textTransform: "none", letterSpacing: 0, fontWeight: weight };
}

// Border props for templates that render the divider as a borderBottom on the
// heading text. Templates that render a standalone divider <View /> use
// dividerProps() instead.
export function headingBorderProps(
  kind: SectionDivider,
  accent: string,
  rule: string
): Record<string, number | string> {
  if (kind === "none") {
    return { borderBottomWidth: 0, paddingBottom: 0 };
  }
  if (kind === "accent-bar") {
    return { borderBottomWidth: 1.2, borderBottomColor: accent, paddingBottom: 2 };
  }
  return { borderBottomWidth: 0.5, borderBottomColor: rule, paddingBottom: 2 };
}

// react-pdf style fragment for a section divider rendered BELOW the heading.
export function dividerProps(
  kind: SectionDivider,
  accent: string,
  rule: string
): Record<string, number | string> {
  if (kind === "none") {
    return { height: 0 };
  }
  if (kind === "accent-bar") {
    return {
      height: 1.2,
      backgroundColor: accent,
      marginTop: 3,
      marginBottom: 4,
    };
  }
  return {
    height: 0.5,
    backgroundColor: rule,
    marginTop: 2,
    marginBottom: 4,
  };
}

export const WEIGHT_TO_NUMBER: Record<NodeFontWeight, number> = {
  light: 300,
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

function textCaseToTransform(c: TextCase): "uppercase" | "lowercase" | "capitalize" | "none" {
  if (c === "uppercase" || c === "smallcaps") return "uppercase";
  if (c === "lowercase") return "lowercase";
  if (c === "titlecase") return "capitalize";
  return "none";
}

// Resolve a color string against the current palette. Accepts palette token
// names ("ink" / "accent" / "muted") or raw hex values.
export function resolvePaletteColor(value: string, theme: ResumeTheme): string {
  if (value === "ink") return theme.palette.ink;
  if (value === "accent") return theme.palette.accent;
  if (value === "muted") return theme.palette.muted;
  return value;
}

// Symbolic resolved style — same shape as NodeStyle, every optional field filled.
// Templates convert to react-pdf styles via toPdfStyle(); Style Editor shows
// these symbolic values directly so dropdowns reflect the currently-rendered
// look (including template baselines).
export interface ResolvedSymbolicStyle {
  fontFamily: string;
  fontWeight: NodeFontWeight;
  fontStyle: "normal" | "italic";
  color: string;            // always a hex value after resolution
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  paragraphSpacing: number;
  textCase: TextCase;
  bulletMarker: BulletMarker;
  linkStyle: LinkStyle;
}

export interface ResolvedPdfStyle {
  fontFamily: string;
  fontWeight: number;
  fontStyle: "normal" | "italic";
  color: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  marginBottom: number;
  textTransform: "uppercase" | "lowercase" | "capitalize" | "none";
  bulletMarker: BulletMarker;
  linkStyle: LinkStyle;
}

function defaultWeightForKind(kind: NodeKind, global: HeadingWeight): NodeFontWeight {
  if (kind === "name") return "bold";
  if (kind === "section") return global;
  if (kind === "role") return "semibold";
  return "regular";
}

function defaultCaseForKind(kind: NodeKind, global: HeadingCase): TextCase {
  if (kind === "section") return global as TextCase;
  return "normal";
}

function defaultColorTokenForKind(kind: NodeKind): string {
  if (kind === "contact" || kind === "dates") return "muted";
  return "ink";
}

function defaultSizeForKind(
  kind: NodeKind,
  bodySize: number,
  nameSize: number,
  headingSize: number
): number {
  if (kind === "name") return nameSize;
  if (kind === "section") return headingSize;
  if (kind === "contact" || kind === "dates") return bodySize - 1;
  return bodySize;
}

// Build the "global style" layer for a given kind — the theme-wide settings
// (theme.font, theme.lineHeight, theme.headingCase, etc.) projected into the
// NodeStyle shape for fields where a global equivalent exists.
function globalStyleFor(kind: NodeKind, t: TemplateTokens): NodeStyle {
  const g: NodeStyle = {
    fontFamily: t.font,
    lineHeight: t.lineHeight,
  };
  if (kind === "section") {
    g.textCase = t.headingCase as TextCase;
    g.fontWeight = t.headingWeight;
  }
  if (kind === "bullet") {
    g.bulletMarker = t.bulletMarker;
  }
  if (kind === "link") {
    g.linkStyle = t.linkStyle;
  }
  return g;
}

// Priority: node override > global style > template baseline > kind default.
// Inline markdown directives are applied downstream of this resolver (at the
// InlineText render step), so they are effectively the highest-priority layer.
export function resolveNodeStyleSymbolic(
  theme: ResumeTheme,
  kind: NodeKind,
  baseline?: NodeStyleMap
): ResolvedSymbolicStyle {
  const t = tokens(theme);
  const ov: NodeStyle = theme.nodes?.[kind] ?? {};
  const global: NodeStyle = globalStyleFor(kind, t);
  const base: NodeStyle = baseline?.[kind] ?? {};

  const pick = <K extends keyof NodeStyle>(key: K): NodeStyle[K] => {
    if (ov[key] !== undefined) return ov[key];
    if (global[key] !== undefined) return global[key];
    return base[key];
  };

  const weight = pick("fontWeight") ?? defaultWeightForKind(kind, t.headingWeight);
  const tcase = pick("textCase") ?? defaultCaseForKind(kind, t.headingCase);
  const sizeFromBase = pick("fontSize");
  const fontSize = sizeFromBase ?? defaultSizeForKind(kind, t.bodySize, t.nameSize, t.headingSize);
  const colorRaw = pick("color") ?? defaultColorTokenForKind(kind);
  const color = resolvePaletteColor(colorRaw, theme);
  const baseLetterSpacing =
    tcase === "uppercase" && kind !== "paragraph" ? 1.2 :
    tcase === "smallcaps" ? 0.4 : 0;
  return {
    fontFamily: pick("fontFamily") ?? t.font,
    fontWeight: weight,
    fontStyle: pick("fontStyle") ?? "normal",
    color,
    fontSize,
    lineHeight: pick("lineHeight") ?? t.lineHeight,
    letterSpacing: pick("letterSpacing") ?? baseLetterSpacing,
    paragraphSpacing: pick("paragraphSpacing") ?? 0,
    textCase: tcase,
    bulletMarker: pick("bulletMarker") ?? t.bulletMarker,
    linkStyle: pick("linkStyle") ?? t.linkStyle,
  };
}

export function toPdfStyle(r: ResolvedSymbolicStyle): ResolvedPdfStyle {
  return {
    fontFamily: safeFontFamily(r.fontFamily),
    fontWeight: WEIGHT_TO_NUMBER[r.fontWeight],
    fontStyle: r.fontStyle,
    color: r.color,
    fontSize: r.fontSize,
    lineHeight: r.lineHeight,
    letterSpacing: r.letterSpacing,
    marginBottom: r.paragraphSpacing,
    textTransform: textCaseToTransform(r.textCase),
    bulletMarker: r.bulletMarker,
    linkStyle: r.linkStyle,
  };
}

// Backwards-compatible resolver that returns the pdf-ready shape. Kept so the
// Style Editor preview helper and older callers don't have to chain both calls.
export function resolveNodeStyle(
  theme: ResumeTheme,
  kind: NodeKind,
  baseline?: NodeStyleMap
): ResolvedPdfStyle {
  return toPdfStyle(resolveNodeStyleSymbolic(theme, kind, baseline));
}

export interface LinkStyleProps {
  color: string;
  textDecoration: "none" | "underline";
}

export function linkProps(
  style: LinkStyle,
  accent: string,
  ink: string
): LinkStyleProps {
  if (style === "underline") return { color: ink, textDecoration: "underline" };
  if (style === "plain") return { color: ink, textDecoration: "none" };
  return { color: accent, textDecoration: "none" };
}

// Builtins are always available in react-pdf without registration.
const BUILTIN_FONTS = new Set(["Helvetica", "Times-Roman", "Courier"]);

/**
 * Resolves a font family for a template. Checks react-pdf's font registry —
 * if the requested family isn't registered (e.g. Google font fetch failed),
 * falls back to Helvetica so the PDF doesn't throw "Font family not
 * registered". This is the guard that keeps every template renderable even
 * when ensureFont returns "Helvetica" silently after a network failure.
 */
import { Font } from "@react-pdf/renderer";
export function safeFontFamily(family: string | null | undefined): string {
  const f = family?.trim();
  if (!f) return "Helvetica";
  if (BUILTIN_FONTS.has(f)) return f;
  try {
    const registered = (Font as unknown as { getRegisteredFontFamilies?: () => string[] })
      .getRegisteredFontFamilies?.();
    if (registered && registered.includes(f)) return f;
  } catch {
    // fall through to Helvetica
  }
  return "Helvetica";
}

// Linear blend between two hex colors. t=0 → a, t=1 → b.
export function mixHex(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const u = Math.max(0, Math.min(1, t));
  const r = Math.round(ca.r + (cb.r - ca.r) * u);
  const g = Math.round(ca.g + (cb.g - ca.g) * u);
  const bl = Math.round(ca.b + (cb.b - ca.b) * u);
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3
    ? h.split("").map((c) => c + c).join("")
    : h.padEnd(6, "0").slice(0, 6);
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
}
