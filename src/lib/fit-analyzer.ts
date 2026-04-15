"use client";

import { getApiKey } from "./ai";
import type { JobSummary } from "./storage";

export interface FitSuggestion {
  kind: "bullet" | "summary" | "skill" | "title";
  location: string;
  before: string;
  after: string;
  reason: string;
}

export interface FitAnalysis {
  fitScore: number;
  fitNotes: string[];
  atsScore: number;
  atsBreakdown: {
    matchedKeywords: string[];
    missingKeywords: string[];
  };
  suggestions: FitSuggestion[];
}

export interface FitCacheKey {
  jobKey: string | null;
  markdownHash: string;
}

const cache = new Map<string, FitAnalysis>();

function keyString(key: FitCacheKey): string {
  return `${key.jobKey ?? "none"}::${key.markdownHash}`;
}

export function markdownHash(markdown: string): string {
  let hash = 2166136261;
  for (let i = 0; i < markdown.length; i += 1) {
    hash ^= markdown.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function readCache(key: FitCacheKey): FitAnalysis | null {
  return cache.get(keyString(key)) ?? null;
}

export function writeCache(key: FitCacheKey, value: FitAnalysis): void {
  cache.set(keyString(key), value);
}

export function clearCache(): void {
  cache.clear();
}

export interface AnalyzeFitArgs {
  markdown: string;
  jobDescription: string;
  jobKey: string | null;
  force?: boolean;
}

export async function analyzeFit(
  args: AnalyzeFitArgs
): Promise<{ analysis: FitAnalysis; cached: boolean }> {
  const hash = markdownHash(args.markdown);
  const cacheKey: FitCacheKey = { jobKey: args.jobKey, markdownHash: hash };
  if (!args.force) {
    const hit = readCache(cacheKey);
    if (hit) return { analysis: hit, cached: true };
  }

  const apiKey = getApiKey();
  const res = await fetch("/api/analyze-fit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      apiKey: apiKey ?? undefined,
      markdown: args.markdown,
      jobDescription: args.jobDescription,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    let message = "analysis failed";
    try {
      const data = JSON.parse(text) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      if (text) message = text.slice(0, 200);
    }
    throw new Error(message);
  }

  const analysis = (await res.json()) as FitAnalysis;
  writeCache(cacheKey, analysis);
  return { analysis, cached: false };
}

export interface JobFetchResult {
  text: string;
  title: string | null;
  company: string | null;
  location: string | null;
  source: "greenhouse" | "ashby";
  sourceUrl: string;
}

export async function summariseJob(
  jobDescription: string
): Promise<JobSummary> {
  const apiKey = getApiKey();
  const res = await fetch("/api/job-summary", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      apiKey: apiKey ?? undefined,
      jobDescription,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    let message = "summary failed";
    try {
      const data = JSON.parse(text) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      if (text) message = text.slice(0, 200);
    }
    throw new Error(message);
  }
  return (await res.json()) as JobSummary;
}

export async function fetchJobFromUrl(url: string): Promise<JobFetchResult> {
  const res = await fetch("/api/job", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const text = await res.text();
    let message = "fetch failed";
    try {
      const data = JSON.parse(text) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      if (text) message = text.slice(0, 200);
    }
    throw new Error(message);
  }
  return (await res.json()) as JobFetchResult;
}
