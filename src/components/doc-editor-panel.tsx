"use client";

import * as React from "react";
import {
  CaretDown,
  CaretRight,
  Minus,
  Plus,
  ArrowCounterClockwise,
  TextB,
  TextItalic,
  TextUnderline,
} from "@phosphor-icons/react";
import { HexColorPicker } from "react-colorful";
import type {
  BulletMarker,
  HeadingCase,
  HeadingWeight,
  LinkStyle,
  NodeKind,
  NodeStyle,
  NodeFontWeight,
  FontStyle,
  TextCase,
  PageMargins,
  ResumePalette,
  ResumeTheme,
  SectionDivider,
} from "@/lib/resume-theme";
import {
  FONT_OPTIONS,
  THEME_DEFAULTS,
  normalizeTheme,
} from "@/lib/resume-theme";
import type { CenterTab } from "@/components/center-tabs";
import { resolveNodeStyle, resolveNodeStyleSymbolic } from "@/lib/templates/_theme";
import { parseResumeMarkdown, type ResumeAst } from "@/lib/resume-md";
import type { NodeStyleMap } from "@/lib/resume-theme";
import { templateOptions, getTemplateBaseline, getTemplateDefaultFont } from "@/lib/templates";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";
import { useResumeStore } from "@/lib/resume-store";
import { cn } from "@/lib/utils";
import {
  toggleOrReplace,
  describeState,
  type Directive,
} from "@/lib/resume-md-edits";

type MarginPreset = "tight" | "normal" | "loose";

const MARGIN_PRESETS: Record<MarginPreset, PageMargins> = {
  tight: { top: 28, right: 32, bottom: 28, left: 32 },
  normal: { top: 40, right: 48, bottom: 40, left: 48 },
  loose: { top: 56, right: 64, bottom: 56, left: 64 },
};

const LINE_HEIGHT_OPTIONS = [1.0, 1.15, 1.3, 1.4, 1.5, 1.75, 2.0];
const SECTION_GAP_OPTIONS = [6, 10, 14, 18, 24];

const HEADING_CASE_OPTIONS: { value: HeadingCase; label: string }[] = [
  { value: "normal", label: "Aa" },
  { value: "uppercase", label: "AA" },
  { value: "smallcaps", label: "Aᴀ" },
];

const HEADING_WEIGHT_OPTIONS: { value: HeadingWeight; label: string }[] = [
  { value: "regular", label: "regular" },
  { value: "medium", label: "medium" },
  { value: "bold", label: "bold" },
];

const BULLET_OPTIONS: { value: BulletMarker; glyph: string; label: string }[] = [
  { value: "dot", glyph: "\u2022", label: "dot" },
  { value: "dash", glyph: "\u2013", label: "dash" },
  { value: "arrow", glyph: "\u2192", label: "arrow" },
  { value: "square", glyph: "\u25AA", label: "square" },
  { value: "none", glyph: "·", label: "none" },
];

const DIVIDER_OPTIONS: { value: SectionDivider; label: string }[] = [
  { value: "none", label: "none" },
  { value: "rule", label: "rule" },
  { value: "accent-bar", label: "bar" },
];

const LINK_OPTIONS: { value: LinkStyle; label: string }[] = [
  { value: "plain", label: "plain" },
  { value: "underline", label: "underline" },
  { value: "accent", label: "accent" },
];

type GroupId =
  | "text"
  | "template"
  | "palette"
  | "global"
  | "style"
  | "layout";

const GROUP_STORAGE_KEY = "resumewise-design-groups";
const DEFAULT_OPEN: Record<GroupId, boolean> = {
  text: true,
  template: true,
  palette: true,
  global: true,
  style: true,
  layout: false,
};

const SELECTION_WEIGHT_OPTIONS = [
  { value: 300, label: "300" },
  { value: 400, label: "400" },
  { value: 500, label: "500" },
  { value: 600, label: "600" },
  { value: 700, label: "700" },
  { value: 800, label: "800" },
];

const SELECTION_SIZE_PRESETS = [9, 10, 11, 12, 14, 18, 24];

function loadGroupState(): Record<GroupId, boolean> {
  if (typeof window === "undefined") return DEFAULT_OPEN;
  try {
    const raw = window.localStorage.getItem(GROUP_STORAGE_KEY);
    if (!raw) return DEFAULT_OPEN;
    const parsed = JSON.parse(raw) as Partial<Record<GroupId, boolean>>;
    return { ...DEFAULT_OPEN, ...parsed };
  } catch {
    return DEFAULT_OPEN;
  }
}

