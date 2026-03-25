import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { StarterKit } from "@tiptap/starter-kit";
import { Bold } from "@tiptap/extension-bold";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { Underline } from "@tiptap/extension-underline";
import { TextAlign } from "@tiptap/extension-text-align";
import { Link } from "@tiptap/extension-link";

const BULLET_CHARS = ["•", "·", "‣", "◦", "▪", "▸"];
const BULLET_WIDTH = "8px";

function isBulletLine(text: string): boolean {
  const trimmed = text.trimStart();
  return BULLET_CHARS.some((b) => trimmed.startsWith(b));
}

// Preserve paragraph-level styles from PDF HTML and auto-apply hanging indent on bullet lines
const ParagraphStyles = Extension.create({
  name: "paragraphStyles",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el) => el.style.lineHeight || null,
            renderHTML: (attrs) =>
              attrs.lineHeight
                ? { style: `line-height: ${attrs.lineHeight}` }
                : {},
          },
          paddingLeft: {
            default: null,
            parseHTML: (el) => el.style.paddingLeft || null,
            renderHTML: (attrs) =>
              attrs.paddingLeft
                ? { style: `padding-left: ${attrs.paddingLeft}` }
                : {},
          },
          textIndent: {
            default: null,
            parseHTML: (el) => el.style.textIndent || null,
            renderHTML: (attrs) =>
              attrs.textIndent
                ? { style: `text-indent: ${attrs.textIndent}` }
                : {},
          },
          marginLeft: {
            default: null,
            parseHTML: (el) => el.style.marginLeft || null,
            renderHTML: (attrs) =>
              attrs.marginLeft
                ? { style: `margin-left: ${attrs.marginLeft}` }
                : {},
          },
          marginTop: {
            default: null,
            parseHTML: (el) => el.style.marginTop || null,
            renderHTML: (attrs) =>
              attrs.marginTop
                ? { style: `margin-top: ${attrs.marginTop}` }
                : {},
          },
        },
      },
    ];
  },
  addProseMirrorPlugins() {
    return [
      // Inherit paragraph styles (lineHeight) when pressing Enter to split
      new Plugin({
        key: new PluginKey("inheritParagraphStyles"),
        appendTransaction(transactions, oldState, newState) {
          if (!transactions.some((t) => t.docChanged)) return null;
          // Detect paragraph split: doc grew by exactly 1 node, and an empty paragraph exists
          if (newState.doc.childCount <= oldState.doc.childCount) return null;

          const { doc, tr } = newState;
          let changed = false;
          doc.descendants((node, pos) => {
            if (node.type.name !== "paragraph") return;
            if (node.content.size > 0) return; // only empty paragraphs
            if (node.attrs.lineHeight) return; // already has lineHeight

            // Find previous sibling paragraph
            const $pos = doc.resolve(pos);
            const index = $pos.index($pos.depth);
            if (index === 0) return;
            const parent = $pos.parent;
            const prev = parent.child(index - 1);
            if (prev.type.name !== "paragraph" || !prev.attrs.lineHeight) return;

            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              lineHeight: prev.attrs.lineHeight,
            });
            changed = true;
          });
          return changed ? tr : null;
        },
      }),
      new Plugin({
        key: new PluginKey("bulletHangingIndent"),
        appendTransaction(transactions, _oldState, newState) {
          // Only run when document content actually changed, not on selection changes
          if (!transactions.some((t) => t.docChanged)) return null;

          const { doc, tr } = newState;
          let changed = false;

          doc.descendants((node, pos) => {
            if (node.type.name !== "paragraph") return;

            const text = node.textContent;
            const bullet = isBulletLine(text);
            const hasIndent = node.attrs.textIndent === `-${BULLET_WIDTH}`;

            if (bullet && !hasIndent) {
              // Add hanging indent
              const currentPadding = parseFloat(node.attrs.paddingLeft || "0");
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                textIndent: `-${BULLET_WIDTH}`,
                paddingLeft: `${currentPadding + parseFloat(BULLET_WIDTH)}px`,
              });
              changed = true;
            } else if (!bullet && hasIndent) {
              // Remove hanging indent
              const currentPadding = parseFloat(node.attrs.paddingLeft || "0");
              const restored = Math.max(0, currentPadding - parseFloat(BULLET_WIDTH));
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                textIndent: null,
                paddingLeft: restored > 0 ? `${restored}px` : null,
              });
              changed = true;
            }
          });

          return changed ? tr : null;
        },
      }),
    ];
  },
});

