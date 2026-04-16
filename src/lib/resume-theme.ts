// Theme, palette, and font catalog — decoupled from the (now markdown-only)
// resume content model. Templates read a `ResumeTheme` directly; everything
// else about the resume lives in the markdown string.

export type Density = "compact" | "normal" | "spacious";

export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ResumePalette {
  ink: string;    // body text / primary
  accent: string; // role varies per template: name / dividers / bullets
  muted: string;  // dates / labels / secondary
}

export type HeadingCase = "normal" | "uppercase" | "smallcaps";
export type HeadingWeight = "regular" | "medium" | "bold";
export type BulletMarker = "dot" | "dash" | "arrow" | "square" | "none";
export type SectionDivider = "none" | "rule" | "accent-bar";
export type LinkStyle = "plain" | "underline" | "accent";

export type NodeKind =
  | "name"      // H1
  | "contact"   // contact row (email · phone · url)
  | "section"   // H2
  | "role"      // H3
  | "dates"     // {dates}...{/dates} — user-applied, always right-aligned
  | "paragraph"
  | "bullet"
  | "link";
export type FontStyle = "normal" | "italic";
export type TextCase = "normal" | "uppercase" | "smallcaps" | "lowercase" | "titlecase";
export type NodeFontWeight = HeadingWeight | "light" | "semibold";

export interface NodeStyle {
  fontFamily?: string;
  fontWeight?: NodeFontWeight;
  fontStyle?: FontStyle;
  color?: string;
  fontSize?: number;
  lineHeight?: number;
  letterSpacing?: number;
  paragraphSpacing?: number;
  textCase?: TextCase;
  bulletMarker?: BulletMarker; // bullet only
  linkStyle?: LinkStyle;       // link only
}

export type NodeStyleMap = Partial<Record<NodeKind, NodeStyle>>;

export interface ResumeTheme {
  font: string;
  palette: ResumePalette;
  accent: string;             // legacy mirror of palette.accent
  density: Density;
  fontSize?: number;
  lineHeight?: number;
  margins?: PageMargins;
  sectionSpacing?: number;
  headingCase?: HeadingCase;
  headingWeight?: HeadingWeight;
  bulletMarker?: BulletMarker;
  nameScale?: number;
  sectionDivider?: SectionDivider;
  linkStyle?: LinkStyle;
  // Per-node style overrides for the *currently active* template. When the
  // template changes, resume-store stashes these into `nodesByTemplate[oldId]`
  // and hydrates from `nodesByTemplate[newId]` so per-template edits persist.
  nodes?: NodeStyleMap;
  nodesByTemplate?: Record<string, NodeStyleMap>;
  // Same split for `font`: `font` is the active template's font; per-template
  // choices are archived in `fontByTemplate`.
  fontByTemplate?: Record<string, string>;
}

export const THEME_DEFAULTS = {
  ink: "#0a0a0a",
  accent: "#0f172a",
  muted: "#525252",
  fontSize: 10,
  lineHeight: 1.4,
  margins: { top: 40, right: 48, bottom: 40, left: 48 } as PageMargins,
  sectionSpacing: 14,
  headingCase: "uppercase" as HeadingCase,
  headingWeight: "medium" as HeadingWeight,
  bulletMarker: "dot" as BulletMarker,
  nameScale: 1.0,
  sectionDivider: "rule" as SectionDivider,
  linkStyle: "accent" as LinkStyle,
} as const;

export interface PalettePreset {
  id: string;
  name: string;
  palette: ResumePalette;
}

