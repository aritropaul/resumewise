import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getKeyStorage } from "@/lib/key-storage";
import { detectProvider } from "@/lib/providers";

async function getUserId(): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

// Env var → provider mapping for server-provided keys
const ENV_KEY_MAP: { env: string; provider: string; prefix: (v: string) => string }[] = [
  { env: "OPENAI_API_KEY", provider: "openai", prefix: (v) => v.slice(0, 5) + "..." },
  { env: "ANTHROPIC_API_KEY", provider: "anthropic", prefix: (v) => v.slice(0, 7) + "..." },
];

// GET /api/keys — list key metadata (no plaintext)
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ks = await getKeyStorage();
  const meta = await ks.listMeta(userId);

  // Include server env-var keys so settings page reflects them
  const dbProviders = new Set(meta.map((m) => m.provider));
  for (const e of ENV_KEY_MAP) {
    const val = process.env[e.env];
    if (val && !dbProviders.has(e.provider)) {
      meta.push({
        provider: e.provider,
        keyPrefix: e.prefix(val),
        createdAt: "",
        source: "env",
      } as typeof meta[number] & { source: string });
    }
  }

  return NextResponse.json(meta);
}

// POST /api/keys — save a key { provider?, key }
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { key?: string; provider?: string };
  const key = body.key;
  if (!key || typeof key !== "string" || key.length < 8) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 400 });
  }

  const provider = body.provider || detectProvider(key);
  const ks = await getKeyStorage();
  await ks.save(userId, provider, key);

  return NextResponse.json({ ok: true, provider });
}

// DELETE /api/keys?provider=openai — remove a key
export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const provider = searchParams.get("provider");
  if (!provider) {
    return NextResponse.json({ error: "provider required" }, { status: 400 });
  }

  const ks = await getKeyStorage();
  await ks.remove(userId, provider);
  return NextResponse.json({ ok: true });
}
