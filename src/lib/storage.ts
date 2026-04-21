import { defaultTheme, type ResumeTheme } from "./resume-theme";
import { SAMPLE_MARKDOWN } from "./resume-md";

export interface JobSummary {
  summary: string;
  responsibilities: string[];
  requirements: string[];
  niceToHave: string[];
  compensation: string | null;
}

export interface SavedDocument {
  id: string;
  name: string;
  date: string;
  markdown: string;
  theme: ResumeTheme;
  template: string;
  parentId?: string | null;
  sourceId?: string | null;
  baseId?: string | null;
  jobDescription?: string | null;
  jobKey?: string | null;
  jobTitle?: string | null;
  company?: string | null;
  jobSourceUrl?: string | null;
  jobSource?: "greenhouse" | "ashby" | "paste" | null;
  jobSummary?: JobSummary | null;
  collapsed?: boolean;
  documentType?: "resume" | "cover_letter";
}

function stampedDate(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function getBaseDocumentId(doc: SavedDocument): string | null {
  return doc.baseId ?? doc.parentId ?? null;
}

export function isVariantDocument(doc: SavedDocument): boolean {
  return !!getBaseDocumentId(doc);
}

// ---------------------------------------------------------------------------
// Server-backed storage (SQLite via /api/documents)
// ---------------------------------------------------------------------------

export async function loadAllDocuments(): Promise<SavedDocument[]> {
  const res = await fetch("/api/documents");
  if (!res.ok) throw new Error("Failed to load documents");
  return res.json();
}

export async function saveDocument(doc: SavedDocument): Promise<void> {
  const res = await fetch("/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(doc),
  });
  if (!res.ok) throw new Error("Failed to save document");
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`/api/documents?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete document");
}

// IndexedDB migration removed — server storage handles persistence.

// ---------------------------------------------------------------------------
// Pure document factories (no storage calls)
// ---------------------------------------------------------------------------

export function duplicateDocument(
  doc: SavedDocument,
  newName: string,
  parentId?: string | null
): SavedDocument {
  const baseId = parentId ?? getBaseDocumentId(doc);
  return {
    ...doc,
    id: crypto.randomUUID(),
    name: newName,
    date: stampedDate(),
    parentId: parentId ?? null,
    sourceId: doc.id,
    baseId,
    jobDescription: doc.jobDescription ?? null,
    jobKey: doc.jobKey ?? null,
    jobTitle: doc.jobTitle ?? null,
    company: doc.company ?? null,
    jobSourceUrl: doc.jobSourceUrl ?? null,
    jobSource: doc.jobSource ?? null,
    jobSummary: doc.jobSummary ?? null,
    markdown: doc.markdown,
    theme: { ...doc.theme, palette: { ...doc.theme.palette } },
    template: doc.template,
    collapsed: undefined,
  };
}

export function createVariantDocument(
  doc: SavedDocument,
  newName: string,
  jobDescription?: string | null
): SavedDocument {
  const rootId = getBaseDocumentId(doc) ?? doc.id;
  return {
    ...duplicateDocument(doc, newName, rootId),
    parentId: rootId,
    baseId: rootId,
    sourceId: doc.id,
    jobDescription: jobDescription ?? doc.jobDescription ?? null,
    jobKey: doc.jobKey ?? null,
    jobTitle: doc.jobTitle ?? null,
    company: doc.company ?? null,
    jobSourceUrl: doc.jobSourceUrl ?? null,
    jobSource: doc.jobSource ?? null,
    jobSummary: doc.jobSummary ?? null,
  };
}

export function createBlankDocument(name: string): SavedDocument {
  return {
    id: crypto.randomUUID(),
    name,
    date: stampedDate(),
    markdown: `# ${name}\n`,
    theme: defaultTheme(),
    template: "classic",
    parentId: null,
    sourceId: null,
    baseId: null,
    jobDescription: null,
    jobKey: null,
    jobTitle: null,
    company: null,
    jobSourceUrl: null,
    jobSource: null,
    jobSummary: null,
  };
}

export function createSampleDocument(name: string): SavedDocument {
  return {
    ...createBlankDocument(name),
    markdown: SAMPLE_MARKDOWN,
  };
}

