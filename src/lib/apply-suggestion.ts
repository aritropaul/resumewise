// Exact-match markdown splice for applying a single AnalyzeFit suggestion.
// Returns the new markdown, or null if `before` is not found / ambiguous.

export function applySuggestion(
  markdown: string,
  before: string,
  after: string
): string | null {
  if (!before) return null;
  const first = markdown.indexOf(before);
  if (first < 0) return null;
  // If the same `before` appears more than once we can't safely pick one.
  const second = markdown.indexOf(before, first + before.length);
  if (second >= 0) return null;
  return markdown.slice(0, first) + after + markdown.slice(first + before.length);
}
