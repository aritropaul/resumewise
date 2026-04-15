// Pure string helpers that wrap/unwrap/replace inline directives around a
// text range in the markdown. Used by the right-panel Design controls when
// the user has a selection in the Edit tab.
//
// Directive form:
//   opener: {name}            value-less (bold, italic, underline, code, accent, muted, ink)
//           {name:value}      value-ful (weight, size, color, font)
//   closer: {/name}
//
// Convention: the "fully wrapped" check looks for the opener immediately
// before `start` and the closer immediately after `end`. This matches how the
// panel applies its own wrappers (adjacent to the selection), so toggling the
// same control twice cleanly removes the last wrap.

export interface Directive {
  name: string;
  value?: string;
}

export interface EditResult {
  md: string;
  selection: { start: number; end: number };
}

export function formatOpener(d: Directive): string {
  return d.value ? `{${d.name}:${d.value}}` : `{${d.name}}`;
}

export function formatCloser(name: string): string {
  return `{/${name}}`;
}

// Find the opener `{name}` or `{name:<anything>}` ending exactly at `beforeEnd`.
// Returns its start position, or -1 if not matched.
function openerEndingAt(md: string, beforeEnd: number, name: string): number {
  if (beforeEnd <= 0 || md[beforeEnd - 1] !== "}") return -1;
  // Scan backward for the matching `{`.
  let i = beforeEnd - 2;
  while (i >= 0 && md[i] !== "{") i--;
  if (i < 0) return -1;
  const body = md.slice(i + 1, beforeEnd - 1);
  if (body.startsWith("/")) return -1;
  const colon = body.indexOf(":");
  const foundName = (colon === -1 ? body : body.slice(0, colon)).trim().toLowerCase();
  if (foundName !== name) return -1;
  return i;
}

// Read the directive value at the opener at `openerStart`. Returns "" for
// value-less directives.
function readOpenerValue(md: string, openerStart: number, openerEndExclusive: number): string {
  const body = md.slice(openerStart + 1, openerEndExclusive - 1);
  const colon = body.indexOf(":");
  return colon === -1 ? "" : body.slice(colon + 1).trim();
}

function closerAt(md: string, start: number, name: string): boolean {
  const closer = formatCloser(name);
  return md.slice(start, start + closer.length) === closer;
}

export type WrapState =
  | { kind: "none" }
  | { kind: "wrapped"; openerStart: number; openerEnd: number; closerStart: number; closerEnd: number; value: string };

export function detectDirective(
  md: string,
  start: number,
  end: number,
  name: string
): WrapState {
  const openerStart = openerEndingAt(md, start, name);
  if (openerStart === -1) return { kind: "none" };
  const openerEnd = start; // selection begins right after the opener's `}`
  const closer = formatCloser(name);
  if (!closerAt(md, end, name)) return { kind: "none" };
  const closerStart = end;
  const closerEnd = end + closer.length;
  const value = readOpenerValue(md, openerStart, openerEnd);
  return { kind: "wrapped", openerStart, openerEnd, closerStart, closerEnd, value };
}

export function wrapSelection(
  md: string,
  start: number,
  end: number,
  directive: Directive
): EditResult {
  const opener = formatOpener(directive);
  const closer = formatCloser(directive.name);
  const next =
    md.slice(0, start) + opener + md.slice(start, end) + closer + md.slice(end);
  return {
    md: next,
    selection: { start: start + opener.length, end: end + opener.length },
  };
}

export function unwrapSelection(
  md: string,
  state: Extract<WrapState, { kind: "wrapped" }>
): EditResult {
  const { openerStart, openerEnd, closerStart, closerEnd } = state;
  const next =
    md.slice(0, openerStart) +
    md.slice(openerEnd, closerStart) +
    md.slice(closerEnd);
  const selStart = openerStart;
  const selEnd = closerStart - (openerEnd - openerStart);
  return { md: next, selection: { start: selStart, end: selEnd } };
}

// Replace an existing wrapper's value (e.g. weight:500 → weight:600) while
// keeping the selection intact.
export function replaceWrapperValue(
  md: string,
  state: Extract<WrapState, { kind: "wrapped" }>,
  directive: Directive
): EditResult {
  const newOpener = formatOpener(directive);
  const oldOpenerLen = state.openerEnd - state.openerStart;
  const next =
    md.slice(0, state.openerStart) +
    newOpener +
    md.slice(state.openerEnd);
  const delta = newOpener.length - oldOpenerLen;
  return {
    md: next,
    selection: { start: state.openerEnd + delta, end: state.closerStart + delta },
  };
}

// The orchestration function the panel calls per control change. Behavior:
// - Empty selection → returns null (caller should fall back to theme).
// - Fully wrapped in the same directive (same name, same value) → unwrap.
// - Fully wrapped in the same name but different value → replace value.
// - Otherwise → wrap.
export function toggleOrReplace(
  md: string,
  start: number,
  end: number,
  directive: Directive
): EditResult | null {
  if (start === end) return null;
  const state = detectDirective(md, start, end, directive.name);
  if (state.kind === "wrapped") {
    const sameValue = (directive.value ?? "") === state.value;
    if (sameValue) return unwrapSelection(md, state);
    if (directive.value) return replaceWrapperValue(md, state, directive);
    return unwrapSelection(md, state);
  }
  return wrapSelection(md, start, end, directive);
}

// Convenience: describe what the current selection's state is for a given
// directive name. Used by the panel to show active/inactive for toggles.
export function describeState(
  md: string,
  start: number,
  end: number,
  name: string
): { active: boolean; value: string } {
  if (start === end) return { active: false, value: "" };
  const state = detectDirective(md, start, end, name);
  if (state.kind === "wrapped") return { active: true, value: state.value };
  return { active: false, value: "" };
}
