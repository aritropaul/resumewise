import { NextResponse } from "next/server";

let cached: string[] | null = null;

export async function GET() {
  if (cached) return NextResponse.json({ fonts: cached });

  try {
    const res = await fetch("https://fonts.google.com/metadata/fonts");
    const data = await res.json();
    const fonts = (data.familyMetadataList || []).map(
      (f: { family: string }) => f.family
    );
    cached = fonts;
    return NextResponse.json({ fonts });
  } catch {
    return NextResponse.json({ fonts: [] });
  }
}