// Custom selection highlight — always visible via decorations, persists on blur
export const selectionHighlightKey = new PluginKey("selectionHighlight");

const SelectionHighlight = Extension.create({
  name: "selectionHighlight",
  addProseMirrorPlugins() {
    let focused = false;

    return [
      new Plugin({
        key: selectionHighlightKey,
        state: {
          init: () => ({ from: 0, to: 0 }),
          apply(tr, prev, _oldState, newState) {
            // Another editor took focus — clear saved range
            if (tr.getMeta("clearSelectionHighlight")) {
              return { from: 0, to: 0 };
            }
            const { from, to } = newState.selection;
            if (from !== to) {
              return { from, to };
            }
            return prev;
          },
        },
        props: {
          handleDOMEvents: {
            focus: () => {
              focused = true;
              return false;
            },
            blur: (view) => {
              focused = false;
              setTimeout(() => {
                if (view.dom.isConnected) {
                  view.dispatch(view.state.tr);
                }
              }, 0);
              return false;
            },
          },
          decorations(state) {
            const { from, to } = state.selection;
            // Active selection — always show
            if (from !== to) {
              return DecorationSet.create(state.doc, [
                Decoration.inline(from, to, { class: "custom-selection" }),
              ]);
            }
            // Blurred — show saved range from plugin state
            if (!focused) {
              const saved = selectionHighlightKey.getState(state);
              if (saved && saved.from < saved.to) {
                const size = state.doc.content.size;
                const sf = Math.min(saved.from, size);
                const st = Math.min(saved.to, size);
                if (sf < st) {
                  return DecorationSet.create(state.doc, [
                    Decoration.inline(sf, st, { class: "custom-selection" }),
                  ]);
                }
              }
            }
            return DecorationSet.empty;
          },
        },
      }),
    ];
  },
});

// Add fontWeight to textStyle mark — follows same pattern as FontSize extension
const FontWeight = Extension.create({
  name: "fontWeight",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontWeight: {
            default: null,
            parseHTML: (element) => element.style.fontWeight,
            renderHTML: (attributes) => {
              if (!attributes.fontWeight) {
                return {};
              }
              return {
                style: `font-weight: ${attributes.fontWeight}`,
              };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontWeight:
        (fontWeight: string) =>
        ({ chain }: any) => {
          return chain().setMark("textStyle", { fontWeight }).run();
        },
      unsetFontWeight:
        () =>
        ({ chain }: any) => {
          return chain()
            .setMark("textStyle", { fontWeight: null })
            .removeEmptyTextStyle()
            .run();
        },
    } as any;
  },
});

export function createResumeExtensions() {
  return [
    StarterKit.configure({
      heading: false,
      codeBlock: false,
      blockquote: false,
      bold: false, // Disable — conflicts with FontWeight on font-weight CSS
    }),
    Bold.extend({
      // Only match <strong>/<b> tags, NOT css font-weight
      // (FontWeight extension handles font-weight via textStyle mark)
      parseHTML() {
        return [
          { tag: "strong" },
          { tag: "b", getAttrs: (node) => (node as HTMLElement).style.fontWeight !== "normal" && null },
        ];
      },
    }),
    TextStyleKit,
    FontWeight,
    Underline,
    TextAlign.configure({
      types: ["paragraph"],
      alignments: ["left", "center", "right", "justify"],
      defaultAlignment: "left",
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      defaultProtocol: "https",
      HTMLAttributes: {
        target: "_blank",
        rel: "noopener noreferrer",
      },
    }),
    ParagraphStyles,
    SelectionHighlight,
  ];
}

// Helpers for pt/px conversion (TipTap stores px, UI shows pt)
export function pxToPt(px: string | null): number {
  if (!px) return 0;
  return Math.round(parseFloat(px) * 0.75 * 10) / 10;
}

export function ptToPx(pt: number): string {
  return `${Math.round((pt / 0.75) * 10) / 10}px`;
}
