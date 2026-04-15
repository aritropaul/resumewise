// Line-level diff → reviewable hunks. Backs the AI full-document rewrite flow:
// the model returns a complete new markdown, we diff against the old version,
// and show add/remove pairs as hunks the user accepts or rejects.

import { diffLines } from "diff";

export interface DiffHunk {
  id: string;
  context: string[]; // last few unchanged lines before the hunk, for readability
  removed: string[];
  added: string[];
}

export type HunkStatus = "pending" | "accepted" | "rejected";

export interface HunkDecision {
  hunk: DiffHunk;
  status: HunkStatus;
}

const CONTEXT_LINES = 2;

function splitLines(chunk: string): string[] {
  // Strip the trailing newline the diff library leaves so each element is one
  // line of text, while preserving internal empty lines.
  const trimmed = chunk.endsWith("\n") ? chunk.slice(0, -1) : chunk;
  if (trimmed === "") return [];
  return trimmed.split("\n");
}

export function computeHunks(oldMd: string, newMd: string): DiffHunk[] {
  const parts = diffLines(oldMd, newMd);
  const hunks: DiffHunk[] = [];
  let contextBuffer: string[] = [];
  let pending: { removed: string[]; added: string[] } | null = null;
  let nextId = 0;

  const flush = () => {
    if (!pending) return;
    if (pending.removed.length === 0 && pending.added.length === 0) {
      pending = null;
      return;
    }
    hunks.push({
      id: `hunk-${nextId++}`,
      context: contextBuffer.slice(-CONTEXT_LINES),
      removed: pending.removed,
      added: pending.added,
    });
    pending = null;
  };

  for (const part of parts) {
    const lines = splitLines(part.value);
    if (part.added) {
      if (!pending) pending = { removed: [], added: [] };
      pending.added.push(...lines);
    } else if (part.removed) {
      if (!pending) pending = { removed: [], added: [] };
      pending.removed.push(...lines);
    } else {
      flush();
      contextBuffer.push(...lines);
      if (contextBuffer.length > CONTEXT_LINES * 2) {
        contextBuffer = contextBuffer.slice(-CONTEXT_LINES * 2);
      }
    }
  }
  flush();
  return hunks;
}

// Apply a set of accept/reject decisions to produce a final markdown. The
// algorithm re-walks the original diff; for each hunk we either keep the
// removed lines (reject) or emit the added lines (accept).
export function applyDecisions(
  oldMd: string,
  newMd: string,
  decisions: Map<string, HunkStatus>
): string {
  const parts = diffLines(oldMd, newMd);
  const out: string[] = [];
  let hunkIndex = 0;
  let pendingRemoved: string[] | null = null;

  const decide = (removed: string[], added: string[]) => {
    const id = `hunk-${hunkIndex++}`;
    const status = decisions.get(id) ?? "pending";
    if (status === "accepted") {
      for (const line of added) out.push(line);
    } else {
      // pending OR rejected → keep the old lines untouched.
      for (const line of removed) out.push(line);
    }
  };

  for (const part of parts) {
    const lines = splitLines(part.value);
    if (part.added) {
      if (pendingRemoved) {
        decide(pendingRemoved, lines);
        pendingRemoved = null;
      } else {
        decide([], lines);
      }
    } else if (part.removed) {
      if (pendingRemoved) {
        // back-to-back removes: decide them as a pure deletion, then start fresh
        decide(pendingRemoved, []);
      }
      pendingRemoved = lines;
    } else {
      if (pendingRemoved) {
        decide(pendingRemoved, []);
        pendingRemoved = null;
      }
      for (const line of lines) out.push(line);
    }
  }
  if (pendingRemoved) {
    decide(pendingRemoved, []);
  }
  return out.join("\n");
}

export function formatHunkSummary(hunk: DiffHunk): string {
  const add = hunk.added.length;
  const del = hunk.removed.length;
  if (add && del) return `+${add} / −${del}`;
  if (add) return `+${add}`;
  if (del) return `−${del}`;
  return "·";
}
