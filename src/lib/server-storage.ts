import Database from "better-sqlite3";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const DATA_DIR = path.join(os.homedir(), ".resumewise");
const DB_PATH = path.join(DATA_DIR, "resumewise.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;

  fs.mkdirSync(DATA_DIR, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
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

  return _db;
}

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

function rowToDoc(row: DocRow) {
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

export function loadAll() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM documents").all() as DocRow[];
  return rows.map(rowToDoc);
}

export function upsert(doc: Record<string, unknown>) {
  const db = getDb();
  db.prepare(`
    INSERT INTO documents (id, name, date, markdown, theme, template, parentId, sourceId, baseId, jobDescription, jobKey, jobTitle, company, jobSourceUrl, jobSource, jobSummary, collapsed, documentType)
    VALUES (@id, @name, @date, @markdown, @theme, @template, @parentId, @sourceId, @baseId, @jobDescription, @jobKey, @jobTitle, @company, @jobSourceUrl, @jobSource, @jobSummary, @collapsed, @documentType)
    ON CONFLICT(id) DO UPDATE SET
      name=@name, date=@date, markdown=@markdown, theme=@theme, template=@template,
      parentId=@parentId, sourceId=@sourceId, baseId=@baseId,
      jobDescription=@jobDescription, jobKey=@jobKey, jobTitle=@jobTitle,
      company=@company, jobSourceUrl=@jobSourceUrl, jobSource=@jobSource,
      jobSummary=@jobSummary, collapsed=@collapsed, documentType=@documentType
  `).run({
    id: doc.id,
    name: doc.name,
    date: doc.date,
    markdown: doc.markdown || "",
    theme: JSON.stringify(doc.theme || {}),
    template: doc.template || "classic",
    parentId: doc.parentId || null,
    sourceId: doc.sourceId || null,
    baseId: doc.baseId || null,
    jobDescription: doc.jobDescription || null,
    jobKey: doc.jobKey || null,
    jobTitle: doc.jobTitle || null,
    company: doc.company || null,
    jobSourceUrl: doc.jobSourceUrl || null,
    jobSource: doc.jobSource || null,
    jobSummary: doc.jobSummary ? JSON.stringify(doc.jobSummary) : null,
    collapsed: doc.collapsed ? 1 : 0,
    documentType: doc.documentType || "resume",
  });
}

export function upsertMany(docs: Record<string, unknown>[]) {
  const db = getDb();
  const tx = db.transaction(() => {
    for (const doc of docs) upsert(doc);
  });
  tx();
}

export function remove(id: string) {
  const db = getDb();
  db.prepare("DELETE FROM documents WHERE id = ?").run(id);
}
