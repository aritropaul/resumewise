let cachedFonts: string[] | null = null;
let loadedFonts = new Set<string>();

export async function fetchAllGoogleFonts(): Promise<string[]> {
  if (cachedFonts) return cachedFonts;

  try {
    const res = await fetch("/api/fonts");
    const data = await res.json();
    cachedFonts = data.fonts || [];
    return cachedFonts!;
  } catch {
    return [];
  }
}

export function loadFont(family: string) {
  if (typeof document === "undefined") return;
  if (loadedFonts.has(family)) return;
  loadedFonts.add(family);

  const encoded = family.replace(/ /g, "+");
  // Request just regular weights — works for all fonts including those without italic
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encoded}:wght@100;200;300;400;500;600;700;800;900&display=swap`;
  link.onerror = () => {
    // Fallback: simplest form for fonts that only have one weight
    const fallback = document.createElement("link");
    fallback.rel = "stylesheet";
    fallback.href = `https://fonts.googleapis.com/css2?family=${encoded}&display=swap`;
    document.head.appendChild(fallback);
  };
  document.head.appendChild(link);
}
