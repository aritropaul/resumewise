// Storage abstraction — dual backend.
// Local dev: better-sqlite3 at ~/.resumewise/resumewise.db
// Production: Cloudflare D1 via HTTP API (works from Vercel or anywhere)
//
// All methods are async. The sqlite backend wraps sync calls in promises
// so the interface is uniform.

export interface DocRow {
  id: string;
  name: string;
  date: string;
  markdown: string;
  theme: string;
  template: string;
  parentId: string | null;
  sourceId: string | null;
  baseId: string | null;
  jobDescription: string | null;
  jobKey: string | null;
  jobTitle: string | null;
  company: string | null;
  jobSourceUrl: string | null;
  jobSource: string | null;
  jobSummary: string | null;
  collapsed: number;
  documentType: string | null;
}

export interface SavedDoc {
  id: string;
  name: string;
  date: string;
  markdown: string;
  theme: Record<string, unknown>;
  template: string;
  parentId?: string | null;
  sourceId?: string | null;
  baseId?: string | null;
  jobDescription?: string | null;
  jobKey?: string | null;
  jobTitle?: string | null;
  company?: string | null;
  jobSourceUrl?: string | null;
  jobSource?: string | null;
  jobSummary?: unknown;
  collapsed?: boolean;
  documentType?: string | null;
}

// ---------- shared helpers ----------

function rowToDoc(row: DocRow): SavedDoc {
  return {
    id: row.id,
    name: row.name,
    date: row.date,
    markdown: row.markdown,
    theme: JSON.parse(row.theme),
    template: row.template,
    parentId: row.parentId || null,
    sourceId: row.sourceId || null,
    baseId: row.baseId || null,
    jobDescription: row.jobDescription || null,
    jobKey: row.jobKey || null,
    jobTitle: row.jobTitle || null,
    company: row.company || null,
    jobSourceUrl: row.jobSourceUrl || null,
    jobSource: row.jobSource || null,
    jobSummary: row.jobSummary ? JSON.parse(row.jobSummary) : null,
    collapsed: !!row.collapsed,
    documentType: row.documentType || "resume",
  };
}

function docToParams(doc: Record<string, unknown>, userId: string) {
  return {
    id: doc.id as string,
    user_id: userId,
    name: doc.name as string,
    date: doc.date as string,
    markdown: (doc.markdown as string) || "",
    theme: JSON.stringify(doc.theme || {}),
    template: (doc.template as string) || "classic",
    parentId: (doc.parentId as string) || null,
    sourceId: (doc.sourceId as string) || null,
    baseId: (doc.baseId as string) || null,
    jobDescription: (doc.jobDescription as string) || null,
    jobKey: (doc.jobKey as string) || null,
    jobTitle: (doc.jobTitle as string) || null,
    company: (doc.company as string) || null,
    jobSourceUrl: (doc.jobSourceUrl as string) || null,
    jobSource: (doc.jobSource as string) || null,
    jobSummary: doc.jobSummary ? JSON.stringify(doc.jobSummary) : null,
    collapsed: doc.collapsed ? 1 : 0,
    documentType: (doc.documentType as string) || "resume",
  };
}

const UPSERT_SQL = `
  INSERT INTO documents (id, user_id, name, date, markdown, theme, template, parentId, sourceId, baseId, jobDescription, jobKey, jobTitle, company, jobSourceUrl, jobSource, jobSummary, collapsed, documentType)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name=excluded.name, date=excluded.date, markdown=excluded.markdown,
    theme=excluded.theme, template=excluded.template, parentId=excluded.parentId,
    sourceId=excluded.sourceId, baseId=excluded.baseId,
    jobDescription=excluded.jobDescription, jobKey=excluded.jobKey,
    jobTitle=excluded.jobTitle, company=excluded.company,
    jobSourceUrl=excluded.jobSourceUrl, jobSource=excluded.jobSource,
    jobSummary=excluded.jobSummary, collapsed=excluded.collapsed,
    documentType=excluded.documentType`;

function paramValues(p: ReturnType<typeof docToParams>) {
  return [
    p.id, p.user_id, p.name, p.date, p.markdown, p.theme, p.template,
    p.parentId, p.sourceId, p.baseId, p.jobDescription, p.jobKey,
    p.jobTitle, p.company, p.jobSourceUrl, p.jobSource, p.jobSummary,
    p.collapsed, p.documentType,
  ];
}

// ---------- interface ----------

export interface StorageBackend {
  loadAll(userId: string): Promise<SavedDoc[]>;
  upsert(userId: string, doc: Record<string, unknown>): Promise<void>;
  upsertMany(userId: string, docs: Record<string, unknown>[]): Promise<void>;
  remove(userId: string, id: string): Promise<void>;
}

