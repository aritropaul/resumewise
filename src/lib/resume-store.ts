"use client";

import { create } from "zustand";
import { normalizeTheme, type ResumeTheme } from "./resume-theme";
import { getTemplateDefaultFont } from "./templates";

// Markdown-canonical store: one string is the resume content, one theme is
// the visual config, template is the renderer choice. Undo/redo are plain
// snapshot stacks of `{markdown, theme}`.

const HISTORY_CAP = 50;
const COALESCE_WINDOW_MS = 500;

interface Snapshot {
  markdown: string;
  theme: ResumeTheme;
  template: string;
  at: number;
}

export type PreviewPhase = "idle" | "rendering" | "ready" | "error";
export type PreviewStage =
  | "idle"
  | "font-preload"
  | "pdf-generation"
  | "blob-decode"
  | "page-paint";
export type AiWorkflowMode = "idle" | "chat" | "analyze" | "tailor";

export interface EditorSelection {
  start: number;
  end: number;
  value: string;
  // Monotonically increasing token bumped when the panel asks the editor to
  // re-apply the selection. Used so the editor's effect re-runs even if the
  // numeric range didn't change.
  revision: number;
}

// A selection captured from the editor and handed to the AI panel as context.
// Lives independently of `editorSelection` so it survives tab switches and
// selection changes in the textarea.
export interface AiSelectionChip {
  text: string;
  start: number;
  end: number;
  revision: number;
}

interface ResumeStore {
  markdown: string;
  theme: ResumeTheme;
  template: string;
  activeId: string | null;
  past: Snapshot[];
  future: Snapshot[];
  aiPrefill: string | null;
  previewPhase: PreviewPhase;
  previewError: string | null;
  previewStage: PreviewStage;
  previewRevision: number;
  aiWorkflowMode: AiWorkflowMode;
  editorSelection: EditorSelection | null;
  aiSelectionChip: AiSelectionChip | null;

  setActive: (
    id: string | null,
    doc: { markdown: string; theme: ResumeTheme; template: string } | null
  ) => void;
  setMarkdown: (md: string) => void;
  setTheme: (theme: ResumeTheme) => void;
  setTemplate: (id: string) => void;
  // Replace markdown without pushing a snapshot (for external sources like AI apply).
  replaceMarkdown: (md: string) => void;
  undo: () => boolean;
  redo: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;
  setAiPrefill: (v: string | null) => void;
  setPreviewState: (next: {
    phase: PreviewPhase;
    error?: string | null;
    stage?: PreviewStage;
    revision?: number;
  }) => void;
  setAiWorkflowMode: (mode: AiWorkflowMode) => void;
  setEditorSelection: (sel: { start: number; end: number; value: string } | null) => void;
  requestSelectionApply: (sel: { start: number; end: number }) => void;
  setAiSelectionChip: (
    chip: { text: string; start: number; end: number } | null
  ) => void;
}

function snapshot(s: {
  markdown: string;
  theme: ResumeTheme;
  template: string;
}): Snapshot {
  return { ...s, at: Date.now() };
}

