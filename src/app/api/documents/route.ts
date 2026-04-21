import { NextResponse } from "next/server";
import { getStorage } from "@/lib/server-storage";

// Until auth lands (Phase 3), all local dev uses "local" as userId.
const USER_ID = "local";

export async function GET() {
  try {
    const storage = await getStorage();
    return NextResponse.json(await storage.loadAll(USER_ID));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const storage = await getStorage();
    const body = await req.json() as Record<string, unknown> | Record<string, unknown>[];

    if (Array.isArray(body)) {
      await storage.upsertMany(USER_ID, body);
      return NextResponse.json({ ok: true, count: body.length });
    }

    await storage.upsert(USER_ID, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const storage = await getStorage();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "missing id" }, { status: 400 });
    }
    await storage.remove(USER_ID, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
