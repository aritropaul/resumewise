// GET /api/fonts?family=Inter&weights=400,500,600
//
// Returns TTF sources for a Google-licensed font family, sourced from the
// fontsource project (jsdelivr CDN) rather than Google Fonts CSS.
// Reason: Google Fonts CSS v1 returns Latin-subset TTFs that fontkit cannot
// always parse (JetBrains Mono and IBM Plex Mono in particular crash on
// `_getCBox` / `advanceWidth` lookups). Fontsource ships full per-subset TTFs
// that fontkit handles cleanly.
//
// Pipeline:
//   1. Fetch the fontsource manifest to learn which weights+styles exist.
//   2. Build TTF URLs at /fontsource/fonts/<id>@latest/latin-<weight>-<style>.ttf.
//   3. Return the (weight,style,src) list — client passes to Font.register.
//
// We always include normal for every requested weight, plus italic 400 if the
// font ships an italic axis. Subset is hard-coded to "latin" (sufficient for
// resume English text + most diacritics).

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FaceSource = {
  weight: number;
  style: "normal" | "italic";
  src: string;
};

interface FontsourceManifest {
  id: string;
  family: string;
  weights: number[];
  styles: ("normal" | "italic")[];
}

const CDN = "https://cdn.jsdelivr.net/fontsource/fonts";
const API = "https://api.fontsource.org/v1/fonts";

// Best-effort family→fontsource-id slug. Fontsource IDs are kebab-case lower
// of the canonical Google family name.
function familyToSlug(family: string): string {
  return family
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function fetchManifest(slug: string): Promise<FontsourceManifest | null> {
  const res = await fetch(`${API}/${slug}`, {
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;
  return (await res.json()) as FontsourceManifest;
}

function buildSources(
  slug: string,
  manifest: FontsourceManifest,
  requestedWeights: number[]
): FaceSource[] {
  const out: FaceSource[] = [];
  const available = new Set(manifest.weights);
  const hasItalic = manifest.styles.includes("italic");

  // Normal — pick closest available weight if requested isn't present.
  for (const w of requestedWeights) {
    const resolved = available.has(w) ? w : closest(w, manifest.weights);
    if (resolved == null) continue;
    out.push({
      weight: w,
      style: "normal",
      src: `${CDN}/${slug}@latest/latin-${resolved}-normal.ttf`,
    });
  }

  // Italic — only if font ships one. Always register 400-italic as the italic
  // base weight; richer italics (700-italic etc) are not requested here to
  // keep the registration list small.
  if (hasItalic && available.has(400)) {
    out.push({
      weight: 400,
      style: "italic",
      src: `${CDN}/${slug}@latest/latin-400-italic.ttf`,
    });
  }

  return out;
}

function closest(target: number, weights: number[]): number | null {
  if (!weights.length) return null;
  let best = weights[0];
  let bestDiff = Math.abs(target - best);
  for (const w of weights) {
    const d = Math.abs(target - w);
    if (d < bestDiff) {
      best = w;
      bestDiff = d;
    }
  }
  return best;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const family = searchParams.get("family")?.trim();
  const weightsParam = searchParams.get("weights");

  if (!family) {
    return NextResponse.json({ error: "missing family" }, { status: 400 });
  }

  const requestedWeights = weightsParam
    ? weightsParam
        .split(",")
        .map((w) => parseInt(w.trim(), 10))
        .filter((n) => Number.isFinite(n) && n >= 100 && n <= 900)
    : [400, 500, 600];

  const slug = familyToSlug(family);

  try {
    const manifest = await fetchManifest(slug);
    if (!manifest) {
      return NextResponse.json(
        { error: `fontsource has no font "${family}" (slug: ${slug})` },
        { status: 404 }
      );
    }

    const sources = buildSources(slug, manifest, requestedWeights);
    if (sources.length === 0) {
      return NextResponse.json(
        { error: `no faces resolved for "${family}"` },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { family, sources },
      { headers: { "Cache-Control": "public, max-age=86400" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "fetch failed" },
      { status: 502 }
    );
  }
}
