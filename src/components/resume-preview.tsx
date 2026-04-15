"use client";

import * as React from "react";
import {
  Minus,
  Plus,
  ArrowClockwise,
  CaretUp,
  CaretDown,
} from "@phosphor-icons/react";
import { pdf } from "@react-pdf/renderer";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import type { ResumeTheme } from "@/lib/resume-theme";
import { parseResumeMarkdown } from "@/lib/resume-md";
import { getTemplate, getTemplateFonts } from "@/lib/templates";
import { ensureFont } from "@/lib/templates/fonts";
import { IconButton } from "@/components/ui/icon-button";
import { ResumePageSkeleton } from "@/components/ui/skeleton";
import { useResumeStore, type PreviewStage } from "@/lib/resume-store";

if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
}

interface LoadedPreviewDoc {
  doc: PDFDocumentProxy;
  pageCount: number;
  basePageWidth: number;
  revision: number;
  key: string;
}

function defaultZoomForViewport(): number {
  if (typeof window === "undefined") return 1.2;
  const width = window.innerWidth;
  if (width >= 2560) return 1.6;
  if (width >= 1920) return 1.4;
  return 1.2;
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}


export function ResumePreview({
  markdown,
  theme,
  template,
}: {
  markdown: string;
  theme: ResumeTheme;
  template: string;
}) {
  const setPreviewState = useResumeStore((state) => state.setPreviewState);
  const previewPhase = useResumeStore((state) => state.previewPhase);
  const previewStage = useResumeStore((state) => state.previewStage);
  const previewError = useResumeStore((state) => state.previewError);
  const debouncedMd = useDebounced(markdown, 300);
  const debouncedTheme = useDebounced(theme, 300);
  const debouncedTemplate = useDebounced(template, 300);
  const themeFont = debouncedTheme.font;
  const renderDoc = React.useMemo(
    () => createTemplateDocument(debouncedTemplate, debouncedMd, debouncedTheme),
    [debouncedMd, debouncedTheme, debouncedTemplate]
  );

  const [displayedDoc, setDisplayedDoc] = React.useState<LoadedPreviewDoc | null>(null);
  const [stagedDoc, setStagedDoc] = React.useState<LoadedPreviewDoc | null>(null);
  const [activePage, setActivePage] = React.useState(1);
  const [firstLoaded, setFirstLoaded] = React.useState(false);
  const [userZoom, setUserZoom] = React.useState(() => defaultZoomForViewport());
  const userAdjustedZoomRef = React.useRef(false);

  const setUserZoomManual = React.useCallback(
    (next: number | ((prev: number) => number)) => {
      userAdjustedZoomRef.current = true;
      setUserZoom((prev) => (typeof next === "function" ? (next as (p: number) => number)(prev) : next));
    },
    []
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => {
      if (userAdjustedZoomRef.current) return;
      setUserZoom(defaultZoomForViewport());
    };
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  const renderRevisionRef = React.useRef(0);
  const displayedDocRef = React.useRef<LoadedPreviewDoc | null>(null);
  const stagedDocRef = React.useRef<LoadedPreviewDoc | null>(null);
  const paintedPagesRef = React.useRef(new Map<number, Set<number>>());
  const pageRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Preview renders at the user's zoom directly (1.0 = 100%). Container width
  // no longer auto-fits; the user can scroll if the page exceeds the viewport.
  const finalScale = userZoom;

  React.useEffect(() => {
    displayedDocRef.current = displayedDoc;
  }, [displayedDoc]);

  React.useEffect(() => {
    stagedDocRef.current = stagedDoc;
  }, [stagedDoc]);

  const failPreview = React.useCallback(
    (
      stage: PreviewStage,
      revision: number,
      message: string,
      staged: PDFDocumentProxy | null = null
    ) => {
      if (renderRevisionRef.current !== revision) return;
      if (staged) {
        void staged.destroy().catch(() => {});
      }
      setStagedDoc((current) => (current?.revision === revision ? null : current));
      setPreviewState({ phase: "error", stage, revision, error: message });
    },
    [setPreviewState]
  );

  const commitStagedDoc = React.useCallback(
    (revision: number) => {
      const nextDoc = stagedDocRef.current;
      if (!nextDoc || nextDoc.revision !== revision) return;

      const previousDoc = displayedDocRef.current;
      setDisplayedDoc(nextDoc);
      setStagedDoc(null);
      setFirstLoaded(true);
      setActivePage(1);
      setPreviewState({
        phase: "ready",
        stage: "page-paint",
        revision,
        error: null,
      });

      if (previousDoc && previousDoc.doc !== nextDoc.doc) {
        requestAnimationFrame(() => {
          void previousDoc.doc.destroy().catch(() => {});
        });
      }
    },
    [setPreviewState]
  );

  const handleStagedPagePaint = React.useCallback(
    (revision: number, pageNumber: number) => {
      const staged = stagedDocRef.current;
      if (!staged || staged.revision !== revision) return;

      const painted = paintedPagesRef.current.get(revision) ?? new Set<number>();
      painted.add(pageNumber);
      paintedPagesRef.current.set(revision, painted);

      if (painted.size >= staged.pageCount) {
        paintedPagesRef.current.delete(revision);
        commitStagedDoc(revision);
      }
    },
    [commitStagedDoc]
  );

  const handleStagedRenderError = React.useCallback(
    (revision: number, message: string) => {
      const staged = stagedDocRef.current;
      failPreview("page-paint", revision, message, staged?.doc ?? null);
    },
    [failPreview]
  );

  React.useEffect(() => {
    const revision = renderRevisionRef.current + 1;
    renderRevisionRef.current = revision;

    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;

    setPreviewState({
      phase: "rendering",
      stage: "font-preload",
      revision,
      error: null,
    });

    const declaredFonts = getTemplateFonts(debouncedTemplate);
    const extraFonts = themeFont && !declaredFonts.includes(themeFont) ? [themeFont] : [];
    const nodeFonts: string[] = [];
    if (debouncedTheme.nodes) {
      for (const ns of Object.values(debouncedTheme.nodes)) {
        const f = ns?.fontFamily;
        if (f && !declaredFonts.includes(f) && !extraFonts.includes(f) && !nodeFonts.includes(f)) {
          nodeFonts.push(f);
        }
      }
    }
    const requiredFonts = [...declaredFonts, ...extraFonts, ...nodeFonts];

    const run = async () => {
      try {
        await Promise.all(requiredFonts.map((family) => ensureFont(family)));
        if (cancelled || renderRevisionRef.current !== revision) return;

        setPreviewState({
          phase: "rendering",
          stage: "pdf-generation",
          revision,
          error: null,
        });
        const blob = await pdf(renderDoc).toBlob();
        if (cancelled || renderRevisionRef.current !== revision) return;

        setPreviewState({
          phase: "rendering",
          stage: "blob-decode",
          revision,
          error: null,
        });
        const buffer = new Uint8Array(await blob.arrayBuffer());
        if (cancelled || renderRevisionRef.current !== revision) return;

        // Guard: a truncated or empty blob crashes pdf.js with an opaque
        // "offset is outside the bounds of the DataView" error. Header of a
        // valid PDF is "%PDF-".
        if (
          buffer.length < 32 ||
          buffer[0] !== 0x25 ||
          buffer[1] !== 0x50 ||
          buffer[2] !== 0x44 ||
          buffer[3] !== 0x46
        ) {
          throw new Error("react-pdf produced an empty document");
        }

        loadingTask = pdfjsLib.getDocument({ data: buffer });
        const loadedDoc = await loadingTask.promise;
        if (cancelled || renderRevisionRef.current !== revision) {
          void loadedDoc.destroy().catch(() => {});
          return;
        }

        const firstPage = await loadedDoc.getPage(1);
        const viewport = firstPage.getViewport({ scale: 1 });
        if (cancelled || renderRevisionRef.current !== revision) {
          void loadedDoc.destroy().catch(() => {});
          return;
        }

        paintedPagesRef.current.delete(revision);
        setStagedDoc({
          doc: loadedDoc,
          pageCount: loadedDoc.numPages,
          basePageWidth: viewport.width,
          revision,
          key: loadedDoc.fingerprints?.[0] ?? `${revision}-${loadedDoc.numPages}`,
        });
        setPreviewState({
          phase: "rendering",
          stage: "page-paint",
          revision,
          error: null,
        });
      } catch (error) {
        if (cancelled) return;

        const stage = (() => {
          const currentStage = useResumeStore.getState().previewStage;
          if (currentStage === "font-preload") return "font-preload";
          if (currentStage === "blob-decode") return "blob-decode";
          return "pdf-generation";
        })();
        const message = stageMessage(stage, error);
        failPreview(stage, revision, message);
      }
    };

    void run();

    return () => {
      cancelled = true;
      loadingTask?.destroy();
    };
  }, [renderDoc, setPreviewState, debouncedTemplate, themeFont, failPreview, debouncedTheme.nodes]);

  React.useEffect(() => {
    const scroller = containerRef.current;
    if (!scroller || !displayedDoc) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

        if (visibleEntry) {
          const pageIndex = pageRefs.current.findIndex((node) => node === visibleEntry.target);
          if (pageIndex >= 0) setActivePage(pageIndex + 1);
        }
      },
      { root: scroller, threshold: [0.25, 0.5, 0.75] }
    );

    pageRefs.current.forEach((node) => {
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [displayedDoc]);

  React.useEffect(() => {
    return () => {
      if (displayedDocRef.current) {
        void displayedDocRef.current.doc.destroy().catch(() => {});
      }
      if (stagedDocRef.current) {
        void stagedDocRef.current.doc.destroy().catch(() => {});
      }
    };
  }, []);

  const scrollToPage = React.useCallback((pageNumber: number) => {
    const target = pageRefs.current[pageNumber - 1];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const showSkeleton = !firstLoaded && !displayedDoc && !previewError;

  return (
    <div className="relative h-full w-full bg-muted/40">
      {previewPhase === "rendering" && displayedDoc ? (
        <div className="absolute right-4 top-4 z-10 rounded-md border border-border bg-background/95 px-3 py-1.5 shadow-[var(--shadow-sm)] backdrop-blur-xl animate-in fade-in slide-in-from-bottom-1 duration-300">
          <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
            refreshing preview · {formatStage(previewStage)}
          </span>
        </div>
      ) : null}

      <div
        ref={containerRef}
        className="h-full w-full overflow-auto py-8 flex flex-col items-center gap-6"
      >
        {showSkeleton ? <ResumePageSkeleton /> : null}

        {previewPhase === "error" && !displayedDoc ? (
          <div className="flex flex-col items-center gap-2 px-8 py-16 text-center">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-destructive">
              {previewError ?? "preview failed"}
            </span>
            <span className="max-w-[40ch] text-xs text-muted-foreground">
              Failed during {formatStage(previewStage)}. Try another template or keep editing
              while the last good document is unavailable.
            </span>
          </div>
        ) : null}

        {displayedDoc
          ? Array.from({ length: displayedDoc.pageCount }, (_, index) => (
              <PdfPage
                key={`${displayedDoc.key}-${index + 1}`}
                pdfDoc={displayedDoc.doc}
                pageNumber={index + 1}
                scale={finalScale}
                registerRef={(node) => {
                  pageRefs.current[index] = node;
                }}
              />
            ))
          : null}
      </div>

      {stagedDoc ? (
        <div className="pointer-events-none absolute left-[-200vw] top-0 opacity-0">
          {Array.from({ length: stagedDoc.pageCount }, (_, index) => (
            <PdfPage
              key={`staged-${stagedDoc.key}-${index + 1}`}
              pdfDoc={stagedDoc.doc}
              pageNumber={index + 1}
              scale={1}
              registerRef={undefined}
              hidden
              onPainted={() => handleStagedPagePaint(stagedDoc.revision, index + 1)}
              onRenderError={(message) =>
                handleStagedRenderError(stagedDoc.revision, message)
              }
            />
          ))}
        </div>
      ) : null}

      {displayedDoc ? (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded-md bg-background/95 backdrop-blur-xl p-1 border border-border shadow-[var(--shadow-md)]">
          {displayedDoc.pageCount > 1 ? (
            <>
              <IconButton
                aria-label="previous page"
                onClick={() => scrollToPage(Math.max(1, activePage - 1))}
                size="xs"
              >
                <CaretUp weight="bold" />
              </IconButton>
              <span
                className="px-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground tabular"
                data-tabular
              >
                {String(activePage).padStart(2, "0")}
                <span className="opacity-50"> / </span>
                {String(displayedDoc.pageCount).padStart(2, "0")}
              </span>
              <IconButton
                aria-label="next page"
                onClick={() =>
                  scrollToPage(Math.min(displayedDoc.pageCount, activePage + 1))
                }
                size="xs"
              >
                <CaretDown weight="bold" />
              </IconButton>
              <div className="mx-0.5 h-4 w-px bg-border" />
            </>
          ) : null}

          <IconButton
            aria-label="zoom out"
            onClick={() => setUserZoomManual((zoom) => Math.max(0.5, +(zoom - 0.1).toFixed(2)))}
            size="xs"
          >
            <Minus weight="bold" />
          </IconButton>
          <button
            onClick={() => setUserZoomManual(defaultZoomForViewport())}
            className="px-2 h-6 text-[10px] font-mono uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground tabular"
            data-tabular
          >
            {Math.round(finalScale * 100)}%
          </button>
          <IconButton
            aria-label="zoom in"
            onClick={() => setUserZoomManual((zoom) => Math.min(2.5, +(zoom + 0.1).toFixed(2)))}
            size="xs"
          >
            <Plus weight="bold" />
          </IconButton>
          <div className="mx-0.5 h-4 w-px bg-border" />
          <IconButton
            aria-label="fit"
            onClick={() => {
              userAdjustedZoomRef.current = false;
              setUserZoom(defaultZoomForViewport());
            }}
            size="xs"
          >
            <ArrowClockwise weight="light" />
          </IconButton>
        </div>
      ) : null}
    </div>
  );
}

function PdfPage({
  pdfDoc,
  pageNumber,
  scale,
  registerRef,
  hidden = false,
  onPainted,
  onRenderError,
}: {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  registerRef?: (node: HTMLDivElement | null) => void;
  hidden?: boolean;
  onPainted?: () => void;
  onRenderError?: (message: string) => void;
}) {
  const visibleCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const [dims, setDims] = React.useState<{ w: number; h: number } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let renderTask: { promise: Promise<void>; cancel: () => void } | null = null;

    const render = async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const viewport = page.getViewport({ scale: scale * dpr });
        const cssWidth = viewport.width / dpr;
        const cssHeight = viewport.height / dpr;
        setDims({ w: cssWidth, h: cssHeight });

        const offscreen = document.createElement("canvas");
        offscreen.width = viewport.width;
        offscreen.height = viewport.height;
        const offscreenContext = offscreen.getContext("2d", { alpha: false });
        if (!offscreenContext) {
          throw new Error("page paint context unavailable");
        }

        offscreenContext.fillStyle = "#ffffff";
        offscreenContext.fillRect(0, 0, offscreen.width, offscreen.height);

        renderTask = page.render({
          canvas: offscreen,
          canvasContext: offscreenContext,
          viewport,
        });
        await renderTask.promise;
        if (cancelled) return;

        const visibleCanvas = visibleCanvasRef.current;
        if (!visibleCanvas) {
          throw new Error("visible canvas unavailable");
        }

        visibleCanvas.width = offscreen.width;
        visibleCanvas.height = offscreen.height;
        const visibleContext = visibleCanvas.getContext("2d", { alpha: false });
        if (!visibleContext) {
          throw new Error("page paint context unavailable");
        }

        visibleContext.drawImage(offscreen, 0, 0);
        onPainted?.();
      } catch (error) {
        if ((error as Error).name === "RenderingCancelledException" || cancelled) return;
        console.error("page render failed", error);
        onRenderError?.("preview page failed to paint");
      }
    };

    void render();

    return () => {
      cancelled = true;
      renderTask?.cancel?.();
    };
  }, [onPainted, onRenderError, pageNumber, pdfDoc, scale]);

  return (
    <div
      ref={registerRef}
      data-page={pageNumber}
      className={hidden ? "overflow-hidden" : "border border-border bg-white shadow-[var(--shadow-md)]"}
      style={{
        width: dims?.w ?? 612,
        height: dims?.h ?? 792,
      }}
    >
      <canvas
        ref={visibleCanvasRef}
        style={{
          width: dims?.w ?? "100%",
          height: dims?.h ?? "100%",
          display: "block",
        }}
      />
    </div>
  );
}

function formatStage(stage: PreviewStage): string {
  switch (stage) {
    case "font-preload":
      return "font preload";
    case "pdf-generation":
      return "pdf generation";
    case "blob-decode":
      return "blob decode";
    case "page-paint":
      return "page paint";
    default:
      return "idle";
  }
}

function stageMessage(stage: PreviewStage, error: unknown): string {
  const detail =
    error instanceof Error && error.message.trim().length > 0
      ? error.message.trim()
      : "unknown error";
  switch (stage) {
    case "font-preload":
      return `font preload failed: ${detail}`;
    case "blob-decode":
      return `pdf decode failed: ${detail}`;
    case "page-paint":
      return `page paint failed: ${detail}`;
    default:
      return `pdf generation failed: ${detail}`;
  }
}

function createTemplateDocument(
  templateId: string,
  markdown: string,
  theme: ResumeTheme
) {
  const TemplateComponent = getTemplate(templateId);
  const ast = parseResumeMarkdown(markdown);
  return <TemplateComponent ast={ast} theme={theme} />;
}
