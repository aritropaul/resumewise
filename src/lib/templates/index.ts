// Template registry. Each entry declares a preferred font + preload list.
// `defaultFont` is auto-applied to theme.font when the user picks the template
// while still at the universal Helvetica default; otherwise the user's font
// choice is preserved (knob > template).

import type { ComponentType } from "react";
import type { ResumeAst } from "../resume-md";
import type { NodeStyleMap, ResumeTheme } from "../resume-theme";
import { ClassicTemplate, CLASSIC_BASELINE } from "./classic";
import { ModernTemplate, MODERN_BASELINE } from "./modern";
import { MonoTemplate, MONO_BASELINE } from "./mono";
import { BusinessTemplate, BUSINESS_BASELINE } from "./business";
import { EditorialTemplate, EDITORIAL_BASELINE } from "./editorial";

export type TemplateComponent = ComponentType<{ ast: ResumeAst; theme: ResumeTheme }>;

export interface TemplateEntry {
  name: string;
  description: string;
  component: TemplateComponent;
  defaultFont: string;
  fonts?: string[];
  baseline?: NodeStyleMap;
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  classic: {
    name: "Classic",
    description: "duotone sans · uppercase headings, hairline rule",
    component: ClassicTemplate,
    defaultFont: "Inter",
    fonts: ["Inter"],
    baseline: CLASSIC_BASELINE,
  },
  modern: {
    name: "Modern",
    description: "tritone sans · accent bullets and company names",
    component: ModernTemplate,
    defaultFont: "Manrope",
    fonts: ["Manrope"],
    baseline: MODERN_BASELINE,
  },
  mono: {
    name: "Mono",
    description: "duotone monospace · single column",
    component: MonoTemplate,
    defaultFont: "JetBrains Mono",
    fonts: ["JetBrains Mono"],
    baseline: MONO_BASELINE,
  },
  business: {
    name: "Business",
    description: "tritone serif · centered header, accent titles",
    component: BusinessTemplate,
    defaultFont: "Source Serif 4",
    fonts: ["Source Serif 4"],
    baseline: BUSINESS_BASELINE,
  },
  editorial: {
    name: "Editorial",
    description: "italic serif · single-column display headings",
    component: EditorialTemplate,
    defaultFont: "EB Garamond",
    fonts: ["EB Garamond"],
    baseline: EDITORIAL_BASELINE,
  },
};

export function getTemplate(id: string): TemplateComponent {
  return TEMPLATES[id]?.component ?? ClassicTemplate;
}

export function getTemplateDefaultFont(id: string): string | null {
  return TEMPLATES[id]?.defaultFont ?? null;
}

export function templateOptions(): { id: string; name: string; description: string }[] {
  return Object.entries(TEMPLATES).map(([id, t]) => ({
    id,
    name: t.name,
    description: t.description,
  }));
}

export function getTemplateFonts(id: string): string[] {
  return TEMPLATES[id]?.fonts ?? [];
}

export function getTemplateBaseline(id: string): NodeStyleMap | undefined {
  return TEMPLATES[id]?.baseline;
}