export function DocEditorPanel({ mode = "edit" }: { mode?: CenterTab } = {}) {
  const storeTheme = useResumeStore((state) => state.theme);
  const storeTemplate = useResumeStore((state) => state.template);
  const setThemeStore = useResumeStore((state) => state.setTheme);
  const setTemplateStore = useResumeStore((state) => state.setTemplate);
  const markdown = useResumeStore((state) => state.markdown);
  const setMarkdown = useResumeStore((state) => state.setMarkdown);
  const requestSelectionApply = useResumeStore((state) => state.requestSelectionApply);
  const editorSelection = useResumeStore((state) => state.editorSelection);
  const theme = normalizeTheme(storeTheme);
  const palette = theme.palette;
  const ast = React.useMemo(() => parseResumeMarkdown(markdown), [markdown]);
  const baseline = getTemplateBaseline(storeTemplate);

  const hasSelection =
    !!editorSelection && editorSelection.end > editorSelection.start;

  const applyDirective = React.useCallback(
    (directive: Directive): boolean => {
      if (!editorSelection || editorSelection.end <= editorSelection.start) return false;
      const { start, end } = editorSelection;
      const result = toggleOrReplace(markdown, start, end, directive);
      if (!result) return false;
      setMarkdown(result.md);
      requestSelectionApply(result.selection);
      return true;
    },
    [editorSelection, markdown, setMarkdown, requestSelectionApply]
  );

  const [openGroups, setOpenGroups] = React.useState<Record<GroupId, boolean>>(
    DEFAULT_OPEN
  );
  React.useEffect(() => {
    setOpenGroups(loadGroupState());
  }, []);

  function toggleGroup(id: GroupId) {
    setOpenGroups((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        window.localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  function patch(p: Partial<ResumeTheme>) {
    const next = { ...theme, ...p };
    if (p.palette) {
      next.accent = p.palette.accent ?? next.palette.accent;
    }
    setThemeStore(next);
  }

  function patchPalette(p: Partial<ResumePalette>) {
    const nextPalette = { ...palette, ...p };
    patch({ palette: nextPalette, accent: nextPalette.accent });
  }

  function patchNode(kind: NodeKind, p: Partial<NodeStyle>) {
    const current = theme.nodes?.[kind] ?? {};
    // Strip keys whose value is `undefined` so resetting a single field removes
    // the override cleanly rather than persisting `{ color: undefined }`.
    const merged: NodeStyle = { ...current, ...p };
    for (const k of Object.keys(merged) as (keyof NodeStyle)[]) {
      if (merged[k] === undefined) delete merged[k];
    }
    patch({ nodes: { ...theme.nodes, [kind]: merged } });
  }

  function resetNode(kind: NodeKind) {
    if (!theme.nodes) return;
    const nextNodes = { ...theme.nodes };
    delete nextNodes[kind];
    patch({ nodes: nextNodes });
  }

  function resetAllNodes() {
    const templateFont = getTemplateDefaultFont(storeTemplate) ?? "Helvetica";
    patch({ nodes: {}, font: templateFont });
  }

  if (mode === "preview") {
    return (
      <div className="flex-1 overflow-y-auto">
        <Group
          id="template"
          label="Template"
          open={openGroups.template}
          onToggle={() => toggleGroup("template")}
        >
          <TemplateGrid
            current={storeTemplate}
            onSelect={(id) => setTemplateStore(id)}
          />
        </Group>

        <Group
          id="palette"
          label="Palette"
          open={openGroups.palette}
          onToggle={() => toggleGroup("palette")}
        >
          <PaletteControls palette={palette} onChange={patchPalette} />
        </Group>

        <Group
          id="layout"
          label="Layout"
          open={openGroups.layout}
          onToggle={() => toggleGroup("layout")}
        >
          <LayoutControls theme={theme} onPatch={patch} />
        </Group>

        <Group
          id="style"
          label="Style editor"
          open={openGroups.style}
          onToggle={() => toggleGroup("style")}
        >
          <StyleEditorAccordion
            theme={theme}
            ast={ast}
            baseline={baseline}
            onPatchNode={patchNode}
            onSetFont={(f) => patch({ font: f })}
            onResetAll={resetAllNodes}
            onResetNode={resetNode}
          />
        </Group>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <ModeChip hasSelection={hasSelection} selectionText={editorSelection?.value} />

      <Group
        id="global"
        label="Global theme"
        open={openGroups.global}
        onToggle={() => toggleGroup("global")}
      >
        <TypographyControls theme={theme} onPatch={patch} />
      </Group>

      <Group
        id="text"
        label="Text (selection)"
        open={openGroups.text}
        onToggle={() => toggleGroup("text")}
      >
        <SelectionTextControls
          markdown={markdown}
          selection={editorSelection}
          hasSelection={hasSelection}
          applyDirective={applyDirective}
        />
      </Group>
    </div>
  );
}

// ---------- Style Editor (per-AST-node accordion) ----------

const NODE_KINDS: { kind: NodeKind; label: string }[] = [
  { kind: "name", label: "Name" },
  { kind: "label", label: "Tagline" },
  { kind: "contact", label: "Contact" },
  { kind: "section", label: "Section header" },
  { kind: "role", label: "Role / title" },
  { kind: "dates", label: "Dates" },
  { kind: "location", label: "Location" },
  { kind: "paragraph", label: "Paragraph" },
  { kind: "bullet", label: "Bullet" },
  { kind: "link", label: "Link" },
];

const NODE_OPEN_STORAGE_KEY = "resumewise-style-node-open";
const DEFAULT_NODE_OPEN: Record<NodeKind, boolean> = {
  name: true,
  label: false,
  contact: false,
  section: false,
  role: false,
  dates: false,
  location: false,
  paragraph: false,
  bullet: false,
  link: false,
};

function loadNodeOpenState(): Record<NodeKind, boolean> {
  if (typeof window === "undefined") return DEFAULT_NODE_OPEN;
  try {
    const raw = window.localStorage.getItem(NODE_OPEN_STORAGE_KEY);
    if (!raw) return DEFAULT_NODE_OPEN;
    const parsed = JSON.parse(raw) as Partial<Record<NodeKind, boolean>>;
    return { ...DEFAULT_NODE_OPEN, ...parsed };
  } catch {
    return DEFAULT_NODE_OPEN;
  }
}

function StyleEditorAccordion({
  theme,
  ast,
  baseline,
  onPatchNode,
  onSetFont,
  onResetAll,
  onResetNode,
}: {
  theme: ResumeTheme;
  ast: ResumeAst;
  baseline: NodeStyleMap | undefined;
  onPatchNode: (kind: NodeKind, p: Partial<NodeStyle>) => void;
  onSetFont: (f: string) => void;
  onResetAll: () => void;
  onResetNode: (kind: NodeKind) => void;
}) {
  const [openNodes, setOpenNodes] = React.useState<Record<NodeKind, boolean>>(
    DEFAULT_NODE_OPEN
  );
  React.useEffect(() => {
    setOpenNodes(loadNodeOpenState());
  }, []);

  function toggleNode(kind: NodeKind) {
    setOpenNodes((prev) => {
      const next = { ...prev, [kind]: !prev[kind] };
      try {
        window.localStorage.setItem(NODE_OPEN_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  const hasAnyOverride = !!theme.nodes && Object.values(theme.nodes).some(
    (ns) => ns && Object.keys(ns).length > 0
  );

  return (
    <div className="flex flex-col">
      <div className="px-3 py-1.5 border-b border-border">
        <Row label="font">
          <NodeFontPicker value={theme.font} onChange={onSetFont} />
        </Row>
        <div className="flex items-center justify-end pt-1">
          <button
            onClick={onResetAll}
            disabled={!hasAnyOverride}
            className={cn(
              "flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.1em] transition-colors",
              hasAnyOverride
                ? "text-muted-foreground hover:text-foreground"
                : "text-muted-foreground/40 cursor-not-allowed"
            )}
            title="clear all per-node overrides, restore template baseline"
          >
            <ArrowCounterClockwise weight="bold" className="size-2.5" />
            reset all
          </button>
        </div>
      </div>
      {NODE_KINDS.map(({ kind, label }) => {
        const kindHasOverride =
          !!theme.nodes?.[kind] && Object.keys(theme.nodes[kind] ?? {}).length > 0;
        return (
        <Collapsible
          key={kind}
          open={openNodes[kind]}
          onOpenChange={() => toggleNode(kind)}
        >
          <CollapsibleTrigger
            className={cn(
              "group flex items-center justify-between w-full h-8 px-5",
              "text-left border-t border-border first:border-t-0",
              "hover:bg-muted/40 transition-colors duration-150"
            )}
          >
            <span className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted-foreground group-hover:text-foreground">
              {label}
              {kindHasOverride ? (
                <span className="ml-1.5 text-[9px] text-brand">●</span>
              ) : null}
            </span>
            {openNodes[kind] ? (
              <CaretDown weight="bold" className="size-2.5 text-muted-foreground" />
            ) : (
              <CaretRight weight="bold" className="size-2.5 text-muted-foreground" />
            )}
          </CollapsibleTrigger>
          <CollapsibleContent className="py-1.5 bg-muted/10">
            <StyleEditorControls
              kind={kind}
              style={theme.nodes?.[kind] ?? {}}
              theme={theme}
              ast={ast}
              baseline={baseline}
              onPatch={(p) => onPatchNode(kind, p)}
            />
            {kindHasOverride ? (
              <div className="flex justify-end px-3 pt-1 pb-1">
                <button
                  onClick={() => onResetNode(kind)}
                  className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground transition-colors"
                  title={`clear override for ${label}`}
                >
                  <ArrowCounterClockwise weight="bold" className="size-2.5" />
                  reset
                </button>
              </div>
            ) : null}
          </CollapsibleContent>
        </Collapsible>
        );
      })}
    </div>
  );
}

const NODE_WEIGHT_OPTIONS: { value: NodeFontWeight; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "regular", label: "Regular" },
  { value: "medium", label: "Medium" },
  { value: "semibold", label: "Semibold" },
  { value: "bold", label: "Bold" },
];

const TEXT_CASE_OPTIONS: { value: TextCase; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "uppercase", label: "UPPERCASE" },
  { value: "lowercase", label: "lowercase" },
  { value: "smallcaps", label: "Small caps" },
  { value: "titlecase", label: "Title Case" },
];

const FALLBACK_EXAMPLES: Record<NodeKind, string> = {
  name: "Your Name",
  label: "Your tagline",
  contact: "you@example.com",
  section: "Section",
  role: "Role — Company",
  dates: "Dates",
  location: "Location",
  paragraph: "Summary paragraph.",
  bullet: "A bullet point from your resume.",
  link: "example.com",
};

function extractLinkFromText(s: string): string | null {
  const m = s.match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (m) return m[1];
  const urlM = s.match(/(https?:\/\/\S+|[a-z0-9-]+\.(?:com|dev|io|org|net|co|xyz|app|ai|me)\S*)/i);
  if (urlM) return urlM[1];
  return null;
}

function pickExample(kind: NodeKind, ast: ResumeAst): string {
  switch (kind) {
    case "name":
      return ast.header.name || FALLBACK_EXAMPLES.name;
    case "label":
      return ast.header.label || FALLBACK_EXAMPLES.label;
    case "contact":
      return ast.header.contacts[0] || FALLBACK_EXAMPLES.contact;
    case "section":
      return ast.sections[0]?.heading || FALLBACK_EXAMPLES.section;
    case "role": {
      for (const s of ast.sections) {
        const item = s.items[0];
        if (!item) continue;
        const parts = [item.title, item.subtitle].filter(Boolean);
        if (parts.length) return parts.join(" — ");
      }
      return FALLBACK_EXAMPLES.role;
    }
    case "dates": {
      for (const s of ast.sections) {
        for (const item of s.items) if (item.dates) return item.dates;
      }
      return FALLBACK_EXAMPLES.dates;
    }
    case "location": {
      for (const s of ast.sections) {
        for (const item of s.items) if (item.location) return item.location;
      }
      return ast.header.location || FALLBACK_EXAMPLES.location;
    }
    case "paragraph": {
      for (const s of ast.sections) {
        const p = s.paragraphs?.[0];
        if (p) return p;
      }
      return FALLBACK_EXAMPLES.paragraph;
    }
    case "bullet": {
      for (const s of ast.sections) {
        const sb = s.bullets?.[0];
        if (sb) return sb;
        for (const item of s.items) if (item.bullets[0]) return item.bullets[0];
      }
      return FALLBACK_EXAMPLES.bullet;
    }
    case "link": {
      for (const c of ast.header.contacts) {
        const l = extractLinkFromText(c);
        if (l) return l;
      }
      for (const s of ast.sections) {
        for (const p of s.paragraphs ?? []) {
          const l = extractLinkFromText(p);
          if (l) return l;
        }
        for (const b of s.bullets ?? []) {
          const l = extractLinkFromText(b);
          if (l) return l;
        }
        for (const item of s.items) {
          for (const b of item.bullets) {
            const l = extractLinkFromText(b);
            if (l) return l;
          }
        }
      }
      return FALLBACK_EXAMPLES.link;
    }
  }
}

function stripInlineDirectives(s: string): string {
  return s.replace(/\{\/?[a-z]+(?::[^}]*)?\}/gi, "").trim();
}

function NodePreview({
  kind,
  theme,
  ast,
  baseline,
}: {
  kind: NodeKind;
  theme: ResumeTheme;
  ast: ResumeAst;
  baseline: NodeStyleMap | undefined;
}) {
  const resolved = resolveNodeStyle(theme, kind, baseline);
  const textDecoration =
    kind === "link" && resolved.linkStyle === "underline" ? "underline" : "none";
  const style: React.CSSProperties = {
    fontFamily: fontFamilyForPreview(theme.font ?? "Helvetica"),
    fontWeight: resolved.fontWeight,
    fontStyle: resolved.fontStyle,
    color: resolved.color,
    fontSize: `${Math.min(resolved.fontSize, 22)}px`,
    lineHeight: resolved.lineHeight,
    letterSpacing: `${resolved.letterSpacing}px`,
    textTransform: resolved.textTransform,
    textDecoration,
  };
  const prefix = kind === "bullet" ? bulletGlyphForMarker(resolved.bulletMarker) + "  " : "";
  const example = stripInlineDirectives(pickExample(kind, ast));
  return (
    <div className="mx-3 mb-2 rounded-sm border border-border bg-white px-3 py-3 overflow-hidden">
      <div className="mb-1.5 text-[9px] font-mono uppercase tracking-[0.14em] text-zinc-500">
        preview
      </div>
      <div style={style} className="leading-tight truncate">
        {prefix}
        {example}
      </div>
    </div>
  );
}

function bulletGlyphForMarker(m: BulletMarker): string {
  switch (m) {
    case "dot": return "•";
    case "dash": return "–";
    case "arrow": return "→";
    case "square": return "▪";
    case "none": return "";
  }
}

function StyleEditorControls({
  kind,
  style,
  theme,
  ast,
  baseline,
  onPatch,
}: {
  kind: NodeKind;
  style: NodeStyle;
  theme: ResumeTheme;
  ast: ResumeAst;
  baseline: NodeStyleMap | undefined;
  onPatch: (p: Partial<NodeStyle>) => void;
}) {
  const sym = resolveNodeStyleSymbolic(theme, kind, baseline);

  return (
    <>
      <NodePreview kind={kind} theme={theme} ast={ast} baseline={baseline} />

      <Row label="font">
        <NodeFontPicker
          value={sym.fontFamily}
          onChange={(v) => onPatch({ fontFamily: v })}
        />
      </Row>

      <Row label="weight">
        <DropdownSelect
          value={sym.fontWeight}
          options={NODE_WEIGHT_OPTIONS}
          onChange={(v) => onPatch({ fontWeight: v as NodeFontWeight })}
        />
      </Row>

      <Row label="italic">
        <SegmentedGroup>
          {(["normal", "italic"] as FontStyle[]).map((opt) => (
            <Segment
              key={opt}
              active={sym.fontStyle === opt}
              onClick={() => onPatch({ fontStyle: opt })}
            >
              {opt === "normal" ? "off" : "on"}
            </Segment>
          ))}
        </SegmentedGroup>
      </Row>

      <Row label="case">
        <DropdownSelect
          value={sym.textCase}
          options={TEXT_CASE_OPTIONS}
          onChange={(v) => onPatch({ textCase: v as TextCase })}
        />
      </Row>

      <Row label="color">
        <NodeColorPicker
          palette={theme.palette}
          value={sym.color}
          onChange={(v) => onPatch({ color: v })}
          onReset={() => onPatch({ color: undefined })}
          isDefault={style.color === undefined}
        />
      </Row>

      <Row label="size">
        <NumberStepper
          value={sym.fontSize}
          step={0.5}
          min={5}
          max={96}
          suffix="pt"
          onChange={(n) => onPatch({ fontSize: n })}
        />
      </Row>

      <Row label="line">
        <NumberStepper
          value={sym.lineHeight}
          step={0.05}
          min={0.8}
          max={3.0}
          decimals={2}
          onChange={(n) => onPatch({ lineHeight: Math.round(n * 100) / 100 })}
        />
      </Row>

      <SliderRow
        label="kerning"
        value={sym.letterSpacing}
        min={-1}
        max={8}
        step={0.1}
        suffix="pt"
        onChange={(n) => onPatch({ letterSpacing: Math.round(n * 100) / 100 })}
      />

      <SliderRow
        label="¶ spacing"
        value={sym.paragraphSpacing}
        min={0}
        max={48}
        step={1}
        suffix="pt"
        onChange={(n) => onPatch({ paragraphSpacing: n })}
      />

      {kind === "bullet" && (
        <Row label="marker">
          <SegmentedGroup>
            {BULLET_OPTIONS.map((opt) => (
              <Segment
                key={opt.value}
                active={sym.bulletMarker === opt.value}
                onClick={() => onPatch({ bulletMarker: opt.value })}
                title={opt.label}
              >
                <span className="font-mono text-[13px] leading-none">{opt.glyph}</span>
              </Segment>
            ))}
          </SegmentedGroup>
        </Row>
      )}

      {kind === "link" && (
        <Row label="decoration">
          <SegmentedGroup>
            {LINK_OPTIONS.map((opt) => (
              <Segment
                key={opt.value}
                active={sym.linkStyle === opt.value}
                onClick={() => onPatch({ linkStyle: opt.value })}
              >
                {opt.label}
              </Segment>
            ))}
          </SegmentedGroup>
        </Row>
      )}
    </>
  );
}

function NodeFontPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const current = FONT_OPTIONS.find((f) => f.id === value) ?? FONT_OPTIONS[0];
  return (
    <Popover>
      <PopoverTrigger render={<ValueButton />}>
        <span
          className="text-foreground truncate"
          style={{ fontFamily: fontFamilyForPreview(current.id) }}
        >
          {current.label}
        </span>
        <CaretDown weight="bold" className="size-2.5 text-muted-foreground shrink-0" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[220px] p-1 max-h-[320px] overflow-y-auto"
      >
        {(["sans", "serif", "mono"] as const).map((cat) => {
          const fonts = FONT_OPTIONS.filter((f) => f.category === cat);
          if (!fonts.length) return null;
          return (
            <div key={cat} className="flex flex-col">
              <MenuHeader>{cat}</MenuHeader>
              {fonts.map((f) => {
                const active = value === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => onChange(f.id)}
                    className={cn(
                      "flex items-center justify-between h-7 px-2 rounded-sm text-left transition-colors duration-150",
                      active ? "bg-muted text-foreground" : "text-foreground hover:bg-muted/70"
                    )}
                  >
                    <span
                      className="text-[12px]"
                      style={{ fontFamily: fontFamilyForPreview(f.id) }}
                    >
                      {f.label}
                    </span>
                    {!f.builtin ? (
                      <span className="text-[9px] font-mono uppercase tracking-[0.1em] text-muted-foreground">
                        web
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

function DropdownSelect<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <Popover>
      <PopoverTrigger render={<ValueButton />}>
        <span className="text-foreground truncate">{current?.label}</span>
        <CaretDown weight="bold" className="size-2.5 text-muted-foreground shrink-0" />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-[160px] p-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex items-center justify-between h-7 px-2 rounded-sm text-[12px] text-left transition-colors duration-150 w-full",
              opt.value === value
                ? "bg-muted text-foreground"
                : "text-foreground hover:bg-muted/70"
            )}
          >
            <span>{opt.label}</span>
            {opt.value === value ? <span className="text-muted-foreground">✓</span> : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function NodeColorPicker({
  palette,
  value,
  onChange,
  onReset,
  isDefault,
}: {
  palette: ResumePalette;
  value: string;
  onChange: (v: string) => void;
  onReset: () => void;
  isDefault: boolean;
}) {
  const tokens: { label: string; value: string }[] = [
    { label: "ink", value: palette.ink },
    { label: "accent", value: palette.accent },
    { label: "muted", value: palette.muted },
  ];
  return (
    <div className="flex items-center gap-1">
      {tokens.map((t) => {
        const active = !isDefault && value.toLowerCase() === t.value.toLowerCase();
        return (
          <button
            key={t.label}
            onClick={() => onChange(t.value)}
            title={t.label}
            className={cn(
              "size-6 rounded-sm border transition-all",
              active
                ? "border-foreground ring-1 ring-foreground/30"
                : "border-border hover:border-foreground/50"
            )}
            style={{ backgroundColor: t.value }}
          />
        );
      })}
      <Popover>
        <PopoverTrigger
          render={
            <button
              className={cn(
                "flex items-center gap-1 h-6 px-1.5 rounded-sm border text-[10px] font-mono transition-colors",
                "border-border hover:border-foreground/50 bg-background"
              )}
              title="custom"
            />
          }
        >
          <span
            aria-hidden
            className="size-3 rounded-[2px] border border-border"
            style={{ backgroundColor: value }}
          />
          <span className="text-foreground">hex</span>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={6} className="w-[216px] p-2">
          <div className="rw-color-picker">
            <HexColorPicker color={safeHex(value)} onChange={(v) => onChange(v.toLowerCase())} />
          </div>
          <div className="flex items-center justify-between pt-2">
            <span className="text-[10px] font-mono text-muted-foreground">{value.toLowerCase()}</span>
            <button
              onClick={onReset}
              className="text-[10px] font-mono uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
            >
              reset
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1 px-3 pb-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
        <span className="text-[11px] font-mono tabular text-foreground" data-tabular>
          {value.toFixed(step < 1 ? 2 : 0)}
          {suffix ? ` ${suffix}` : ""}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => {
          const n = Array.isArray(v) ? v[0] : v;
          onChange(n);
        }}
      />
    </div>
  );
}

function NumberStepper({
  value,
  step,
  min,
  max,
  suffix,
  decimals = 1,
  onChange,
}: {
  value: number;
  step: number;
  min: number;
  max: number;
  suffix?: string;
  decimals?: number;
  onChange: (n: number) => void;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="flex items-center h-7 rounded-sm border border-border overflow-hidden bg-background">
      <button
        onClick={() => onChange(clamp(Number((value - step).toFixed(decimals))))}
        className="h-full px-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="decrease"
      >
        <Minus weight="bold" className="size-3" />
      </button>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={Number(value.toFixed(decimals))}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(clamp(n));
        }}
        className="h-full w-14 text-center text-xs font-mono tabular text-foreground bg-transparent outline-none appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        data-tabular
      />
      <button
        onClick={() => onChange(clamp(Number((value + step).toFixed(decimals))))}
        className="h-full px-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="increase"
      >
        <Plus weight="bold" className="size-3" />
      </button>
      {suffix ? (
        <span className="px-2 text-[10px] font-mono uppercase tracking-[0.1em] text-muted-foreground border-l border-border h-full flex items-center">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

// ---------- Group shell ----------

function Group({
  id,
  label,
  open,
  onToggle,
  children,
}: {
  id: GroupId;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onToggle} data-group={id}>
      <CollapsibleTrigger
        className={cn(
          "group flex items-center justify-between w-full h-9 px-3",
          "border-b border-border text-left",
          "hover:bg-muted/40 transition-colors duration-150"
        )}
      >
        <span className="text-label text-muted-foreground group-hover:text-foreground transition-colors">
          {label}
        </span>
        {open ? (
          <CaretDown weight="bold" className="size-2.5 text-muted-foreground" />
        ) : (
          <CaretRight weight="bold" className="size-2.5 text-muted-foreground" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="py-2 border-b border-border">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------- Template grid ----------

function TemplateGrid({
  current,
  onSelect,
}: {
  current: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 px-2">
      {templateOptions().map((t) => {
        const active = current === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={cn(
              "flex flex-col gap-0.5 items-start px-2 py-1.5 rounded-sm border text-left transition-colors duration-150 min-w-0",
              active
                ? "border-foreground bg-muted/60"
                : "border-transparent hover:bg-muted"
            )}
          >
            <span className="text-[12px] font-medium text-foreground lowercase truncate w-full">
              {t.name.toLowerCase()}
            </span>
            <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-muted-foreground leading-tight line-clamp-1 w-full">
              {t.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------- Palette controls ----------

function PaletteControls({
  palette,
  onChange,
}: {
  palette: ResumePalette;
  onChange: (p: Partial<ResumePalette>) => void;
}) {
  function reset() {
    onChange({
      ink: THEME_DEFAULTS.ink,
      accent: THEME_DEFAULTS.accent,
      muted: THEME_DEFAULTS.muted,
    });
  }

  return (
    <div className="flex flex-col gap-1.5 px-3">
      <div className="grid grid-cols-3 gap-1.5">
        <ColorPicker
          label="ink"
          value={palette.ink}
          onChange={(v) => onChange({ ink: v })}
        />
        <ColorPicker
          label="accent"
          value={palette.accent}
          onChange={(v) => onChange({ accent: v })}
        />
        <ColorPicker
          label="muted"
          value={palette.muted}
          onChange={(v) => onChange({ muted: v })}
        />
      </div>
      <div className="flex items-center justify-end pt-0.5">
        <button
          onClick={reset}
          className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowCounterClockwise weight="bold" className="size-2.5" />
          reset
        </button>
      </div>
    </div>
  );
}

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);

  function commitHex(input: string) {
    const trimmed = input.trim();
    const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    if (/^#[0-9a-f]{6}$/i.test(withHash)) {
      onChange(withHash.toLowerCase());
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            className={cn(
              "flex items-center gap-1.5 h-8 px-1.5 rounded-sm border border-border bg-background",
              "hover:border-foreground/50 transition-colors duration-150",
              "data-[popup-open]:border-foreground/60 data-[popup-open]:bg-muted"
            )}
          />
        }
      >
        <span
          aria-hidden
          className="size-4 rounded-[2px] border border-border shrink-0"
          style={{ backgroundColor: value }}
        />
        <span className="flex flex-col items-start min-w-0 flex-1">
          <span className="text-[9px] font-mono uppercase tracking-[0.12em] text-muted-foreground leading-none">
            {label}
          </span>
          <span className="text-[10px] font-mono text-foreground leading-tight truncate w-full">
            {value.toLowerCase()}
          </span>
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-[232px] p-2">
        <div className="text-label text-muted-foreground px-1 pb-1.5">{label}</div>
        <div className="rw-color-picker">
          <HexColorPicker
            color={safeHex(value)}
            onChange={(v) => onChange(v.toLowerCase())}
          />
        </div>
        <div className="flex items-center gap-1.5 pt-2">
          <span className="text-[10px] font-mono uppercase tracking-[0.1em] text-muted-foreground pl-1">
            hex
          </span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commitHex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitHex((e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).blur();
              }
            }}
            spellCheck={false}
            autoComplete="off"
            className="h-7 text-xs font-mono flex-1 px-2 rounded-sm border border-border bg-background text-foreground outline-none focus:border-foreground/60"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function safeHex(v: string): string {
  return /^#[0-9a-f]{6}$/i.test(v) ? v : "#000000";
}

// ---------- Typography controls ----------

function TypographyControls({
  theme,
  onPatch,
}: {
  theme: ResumeTheme;
  onPatch: (p: Partial<ResumeTheme>) => void;
}) {
  const currentFont =
    FONT_OPTIONS.find((f) => f.id === theme.font) ?? FONT_OPTIONS[0];
  const fontSize = theme.fontSize ?? THEME_DEFAULTS.fontSize;
  const lineHeight = theme.lineHeight ?? THEME_DEFAULTS.lineHeight;
  const nameScale = theme.nameScale ?? THEME_DEFAULTS.nameScale;

  function nudgeFontSize(delta: number) {
    const next = Math.round((fontSize + delta) * 2) / 2;
    onPatch({ fontSize: Math.max(6, Math.min(24, next)) });
  }

  return (
    <>
      <Row label="font">
        <Popover>
          <PopoverTrigger render={<ValueButton />}>
            <span
              className="text-foreground truncate"
              style={{ fontFamily: fontFamilyForPreview(currentFont.id) }}
            >
              {currentFont.label}
            </span>
            <CaretDown weight="bold" className="size-2.5 text-muted-foreground shrink-0" />
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={6}
            className="w-[240px] p-1 max-h-[360px] overflow-y-auto"
          >
            {(["sans", "serif", "mono"] as const).map((cat) => {
              const fonts = FONT_OPTIONS.filter((f) => f.category === cat);
              if (fonts.length === 0) return null;
              return (
                <div key={cat} className="flex flex-col">
                  <MenuHeader>{cat}</MenuHeader>
                  {fonts.map((f) => {
                    const active = theme.font === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => onPatch({ font: f.id })}
                        className={cn(
                          "flex items-center justify-between h-8 px-2 rounded-sm text-left transition-colors duration-150",
                          active
                            ? "bg-muted text-foreground"
                            : "text-foreground hover:bg-muted/70"
                        )}
                      >
                        <span
                          className="text-[13px]"
                          style={{ fontFamily: fontFamilyForPreview(f.id) }}
                        >
                          {f.label}
                        </span>
                        {!f.builtin && (
                          <span className="text-[9px] font-mono uppercase tracking-[0.1em] text-muted-foreground">
                            web
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </PopoverContent>
        </Popover>
      </Row>

      <Row label="size">
        <div className="flex items-center h-7 rounded-sm border border-border overflow-hidden bg-background">
          <button
            onClick={() => nudgeFontSize(-0.5)}
            className="h-full px-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150"
            aria-label="decrease"
          >
            <Minus weight="bold" className="size-3" />
          </button>
          <input
            type="number"
            value={fontSize}
            step={0.5}
            min={6}
            max={24}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isNaN(n)) onPatch({ fontSize: n });
            }}
            className="h-full w-12 text-center text-xs font-mono tabular text-foreground bg-transparent outline-none appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            data-tabular
          />
          <button
            onClick={() => nudgeFontSize(0.5)}
            className="h-full px-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150"
            aria-label="increase"
          >
            <Plus weight="bold" className="size-3" />
          </button>
          <span className="px-2 text-[10px] font-mono uppercase tracking-[0.1em] text-muted-foreground border-l border-border h-full flex items-center">
            pt
          </span>
        </div>
      </Row>

      <Row label="line height">
        <Popover>
          <PopoverTrigger render={<ValueButton />}>
            <span className="text-foreground font-mono tabular" data-tabular>
              {lineHeight.toFixed(2)}
            </span>
            <CaretDown weight="bold" className="size-2.5 text-muted-foreground shrink-0" />
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={6} className="w-[140px] p-1">
            <MenuHeader>line height</MenuHeader>
            {LINE_HEIGHT_OPTIONS.map((v) => {
              const active = Math.abs(lineHeight - v) < 0.001;
              return (
                <button
                  key={v}
                  onClick={() => onPatch({ lineHeight: v })}
                  className={cn(
                    "flex items-center justify-between h-7 px-2 rounded-sm text-[13px] font-mono transition-colors duration-150",
                    active
                      ? "bg-muted text-foreground"
                      : "text-foreground hover:bg-muted/70"
                  )}
                >
                  <span>{v.toFixed(2)}</span>
                  {active && <span className="text-muted-foreground">✓</span>}
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
      </Row>

      <Row label="heading">
        <SegmentedGroup>
          {HEADING_CASE_OPTIONS.map((opt) => (
            <Segment
              key={opt.value}
              active={(theme.headingCase ?? THEME_DEFAULTS.headingCase) === opt.value}
              onClick={() => onPatch({ headingCase: opt.value })}
            >
              {opt.label}
            </Segment>
          ))}
        </SegmentedGroup>
      </Row>

      <Row label="weight">
        <SegmentedGroup>
          {HEADING_WEIGHT_OPTIONS.map((opt) => (
            <Segment
              key={opt.value}
              active={(theme.headingWeight ?? THEME_DEFAULTS.headingWeight) === opt.value}
              onClick={() => onPatch({ headingWeight: opt.value })}
            >
              {opt.label}
            </Segment>
          ))}
        </SegmentedGroup>
      </Row>

      <div className="px-3 pt-1 pb-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-muted-foreground">
            name scale
          </span>
          <span className="text-[11px] font-mono tabular text-foreground" data-tabular>
            {nameScale.toFixed(2)}×
          </span>
        </div>
        <Slider
          min={0.85}
          max={1.25}
          step={0.05}
          value={[nameScale]}
          onValueChange={(v) => {
            const next = Array.isArray(v) ? v[0] : v;
            onPatch({ nameScale: Math.round(next * 100) / 100 });
          }}
        />
      </div>
    </>
  );
}

// ---------- Layout controls ----------

function LayoutControls({
  theme,
  onPatch,
}: {
  theme: ResumeTheme;
  onPatch: (p: Partial<ResumeTheme>) => void;
}) {
  const margins = theme.margins ?? THEME_DEFAULTS.margins;
  const sectionSpacing = theme.sectionSpacing ?? THEME_DEFAULTS.sectionSpacing;

  const marginPreset: MarginPreset | "custom" = (() => {
    for (const [k, v] of Object.entries(MARGIN_PRESETS)) {
      if (
        v.top === margins.top &&
        v.right === margins.right &&
        v.bottom === margins.bottom &&
        v.left === margins.left
      ) {
        return k as MarginPreset;
      }
    }
    return "custom";
  })();

  function setMargin(key: keyof PageMargins, value: number) {
    onPatch({
      margins: { ...margins, [key]: Math.max(0, Math.min(96, value)) },
    });
  }

  return (
    <>
      <Row label="margins">
        <SegmentedGroup>
          {(Object.keys(MARGIN_PRESETS) as MarginPreset[]).map((preset) => (
            <Segment
              key={preset}
              active={marginPreset === preset}
              onClick={() => onPatch({ margins: MARGIN_PRESETS[preset] })}
            >
              {preset}
            </Segment>
          ))}
        </SegmentedGroup>
      </Row>

      <div className="grid grid-cols-2 gap-2 px-3 pb-2">
        <MarginField label="top" value={margins.top} onChange={(v) => setMargin("top", v)} />
        <MarginField label="right" value={margins.right} onChange={(v) => setMargin("right", v)} />
        <MarginField label="bottom" value={margins.bottom} onChange={(v) => setMargin("bottom", v)} />
        <MarginField label="left" value={margins.left} onChange={(v) => setMargin("left", v)} />
      </div>

      <Row label="section gap">
        <Popover>
          <PopoverTrigger render={<ValueButton />}>
            <span className="text-foreground font-mono tabular" data-tabular>
              {sectionSpacing}pt
            </span>
            <CaretDown weight="bold" className="size-2.5 text-muted-foreground shrink-0" />
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={6} className="w-[140px] p-1">
            <MenuHeader>section gap</MenuHeader>
            {SECTION_GAP_OPTIONS.map((v) => {
              const active = sectionSpacing === v;
              return (
                <button
                  key={v}
                  onClick={() => onPatch({ sectionSpacing: v })}
                  className={cn(
                    "flex items-center justify-between h-7 px-2 rounded-sm text-[13px] font-mono transition-colors duration-150",
                    active
                      ? "bg-muted text-foreground"
                      : "text-foreground hover:bg-muted/70"
                  )}
                >
                  <span>{v}pt</span>
                  {active && <span className="text-muted-foreground">✓</span>}
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
      </Row>

      <Row label="divider">
        <SegmentedGroup>
          {DIVIDER_OPTIONS.map((opt) => (
            <Segment
              key={opt.value}
              active={(theme.sectionDivider ?? THEME_DEFAULTS.sectionDivider) === opt.value}
              onClick={() => onPatch({ sectionDivider: opt.value })}
            >
              {opt.label}
            </Segment>
          ))}
        </SegmentedGroup>
      </Row>
    </>
  );
}

// ---------- Primitives ----------

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 h-9">
      <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-muted-foreground shrink-0">
        {label}
      </span>
      <div className="flex items-center min-w-0">{children}</div>
    </div>
  );
}

function SegmentedGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-7 rounded-sm border border-border overflow-hidden bg-background">
      {children}
    </div>
  );
}

function Segment({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "px-2.5 text-[11px] font-mono lowercase tracking-[0.08em] transition-colors duration-150",
        "border-l border-border first:border-l-0 min-w-[32px] flex items-center justify-center",
        active
          ? "bg-foreground text-background"
          : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}

function ValueButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    className?: string;
    children?: React.ReactNode;
  }
) {
  const { className, children, ...rest } = props;
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1.5 h-7 px-2 rounded-sm border border-border bg-background text-[12px] text-foreground hover:border-foreground/50 transition-colors duration-150 data-[popup-open]:border-foreground/60 data-[popup-open]:bg-muted min-w-[120px] max-w-[180px]",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

function MenuHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-label text-muted-foreground px-1 pt-0.5 pb-1">
      {children}
    </div>
  );
}

function MarginField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 h-7 rounded-sm border border-border bg-background pl-2 pr-1 hover:border-foreground/50 transition-colors duration-150">
      <span className="text-[10px] font-mono uppercase tracking-[0.1em] text-muted-foreground w-10 shrink-0">
        {label}
      </span>
      <input
        type="number"
        min={0}
        max={96}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
        className="h-6 w-full bg-transparent text-[12px] font-mono tabular text-foreground outline-none appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-right"
        data-tabular
      />
    </label>
  );
}

function fontFamilyForPreview(id: string): string {
  if (id === "Helvetica") return "Helvetica, Arial, sans-serif";
  if (id === "Times-Roman") return "ui-serif, Times, serif";
  if (id === "Courier") return "ui-monospace, Courier, monospace";
  if (/mono/i.test(id)) return `"${id}", ui-monospace, monospace`;
  if (/serif|garamond|lora|merriweather/i.test(id))
    return `"${id}", ui-serif, serif`;
  return `"${id}", ui-sans-serif, sans-serif`;
}

// ---------- Mode indicator ----------

function ModeChip({
  hasSelection,
  selectionText,
}: {
  hasSelection: boolean;
  selectionText?: string;
}) {
  const label = hasSelection ? "formatting selection" : "global theme";
  const hint = hasSelection
    ? selectionText && selectionText.length > 0
      ? `"${truncate(selectionText, 24)}"`
      : null
    : "select text to format a range";
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-3 h-9 border-b border-border",
        hasSelection ? "bg-brand/5" : "bg-muted/20"
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          aria-hidden
          className={cn(
            "size-1.5 rounded-full shrink-0",
            hasSelection ? "bg-brand" : "bg-muted-foreground/40"
          )}
        />
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-foreground">
          {label}
        </span>
      </div>
      {hint ? (
        <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[45%]">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

// ---------- Selection-mode text controls ----------

function SelectionTextControls({
  markdown,
  selection,
  hasSelection,
  applyDirective,
}: {
  markdown: string;
  selection: { start: number; end: number } | null;
  hasSelection: boolean;
  applyDirective: (d: Directive) => boolean;
}) {
  // Detect current state per-directive so toggles/inputs reflect reality.
  const state = React.useMemo(() => {
    if (!selection || selection.end <= selection.start) {
      return {
        bold: false,
        italic: false,
        underline: false,
        weight: "",
        size: "",
        color: "",
        font: "",
      };
    }
    const s = selection;
    return {
      bold: describeState(markdown, s.start, s.end, "bold").active,
      italic: describeState(markdown, s.start, s.end, "italic").active,
      underline: describeState(markdown, s.start, s.end, "underline").active,
      weight: describeState(markdown, s.start, s.end, "weight").value,
      size: describeState(markdown, s.start, s.end, "size").value,
      color: describeState(markdown, s.start, s.end, "color").value,
      font: describeState(markdown, s.start, s.end, "font").value,
    };
  }, [markdown, selection]);

  if (!hasSelection) {
    return (
      <div className="px-3 py-3">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Select text in the Edit tab to style just that range. Changes wrap the
          selection with inline directives in the markdown.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-3 py-1">
      {/* Toggles row */}
      <div className="flex items-center gap-1">
        <ToggleButton
          active={state.bold}
          aria-label="bold"
          onClick={() => applyDirective({ name: "bold" })}
        >
          <TextB weight="bold" className="size-3.5" />
        </ToggleButton>
        <ToggleButton
          active={state.italic}
          aria-label="italic"
          onClick={() => applyDirective({ name: "italic" })}
        >
          <TextItalic weight="bold" className="size-3.5" />
        </ToggleButton>
        <ToggleButton
          active={state.underline}
          aria-label="underline"
          onClick={() => applyDirective({ name: "underline" })}
        >
          <TextUnderline weight="bold" className="size-3.5" />
        </ToggleButton>
      </div>

      {/* Weight + size */}
      <div className="grid grid-cols-2 gap-1.5">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground">
            weight
          </span>
          <Popover>
            <PopoverTrigger render={<ValueButton />}>
              <span className="text-foreground font-mono tabular" data-tabular>
                {state.weight || "—"}
              </span>
              <CaretDown weight="bold" className="size-2.5 text-muted-foreground shrink-0" />
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={6} className="w-[120px] p-1">
              {SELECTION_WEIGHT_OPTIONS.map((w) => (
                <button
                  key={w.value}
                  onClick={() => applyDirective({ name: "weight", value: String(w.value) })}
                  className={cn(
                    "flex items-center justify-between h-7 px-2 rounded-sm text-[12px] font-mono transition-colors duration-150 w-full",
                    state.weight === String(w.value)
                      ? "bg-muted text-foreground"
                      : "text-foreground hover:bg-muted/70"
                  )}
                >
                  <span>{w.label}</span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground">
            size
          </span>
          <Popover>
            <PopoverTrigger render={<ValueButton />}>
              <span className="text-foreground font-mono tabular" data-tabular>
                {state.size ? `${state.size}pt` : "—"}
              </span>
              <CaretDown weight="bold" className="size-2.5 text-muted-foreground shrink-0" />
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={6} className="w-[120px] p-1">
              {SELECTION_SIZE_PRESETS.map((n) => (
                <button
                  key={n}
                  onClick={() => applyDirective({ name: "size", value: String(n) })}
                  className={cn(
                    "flex items-center justify-between h-7 px-2 rounded-sm text-[12px] font-mono transition-colors duration-150 w-full",
                    state.size === String(n)
                      ? "bg-muted text-foreground"
                      : "text-foreground hover:bg-muted/70"
                  )}
                >
                  <span>{n}pt</span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Color */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground">
          color
        </span>
        <div className="flex items-center gap-1.5">
          <Popover>
            <PopoverTrigger
              render={
                <button
                  className="flex items-center gap-1.5 h-8 pl-1.5 pr-2 rounded-sm border border-border bg-background hover:border-foreground/50 transition-colors"
                  aria-label="pick color"
                />
              }
            >
              <span
                aria-hidden
                className="size-4 rounded-[2px] border border-border shrink-0"
                style={{ backgroundColor: state.color || "transparent" }}
              />
              <span className="text-[11px] font-mono text-foreground">
                {state.color || "—"}
              </span>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={6} className="w-[232px] p-2">
              <div className="rw-color-picker">
                <HexColorPicker
                  color={safeHex(state.color || "#000000")}
                  onChange={(v) => applyDirective({ name: "color", value: v.toLowerCase() })}
                />
              </div>
            </PopoverContent>
          </Popover>
          {/* Palette-token shortcuts */}
          {["accent", "muted", "ink"].map((token) => (
            <button
              key={token}
              onClick={() => applyDirective({ name: token })}
              className={cn(
                "h-8 px-2 rounded-sm border text-[10px] font-mono uppercase tracking-[0.1em] transition-colors",
                describeState(markdown, selection!.start, selection!.end, token).active
                  ? "border-foreground bg-muted text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {token}
            </button>
          ))}
        </div>
      </div>

      {/* Font family */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground">
          font
        </span>
        <Popover>
          <PopoverTrigger render={<ValueButton />}>
            <span
              className="text-foreground truncate"
              style={state.font ? { fontFamily: fontFamilyForPreview(state.font) } : undefined}
            >
              {state.font || "— (inherit)"}
            </span>
            <CaretDown weight="bold" className="size-2.5 text-muted-foreground shrink-0" />
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={6} className="w-[220px] p-1 max-h-[320px] overflow-y-auto">
            {(["sans", "serif", "mono"] as const).map((cat) => {
              const fonts = FONT_OPTIONS.filter((f) => f.category === cat);
              if (fonts.length === 0) return null;
              return (
                <div key={cat} className="flex flex-col">
                  <div className="px-2 py-1 text-[9px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
                    {cat}
                  </div>
                  {fonts.map((f) => {
                    const active = state.font === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => applyDirective({ name: "font", value: f.id })}
                        className={cn(
                          "flex items-center justify-between h-7 px-2 rounded-sm text-left transition-colors duration-150",
                          active
                            ? "bg-muted text-foreground"
                            : "text-foreground hover:bg-muted/70"
                        )}
                      >
                        <span
                          className="text-[12px]"
                          style={{ fontFamily: fontFamilyForPreview(f.id) }}
                        >
                          {f.label}
                        </span>
                        {!f.builtin ? (
                          <span className="text-[9px] font-mono uppercase tracking-[0.1em] text-muted-foreground">
                            web
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
  ...rest
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children">) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center h-7 w-8 rounded-sm border text-foreground transition-colors duration-150",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border hover:bg-muted"
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
