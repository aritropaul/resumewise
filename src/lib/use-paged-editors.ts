"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { createResumeExtensions } from "@/lib/tiptap-extensions";

const PAGE_H = 792;

interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface UsePagedEditorsOptions {
  content: string | Record<string, unknown>; // HTML string or ProseMirror JSON
  margins: Margins;
}

interface UsePagedEditorsReturn {
  editors: Editor[];
  activeEditor: Editor | null;
  pageCount: number;
  setFullContent: (json: Record<string, unknown>) => void;
}

export function usePagedEditors({
  content,
  margins,
}: UsePagedEditorsOptions): UsePagedEditorsReturn {
  const editorsRef = useRef<Editor[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const reflowLock = useRef(false);
  const reflowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const marginsRef = useRef(margins);
  marginsRef.current = margins;

  const getContentHeight = useCallback(
    () => PAGE_H - marginsRef.current.top - marginsRef.current.bottom,
    []
  );

  // Create a single editor instance
  const createEditor = useCallback(
    (content: string | Record<string, unknown>, index: number): Editor => {
      const editor = new Editor({
        extensions: createResumeExtensions(),
        content,
        ...({ immediatelyRender: false } as any),
        editorProps: {
          attributes: {
            class: "outline-none",
            spellcheck: "false",
          },
          handleKeyDown: (view, event) => {
            // Backspace at position 0 → move first node to previous page
            if (event.key === "Backspace" && index > 0) {
              const { from } = view.state.selection;
              if (from === 0 || (from <= 1 && view.state.doc.childCount > 0)) {
                const prevEditor = editorsRef.current[index - 1];
                if (!prevEditor) return false;

                // Move first node of this editor to end of previous editor
                const firstNode = removeFirstNode(editor);
                if (firstNode) {
                  appendNode(prevEditor, firstNode);
                  // Focus previous editor at end
                  const endPos = prevEditor.state.doc.content.size;
                  prevEditor.commands.focus("end");
                  setActiveIndex(index - 1);
                  // Trigger reflow from previous page
                  scheduleReflow(index - 1);
                  return true;
                }
              }
            }
            return false;
          },
        },
      });

      editor.on("focus", () => {
        setActiveIndex(index);
        // Collapse selection and clear highlights in all other editors
        editorsRef.current.forEach((other, i) => {
          if (i !== index && other !== editor) {
            const tr = other.state.tr.setSelection(
              TextSelection.create(other.state.doc, 0)
            );
            tr.setMeta("addToHistory", false);
            tr.setMeta("clearSelectionHighlight", true);
            other.view.dispatch(tr);
          }
        });
      });

      editor.on("update", () => {
        // Don't trigger reflow if we're already in one
        if (!reflowLock.current) {
          scheduleReflow(index);
        }
      });

      return editor;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const scheduleReflow = useCallback((fromIndex: number) => {
    if (reflowTimer.current) clearTimeout(reflowTimer.current);
    reflowTimer.current = setTimeout(() => {
      reflow(fromIndex);
    }, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Transaction-based helpers ---

  // Remove the last child node from an editor, return its JSON
  function removeLastNode(editor: Editor): Record<string, unknown> | null {
    const { state } = editor;
    const { doc } = state;
    if (doc.childCount === 0) return null;
    const lastChild = doc.lastChild!;
    const json = lastChild.toJSON();
    const from = doc.content.size - lastChild.nodeSize;
    const tr = state.tr.delete(from, doc.content.size);
    tr.setMeta("addToHistory", false);
    editor.view.dispatch(tr);
    return json;
  }

  // Remove the first child node from an editor, return its JSON
  function removeFirstNode(editor: Editor): Record<string, unknown> | null {
    const { state } = editor;
    const { doc } = state;
    if (doc.childCount === 0) return null;
    const firstChild = doc.firstChild!;
    const json = firstChild.toJSON();
    const tr = state.tr.delete(0, firstChild.nodeSize);
    tr.setMeta("addToHistory", false);
    editor.view.dispatch(tr);
    return json;
  }

  // Insert a node (from JSON) at the beginning of an editor's doc
  function prependNode(editor: Editor, nodeJSON: Record<string, unknown>) {
    const { state } = editor;
    const node = state.schema.nodeFromJSON(nodeJSON);
    const tr = state.tr.insert(0, node);
    tr.setMeta("addToHistory", false);
    editor.view.dispatch(tr);
  }

  // Insert a node (from JSON) at the end of an editor's doc
  function appendNode(editor: Editor, nodeJSON: Record<string, unknown>) {
    const { state } = editor;
    const node = state.schema.nodeFromJSON(nodeJSON);
    const tr = state.tr.insert(state.doc.content.size, node);
    tr.setMeta("addToHistory", false);
    editor.view.dispatch(tr);
  }

  // Remove the last child node (undo an append)
  function removeLastNodeSilent(editor: Editor) {
    const { state } = editor;
    const { doc } = state;
    if (doc.childCount === 0) return;
    const lastChild = doc.lastChild!;
    const from = doc.content.size - lastChild.nodeSize;
    const tr = state.tr.delete(from, doc.content.size);
    tr.setMeta("addToHistory", false);
    editor.view.dispatch(tr);
  }

  // The core reflow algorithm using transactions
  const reflow = useCallback((startIndex: number) => {
    if (reflowLock.current) return;
    reflowLock.current = true;

    const editors = editorsRef.current;
    const maxH = getContentHeight();

    try {
      // Forward pass: overflow — push trailing nodes to next page
      for (let i = startIndex; i < editors.length; i++) {
        const editor = editors[i];
        const dom = editor.view.dom;

        while (dom.scrollHeight > maxH + 2) {
          const { doc } = editor.state;
          if (doc.childCount <= 1) break; // keep at least one node

          const nodeJSON = removeLastNode(editor);
          if (!nodeJSON) break;

          // Ensure next page exists
          if (i + 1 >= editors.length) {
            const newEditor = createEditor("", editors.length);
            editors.push(newEditor);
          }

          prependNode(editors[i + 1], nodeJSON);
        }
      }

      // Backward pass: underflow — pull leading nodes from next page
      // Only attempt if there's meaningful room on the current page
      for (let i = startIndex; i < editors.length - 1; i++) {
        const editor = editors[i];
        const nextEditor = editors[i + 1];
        const dom = editor.view.dom;

        // Skip if current page is already full or nearly full
        if (dom.scrollHeight >= maxH - 20) continue;
        // Skip if next page is empty
        if (nextEditor.state.doc.childCount === 0) continue;

        while (true) {
          if (nextEditor.state.doc.childCount === 0) break;

          const firstChild = nextEditor.state.doc.firstChild!;
          const nodeJSON = firstChild.toJSON();

          // Try appending to current page
          appendNode(editor, nodeJSON);

          // Check if it still fits
          if (dom.scrollHeight > maxH + 2) {
            // Doesn't fit — undo the append
            removeLastNodeSilent(editor);
            break;
          }

          // It fits — commit by removing from next page
          removeFirstNode(nextEditor);
        }
      }

      // Cleanup: remove empty trailing pages (keep at least 1)
      while (editors.length > 1) {
        const last = editors[editors.length - 1];
        const { doc } = last.state;
        const isEmpty =
          doc.childCount === 0 ||
          (doc.childCount === 1 &&
            doc.firstChild!.type.name === "paragraph" &&
            doc.firstChild!.content.size === 0);

        if (isEmpty) {
          last.destroy();
          editors.pop();
        } else {
          break;
        }
      }

      setPageCount(editors.length);
    } finally {
      reflowLock.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stable content key to detect real changes (not reference changes)
  const contentKey = typeof content === "string" ? content : JSON.stringify(content);

  // Initialize when content changes
  useEffect(() => {
    editorsRef.current.forEach((e) => e.destroy());
    editorsRef.current = [];

    const firstEditor = createEditor(content as string, 0);
    editorsRef.current = [firstEditor];
    setActiveIndex(0);
    setPageCount(1);

    // Wait for render, then reflow
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        reflow(0);
      });
    });

    return () => {
      editorsRef.current.forEach((e) => e.destroy());
      editorsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey]);

  // Reflow when margins change
  useEffect(() => {
    if (editorsRef.current.length === 0) return;
    requestAnimationFrame(() => {
      reflow(0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [margins.top, margins.bottom, margins.left, margins.right]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (reflowTimer.current) clearTimeout(reflowTimer.current);
    };
  }, []);

  // Set full document content atomically — used by AI tools
  // Loads all content into editor 0, destroys extras, then reflows to paginate
  const setFullContent = useCallback((json: Record<string, unknown>) => {
    const editors = editorsRef.current;
    if (editors.length === 0) return;

    // Cancel any pending reflow
    if (reflowTimer.current) clearTimeout(reflowTimer.current);

    // Destroy all editors except the first
    while (editors.length > 1) {
      const removed = editors.pop()!;
      removed.destroy();
    }

    // Set content on the first editor
    editors[0].commands.setContent(json);
    setPageCount(1);

    // Reflow after render to paginate
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        reflow(0);
      });
    });
  }, [reflow]);

  const activeEditor =
    editorsRef.current[activeIndex] || editorsRef.current[0] || null;

  return {
    editors: editorsRef.current,
    activeEditor,
    pageCount,
    setFullContent,
  };
}
