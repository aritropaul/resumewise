// Resolve API key for AI routes. Priority:
// 1. User's stored key for the requested provider (or default provider)
// 2. Fallback key from request body (backward compat, removed in future)
// 3. Server OPENAI_API_KEY env var

import { headers } from "next/headers";
import { auth } from "./auth";
import { getKeyStorage } from "./key-storage";
import { detectProvider, type ProviderClient, getProviderClient } from "./providers";

export async function resolveProviderClient(
  bodyKey?: string
): Promise<{ client: ProviderClient; userId: string | null } | { error: string; status: number }> {
  // Try to get authenticated user
  let userId: string | null = null;
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    userId = session?.user?.id ?? null;
  } catch {}

  // Try stored key from DB first
  if (userId) {
    try {
      const ks = await getKeyStorage();
      const meta = await ks.listMeta(userId);
      if (meta.length > 0) {
        // Use first available provider (prefer anthropic)
        const preferred = meta.find((m) => m.provider === "anthropic") || meta[0];
        const key = await ks.get(userId, preferred.provider);
        if (key) {
          return { client: getProviderClient(key), userId };
        }
      }
    } catch {
      // Fall through to other methods
    }
  }

  // Fallback: key from request body (backward compat)
  if (typeof bodyKey === "string" && bodyKey) {
    return { client: getProviderClient(bodyKey), userId };
  }

  // Fallback: server env var
  if (process.env.OPENAI_API_KEY) {
    return { client: getProviderClient(process.env.OPENAI_API_KEY), userId };
  }

  return { error: "No API key configured. Add one in Settings.", status: 401 };
}
