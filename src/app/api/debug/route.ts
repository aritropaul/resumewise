import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET() {
  try {
    // Test Better Auth signup directly
    const result = await auth.api.signUpEmail({
      body: {
        name: "Debug User",
        email: `debug-${Date.now()}@test.com`,
        password: "testpassword123",
      },
    });
    return NextResponse.json({ ok: true, user: result.user?.email });
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : String(e),
      name: e instanceof Error ? e.name : undefined,
      stack: e instanceof Error ? e.stack?.split("\n").slice(0, 5) : undefined,
    }, { status: 500 });
  }
}
