// BYOK key storage — encrypted API keys in sqlite/D1.

import { encryptApiKey, decryptApiKey } from "./crypto";

export interface KeyMeta {
  provider: string;
  keyPrefix: string;
  createdAt: string;
}

interface KeyRow {
  id: string;
  user_id: string;
  provider: string;
  encrypted_key: string;
  iv: string;
  key_prefix: string;
  created_at: string;
  updated_at: string;
}

function getMasterKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error("ENCRYPTION_KEY not set or too short");
  }
  return key;
}

function keyPrefix(key: string): string {
  return key.slice(0, 8) + "***";
}

// ---------- Dual-backend operations ----------

export interface KeyStorageBackend {
  save(userId: string, provider: string, plaintextKey: string): Promise<void>;
  get(userId: string, provider: string): Promise<string | null>;
  listMeta(userId: string): Promise<KeyMeta[]>;
  remove(userId: string, provider: string): Promise<void>;
}

// -- SQLite backend (local dev) --

let _sqliteBackend: KeyStorageBackend | null = null;

function getSqliteKeyBackend(): KeyStorageBackend {
  if (_sqliteBackend) return _sqliteBackend;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  const path = require("node:path");
  const os = require("node:os");
  const fs = require("node:fs");

  const DATA_DIR = path.join(os.homedir(), ".resumewise");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "resumewise.db"));

  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      iv TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, provider)
    )
  `);

  _sqliteBackend = {
    async save(userId, provider, plaintextKey) {
      const master = getMasterKey();
      const { ciphertext, iv } = await encryptApiKey(plaintextKey, master);
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO api_keys (id, user_id, provider, encrypted_key, iv, key_prefix)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, provider) DO UPDATE SET
          encrypted_key=excluded.encrypted_key, iv=excluded.iv,
          key_prefix=excluded.key_prefix, updated_at=datetime('now')
      `).run(id, userId, provider, ciphertext, iv, keyPrefix(plaintextKey));
    },

    async get(userId, provider) {
      const row = db
        .prepare("SELECT encrypted_key, iv FROM api_keys WHERE user_id = ? AND provider = ?")
        .get(userId, provider) as { encrypted_key: string; iv: string } | undefined;
      if (!row) return null;
      return decryptApiKey(row.encrypted_key, row.iv, getMasterKey());
    },

    async listMeta(userId) {
      const rows = db
        .prepare("SELECT provider, key_prefix, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at")
        .all(userId) as { provider: string; key_prefix: string; created_at: string }[];
      return rows.map((r) => ({
        provider: r.provider,
        keyPrefix: r.key_prefix,
        createdAt: r.created_at,
      }));
    },

    async remove(userId, provider) {
      db.prepare("DELETE FROM api_keys WHERE user_id = ? AND provider = ?").run(userId, provider);
    },
  };

  return _sqliteBackend;
}

// -- D1 backend (Cloudflare) --

function getD1KeyBackend(d1: D1Database): KeyStorageBackend {
  return {
    async save(userId, provider, plaintextKey) {
      const master = getMasterKey();
      const { ciphertext, iv } = await encryptApiKey(plaintextKey, master);
      const id = crypto.randomUUID();
      await d1.prepare(`
        INSERT INTO api_keys (id, user_id, provider, encrypted_key, iv, key_prefix)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, provider) DO UPDATE SET
          encrypted_key=excluded.encrypted_key, iv=excluded.iv,
          key_prefix=excluded.key_prefix, updated_at=datetime('now')
      `).bind(id, userId, provider, ciphertext, iv, keyPrefix(plaintextKey)).run();
    },

    async get(userId, provider) {
      const row = await d1
        .prepare("SELECT encrypted_key, iv FROM api_keys WHERE user_id = ? AND provider = ?")
        .bind(userId, provider)
        .first<{ encrypted_key: string; iv: string }>();
      if (!row) return null;
      return decryptApiKey(row.encrypted_key, row.iv, getMasterKey());
    },

    async listMeta(userId) {
      const { results } = await d1
        .prepare("SELECT provider, key_prefix, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at")
        .bind(userId)
        .all<{ provider: string; key_prefix: string; created_at: string }>();
      return (results ?? []).map((r) => ({
        provider: r.provider,
        keyPrefix: r.key_prefix,
        createdAt: r.created_at,
      }));
    },

    async remove(userId, provider) {
      await d1
        .prepare("DELETE FROM api_keys WHERE user_id = ? AND provider = ?")
        .bind(userId, provider)
        .run();
    },
  };
}

// ---------- Backend resolution ----------

export async function getKeyStorage(): Promise<KeyStorageBackend> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext();
    if (env?.DB) {
      return getD1KeyBackend(env.DB as D1Database);
    }
  } catch {
    // Not on Cloudflare
  }
  return getSqliteKeyBackend();
}
