"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import type { Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Download, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import { loadAllDocuments, saveDocument, deleteDocument, duplicateDocument, type SavedDocument } from "@/lib/storage";

const ResumeEditor = dynamic(
  () => import("@/components/resume-editor").then((m) => m.ResumeEditor),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center bg-[#f6f6f6]"><p className="text-sm text-black/40">Loading editor...</p></div> }
);

const TextPanel = dynamic(
  () => import("@/components/text-panel").then((m) => m.TextPanel),
  { ssr: false }
);

const AiPanel = dynamic(
  () => import("@/components/ai-panel").then((m) => m.AiPanel),
  { ssr: false }
);

const SelectionBar = dynamic(
  () => import("@/components/selection-bar").then((m) => m.SelectionBar),
  { ssr: false }
);

const DocSidebar = dynamic(
  () => import("@/components/doc-sidebar").then((m) => m.DocSidebar),
  { ssr: false }
);

const DEFAULT_MARGINS = { top: 48, right: 56, bottom: 48, left: 56 };

// Collect editor content as merged ProseMirror JSON (preserves nbsp exactly)
function collectEditorJson(editors: Editor[]): Record<string, unknown> | null {
  if (editors.length === 0) return null;
  const allContent = editors.flatMap((e) => {
    const json = e.getJSON();
    return (json.content as Record<string, unknown>[]) || [];
  });
  return { type: "doc", content: allContent };
}

export default function Home() {
  const [files, setFiles] = useState<SavedDocument[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [rightTab, setRightTab] = useState<"editor" | "ai">("editor");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [allEditors, setAllEditors] = useState<Editor[]>([]);
  const setFullContentRef = useRef<((json: Record<string, unknown>) => void) | null>(null);
  const saveLockRef = useRef(false); // Lock auto-save during AI tool execution
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filesRef = useRef(files);
  filesRef.current = files;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const allEditorsRef = useRef(allEditors);
  allEditorsRef.current = allEditors;

  const activeFile = files.find((f) => f.id === activeId) ?? null;
  const margins = activeFile?.margins ?? DEFAULT_MARGINS;
  const activeContent = activeFile?.editorJson || activeFile?.htmlContent || "";

  // Load documents from IndexedDB on mount
  useEffect(() => {
    loadAllDocuments().then((docs) => {
      if (docs.length > 0) {
        setFiles(docs);
        setActiveId(docs[0].id);
      }
    });
  }, []);

  // Save current editor state to IndexedDB only (no React state update to avoid editor recreation)
  const persistToDb = useCallback(() => {
    const id = activeIdRef.current;
    const editors = allEditorsRef.current;
    if (!id || editors.length === 0) return;
    const alive = editors.every((e) => { try { return !!e.view?.dom; } catch { return false; } });
    if (!alive) return;
    const doc = filesRef.current.find((f) => f.id === id);
    if (!doc) return;
    const json = collectEditorJson(editors);
    saveDocument({ ...doc, editorJson: json });
  }, []);

  // Save and update React state — only used when switching documents
  const persistCurrent = useCallback(() => {
    const id = activeIdRef.current;
    const editors = allEditorsRef.current;
    if (!id || editors.length === 0) return;
    const alive = editors.every((e) => { try { return !!e.view?.dom; } catch { return false; } });
    if (!alive) return;
    const doc = filesRef.current.find((f) => f.id === id);
    if (!doc) return;
    const json = collectEditorJson(editors);
    const updated = { ...doc, editorJson: json };
    saveDocument(updated);
    setFiles((prev) => prev.map((f) => (f.id === id ? updated : f)));
  }, []);

  // Manual save (Cmd+S)
  const saveNow = useCallback(() => {
    if (!activeIdRef.current || allEditorsRef.current.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    persistToDb();
    toast.success("Saved");
  }, [persistToDb]);

  // Auto-save: write to IndexedDB only — NO React state update (avoids editor recreation)
  useEffect(() => {
    if (allEditors.length === 0) return;

    const handleUpdate = () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        persistToDb();
      }, 1000);
    };

    allEditors.forEach((e) => e.on("update", handleUpdate));
    return () => {
      allEditors.forEach((e) => e.off("update", handleUpdate));
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [allEditors, persistToDb]);

  // Cmd+S keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveNow();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveNow]);

  const setMargins = useCallback(
    (newMargins: typeof DEFAULT_MARGINS) => {
      if (!activeId) return;
      setFiles((prev) =>
        prev.map((f) => {
          if (f.id !== activeId) return f;
          const updated = { ...f, margins: newMargins };
          saveDocument(updated);
          return updated;
        })
      );
    },
    [activeId]
  );

  const handleMarginChange = useCallback(
    (side: "top" | "right" | "bottom" | "left", value: number) => {
      if (!activeId) return;
      setFiles((prev) =>
        prev.map((f) => {
          if (f.id !== activeId) return f;
          const updated = { ...f, margins: { ...f.margins, [side]: value } };
          saveDocument(updated);
          return updated;
        })
      );
    },
    [activeId]
  );

  const handleFileUpload = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/parse", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Parse failed");
      const { html } = await res.json();

      const newDoc: SavedDocument = {
        id: crypto.randomUUID(),
        name: file.name,
        date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
        htmlContent: html,
        margins: { ...DEFAULT_MARGINS },
      };
      await saveDocument(newDoc);
      persistCurrent();
      setFiles((prev) => [...prev, newDoc]);
      setActiveId(newDoc.id);
      toast.success(`Imported ${file.name}`);
    } catch (err) {
      console.error("Failed to parse PDF:", err);
      toast.error("Failed to parse PDF");
    } finally {
      setLoading(false);
    }
  }, [persistCurrent]);

  const switchDocument = useCallback((id: string) => {
    persistCurrent();
    setActiveId(id);
  }, [persistCurrent]);

  const handleCreateBlank = useCallback(() => {
    const newDoc: SavedDocument = {
      id: crypto.randomUUID(),
      name: "Untitled Resume",
      date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      htmlContent: "",
      margins: { ...DEFAULT_MARGINS },
    };
    saveDocument(newDoc);
    persistCurrent();
    setFiles((prev) => [...prev, newDoc]);
    setActiveId(newDoc.id);
  }, [persistCurrent]);

  const handleDuplicate = useCallback(
    (id: string, asVariant: boolean) => {
      const doc = filesRef.current.find((f) => f.id === id);
      if (!doc) return;

      // If duplicating as variant, the parent is the base (either the doc itself if it's a base, or its parent)
      const parentId = asVariant ? (doc.parentId || doc.id) : doc.parentId;
      const baseName = doc.name.replace(/\.pdf$/i, "");
      const newName = asVariant ? `${baseName} — variant` : `${baseName} (copy)`;
      const dup = duplicateDocument(doc, newName, parentId);
      saveDocument(dup);
      setFiles((prev) => [...prev, dup]);
      setActiveId(dup.id);
    },
    []
  );

  const handleRename = useCallback((id: string, newName: string) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const updated = { ...f, name: newName };
        saveDocument(updated);
        return updated;
      })
    );
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      const doc = filesRef.current.find((f) => f.id === id);
      if (!doc) return;

      // If it's a base, also delete its variants
      const idsToDelete = [id];
      if (!doc.parentId) {
        filesRef.current.forEach((f) => {
          if (f.parentId === id) idsToDelete.push(f.id);
        });
      }

      idsToDelete.forEach((did) => deleteDocument(did));
      setFiles((prev) => prev.filter((f) => !idsToDelete.includes(f.id)));

      // If we deleted the active doc, pick another
      if (activeId && idsToDelete.includes(activeId)) {
        const remaining = filesRef.current.filter((f) => !idsToDelete.includes(f.id));
        setActiveId(remaining.length > 0 ? remaining[0].id : null);
      }
    },
    [activeId]
  );

  const handleToggleCollapse = useCallback((id: string) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const updated = { ...f, collapsed: !f.collapsed };
        saveDocument(updated);
        return updated;
      })
    );
  }, []);

  const handleExport = useCallback(() => {
    window.print();
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#f6f6f6]">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file);
          e.target.value = "";
        }}
      />

      {/* ─── Toolbar ─── */}
      <div data-print-hide className="h-10 shrink-0 bg-white border-b border-black/[0.08] flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-sm tracking-tight font-[family-name:var(--font-instrument-serif)] italic text-black">resumewise</h1>
          {activeFile && (
            <>
              <Separator orientation="vertical" className="h-4" />
              <span className="text-[11px] text-black/50 truncate max-w-[200px]">{activeFile.name.replace(/\.pdf$/i, "")}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="xs" className="gap-1 text-[11px]" onClick={() => fileInputRef.current?.click()}>
            <Upload className="size-3" />
            Import
          </Button>
          <Button variant="ghost" size="xs" className="gap-1 text-[11px]" onClick={saveNow} disabled={!activeFile}>
            <Save className="size-3" />
            Save
          </Button>
          <Button variant="ghost" size="xs" className="gap-1 text-[11px]" onClick={handleExport} disabled={!activeFile}>
            <Download className="size-3" />
            Export
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Sidebar */}
        <div data-print-hide className={`shrink-0 h-full overflow-hidden transition-[width] duration-200 ease-out ${leftOpen ? "w-[280px]" : "w-0"}`}>
          <div className="w-[280px] h-full bg-white border-r border-black/[0.08] flex flex-col">
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <h2 className="text-lg tracking-tight font-[family-name:var(--font-instrument-serif)] italic text-black">documents</h2>
              <button onClick={() => setLeftOpen(false)} className="p-1 hover:bg-black/5 rounded"><PanelIcon side="right" /></button>
            </div>
            <DocSidebar
              files={files}
              activeId={activeId}
              loading={loading}
              onSelect={switchDocument}
              onUpload={() => fileInputRef.current?.click()}
              onCreateBlank={handleCreateBlank}
              onDuplicate={handleDuplicate}
              onRename={handleRename}
              onDelete={handleDelete}
              onToggleCollapse={handleToggleCollapse}
            />
          </div>
        </div>

        {/* Center */}
        <div data-print-pages className="flex-1 min-w-0 h-full relative">
          {!leftOpen && (
            <button data-print-hide onClick={() => setLeftOpen(true)} className="absolute top-4 left-4 z-10 p-1 hover:bg-black/5 rounded bg-white shadow-sm">
              <PanelIcon side="right" />
            </button>
          )}
          {activeFile ? (
            <>
              <ResumeEditor content={activeContent} margins={margins} onActiveEditorChange={setEditor} onAllEditorsChange={setAllEditors} onSetFullContent={(fn) => { setFullContentRef.current = fn; }} />
              <SelectionBar allEditors={allEditors} collectEditorJson={collectEditorJson} setFullContent={setFullContentRef} />
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-4">
                <h2 className="text-3xl font-[family-name:var(--font-instrument-serif)] italic text-black">resumewise</h2>
                <p className="text-sm text-black/40">Upload a PDF or create a new document</p>
                <div className="flex gap-2 justify-center">
                  <button onClick={handleCreateBlank} className="px-4 py-2 text-sm border border-black/10 text-black rounded-lg hover:bg-black/[0.02] transition-colors">
                    New blank
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-black/80 transition-colors">
                    {loading ? "Parsing..." : "Upload PDF"}
                  </button>
                </div>
              </div>
            </div>
          )}
          {!rightOpen && (
            <button data-print-hide onClick={() => setRightOpen(true)} className="absolute top-4 right-4 z-10 p-1 hover:bg-black/5 rounded bg-white shadow-sm">
              <PanelIcon side="left" />
            </button>
          )}
        </div>

        {/* Right Sidebar */}
        <div data-print-hide className={`shrink-0 h-full overflow-hidden transition-[width] duration-200 ease-out ${rightOpen ? "w-[280px]" : "w-0"}`}>
          <div className="w-[280px] h-full bg-white border-l border-black/[0.08] flex flex-col">
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <button onClick={() => setRightOpen(false)} className="p-1 hover:bg-black/5 rounded"><PanelIcon side="left" /></button>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setRightTab("editor")}
                  className={`text-lg tracking-tight font-[family-name:var(--font-instrument-serif)] italic transition-colors ${rightTab === "editor" ? "text-black" : "text-black/25 hover:text-black/40"}`}
                >
                  editor
                </button>
                <button
                  onClick={() => setRightTab("ai")}
                  className={`text-lg tracking-tight font-[family-name:var(--font-instrument-serif)] italic transition-colors ${rightTab === "ai" ? "text-black" : "text-black/25 hover:text-black/40"}`}
                >
                  ai
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
              {rightTab === "editor" ? (
                <>
                  <TextPanel editor={editor} allEditors={allEditors} />

                  <Separator />
                  <div className="px-3 py-2.5">
                    <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-2">Page Margins</div>
                    <div className="grid grid-cols-2 gap-x-1.5 gap-y-1.5">
                      {(["top", "bottom", "left", "right"] as const).map((side) => (
                        <div key={side}>
                          <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{side}</span>
                          <div className="relative">
                            <Input
                              type="number"
                              min={0}
                              max={120}
                              value={margins[side]}
                              onChange={(e) => handleMarginChange(side, parseInt(e.target.value) || 0)}
                              className="h-7 text-[11px] md:text-[11px] pr-6 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground pointer-events-none">px</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2">
                      <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Presets</span>
                      <div className="flex gap-1.5 mt-1">
                        {[
                          { label: "Narrow", t: 36, r: 36, b: 36, l: 36 },
                          { label: "Normal", t: 48, r: 56, b: 48, l: 56 },
                          { label: "Wide", t: 72, r: 72, b: 72, l: 72 },
                        ].map((p) => (
                          <Button
                            key={p.label}
                            variant={margins.top === p.t && margins.right === p.r ? "default" : "outline"}
                            size="xs"
                            className="text-[10px]"
                            onClick={() => setMargins({ top: p.t, right: p.r, bottom: p.b, left: p.l })}
                          >
                            {p.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <AiPanel
                  allEditors={allEditors}
                  collectEditorJson={collectEditorJson}
                  documentId={activeFile?.id}
                  setFullContent={setFullContentRef}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelIcon({ side }: { side: "left" | "right" }) {
  const x = side === "right" ? 11.5 : 6.5;
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="14" height="14" rx="2" />
      <line x1={x} y1="2" x2={x} y2="16" />
    </svg>
  );
}