export const PALETTE_PRESETS: PalettePreset[] = [
  { id: "noir",       name: "Noir",       palette: { ink: "#0a0a0a", accent: "#0a0a0a", muted: "#525252" } },
  { id: "graphite",   name: "Graphite",   palette: { ink: "#1f1f1f", accent: "#404040", muted: "#737373" } },
  { id: "slate",      name: "Slate",      palette: { ink: "#0f172a", accent: "#1e293b", muted: "#64748b" } },
  { id: "cobalt",     name: "Cobalt",     palette: { ink: "#0f172a", accent: "#1d4ed8", muted: "#64748b" } },
  { id: "ocean",      name: "Ocean",      palette: { ink: "#0c1f2c", accent: "#0e7490", muted: "#64748b" } },
  { id: "pine",       name: "Pine",       palette: { ink: "#0c1412", accent: "#166534", muted: "#6b7280" } },
  { id: "moss",       name: "Moss",       palette: { ink: "#1a1d14", accent: "#4d7c0f", muted: "#6b7280" } },
  { id: "terracotta", name: "Terracotta", palette: { ink: "#1c1917", accent: "#c2410c", muted: "#78716c" } },
  { id: "clay",       name: "Clay",       palette: { ink: "#1c1917", accent: "#a37a4d", muted: "#78716c" } },
  { id: "plum",       name: "Plum",       palette: { ink: "#1a0f1a", accent: "#7c3aed", muted: "#6b7280" } },
  { id: "crimson",    name: "Crimson",    palette: { ink: "#140a0c", accent: "#9f1239", muted: "#6b7280" } },
  { id: "sand",       name: "Sand",       palette: { ink: "#1c1917", accent: "#b45309", muted: "#78716c" } },
];

export function normalizeTheme(theme: Partial<ResumeTheme> | undefined | null): ResumeTheme {
  const accent = theme?.palette?.accent ?? theme?.accent ?? THEME_DEFAULTS.accent;
  const ink = theme?.palette?.ink ?? THEME_DEFAULTS.ink;
  const muted = theme?.palette?.muted ?? THEME_DEFAULTS.muted;
  return {
    font: theme?.font ?? "Helvetica",
    palette: { ink, accent, muted },
    accent,
    density: theme?.density ?? "normal",
    fontSize: theme?.fontSize ?? THEME_DEFAULTS.fontSize,
    lineHeight: theme?.lineHeight ?? THEME_DEFAULTS.lineHeight,
    margins: theme?.margins ? { ...theme.margins } : { ...THEME_DEFAULTS.margins },
    sectionSpacing: theme?.sectionSpacing ?? THEME_DEFAULTS.sectionSpacing,
    headingCase: theme?.headingCase ?? THEME_DEFAULTS.headingCase,
    headingWeight: theme?.headingWeight ?? THEME_DEFAULTS.headingWeight,
    bulletMarker: theme?.bulletMarker ?? THEME_DEFAULTS.bulletMarker,
    nameScale: theme?.nameScale ?? THEME_DEFAULTS.nameScale,
    sectionDivider: theme?.sectionDivider ?? THEME_DEFAULTS.sectionDivider,
    linkStyle: theme?.linkStyle ?? THEME_DEFAULTS.linkStyle,
    // User overrides only. Empty map means "no per-node overrides" — template
    // baselines + kind defaults fully drive the render.
    nodes: theme?.nodes ?? {},
    nodesByTemplate: theme?.nodesByTemplate ? { ...theme.nodesByTemplate } : undefined,
    fontByTemplate: theme?.fontByTemplate ? { ...theme.fontByTemplate } : undefined,
  };
}

export function defaultTheme(): ResumeTheme {
  return normalizeTheme({ font: "Helvetica" });
}

type FontCategory = "sans" | "serif" | "mono";

export interface FontEntry {
  id: string;
  label: string;
  category: FontCategory;
  builtin: boolean;
  bold: string;
}

