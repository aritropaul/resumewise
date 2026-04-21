// Better Auth server instance. Dual backend: better-sqlite3 local, D1 production.

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

function getDatabase(): unknown {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  const path = require("node:path");
  const os = require("node:os");
  const fs = require("node:fs");

  const DATA_DIR = path.join(os.homedir(), ".resumewise");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const DB_PATH = path.join(DATA_DIR, "resumewise.db");

  return new Database(DB_PATH);
}

export const auth = betterAuth({
  database: getDatabase(),
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
