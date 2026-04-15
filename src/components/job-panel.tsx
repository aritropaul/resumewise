"use client";

import * as React from "react";
import {
  ArrowRight,
  ArrowSquareOut,
  Check,
  GitBranch,
  Link,
  Target,
  X,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BezelCard } from "@/components/ui/card";
import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs";
import { CircularLoader } from "@/components/ui/loader";
import type { SavedDocument } from "@/lib/storage";
import type { FitAnalysis } from "@/lib/fit-analyzer";

export type SuggestionStatus = "accepted" | "rejected" | "error";

export interface JobPanelProps {
  activeFile: SavedDocument;
  jobDescription: string;
  analysis: FitAnalysis | null;
  analysisLoading: boolean;
  analysisError: string | null;
  analysisStale: boolean;
  urlFetchLoading: boolean;
  urlFetchError: string | null;
  summaryLoading: boolean;
  suggestionStatus: Record<number, SuggestionStatus>;
  onJobChange: (value: string) => void;
  onFetchUrl: (source: "greenhouse" | "ashby", url: string) => void;
  onAnalyze: () => void;
  onTailor: () => void;
  onAcceptSuggestion: (index: number) => void;
  onRejectSuggestion: (index: number) => void;
  onClearAnalysis: () => void;
}

type Tab = "paste" | "greenhouse" | "ashby";

