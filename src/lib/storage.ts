const DB_NAME = "resumewise";
const DB_VERSION = 1;
const STORE_NAME = "documents";

export interface SavedDocument {
  id: string;
  name: string;
  date: string;
  htmlContent: string;
  editorJson?: Record<string, unknown> | null; // ProseMirror JSON — preferred over htmlContent
  margins: { top: number; right: number; bottom: number; left: number };
  parentId?: string | null; // null/undefined = base resume, string = variant of that base
  collapsed?: boolean; // whether children are collapsed in sidebar
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
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
    req.onsuccess = () => resolve(req.result);
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
  return {
    ...doc,
    id: crypto.randomUUID(),
    name: newName,
    date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    parentId: parentId ?? null,
    editorJson: doc.editorJson ? JSON.parse(JSON.stringify(doc.editorJson)) : null,
    collapsed: undefined,
  };
}
