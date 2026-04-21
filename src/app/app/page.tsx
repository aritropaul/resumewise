"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Sidebar,
  SidebarSimple,
  Sun,
  MoonStars,
  DownloadSimple,
  MagnifyingGlass,
  FileText,
  UploadSimple,
  Plus,
  Sparkle,
  Keyboard,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs";
import { CircularLoader } from "@/components/ui/loader";
import { ResumePageSkeleton } from "@/components/ui/skeleton";
import { TemplatePicker } from "@/components/template-picker";
import { CommandPalette } from "@/components/command-palette";
import { ShortcutSheet } from "@/components/shortcut-sheet";
import {
  loadAllDocuments,
  saveDocument,
  deleteDocument,
  duplicateDocument,
  createVariantDocument,
  createBlankDocument,
  isVariantDocument,
  type SavedDocument,
} from "@/lib/storage";
import { useResumeStore } from "@/lib/resume-store";
import { DocEditorPanel } from "@/components/doc-editor-panel";
import { downloadResumePdf } from "@/lib/download-pdf";
import { cn } from "@/lib/utils";
import { UserMenu } from "@/components/user-menu";
import { JobPanel, type SuggestionStatus } from "@/components/job-panel";
import {
  buildVariantName,
  extractJobMetadata,
  getVariantState,
  syncDocumentJobMetadata,
} from "@/lib/variant-workflow";
import {
  analyzeFit,
  fetchJobFromUrl,
  markdownHash,
  readCache,
  summariseJob,
  type FitAnalysis,
} from "@/lib/fit-analyzer";
import { applySuggestion } from "@/lib/apply-suggestion";

const CenterTabs = dynamic(
  () => import("@/components/center-tabs").then((m) => m.CenterTabs),
  { ssr: false, loading: () => <ResumePageSkeleton /> }
);

const DocSidebar = dynamic(
  () => import("@/components/doc-sidebar").then((m) => m.DocSidebar),
  { ssr: false }
);

const AiPanel = dynamic(
  () => import("@/components/ai-panel").then((m) => m.AiPanel),
  { ssr: false }
);

type RightTab = "design" | "ai" | "job";
type SaveState = "idle" | "saving" | "saved";
type CenterTab = "edit" | "preview";