export function JobPanel(props: JobPanelProps) {
  const {
    activeFile,
    jobDescription,
    analysis,
    analysisLoading,
    analysisError,
    analysisStale,
    urlFetchLoading,
    urlFetchError,
    summaryLoading,
    suggestionStatus,
    onJobChange,
    onFetchUrl,
    onAnalyze,
    onTailor,
    onAcceptSuggestion,
    onRejectSuggestion,
    onClearAnalysis,
  } = props;

  const initialTab: Tab =
    activeFile.jobSource === "greenhouse"
      ? "greenhouse"
      : activeFile.jobSource === "ashby"
        ? "ashby"
        : "paste";
  const [tab, setTab] = React.useState<Tab>(initialTab);
  const [greenhouseUrl, setGreenhouseUrl] = React.useState(
    activeFile.jobSource === "greenhouse" ? activeFile.jobSourceUrl ?? "" : ""
  );
  const [ashbyUrl, setAshbyUrl] = React.useState(
    activeFile.jobSource === "ashby" ? activeFile.jobSourceUrl ?? "" : ""
  );

  React.useEffect(() => {
    setTab(initialTab);
    setGreenhouseUrl(
      activeFile.jobSource === "greenhouse" ? activeFile.jobSourceUrl ?? "" : ""
    );
    setAshbyUrl(
      activeFile.jobSource === "ashby" ? activeFile.jobSourceUrl ?? "" : ""
    );
    // Reset on active doc change.
  }, [activeFile.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasJob = jobDescription.trim().length > 0;
  const sourceLabel =
    activeFile.jobSource === "greenhouse"
      ? "greenhouse"
      : activeFile.jobSource === "ashby"
        ? "ashby"
        : hasJob
          ? "pasted"
          : null;

  const handleGreenhouseFetch = () => {
    const url = greenhouseUrl.trim();
    if (!url) return;
    onFetchUrl("greenhouse", url);
  };

  const handleAshbyFetch = () => {
    const url = ashbyUrl.trim();
    if (!url) return;
    onFetchUrl("ashby", url);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      <BezelCard className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 flex-col">
            <span className="text-label text-muted-foreground">target job</span>
            <span className="text-sm text-foreground">
              paste a JD or pull from an ATS. tailoring spawns a linked variant.
            </span>
          </div>
          <div className="flex items-center gap-2">
            {sourceLabel ? (
              <Badge variant="outline" size="sm">
                {sourceLabel}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="space-y-3 px-4 py-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList variant="pill" className="w-full">
              <TabsTab value="paste" variant="pill">
                paste
              </TabsTab>
              <TabsTab value="greenhouse" variant="pill">
                greenhouse
              </TabsTab>
              <TabsTab value="ashby" variant="pill">
                ashby
              </TabsTab>
            </TabsList>

            <TabsPanel value="paste" className="mt-3">
              <Textarea
                value={jobDescription}
                onChange={(e) => onJobChange(e.target.value)}
                placeholder="paste the job description here."
                className="min-h-[220px]"
                autoGrow
                maxHeight={360}
              />
            </TabsPanel>

            <TabsPanel value="greenhouse" className="mt-3">
              <UrlFetchRow
                placeholder="https://boards.greenhouse.io/company/jobs/123456"
                value={greenhouseUrl}
                onChange={setGreenhouseUrl}
                onSubmit={handleGreenhouseFetch}
                loading={urlFetchLoading && tab === "greenhouse"}
              />
              <FetchedPreview
                show={activeFile.jobSource === "greenhouse" && hasJob}
                activeFile={activeFile}
                jobDescription={jobDescription}
                summaryLoading={summaryLoading}
                onClear={() => onJobChange("")}
              />
            </TabsPanel>

            <TabsPanel value="ashby" className="mt-3">
              <UrlFetchRow
                placeholder="https://jobs.ashbyhq.com/company/job-uuid"
                value={ashbyUrl}
                onChange={setAshbyUrl}
                onSubmit={handleAshbyFetch}
                loading={urlFetchLoading && tab === "ashby"}
              />
              <FetchedPreview
                show={activeFile.jobSource === "ashby" && hasJob}
                activeFile={activeFile}
                jobDescription={jobDescription}
                summaryLoading={summaryLoading}
                onClear={() => onJobChange("")}
              />
            </TabsPanel>
          </Tabs>

          {urlFetchError ? (
            <p className="text-xs text-destructive">{urlFetchError}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" onClick={onAnalyze} disabled={!hasJob || analysisLoading}>
              {analysisLoading ? (
                <CircularLoader size="sm" className="border-primary-foreground" />
              ) : (
                <Target weight="light" className="size-3.5" />
              )}
              {analysis && !analysisStale ? "re-analyze" : "analyze"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onTailor}
              disabled={!hasJob}
            >
              <GitBranch weight="light" className="size-3.5" />
              tailor
              <ArrowRight weight="light" className="size-3.5" />
            </Button>
          </div>
        </div>
      </BezelCard>

      {analysisError ? (
        <BezelCard className="border-destructive/40">
          <div className="px-4 py-3 text-sm text-destructive">
            {analysisError}
          </div>
        </BezelCard>
      ) : null}

      {analysis ? (
        <AnalysisView
          analysis={analysis}
          suggestionStatus={suggestionStatus}
          stale={analysisStale}
          loading={analysisLoading}
          onAccept={onAcceptSuggestion}
          onReject={onRejectSuggestion}
          onReanalyze={onAnalyze}
          onClear={onClearAnalysis}
        />
      ) : null}
    </div>
  );
}

function UrlFetchRow({
  value,
  onChange,
  onSubmit,
  placeholder,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Link
          weight="light"
          className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pl-7"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={onSubmit}
        disabled={loading || !value.trim()}
      >
        {loading ? <CircularLoader size="sm" /> : "fetch"}
      </Button>
    </div>
  );
}

function FetchedPreview({
  show,
  activeFile,
  jobDescription,
  summaryLoading,
  onClear,
}: {
  show: boolean;
  activeFile: SavedDocument;
  jobDescription: string;
  summaryLoading: boolean;
  onClear: () => void;
}) {
  if (!show) return null;
  const { jobTitle, company, jobSourceUrl, jobSummary } = activeFile;
  return (
    <div className="mt-3 space-y-3 rounded-md border border-border bg-muted/30 px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-sm">
          <div className="font-medium text-foreground">
            {jobTitle ?? "role"}
            {company ? (
              <span className="text-muted-foreground"> · {company}</span>
            ) : null}
          </div>
          {jobSourceUrl ? (
            <a
              href={jobSourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              source
              <ArrowSquareOut weight="light" className="size-3" />
            </a>
          ) : null}
        </div>
        <Button size="sm" variant="ghost" onClick={onClear}>
          clear
        </Button>
      </div>

      {summaryLoading && !jobSummary ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CircularLoader size="sm" />
          summarizing…
        </div>
      ) : null}

      {jobSummary ? (
        <div className="space-y-2.5 text-sm">
          <p className="text-foreground">{jobSummary.summary}</p>
          {jobSummary.compensation ? (
            <div className="flex items-baseline gap-2 text-sm">
              <span className="text-label text-muted-foreground shrink-0">
                comp
              </span>
              <span className="text-foreground tabular-nums">
                {jobSummary.compensation}
              </span>
            </div>
          ) : null}
          <SummarySection
            label="responsibilities"
            items={jobSummary.responsibilities}
          />
          <SummarySection
            label="requirements"
            items={jobSummary.requirements}
          />
          <SummarySection
            label="nice to have"
            items={jobSummary.niceToHave}
          />
        </div>
      ) : null}

      <details className="group">
        <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground">
          <span className="group-open:hidden">show raw text</span>
          <span className="hidden group-open:inline">hide raw text</span>
        </summary>
        <pre className="mt-2 max-h-48 overflow-auto rounded border border-border bg-background p-2 text-xs whitespace-pre-wrap text-foreground">
          {jobDescription}
        </pre>
      </details>
    </div>
  );
}

function SummarySection({
  label,
  items,
}: {
  label: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="text-label text-muted-foreground">{label}</div>
      <ul className="space-y-0.5 text-sm text-foreground">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-muted-foreground">·</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnalysisView({
  analysis,
  suggestionStatus,
  stale,
  loading,
  onAccept,
  onReject,
  onReanalyze,
  onClear,
}: {
  analysis: FitAnalysis;
  suggestionStatus: Record<number, SuggestionStatus>;
  stale: boolean;
  loading: boolean;
  onAccept: (i: number) => void;
  onReject: (i: number) => void;
  onReanalyze: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-label text-muted-foreground">analysis</span>
          {stale ? (
            <Badge variant="secondary" size="sm">
              stale
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {stale ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onReanalyze}
              disabled={loading}
            >
              {loading ? <CircularLoader size="sm" /> : "re-analyze"}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={onClear}
            aria-label="clear analysis"
          >
            <X weight="light" className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ScoreCard label="fit" score={analysis.fitScore} />
        <ScoreCard label="ats" score={analysis.atsScore} />
      </div>

      {analysis.fitNotes.length > 0 ? (
        <BezelCard>
          <div className="space-y-1 px-4 py-3">
            <div className="text-label text-muted-foreground">notes</div>
            <ul className="space-y-1 text-sm text-foreground">
              {analysis.fitNotes.map((note, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-muted-foreground">·</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        </BezelCard>
      ) : null}

      {(analysis.atsBreakdown.matchedKeywords.length > 0 ||
        analysis.atsBreakdown.missingKeywords.length > 0) && (
        <BezelCard>
          <div className="space-y-3 px-4 py-3">
            {analysis.atsBreakdown.matchedKeywords.length > 0 ? (
              <KeywordRow
                label="matched"
                keywords={analysis.atsBreakdown.matchedKeywords}
                variant="success"
              />
            ) : null}
            {analysis.atsBreakdown.missingKeywords.length > 0 ? (
              <KeywordRow
                label="missing"
                keywords={analysis.atsBreakdown.missingKeywords}
                variant="outline"
              />
            ) : null}
          </div>
        </BezelCard>
      )}

      {analysis.suggestions.length > 0 ? (
        <BezelCard>
          <div className="space-y-2 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="text-label text-muted-foreground">
                suggestions ({analysis.suggestions.length})
              </div>
              <div className="text-xs text-muted-foreground">
                accept applies to a tailored variant
              </div>
            </div>
            <div className="flex flex-col divide-y divide-border">
              {analysis.suggestions.map((s, i) => (
                <SuggestionRow
                  key={i}
                  suggestion={s}
                  status={suggestionStatus[i]}
                  onAccept={() => onAccept(i)}
                  onReject={() => onReject(i)}
                />
              ))}
            </div>
          </div>
        </BezelCard>
      ) : null}
    </div>
  );
}

function ScoreCard({ label, score }: { label: string; score: number }) {
  const tone =
    score >= 80
      ? "text-emerald-600 dark:text-emerald-400"
      : score >= 60
        ? "text-foreground"
        : "text-amber-600 dark:text-amber-400";
  return (
    <BezelCard>
      <div className="flex items-baseline justify-between px-4 py-3">
        <span className="text-label text-muted-foreground">{label}</span>
        <span className={`text-2xl font-semibold tabular-nums ${tone}`}>
          {score}
        </span>
      </div>
    </BezelCard>
  );
}

function KeywordRow({
  label,
  keywords,
  variant,
}: {
  label: string;
  keywords: string[];
  variant: "success" | "outline";
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-label text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1">
        {keywords.map((kw) => (
          <Badge key={kw} variant={variant} size="sm">
            {kw}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function SuggestionRow({
  suggestion,
  status,
  onAccept,
  onReject,
}: {
  suggestion: FitAnalysis["suggestions"][number];
  status: SuggestionStatus | undefined;
  onAccept: () => void;
  onReject: () => void;
}) {
  const dim = status === "rejected";
  const done = status === "accepted";
  const errored = status === "error";
  return (
    <div
      className={`flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0 ${
        dim ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-center gap-2 text-xs">
        <Badge variant="outline" size="sm">
          {suggestion.kind}
        </Badge>
        <span className="text-muted-foreground truncate">
          {suggestion.location}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {done ? (
            <Badge variant="success" size="sm">
              applied
            </Badge>
          ) : errored ? (
            <Badge variant="destructive" size="sm">
              no match
            </Badge>
          ) : dim ? null : (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={onReject}
                aria-label="reject suggestion"
              >
                <X weight="light" className="size-3.5" />
              </Button>
              <Button
                size="sm"
                onClick={onAccept}
                aria-label="accept suggestion"
              >
                <Check weight="light" className="size-3.5" />
              </Button>
            </>
          )}
        </span>
      </div>
      <div className="space-y-1 text-sm">
        <div className="rounded border border-border/60 bg-destructive/5 px-2 py-1 text-foreground/80 line-through decoration-destructive/60">
          {suggestion.before}
        </div>
        <div className="rounded border border-border/60 bg-emerald-500/5 px-2 py-1 text-foreground">
          {suggestion.after}
        </div>
      </div>
      <div className="text-xs text-muted-foreground">{suggestion.reason}</div>
    </div>
  );
}
