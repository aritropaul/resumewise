// Better Auth server instance. Dual backend:
// Production (Vercel): D1 via HTTP API — no native modules
// Local dev: better-sqlite3 — only loaded when D1 env vars absent

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { createD1HttpDatabase } from "./d1-http";

function getDatabase(): unknown {
  // Production: D1 HTTP API (no native modules needed)
  const d1 = createD1HttpDatabase();
  if (d1) return d1;

  // Local dev: better-sqlite3 (dynamic require to avoid bundling on Vercel)
  try {
    // Dynamic require hidden from bundler to prevent Vercel from
    // trying to resolve the native module when D1 is available
    // eslint-disable-next-line @typescript-eslint/no-require-imports, no-eval
    const _require = eval("require");
    const Database = _require("better-sqlite3");
    const path = _require("node:path");
    const os = _require("node:os");
    const fs = _require("node:fs");

    const DATA_DIR = path.join(os.homedir(), ".resumewise");
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const DB_PATH = path.join(DATA_DIR, "resumewise.db");

    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    db.exec(`
      CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT,
        image TEXT,
        emailVerified INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS session (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        expiresAt TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        ipAddress TEXT,
        userAgent TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS account (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        accountId TEXT NOT NULL,
        providerId TEXT NOT NULL,
        accessToken TEXT,
        refreshToken TEXT,
        accessTokenExpiresAt TEXT,
        refreshTokenExpiresAt TEXT,
        scope TEXT,
        idToken TEXT,
        password TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS verification (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    return db;
  } catch {
    throw new Error("No database available: set CLOUDFLARE_* env vars or install better-sqlite3");
  }
}

export const auth = betterAuth({
  database: getDatabase(),
  trustedOrigins: [
    process.env.BETTER_AUTH_URL || "http://localhost:3000",
  ],
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
  },
  plugins: [nextCookies()],
});
