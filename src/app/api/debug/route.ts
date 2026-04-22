import { NextResponse } from "next/server";
import { createD1HttpDatabase } from "@/lib/d1-http";

export async function GET() {
  try {
    const d1 = createD1HttpDatabase();
    if (!d1) return NextResponse.json({ error: "no D1 config" });

    // Test insert
    const id = crypto.randomUUID();
    await d1.prepare(
      "INSERT INTO user (id, email, name, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))"
    ).bind(id, `debug-${Date.now()}@test.com`, "Debug", 0).all();

    // Test read
    const result = await d1.prepare("SELECT * FROM user WHERE id = ?").bind(id).all();

    // Cleanup
    await d1.prepare("DELETE FROM user WHERE id = ?").bind(id).all();

    return NextResponse.json({ ok: true, inserted: result.results });
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    }, { status: 500 });
  }
}