export const FONT_OPTIONS: FontEntry[] = [
  // Built-ins — always available, no fetch.
  { id: "Helvetica", label: "Helvetica", category: "sans", builtin: true, bold: "Helvetica-Bold" },
  { id: "Times-Roman", label: "Times", category: "serif", builtin: true, bold: "Times-Bold" },
  { id: "Courier", label: "Courier", category: "mono", builtin: true, bold: "Courier-Bold" },

  // Sans
  { id: "Inter", label: "Inter", category: "sans", builtin: false, bold: "Inter" },
  { id: "Geist", label: "Geist", category: "sans", builtin: false, bold: "Geist" },
  { id: "Manrope", label: "Manrope", category: "sans", builtin: false, bold: "Manrope" },
  { id: "Plus Jakarta Sans", label: "Jakarta", category: "sans", builtin: false, bold: "Plus Jakarta Sans" },
  { id: "Outfit", label: "Outfit", category: "sans", builtin: false, bold: "Outfit" },
  { id: "Public Sans", label: "Public Sans", category: "sans", builtin: false, bold: "Public Sans" },
  { id: "IBM Plex Sans", label: "IBM Plex Sans", category: "sans", builtin: false, bold: "IBM Plex Sans" },
  { id: "Work Sans", label: "Work Sans", category: "sans", builtin: false, bold: "Work Sans" },
  { id: "DM Sans", label: "DM Sans", category: "sans", builtin: false, bold: "DM Sans" },
  { id: "Karla", label: "Karla", category: "sans", builtin: false, bold: "Karla" },
  { id: "Nunito", label: "Nunito", category: "sans", builtin: false, bold: "Nunito" },
  { id: "Open Sans", label: "Open Sans", category: "sans", builtin: false, bold: "Open Sans" },
  { id: "Roboto", label: "Roboto", category: "sans", builtin: false, bold: "Roboto" },
  { id: "Poppins", label: "Poppins", category: "sans", builtin: false, bold: "Poppins" },
  { id: "Montserrat", label: "Montserrat", category: "sans", builtin: false, bold: "Montserrat" },

  // Serif
  { id: "Source Serif 4", label: "Source Serif", category: "serif", builtin: false, bold: "Source Serif 4" },
  { id: "EB Garamond", label: "EB Garamond", category: "serif", builtin: false, bold: "EB Garamond" },
  { id: "Cormorant Garamond", label: "Cormorant", category: "serif", builtin: false, bold: "Cormorant Garamond" },
  { id: "Lora", label: "Lora", category: "serif", builtin: false, bold: "Lora" },
  { id: "Merriweather", label: "Merriweather", category: "serif", builtin: false, bold: "Merriweather" },
  { id: "Spectral", label: "Spectral", category: "serif", builtin: false, bold: "Spectral" },
  { id: "PT Serif", label: "PT Serif", category: "serif", builtin: false, bold: "PT Serif" },
  { id: "Crimson Pro", label: "Crimson Pro", category: "serif", builtin: false, bold: "Crimson Pro" },
  { id: "Libre Baskerville", label: "Baskerville", category: "serif", builtin: false, bold: "Libre Baskerville" },
  { id: "Bitter", label: "Bitter", category: "serif", builtin: false, bold: "Bitter" },

  // Mono
  { id: "JetBrains Mono", label: "JetBrains Mono", category: "mono", builtin: false, bold: "JetBrains Mono" },
  { id: "Geist Mono", label: "Geist Mono", category: "mono", builtin: false, bold: "Geist Mono" },
  { id: "IBM Plex Mono", label: "IBM Plex Mono", category: "mono", builtin: false, bold: "IBM Plex Mono" },
  { id: "Fira Code", label: "Fira Code", category: "mono", builtin: false, bold: "Fira Code" },
  { id: "Roboto Mono", label: "Roboto Mono", category: "mono", builtin: false, bold: "Roboto Mono" },
  { id: "Source Code Pro", label: "Source Code Pro", category: "mono", builtin: false, bold: "Source Code Pro" },
  { id: "Space Mono", label: "Space Mono", category: "mono", builtin: false, bold: "Space Mono" },
];

export const PDF_FONTS = FONT_OPTIONS.filter((f) => f.builtin);

export function resolveFontBold(font: string): string {
  const match = FONT_OPTIONS.find((f) => f.id === font);
  return match ? match.bold : "Helvetica-Bold";
}