export const useResumeStore = create<ResumeStore>((set, get) => ({
  markdown: "",
  theme: normalizeTheme(null),
  template: "classic",
  activeId: null,
  past: [],
  future: [],
  aiPrefill: null,
  previewPhase: "idle",
  previewError: null,
  previewStage: "idle",
  previewRevision: 0,
  aiWorkflowMode: "idle",
  editorSelection: null,
  aiSelectionChip: null,

  setActive(id, doc) {
    set({
      activeId: id,
      markdown: doc?.markdown ?? "",
      theme: normalizeTheme(doc?.theme ?? null),
      template: doc?.template ?? "classic",
      past: [],
      future: [],
      previewPhase: "idle",
      previewError: null,
      previewStage: "idle",
      previewRevision: 0,
      aiWorkflowMode: "idle",
      aiPrefill: null,
      editorSelection: null,
      aiSelectionChip: null,
    });
  },

  setMarkdown(md) {
    const state = get();
    if (md === state.markdown) return;
    const now = Date.now();
    const prev = state.past[state.past.length - 1];
    // Coalesce rapid edits into a single undo entry.
    const coalesce = prev && now - prev.at < COALESCE_WINDOW_MS;
    const entry = snapshot({
      markdown: state.markdown,
      theme: state.theme,
      template: state.template,
    });
    let nextPast = coalesce ? state.past : [...state.past, entry];
    if (nextPast.length > HISTORY_CAP) nextPast = nextPast.slice(-HISTORY_CAP);
    set({ markdown: md, past: nextPast, future: [] });
  },

  setTheme(theme) {
    const state = get();
    const entry = snapshot({
      markdown: state.markdown,
      theme: state.theme,
      template: state.template,
    });
    let nextPast = [...state.past, entry];
    if (nextPast.length > HISTORY_CAP) nextPast = nextPast.slice(-HISTORY_CAP);
    set({ theme: normalizeTheme(theme), past: nextPast, future: [] });
  },

  setTemplate(id) {
    const state = get();
    if (id === state.template) return;
    const entry = snapshot({
      markdown: state.markdown,
      theme: state.theme,
      template: state.template,
    });
    let nextPast = [...state.past, entry];
    if (nextPast.length > HISTORY_CAP) nextPast = nextPast.slice(-HISTORY_CAP);

    const oldId = state.template;
    const oldTheme = state.theme;

    // Stash current template's customizations into the archive maps so we can
    // restore them when the user toggles back.
    const nodesByTemplate = { ...(oldTheme.nodesByTemplate ?? {}) };
    const fontByTemplate = { ...(oldTheme.fontByTemplate ?? {}) };
    if (oldTheme.nodes && Object.keys(oldTheme.nodes).length > 0) {
      nodesByTemplate[oldId] = oldTheme.nodes;
    } else {
      delete nodesByTemplate[oldId];
    }
    fontByTemplate[oldId] = oldTheme.font;

    // Hydrate the new template's saved state, falling back to its preferred font.
    const savedNodes = nodesByTemplate[id] ?? {};
    const savedFont = fontByTemplate[id];
    const preferred = getTemplateDefaultFont(id);
    const nextFont = savedFont ?? preferred ?? oldTheme.font;

    const nextTheme = normalizeTheme({
      ...oldTheme,
      font: nextFont,
      nodes: savedNodes,
      nodesByTemplate,
      fontByTemplate,
    });
    set({ template: id, theme: nextTheme, past: nextPast, future: [] });
  },

  replaceMarkdown(md) {
    set({ markdown: md });
  },

  undo() {
    const state = get();
    const last = state.past[state.past.length - 1];
    if (!last) return false;
    const current = snapshot({
      markdown: state.markdown,
      theme: state.theme,
      template: state.template,
    });
    set({
      markdown: last.markdown,
      theme: last.theme,
      template: last.template,
      past: state.past.slice(0, -1),
      future: [...state.future, current],
    });
    return true;
  },

  redo() {
    const state = get();
    const next = state.future[state.future.length - 1];
    if (!next) return false;
    const current = snapshot({
      markdown: state.markdown,
      theme: state.theme,
      template: state.template,
    });
    set({
      markdown: next.markdown,
      theme: next.theme,
      template: next.template,
      past: [...state.past, current],
      future: state.future.slice(0, -1),
    });
    return true;
  },

  canUndo() {
    return get().past.length > 0;
  },

  canRedo() {
    return get().future.length > 0;
  },

  setAiPrefill(v) {
    set({ aiPrefill: v });
  },

  setPreviewState(next) {
    set((state) => ({
      previewPhase: next.phase,
      previewError: next.error ?? null,
      previewStage: next.stage ?? state.previewStage,
      previewRevision: next.revision ?? state.previewRevision,
    }));
  },

  setAiWorkflowMode(mode) {
    set({ aiWorkflowMode: mode });
  },

  setEditorSelection(sel) {
    if (!sel) {
      set({ editorSelection: null });
      return;
    }
    const prev = get().editorSelection;
    set({
      editorSelection: {
        start: sel.start,
        end: sel.end,
        value: sel.value,
        revision: (prev?.revision ?? 0) + 1,
      },
    });
  },

  requestSelectionApply(sel) {
    const state = get();
    const value = state.markdown.slice(sel.start, sel.end);
    const prev = state.editorSelection;
    set({
      editorSelection: {
        start: sel.start,
        end: sel.end,
        value,
        revision: (prev?.revision ?? 0) + 1,
      },
    });
  },

  setAiSelectionChip(chip) {
    if (!chip) {
      set({ aiSelectionChip: null });
      return;
    }
    const prev = get().aiSelectionChip;
    set({
      aiSelectionChip: {
        text: chip.text,
        start: chip.start,
        end: chip.end,
        revision: (prev?.revision ?? 0) + 1,
      },
    });
  },
}));
