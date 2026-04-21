import { NextResponse } from "next/server";
import { loadAll, upsert, upsertMany, remove } from "@/lib/server-storage";

export async function GET() {
  try {
    return NextResponse.json(loadAll());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Bulk import: array of docs
    if (Array.isArray(body)) {
      upsertMany(body);
      return NextResponse.json({ ok: true, count: body.length });
    }

    // Single upsert
    upsert(body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "missing id" }, { status: 400 });
    }
    remove(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
