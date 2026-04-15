import { defaultTheme, type ResumeTheme } from "./resume-theme";
import { SAMPLE_MARKDOWN } from "./resume-md";

export interface JobSummary {
  summary: string;
  responsibilities: string[];
  requirements: string[];
  niceToHave: string[];
  compensation: string | null;
}

const DB_NAME = "resumewise";
// v4: markdown-canonical redesign. Content now lives in a single markdown
// string per document; the legacy `resume: Resume` shape is dropped.
const DB_VERSION = 4;
const STORE_NAME = "documents";
const LEGACY_FLAG_KEY = "rw-legacy-cleared-v4";

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

let droppedLegacyCount = 0;

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

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
        return;
      }
      // v<4: markdown redesign. Drop everything; user re-imports.
      if (event.oldVersion < 4) {
        const tx = req.transaction!;
        const store = tx.objectStore(STORE_NAME);
        const count = store.count();
        count.onsuccess = () => {
          droppedLegacyCount = count.result || 0;
          store.clear();
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadAllDocuments(): Promise<SavedDocument[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const all = (req.result || []) as unknown[];
      const v4 = all.filter((d): d is SavedDocument =>
        !!d && typeof d === "object" && "markdown" in d && "id" in d
      );
      resolve(v4);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveDocument(doc: SavedDocument): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(doc);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

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

// Returns the count of legacy docs cleared during the v3→v4 upgrade. Read once
// on app boot; the UI shows a toast if non-zero, then sets a flag so the toast
// doesn't re-fire.
export function consumeDroppedLegacyCount(): number {
  if (typeof window === "undefined") return 0;
  if (window.localStorage.getItem(LEGACY_FLAG_KEY) === "1") return 0;
  if (droppedLegacyCount > 0) {
    window.localStorage.setItem(LEGACY_FLAG_KEY, "1");
    return droppedLegacyCount;
  }
  return 0;
}
