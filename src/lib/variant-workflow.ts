import type { SavedDocument } from "./storage";
import { getBaseDocumentId, isVariantDocument } from "./storage";

export interface JobMetadata {
  normalizedJob: string | null;
  jobKey: string | null;
  jobTitle: string | null;
  company: string | null;
}

const TITLE_HINTS = [
  "engineer",
  "designer",
  "manager",
  "director",
  "lead",
  "head",
  "analyst",
  "developer",
  "architect",
  "specialist",
  "researcher",
  "writer",
  "consultant",
  "recruiter",
  "marketer",
  "product",
  "sales",
  "operations",
  "intern",
  "staff",
  "principal",
  "senior",
  "junior",
];

const COMPANY_SKIP_HINTS = [
  "remote",
  "hybrid",
  "onsite",
  "full-time",
  "part-time",
  "contract",
  "united states",
  "new york",
  "san francisco",
  "london",
];

export function normalizeJobDescription(text?: string | null): string | null {
  if (!text) return null;
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function createJobKey(text?: string | null): string | null {
  const normalized = normalizeJobDescription(text);
  if (!normalized) return null;

  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `job-${(hash >>> 0).toString(36)}`;
}

export function extractJobMetadata(text?: string | null): JobMetadata {
  const normalizedJob = normalizeJobDescription(text);
  const jobKey = createJobKey(text);

  if (!normalizedJob) {
    return {
      normalizedJob: null,
      jobKey: null,
      jobTitle: null,
      company: null,
    };
  }

  const lines = normalizedJob
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);

  let jobTitle: string | null = null;
  let company: string | null = null;

  for (const rawLine of lines) {
    const line = toDisplayCase(rawLine);
    const atMatch = line.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
    if (atMatch) {
      jobTitle = sanitizeLabel(atMatch[1]);
      company = sanitizeLabel(atMatch[2]);
      break;
    }

      const dashMatch = line.match(/^(.+?)\s+[–—-]\s+(.+)$/);
      if (dashMatch) {
        const left = sanitizeLabel(dashMatch[1]);
        const right = sanitizeLabel(dashMatch[2]);
        const leftLooksTitle = !!left && looksLikeJobTitle(left);
        const rightLooksTitle = !!right && looksLikeJobTitle(right);

        if (leftLooksTitle && !rightLooksTitle) {
          jobTitle = left;
        company = right;
        break;
      }
      if (rightLooksTitle && !leftLooksTitle) {
        jobTitle = right;
        company = left;
        break;
      }
    }
  }

  if (!jobTitle) {
    jobTitle =
      lines
        .map(toDisplayCase)
        .find((line) => looksLikeJobTitle(line)) ?? null;
  }

  if (!company) {
    company =
      lines
        .map(toDisplayCase)
        .find((line) => looksLikeCompany(line)) ?? null;
  }

  return {
    normalizedJob,
    jobKey,
    jobTitle,
    company,
  };
}

export function buildVariantName(
  baseName: string,
  metadata: JobMetadata,
  override?: { jobTitle?: string | null; company?: string | null }
): string {
  const trimmedBase = stripPdfSuffix(baseName) || "resume";
  const company = override?.company ?? metadata.company;
  const jobTitle = override?.jobTitle ?? metadata.jobTitle;
  if (company) return `${trimmedBase} — ${company}`;
  if (jobTitle) return `${trimmedBase} — ${jobTitle}`;
  return `${trimmedBase} — Tailored`;
}

export interface JobMetadataOverride {
  jobTitle?: string | null;
  company?: string | null;
  jobSourceUrl?: string | null;
  jobSource?: "greenhouse" | "ashby" | "paste" | null;
}

export function syncDocumentJobMetadata(
  doc: SavedDocument,
  jobDescription?: string | null,
  override?: JobMetadataOverride
): SavedDocument {
  const nextJobDescription = jobDescription ?? doc.jobDescription ?? null;
  const metadata = extractJobMetadata(nextJobDescription);

  // If the JD came from an ATS URL (or the current override is one), trust the
  // authoritative title/company instead of letting regex guesses overwrite them.
  const nextSource =
    override?.jobSource !== undefined ? override.jobSource : doc.jobSource ?? null;
  const isAuthoritative = nextSource === "greenhouse" || nextSource === "ashby";

  const jobTitle =
    override?.jobTitle !== undefined
      ? override.jobTitle
      : isAuthoritative
        ? doc.jobTitle ?? null
        : metadata.jobTitle ?? doc.jobTitle ?? null;

  const company =
    override?.company !== undefined
      ? override.company
      : isAuthoritative
        ? doc.company ?? null
        : metadata.company ?? doc.company ?? null;

  return {
    ...doc,
    jobDescription: nextJobDescription,
    jobKey: metadata.jobKey,
    jobTitle,
    company,
    jobSourceUrl:
      override?.jobSourceUrl !== undefined
        ? override.jobSourceUrl
        : doc.jobSourceUrl ?? null,
    jobSource: nextSource,
  };
}

export function findMatchingVariant(
  documents: SavedDocument[],
  baseDocId: string,
  jobKey: string | null
): SavedDocument | null {
  if (!jobKey) return null;
  return (
    documents.find(
      (doc) =>
        doc.parentId === baseDocId &&
        doc.jobKey === jobKey &&
        isVariantDocument(doc)
    ) ?? null
  );
}

export function getVariantState(
  activeFile: SavedDocument | null,
  documents: SavedDocument[],
  jobDescription?: string | null
): {
  metadata: JobMetadata;
  matchingVariant: SavedDocument | null;
  isVariant: boolean;
  baseId: string | null;
} {
  const metadata = extractJobMetadata(jobDescription);
  const isVariant = !!activeFile && isVariantDocument(activeFile);
  const baseId = activeFile ? getBaseDocumentId(activeFile) ?? activeFile.id : null;
  const matchingVariant =
    activeFile && !isVariant && baseId
      ? findMatchingVariant(documents, baseId, metadata.jobKey)
      : null;

  return {
    metadata,
    matchingVariant,
    isVariant,
    baseId,
  };
}

function stripPdfSuffix(value: string): string {
  return value.replace(/\.pdf$/i, "").trim();
}

function sanitizeLabel(value?: string | null): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/[|•]/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

function looksLikeJobTitle(line: string): boolean {
  const lowered = line.toLowerCase();
  return TITLE_HINTS.some((hint) => lowered.includes(hint));
}

function looksLikeCompany(line: string): boolean {
  const lowered = line.toLowerCase();
  if (COMPANY_SKIP_HINTS.some((hint) => lowered.includes(hint))) return false;
  if (looksLikeJobTitle(line)) return false;
  if (line.length > 48) return false;
  return /[a-z]/i.test(line);
}

function toDisplayCase(value: string): string {
  return value
    .split(" ")
    .map((part) => {
      if (part.length <= 2) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}
