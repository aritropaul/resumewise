// Google Fonts loader for @react-pdf/renderer.
//
// Templates declare a `fonts: string[]` list of Google Font family names.
// resume-preview.tsx awaits ensureFont(family) for each before mounting the
// PDF viewer. The loader hits `/api/fonts` (server-side CSS parse + UA spoof)
// and forwards the discovered URLs to Font.register.
//
// Memoized: each family is registered at most once per page lifecycle.
// Failures are logged and fall back to Helvetica — templates never crash.

import { Font } from "@react-pdf/renderer";

type FaceSource = {
  weight: number;
  style: "normal" | "italic";
  src: string;
};

const DEFAULT_WEIGHTS = [400, 500, 600];

// family -> promise that resolves to the resolved family name (or fallback)
const registry = new Map<string, Promise<string>>();

// Families react-pdf ships with; no network fetch needed.
const BUILTINS = new Set(["Helvetica", "Times-Roman", "Courier"]);

async function fetchFontSources(
  family: string,
  weights: number[],
): Promise<FaceSource[]> {
  const url = `/api/fonts?family=${encodeURIComponent(family)}&weights=${weights.join(",")}&v=2`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`font route ${res.status}: ${body.slice(0, 120)}`);
  }
  const json = (await res.json()) as { sources?: FaceSource[]; error?: string };
  if (!json.sources || json.sources.length === 0) {
    throw new Error(json.error ?? "no sources returned");
  }
  return json.sources;
}

async function registerGoogleFont(
  family: string,
  weights: number[],
): Promise<string> {
  const sources = await fetchFontSources(family, weights);
  // Google returns multiple @font-face blocks per weight+style (one per
  // unicode subset: latin, latin-ext, cyrillic, etc.). react-pdf can't
  // discriminate by unicode-range, so keep only one src per weight+style —
  // the LAST block, which is the basic Latin subset for almost every family.
  const lastByKey = new Map<string, FaceSource>();
  for (const s of sources) {
    lastByKey.set(`${s.weight}-${s.style}`, s);
  }
  Font.register({
    family,
    fonts: Array.from(lastByKey.values()).map((s) => ({
      src: s.src,
      fontWeight: s.weight,
      fontStyle: s.style,
    })),
  });
  return family;
}

/**
 * Register a Google Font family with react-pdf. Memoized — second call for
 * the same family returns the cached promise. Resolves with the family name
 * on success, or "Helvetica" on any failure (never rejects).
 */
export function ensureFont(
  family: string,
  weights: number[] = DEFAULT_WEIGHTS,
): Promise<string> {
  if (!family || BUILTINS.has(family)) return Promise.resolve(family || "Helvetica");
  const cached = registry.get(family);
  if (cached) return cached;
  const p = registerGoogleFont(family, weights).catch((err) => {
    console.warn(`[fonts] failed to load "${family}":`, err);
    // Drop from cache so a later call can retry.
    registry.delete(family);
    return "Helvetica";
  });
  registry.set(family, p);
  return p;
}

/**
 * Fire-and-forget registration — kicks off loading without awaiting.
 * Useful inside synchronous template factories where we can't block.
 * The first render may show Helvetica; a re-render after load shows the
 * real font.
 */
export function ensureFontSync(
  family: string,
  weights: number[] = DEFAULT_WEIGHTS,
): void {
  void ensureFont(family, weights);
}

/**
 * Return a safe family name for `fontFamily:` styles. If the font hasn't
 * finished loading yet, react-pdf substitutes Helvetica automatically (it
 * only knows about registered families), so we can just return the family
 * string — but we gate on BUILTINS to avoid noisy console warnings when a
 * template declares a standard PDF font.
 */
export function withFallback(family: string): string {
  if (!family) return "Helvetica";
  if (BUILTINS.has(family)) return family;
  return family;
}

/** For tests / debugging. */
export function _resetFontRegistry() {
  registry.clear();
}
