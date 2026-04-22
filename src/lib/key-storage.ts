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

// -- D1 HTTP API backend (production) --

interface D1Resp<T> {
  result: Array<{ results: T[] }>;
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

async function d1KeyQuery<T>(
  config: { accountId: string; databaseId: string; apiToken: string },
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });
  const data = (await res.json()) as D1Resp<T>;
  if (!data.success) throw new Error(data.errors?.[0]?.message || "D1 query failed");
  return data.result?.[0]?.results ?? [];
}

async function d1KeyExec(
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
  const data = (await res.json()) as D1Resp<unknown>;
  if (!data.success) throw new Error(data.errors?.[0]?.message || "D1 exec failed");
}

function getD1KeyHttpBackend(config: {
  accountId: string;
  databaseId: string;
  apiToken: string;
}): KeyStorageBackend {
  return {
    async save(userId, provider, plaintextKey) {
      const master = getMasterKey();
      const { ciphertext, iv } = await encryptApiKey(plaintextKey, master);
      const id = crypto.randomUUID();
      await d1KeyExec(config, `
        INSERT INTO api_keys (id, user_id, provider, encrypted_key, iv, key_prefix)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, provider) DO UPDATE SET
          encrypted_key=excluded.encrypted_key, iv=excluded.iv,
          key_prefix=excluded.key_prefix, updated_at=datetime('now')
      `, [id, userId, provider, ciphertext, iv, keyPrefix(plaintextKey)]);
    },

    async get(userId, provider) {
      const rows = await d1KeyQuery<{ encrypted_key: string; iv: string }>(
        config,
        "SELECT encrypted_key, iv FROM api_keys WHERE user_id = ? AND provider = ?",
        [userId, provider]
      );
      if (rows.length === 0) return null;
      return decryptApiKey(rows[0].encrypted_key, rows[0].iv, getMasterKey());
    },

    async listMeta(userId) {
      const rows = await d1KeyQuery<{ provider: string; key_prefix: string; created_at: string }>(
        config,
        "SELECT provider, key_prefix, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at",
        [userId]
      );
      return rows.map((r) => ({
        provider: r.provider,
        keyPrefix: r.key_prefix,
        createdAt: r.created_at,
      }));
    },

    async remove(userId, provider) {
      await d1KeyExec(
        config,
        "DELETE FROM api_keys WHERE user_id = ? AND provider = ?",
        [userId, provider]
      );
    },
  };
}

// ---------- Backend resolution ----------

export async function getKeyStorage(): Promise<KeyStorageBackend> {
  const d1Config = getD1Config();
  if (d1Config) return getD1KeyHttpBackend(d1Config);
  return getSqliteKeyBackend();
}