export default function Home() {
  const [files, setFiles] = useState<SavedDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [rightTab, setRightTab] = useState<RightTab>("design");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [isDownloading, setIsDownloading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutOpen, setShortcutOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAgo, setSavedAgo] = useState<number | null>(null);
  const [rightTabByDoc, setRightTabByDoc] = useState<
    Partial<Record<string, RightTab>>
  >({});
  const [centerTabByDoc, setCenterTabByDoc] = useState<
    Partial<Record<string, CenterTab>>
  >({});
  const [fitAnalysis, setFitAnalysis] = useState<FitAnalysis | null>(null);
  const [fitAnalysisKey, setFitAnalysisKey] = useState<{
    docId: string;
    jobKey: string | null;
    markdownHash: string;
  } | null>(null);
  const [fitLoading, setFitLoading] = useState(false);
  const [fitError, setFitError] = useState<string | null>(null);
  const [urlFetchLoading, setUrlFetchLoading] = useState(false);
  const [urlFetchError, setUrlFetchError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [suggestionStatus, setSuggestionStatus] = useState<
    Record<number, SuggestionStatus>
  >({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedAtRef = useRef<number | null>(null);
  const filesRef = useRef(files);
  filesRef.current = files;

  const store = useResumeStore();
  const { markdown, activeId, theme: resumeTheme, template } = store;
  const activeFile = files.find((f) => f.id === activeId) ?? null;
  const jobDescription = activeFile?.jobDescription ?? null;
  const centerTab: CenterTab = activeId
    ? (centerTabByDoc[activeId] ?? "edit")
    : "edit";

  useEffect(() => {
    if (typeof document === "undefined") return;
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem("theme", theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    (async () => {
      setLoadingDocs(true);
      try {
        const all = await loadAllDocuments();
        all.sort((a, b) => a.name.localeCompare(b.name));
        setFiles(all);
        if (all.length > 0) {
          const first = all[0];
          store.setActive(first.id, {
            markdown: first.markdown,
            theme: first.theme,
            template: first.template,
          });
        }
      } catch (e) {
        console.error("Failed to load documents", e);
      } finally {
        setLoadingDocs(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave whenever the store's markdown/theme/template drift from the file.
  useEffect(() => {
    if (!activeId) return;
    const file = filesRef.current.find((f) => f.id === activeId);
    if (!file) return;
    if (
      file.markdown === markdown &&
      file.theme === resumeTheme &&
      file.template === template
    ) {
      return;
    }
    const next: SavedDocument = {
      ...file,
      markdown,
      theme: resumeTheme,
      template,
    };
    setFiles((prev) => prev.map((f) => (f.id === activeId ? next : f)));
    setSaveState("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveDocument(next)
        .then(() => {
          savedAtRef.current = Date.now();
          setSavedAgo(0);
          setSaveState("saved");
        })
        .catch((e) => {
          console.error("Save failed", e);
          setSaveState("idle");
        });
    }, 600);
  }, [markdown, resumeTheme, template, activeId]);

  useEffect(() => {
    if (saveState !== "saved") return;
    const id = setInterval(() => {
      if (!savedAtRef.current) return;
      setSavedAgo(Math.floor((Date.now() - savedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [saveState]);

  const setInspectorTab = useCallback(
    (tab: RightTab) => {
      setRightTab(tab);
      if (!activeId) return;
      setRightTabByDoc((prev) => ({ ...prev, [activeId]: tab }));
    },
    [activeId]
  );

  const setCenterTab = useCallback(
    (tab: CenterTab) => {
      if (!activeId) return;
      setCenterTabByDoc((prev) => ({ ...prev, [activeId]: tab }));
    },
    [activeId]
  );

  useEffect(() => {
    if (!activeId) return;
    setRightTab(rightTabByDoc[activeId] ?? "design");
  }, [activeId, rightTabByDoc]);

  useEffect(() => {
    if (!activeId) return;
    const doc = filesRef.current.find((f) => f.id === activeId);
    if (!doc) return;
    // Rehydrate a cached analysis if it still matches the current doc+JD+markdown.
    const cached = readCache({
      jobKey: doc.jobKey ?? null,
      markdownHash: markdownHash(doc.markdown),
    });
    if (cached) {
      setFitAnalysis(cached);
      setFitAnalysisKey({
        docId: doc.id,
        jobKey: doc.jobKey ?? null,
        markdownHash: markdownHash(doc.markdown),
      });
    } else {
      setFitAnalysis(null);
      setFitAnalysisKey(null);
    }
    setSuggestionStatus({});
    setFitError(null);
    setUrlFetchError(null);
  }, [activeId]);

  const activateDoc = useCallback(
    (doc: SavedDocument) => {
      store.setActive(doc.id, {
        markdown: doc.markdown,
        theme: doc.theme,
        template: doc.template,
      });
    },
    [store]
  );

  const handleSelect = useCallback(
    (id: string) => {
      const doc = filesRef.current.find((f) => f.id === id);
      if (doc) activateDoc(doc);
    },
    [activateDoc]
  );

  const handleCreateBlank = useCallback(() => {
    const doc = createBlankDocument("untitled resume");
    saveDocument(doc).catch((e) => console.error("Save failed", e));
    setFiles((prev) => [...prev, doc]);
    activateDoc(doc);
  }, [activateDoc]);

  const handleUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChosen = useCallback(
    async (file: File) => {
      if (!file) return;
      const baseName = file.name.replace(/\.pdf$/i, "");
      const importToast = toast.loading(`importing ${baseName}…`);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const parseRes = await fetch("/api/parse", { method: "POST", body: fd });
        if (!parseRes.ok) {
          const err = await parseRes.json().catch(() => ({ error: "parse failed" })) as { error?: string };
          throw new Error(err.error || "parse failed");
        }
        const { text } = (await parseRes.json()) as { text: string };

        const importRes = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!importRes.ok) {
          const err = await importRes.json().catch(() => ({ error: "import failed" })) as { error?: string };
          throw new Error(err.error || "import failed");
        }
        const { markdown: importedMd } = (await importRes.json()) as {
          markdown: string;
        };

        const doc = createBlankDocument(baseName);
        doc.markdown = importedMd;
        await saveDocument(doc);
        setFiles((prev) => [...prev, doc]);
        activateDoc(doc);
        toast.success(`imported ${baseName}`, { id: importToast });
      } catch (e) {
        console.error("Import failed", e);
        toast.error(`import failed: ${(e as Error).message}`, { id: importToast });
      }
    },
    [activateDoc]
  );

  const handleImportBackup = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const importToast = toast.loading("importing backup…");
      try {
        const text = await file.text();
        const docs: SavedDocument[] = JSON.parse(text);
        if (!Array.isArray(docs) || docs.length === 0) {
          toast.error("no documents found in file", { id: importToast });
          return;
        }
        const res = await fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(docs),
        });
        if (!res.ok) throw new Error("upload failed");
        const all = await loadAllDocuments();
        all.sort((a, b) => a.name.localeCompare(b.name));
        setFiles(all);
        if (all.length > 0) activateDoc(all[0]);
        toast.success(`imported ${docs.length} document${docs.length === 1 ? "" : "s"}`, { id: importToast });
      } catch (e) {
        toast.error(`import failed: ${(e as Error).message}`, { id: importToast });
      }
    };
    input.click();
  }, [activateDoc]);

  const handleRename = useCallback((id: string, name: string) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const next = { ...f, name };
        saveDocument(next).catch((e) => console.error("Save failed", e));
        return next;
      })
    );
  }, []);

  const handleDuplicate = useCallback(
    (id: string, asVariant: boolean) => {
      const src = filesRef.current.find((f) => f.id === id);
      if (!src) return;
      const sourceDoc: SavedDocument =
        src.id === activeId
          ? { ...src, markdown, theme: resumeTheme, template }
          : src;
      const metadata = extractJobMetadata(sourceDoc.jobDescription);
      const dup = asVariant
        ? createVariantDocument(
            sourceDoc,
            buildVariantName(sourceDoc.name, metadata),
            sourceDoc.jobDescription
          )
        : duplicateDocument(
            sourceDoc,
            `${src.name.replace(/\.pdf$/i, "")} (copy)`,
            null
          );
      saveDocument(dup).catch((e) => console.error("Save failed", e));
      setFiles((prev) => [...prev, dup]);
      activateDoc(dup);
    },
    [activeId, markdown, resumeTheme, template, activateDoc]
  );

  const handleDelete = useCallback(
    (id: string) => {
      const target = filesRef.current.find((f) => f.id === id);
      if (!target) return;
      const ids = [
        id,
        ...filesRef.current.filter((f) => f.parentId === id).map((f) => f.id),
      ];
      const snapshot = filesRef.current.filter((f) => ids.includes(f.id));
      const label = target.name.replace(/\.pdf$/i, "") || "untitled";

      setFiles((prev) => prev.filter((f) => !ids.includes(f.id)));
      if (ids.includes(activeId ?? "")) {
        const remaining = filesRef.current.filter((f) => !ids.includes(f.id));
        const nextDoc = remaining[0];
        if (nextDoc) activateDoc(nextDoc);
        else store.setActive(null, null);
      }

      let undone = false;
      toast(`deleted ${label}`, {
        description: ids.length > 1 ? `${ids.length - 1} variants also removed` : undefined,
        action: {
          label: "undo",
          onClick: () => {
            undone = true;
            setFiles((prev) => {
              const byId = new Set(prev.map((p) => p.id));
              const restored = snapshot.filter((s) => !byId.has(s.id));
              return [...prev, ...restored];
            });
          },
        },
        duration: 6000,
      });

      setTimeout(() => {
        if (undone) return;
        Promise.all(ids.map((i) => deleteDocument(i))).catch((e) =>
          console.error("Delete failed", e)
        );
      }, 6000);
    },
    [activeId, activateDoc, store]
  );

  const handleToggleCollapse = useCallback((id: string) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const next = { ...f, collapsed: !f.collapsed };
        saveDocument(next).catch((e) => console.error("Save failed", e));
        return next;
      })
    );
  }, []);

  const handleDownload = useCallback(async () => {
    if (!activeFile) return;
    setIsDownloading(true);
    try {
      await downloadResumePdf(
        { markdown, theme: resumeTheme, template },
        activeFile.name
      );
    } catch (e) {
      console.error("Download failed", e);
      toast.error("download failed");
    } finally {
      setIsDownloading(false);
    }
  }, [activeFile, markdown, resumeTheme, template]);

  const handleJobChange = useCallback(
    (value: string) => {
      if (!activeId) return;
      setFiles((prev) =>
        prev.map((f) => {
          if (f.id !== activeId) return f;
          return syncDocumentJobMetadata({ ...f, jobDescription: value });
        })
      );
      setSaveState("saving");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const current = filesRef.current.find((f) => f.id === activeId);
        if (!current) return;
        saveDocument(current)
          .then(() => {
            savedAtRef.current = Date.now();
            setSavedAgo(0);
            setSaveState("saved");
          })
          .catch((e) => console.error("Save failed", e));
      }, 600);
    },
    [activeId]
  );

  // Fork a fresh variant the first time the AI tab (or selection popover)
  // touches a base doc. If the active doc is already a variant, stay put — per
  // product rule, subsequent AI edits mutate in place.
  const ensureAiFork = useCallback(async () => {
    if (!activeFile) return null;
    if (isVariantDocument(activeFile)) {
      return activeFile;
    }
    const sourceDoc: SavedDocument = {
      ...activeFile,
      markdown,
      theme: resumeTheme,
      template,
    };
    const variant = createVariantDocument(
      sourceDoc,
      `${sourceDoc.name.replace(/\.pdf$/i, "")} — draft`,
      sourceDoc.jobDescription ?? null
    );
    try {
      await saveDocument(variant);
    } catch (e) {
      console.error("Save failed", e);
      toast.error("couldn't save variant");
      return null;
    }
    setFiles((prev) => [...prev, variant]);
    activateDoc(variant);
    toast.success(`forked variant for ai edits`);
    return variant;
  }, [activeFile, markdown, resumeTheme, template, activateDoc]);

  const openAiTab = useCallback(() => {
    setInspectorTab("ai");
  }, [setInspectorTab]);

  const ensureVariantForJob = useCallback(async () => {
    if (!activeFile) return null;
    const trimmed = activeFile.jobDescription?.trim();
    if (!trimmed) {
      toast.error("paste the job description before tailoring");
      return null;
    }

    const sourceDoc = syncDocumentJobMetadata(
      { ...activeFile, markdown, theme: resumeTheme, template },
      trimmed
    );

    if (isVariantDocument(sourceDoc)) {
      await saveDocument(sourceDoc);
      setFiles((prev) =>
        prev.map((file) => (file.id === sourceDoc.id ? sourceDoc : file))
      );
      activateDoc(sourceDoc);
      toast.success("continuing the active tailored variant");
      return sourceDoc;
    }

    const state = getVariantState(sourceDoc, filesRef.current, trimmed);
    if (state.matchingVariant) {
      const match = syncDocumentJobMetadata(
        { ...state.matchingVariant, jobDescription: trimmed },
        trimmed
      );
      await saveDocument(match);
      setFiles((prev) => prev.map((f) => (f.id === match.id ? match : f)));
      activateDoc(match);
      toast.success("opened the existing tailored variant");
      return match;
    }

    const metadata = extractJobMetadata(trimmed);
    const authoritative =
      sourceDoc.jobSource === "greenhouse" || sourceDoc.jobSource === "ashby"
        ? { jobTitle: sourceDoc.jobTitle, company: sourceDoc.company }
        : undefined;
    const created = syncDocumentJobMetadata(
      createVariantDocument(
        sourceDoc,
        buildVariantName(sourceDoc.name, metadata, authoritative),
        trimmed
      ),
      trimmed
    );
    await saveDocument(created);
    setFiles((prev) => [...prev, created]);
    activateDoc(created);
    toast.success("created a tailored variant");
    return created;
  }, [activeFile, markdown, resumeTheme, template, activateDoc]);

  const queueAiWorkflow = useCallback(
    (mode: "idle" | "analyze" | "tailor", prompt: string) => {
      setInspectorTab("ai");
      store.setAiWorkflowMode(mode);
      store.setAiPrefill(prompt);
    },
    [setInspectorTab, store]
  );

  const handleFetchJobUrl = useCallback(
    async (source: "greenhouse" | "ashby", url: string) => {
      if (!activeId) return;
      setUrlFetchError(null);
      setUrlFetchLoading(true);
      try {
        const result = await fetchJobFromUrl(url);
        if (result.source !== source) {
          toast.message(
            `loaded from ${result.source} instead of ${source}`
          );
        }
        setFiles((prev) =>
          prev.map((f) => {
            if (f.id !== activeId) return f;
            return syncDocumentJobMetadata(
              { ...f, jobDescription: result.text, jobSummary: null },
              result.text,
              {
                jobTitle: result.title,
                company: result.company,
                jobSource: result.source,
                jobSourceUrl: result.sourceUrl,
              }
            );
          })
        );
        setSaveState("saving");
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          const current = filesRef.current.find((f) => f.id === activeId);
          if (!current) return;
          saveDocument(current)
            .then(() => {
              savedAtRef.current = Date.now();
              setSavedAgo(0);
              setSaveState("saved");
            })
            .catch((e) => console.error("Save failed", e));
        }, 200);
        toast.success(
          result.company
            ? `loaded ${result.title ?? "role"} · ${result.company}`
            : `loaded ${result.title ?? "job"}`
        );

        // Summarise in the background. Persists once it lands, never blocks the
        // fetch UI or analyze path.
        setSummaryLoading(true);
        summariseJob(result.text)
          .then((summary) => {
            setFiles((prev) =>
              prev.map((f) => (f.id === activeId ? { ...f, jobSummary: summary } : f))
            );
            const latest = filesRef.current.find((f) => f.id === activeId);
            if (latest) {
              saveDocument({ ...latest, jobSummary: summary }).catch((e) =>
                console.error("Save failed", e)
              );
            }
          })
          .catch((e) => {
            console.error("Summary failed", e);
          })
          .finally(() => setSummaryLoading(false));
      } catch (e) {
        const message = e instanceof Error ? e.message : "fetch failed";
        setUrlFetchError(message);
        toast.error(`couldn't load: ${message}`);
      } finally {
        setUrlFetchLoading(false);
      }
    },
    [activeId]
  );

  const handleAnalyzeJob = useCallback(async () => {
    if (!activeFile) return;
    const jd = activeFile.jobDescription?.trim();
    if (!jd) {
      toast.error("paste the job description before running analysis");
      return;
    }
    const key = {
      docId: activeFile.id,
      jobKey: activeFile.jobKey ?? null,
      markdownHash: markdownHash(markdown),
    };
    setFitError(null);
    setFitLoading(true);
    try {
      const { analysis } = await analyzeFit({
        markdown,
        jobDescription: jd,
        jobKey: key.jobKey,
      });
      setFitAnalysis(analysis);
      setFitAnalysisKey(key);
      setSuggestionStatus({});
    } catch (e) {
      const message = e instanceof Error ? e.message : "analysis failed";
      setFitError(message);
      toast.error(message);
    } finally {
      setFitLoading(false);
    }
  }, [activeFile, markdown]);

  const handleTailorJob = useCallback(async () => {
    if (!jobDescription?.trim()) {
      toast.error("paste the job description before tailoring");
      return;
    }
    const variant = await ensureVariantForJob();
    if (!variant) return;
    queueAiWorkflow(
      "tailor",
      "Tailor this resume to the target job. Focus on the summary, the strongest work bullets, and the most relevant skills."
    );
  }, [queueAiWorkflow, jobDescription, ensureVariantForJob]);

  const handleAcceptSuggestion = useCallback(
    async (index: number) => {
      if (!fitAnalysis) return;
      const suggestion = fitAnalysis.suggestions[index];
      if (!suggestion) return;
      const variant = await ensureVariantForJob();
      if (!variant) return;
      // ensureVariantForJob may have switched the active doc; read latest markdown
      // from the store so the splice targets the right document.
      const currentMd = useResumeStore.getState().markdown;
      const next = applySuggestion(currentMd, suggestion.before, suggestion.after);
      if (!next) {
        setSuggestionStatus((prev) => ({ ...prev, [index]: "error" }));
        toast.error("couldn't find the exact text — open AI tab to rewrite");
        return;
      }
      store.setMarkdown(next);
      setSuggestionStatus((prev) => ({ ...prev, [index]: "accepted" }));
      // Re-anchor the analysis key to the post-accept state so applying our own
      // suggestion doesn't mark the analysis stale and pull the user into a
      // re-analyze loop.
      setFitAnalysisKey({
        docId: variant.id,
        jobKey: variant.jobKey ?? null,
        markdownHash: markdownHash(next),
      });
    },
    [fitAnalysis, ensureVariantForJob, store]
  );

  const handleRejectSuggestion = useCallback((index: number) => {
    setSuggestionStatus((prev) => ({ ...prev, [index]: "rejected" }));
  }, []);

  const handleClearAnalysis = useCallback(() => {
    setFitAnalysis(null);
    setFitAnalysisKey(null);
    setSuggestionStatus({});
    setFitError(null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const isEditing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (e.key === "?" && !isEditing) {
        e.preventDefault();
        setShortcutOpen((o) => !o);
        return;
      }
      if (!mod) return;
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (e.key.toLowerCase() === "z" && !e.shiftKey && !isEditing) {
        e.preventDefault();
        if (store.canUndo()) store.undo();
      } else if (
        (e.key.toLowerCase() === "z" && e.shiftKey) ||
        e.key.toLowerCase() === "y"
      ) {
        if (isEditing) return;
        e.preventDefault();
        if (store.canRedo()) store.redo();
      } else if (e.key.toLowerCase() === "b") {
        e.preventDefault();
        setLeftOpen((o) => !o);
      } else if (e.key.toLowerCase() === "j") {
        e.preventDefault();
        setRightOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  return (
    <div className="h-screen w-screen flex flex-col bg-background">
      <header className="flex items-center gap-2 pl-2 pr-2 h-11 border-b border-border bg-background sticky top-0 z-30">
        <IconButton
          aria-label={leftOpen ? "hide documents" : "show documents"}
          onClick={() => setLeftOpen((o) => !o)}
          size="sm"
        >
          <Sidebar weight="light" />
        </IconButton>

        <div className="flex items-center gap-2 min-w-0">
          <BrandMark />
          <span className="text-label text-muted-foreground select-none">resumewise</span>
          <span className="h-3 w-px bg-border mx-1" aria-hidden />
          <span className="text-sm font-medium text-foreground truncate max-w-[30ch]">
            {activeFile?.name.replace(/\.pdf$/i, "") || "—"}
          </span>
          {activeFile?.parentId ? (
            <Badge variant="outline" size="sm" className="uppercase tracking-wider">
              variant
            </Badge>
          ) : null}
        </div>

        {activeFile && <SaveIndicator state={saveState} secondsAgo={savedAgo} />}

        <div className="flex-1" />

        <button
          onClick={() => setPaletteOpen(true)}
          className="h-7 inline-flex items-center gap-1.5 px-2 rounded-[var(--radius-md)] text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-[background-color,color] duration-150"
        >
          <MagnifyingGlass weight="light" className="size-3.5" />
          <span>find</span>
          <Kbd>⌘K</Kbd>
        </button>

        <IconButton
          aria-label="toggle theme"
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          size="sm"
        >
          {theme === "dark" ? <Sun weight="light" /> : <MoonStars weight="light" />}
        </IconButton>

        <IconButton
          aria-label="keyboard shortcuts"
          onClick={() => setShortcutOpen(true)}
          size="sm"
        >
          <Keyboard weight="light" />
        </IconButton>

        <Button
          size="sm"
          onClick={handleDownload}
          disabled={!activeFile || isDownloading}
        >
          {isDownloading ? (
            <CircularLoader size="sm" className="size-3.5" />
          ) : (
            <DownloadSimple weight="light" className="size-3.5" />
          )}
          download
        </Button>

        <IconButton
          aria-label={rightOpen ? "hide panel" : "show panel"}
          onClick={() => setRightOpen((o) => !o)}
          size="sm"
        >
          <SidebarSimple weight="light" />
        </IconButton>

        <UserMenu />
      </header>

      <div className="flex-1 flex min-h-0">
        {leftOpen && (
          <aside className="w-60 bg-background text-foreground border-r border-border flex flex-col min-h-0">
            <div className="flex items-center justify-between px-3 pt-3 pb-2">
              <span className="text-label text-muted-foreground">documents</span>
              <span
                className="text-label text-muted-foreground tabular"
                data-tabular
              >
                {String(files.length).padStart(2, "0")}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <DocSidebar
                files={files}
                activeId={activeId}
                loading={loadingDocs}
                onSelect={handleSelect}
                onUpload={handleUpload}
                onCreateBlank={handleCreateBlank}
                onDuplicate={handleDuplicate}
                onRename={handleRename}
                onDelete={handleDelete}
                onToggleCollapse={handleToggleCollapse}
              />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileChosen(f);
                if (e.target) e.target.value = "";
              }}
            />
          </aside>
        )}

        <main className="flex-1 min-w-0 flex flex-col bg-background">
          {activeFile ? (
            <div className="flex-1 min-h-0">
              <CenterTabs
                tab={centerTab}
                onTabChange={setCenterTab}
                markdown={markdown}
                onMarkdownChange={store.setMarkdown}
                theme={resumeTheme}
                template={template}
                onEnsureAiFork={ensureAiFork}
                onOpenAiTab={openAiTab}
              />
            </div>
          ) : (
            <EmptyState
              loading={loadingDocs}
              onCreate={handleCreateBlank}
              onUpload={handleUpload}
              onImportBackup={handleImportBackup}
            />
          )}
        </main>

        {rightOpen && activeFile && (
          <aside className="w-[360px] bg-background border-l border-border flex flex-col min-h-0">
            <Tabs
              value={rightTab}
              onValueChange={(v) => setInspectorTab(v as RightTab)}
              className="flex-1 min-h-0 flex flex-col"
            >
              <div className="flex items-center px-3 h-11 border-b border-border">
                <TabsList variant="pill" className="w-full">
                  <TabsTab value="design" variant="pill">
                    design
                  </TabsTab>
                  <TabsTab value="ai" variant="pill">
                    ai
                  </TabsTab>
                  <TabsTab value="job" variant="pill">
                    job
                  </TabsTab>
                </TabsList>
              </div>
              <TabsPanel
                value="design"
                className="flex-1 min-h-0 flex flex-col data-[hidden]:hidden animate-panel-in"
              >
                <DocEditorPanel mode={centerTab} />
              </TabsPanel>
              <TabsPanel
                value="ai"
                className="flex-1 min-h-0 flex flex-col data-[hidden]:hidden animate-panel-in"
              >
                <AiPanel
                  markdown={markdown}
                  activeFile={activeFile}
                  jobDescription={jobDescription}
                  onEnsureVariant={ensureVariantForJob}
                  onEnsureAiFork={ensureAiFork}
                />
              </TabsPanel>
              <TabsPanel
                value="job"
                className="flex-1 min-h-0 flex flex-col data-[hidden]:hidden animate-panel-in"
              >
                <JobPanel
                  activeFile={activeFile}
                  jobDescription={jobDescription ?? ""}
                  analysis={fitAnalysis}
                  analysisLoading={fitLoading}
                  analysisError={fitError}
                  analysisStale={
                    !!fitAnalysis &&
                    (!fitAnalysisKey ||
                      fitAnalysisKey.docId !== activeFile.id ||
                      fitAnalysisKey.jobKey !== (activeFile.jobKey ?? null) ||
                      fitAnalysisKey.markdownHash !== markdownHash(markdown))
                  }
                  urlFetchLoading={urlFetchLoading}
                  urlFetchError={urlFetchError}
                  summaryLoading={summaryLoading}
                  suggestionStatus={suggestionStatus}
                  onJobChange={handleJobChange}
                  onFetchUrl={handleFetchJobUrl}
                  onAnalyze={handleAnalyzeJob}
                  onTailor={handleTailorJob}
                  onAcceptSuggestion={handleAcceptSuggestion}
                  onRejectSuggestion={handleRejectSuggestion}
                  onClearAnalysis={handleClearAnalysis}
                />
              </TabsPanel>
            </Tabs>
          </aside>
        )}
      </div>
      {activeFile && (
        <TemplatePicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          value={template}
          onSelect={(id) => store.setTemplate(id)}
        />
      )}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        files={files}
        activeId={activeId}
        onSelectDoc={handleSelect}
        onPrefillAi={(prompt) => {
          setInspectorTab("ai");
          store.setAiWorkflowMode("idle");
          store.setAiPrefill(prompt);
        }}
        onToggleTheme={() =>
          setTheme((t) => (t === "dark" ? "light" : "dark"))
        }
        onNewBlank={handleCreateBlank}
        onUpload={handleUpload}
        onDownload={handleDownload}
        theme={theme}
      />
      <ShortcutSheet open={shortcutOpen} onOpenChange={setShortcutOpen} />
    </div>
  );
}

function BrandMark() {
  return (
    <span
      aria-hidden
      className="size-5 rounded-sm bg-foreground text-background inline-flex items-center justify-center font-mono text-[11px] font-bold tracking-[0.04em] select-none"
    >
      R
    </span>
  );
}

function SaveIndicator({
  state,
  secondsAgo,
}: {
  state: SaveState;
  secondsAgo: number | null;
}) {
  const label =
    state === "saving"
      ? "saving…"
      : state === "saved"
        ? secondsAgo === null || secondsAgo < 1
          ? "saved just now"
          : `saved ${secondsAgo}s ago`
        : "draft";

  return (
    <div className="flex items-center gap-1.5 pl-1">
      <span className="relative inline-flex size-1.5 shrink-0" aria-hidden>
        <span
          className={cn(
            "absolute inset-0 rounded-full",
            state === "saving"
              ? "bg-brand"
              : state === "saved"
                ? "bg-emerald-500 dark:bg-emerald-400"
                : "bg-muted-foreground/50"
          )}
        />
        {state === "saved" && (
          <span
            className={cn(
              "absolute inset-0 rounded-full bg-emerald-400 animate-save-pulse"
            )}
          />
        )}
      </span>
      <span
        className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground tabular"
        data-tabular
      >
        {label}
      </span>
    </div>
  );
}

function EmptyState({
  loading,
  onCreate,
  onUpload,
  onImportBackup,
}: {
  loading: boolean;
  onCreate: () => void;
  onUpload: () => void;
  onImportBackup: () => void;
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-background">
      <div className="max-w-[480px] w-full flex flex-col gap-6">
        <div className="flex items-baseline gap-3 select-none">
          <span
            className="text-display-lg text-foreground tabular"
            data-tabular
          >
            00
          </span>
          <span className="text-label text-muted-foreground">
            / no resume open
          </span>
        </div>
        <h1 className="text-heading text-foreground font-semibold max-w-[32ch]">
          start blank, import a pdf, or let ai draft one from a role title.
        </h1>
        <p className="text-sm text-muted-foreground max-w-[52ch] text-pretty leading-relaxed">
          local-first. your data lives in this browser. bring your own api key
          for ai assistance — anthropic, openai, gemini, grok, or openrouter.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button size="sm" onClick={onCreate} disabled={loading}>
            <Plus weight="light" className="size-3.5" />
            start blank
          </Button>
          <Button size="sm" variant="outline" onClick={onUpload} disabled={loading}>
            <UploadSimple weight="light" className="size-3.5" />
            import pdf
          </Button>
          <Button size="sm" variant="ghost" disabled className="opacity-50">
            <Sparkle weight="light" className="size-3.5" />
            draft with ai
            <Badge variant="outline" size="sm" className="ml-1 uppercase tracking-wider">
              soon
            </Badge>
          </Button>
        </div>
        <div className="pt-4 border-t border-border flex flex-col gap-3">
          <Button size="sm" variant="outline" onClick={onImportBackup} disabled={loading}>
            <DownloadSimple weight="light" className="size-3.5" />
            import backup (.json)
          </Button>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <FileText weight="light" className="size-3.5" />
            <span>press <Kbd>?</Kbd> for keyboard shortcuts</span>
          </div>
        </div>
      </div>
    </div>
  );
}