// ---------- better-sqlite3 backend (local dev) ----------

let _sqliteBackend: StorageBackend | null = null;

function getSqliteBackend(): StorageBackend {
  if (_sqliteBackend) return _sqliteBackend;

  // Dynamic import to avoid loading native module on Cloudflare
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  const path = require("node:path");
  const os = require("node:os");
  const fs = require("node:fs");

  const DATA_DIR = path.join(os.homedir(), ".resumewise");
  const DB_PATH = path.join(DATA_DIR, "resumewise.db");

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Local dev schema — no user_id column (single user).
  // Also create the user_id version for forward compat.
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'local',
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      markdown TEXT NOT NULL DEFAULT '',
      theme TEXT NOT NULL DEFAULT '{}',
      template TEXT NOT NULL DEFAULT 'classic',
      parentId TEXT,
      sourceId TEXT,
      baseId TEXT,
      jobDescription TEXT,
      jobKey TEXT,
      jobTitle TEXT,
      company TEXT,
      jobSourceUrl TEXT,
      jobSource TEXT,
      jobSummary TEXT,
      collapsed INTEGER DEFAULT 0,
      documentType TEXT DEFAULT 'resume'
    )
  `);

  // Add user_id column if migrating from old schema
  try {
    db.exec("ALTER TABLE documents ADD COLUMN user_id TEXT NOT NULL DEFAULT 'local'");
  } catch {
    // Column already exists — fine
  }

  _sqliteBackend = {
    async loadAll(userId: string) {
      const rows = db
        .prepare("SELECT * FROM documents WHERE user_id = ?")
        .all(userId) as DocRow[];
      return rows.map(rowToDoc);
    },
    async upsert(userId: string, doc: Record<string, unknown>) {
      const p = docToParams(doc, userId);
      db.prepare(UPSERT_SQL).run(...paramValues(p));
    },
    async upsertMany(userId: string, docs: Record<string, unknown>[]) {
      const tx = db.transaction(() => {
        for (const doc of docs) {
          const p = docToParams(doc, userId);
          db.prepare(UPSERT_SQL).run(...paramValues(p));
        }
      });
      tx();
    },
    async remove(userId: string, id: string) {
      db.prepare("DELETE FROM documents WHERE id = ? AND user_id = ?").run(id, userId);
    },
  };

  return _sqliteBackend;
}

// ---------- D1 HTTP API backend (production — works from Vercel) ----------

interface D1Response {
  result: Array<{ results: DocRow[] }>;
  success: boolean;
  errors: Array<{ message: string }>;
}

function getD1Config() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !databaseId || !apiToken) return null;
  return { accountId, databaseId, apiToken };
}

async function d1Query(
  config: { accountId: string; databaseId: string; apiToken: string },
  sql: string,
  params: unknown[] = []
): Promise<DocRow[]> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });
  const data = (await res.json()) as D1Response;
  if (!data.success) {
    throw new Error(data.errors?.[0]?.message || "D1 query failed");
  }
  return data.result?.[0]?.results ?? [];
}

async function d1Exec(
  config: { accountId: string; databaseId: string; apiToken: string },
  sql: string,
  params: unknown[] = []
): Promise<void> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });
  const data = (await res.json()) as D1Response;
  if (!data.success) {
    throw new Error(data.errors?.[0]?.message || "D1 exec failed");
  }
}

function getD1HttpBackend(config: {
  accountId: string;
  databaseId: string;
  apiToken: string;
}): StorageBackend {
  return {
    async loadAll(userId: string) {
      const rows = await d1Query(
        config,
        "SELECT * FROM documents WHERE user_id = ?",
        [userId]
      );
      return rows.map(rowToDoc);
    },
    async upsert(userId: string, doc: Record<string, unknown>) {
      const p = docToParams(doc, userId);
      await d1Exec(config, UPSERT_SQL, paramValues(p));
    },
    async upsertMany(userId: string, docs: Record<string, unknown>[]) {
      for (const doc of docs) {
        const p = docToParams(doc, userId);
        await d1Exec(config, UPSERT_SQL, paramValues(p));
      }
    },
    async remove(userId: string, id: string) {
      await d1Exec(
        config,
        "DELETE FROM documents WHERE id = ? AND user_id = ?",
        [id, userId]
      );
    },
  };
}

// ---------- backend resolution ----------

export async function getStorage(): Promise<StorageBackend> {
  // Production: D1 HTTP API (works from Vercel)
  const d1Config = getD1Config();
  if (d1Config) {
    return getD1HttpBackend(d1Config);
  }

  // Local dev: better-sqlite3
  return getSqliteBackend();
}
