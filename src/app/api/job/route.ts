// Job-posting URL → plain-text JD + authoritative metadata. Supports Greenhouse
// (boards-api.greenhouse.io) and Ashby (posting-api.ashbyhq.com) public APIs.
// Both expose structured JSON without auth; no scraping library needed.

import { NextRequest } from "next/server";

type JobSource = "greenhouse" | "ashby";

interface JobFetchResponse {
  text: string;
  title: string | null;
  company: string | null;
  location: string | null;
  source: JobSource;
  sourceUrl: string;
}

export async function POST(req: NextRequest) {
  let body: { url?: string };
  try {
    body = (await req.json()) as { url?: string };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const url = (body.url ?? "").trim();
  if (!url) {
    return Response.json({ error: "url required" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Response.json({ error: "invalid url" }, { status: 400 });
  }

  try {
    if (isGreenhouse(parsed)) {
      const result = await fetchGreenhouse(parsed);
      return Response.json(result satisfies JobFetchResponse);
    }
    if (isAshby(parsed)) {
      const result = await fetchAshby(parsed);
      return Response.json(result satisfies JobFetchResponse);
    }
    return Response.json(
      { error: "unsupported host — use a Greenhouse or Ashby posting URL" },
      { status: 400 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 502 });
  }
}

function isGreenhouse(u: URL): boolean {
  return (
    u.hostname.endsWith("greenhouse.io") ||
    u.hostname === "boards.greenhouse.io" ||
    u.hostname === "job-boards.greenhouse.io"
  );
}

function isAshby(u: URL): boolean {
  return u.hostname.endsWith("ashbyhq.com");
}

async function fetchGreenhouse(u: URL): Promise<JobFetchResponse> {
  // Paths seen in the wild:
  //   /{company}/jobs/{id}
  //   /embed/job_app?for={company}&token={id}
  //   /{company}/jobs/{id}/apply
  const segments = u.pathname.split("/").filter(Boolean);
  let company: string | null = null;
  let jobId: string | null = null;

  const jobsIdx = segments.indexOf("jobs");
  if (jobsIdx > 0 && segments[jobsIdx + 1]) {
    company = segments[jobsIdx - 1];
    jobId = segments[jobsIdx + 1].split(/[#?]/)[0];
  } else if (u.searchParams.get("for") && u.searchParams.get("token")) {
    company = u.searchParams.get("for");
    jobId = u.searchParams.get("token");
  }

  if (!company || !jobId) {
    throw new Error("couldn't parse greenhouse url");
  }

  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
    company
  )}/jobs/${encodeURIComponent(jobId)}?questions=false`;

  const res = await fetch(apiUrl, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`greenhouse api ${res.status}`);
  }
  const data = (await res.json()) as {
    title?: string;
    content?: string;
    company?: { name?: string };
    location?: { name?: string };
    departments?: Array<{ name?: string }>;
  };

  return {
    text: htmlToText(data.content ?? ""),
    title: data.title ?? null,
    company: data.company?.name ?? companyFromSlug(company),
    location: data.location?.name ?? null,
    source: "greenhouse",
    sourceUrl: u.toString(),
  };
}

async function fetchAshby(u: URL): Promise<JobFetchResponse> {
  // Paths seen: /{orgSlug}/{jobId}[/application]
  const segments = u.pathname.split("/").filter(Boolean);
  const orgSlug = segments[0] ?? null;
  const jobId = segments[1] ?? null;
  if (!orgSlug || !jobId) {
    throw new Error("couldn't parse ashby url");
  }

  // Try the public posting-api first. Shape (undocumented but stable):
  //   { jobs: [{ id, title, locationName, departmentName, descriptionHtml, ... }],
  //     organizationName, ... }
  const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(
    orgSlug
  )}?includeCompensation=true`;
  const res = await fetch(apiUrl, { headers: { accept: "application/json" } });
  if (res.ok) {
    const data = (await res.json()) as {
      organizationName?: string;
      jobs?: Array<{
        id?: string;
        title?: string;
        descriptionHtml?: string;
        descriptionPlain?: string;
        locationName?: string;
        departmentName?: string;
      }>;
    };
    const job = data.jobs?.find((j) => j.id === jobId);
    if (job) {
      const raw = job.descriptionHtml ?? job.descriptionPlain ?? "";
      return {
        text: htmlToText(raw),
        title: job.title ?? null,
        company: data.organizationName ?? companyFromSlug(orgSlug),
        location: job.locationName ?? null,
        source: "ashby",
        sourceUrl: u.toString(),
      };
    }
  }

  // Fallback: scrape the HTML page for __NEXT_DATA__ JSON payload.
  const html = await fetch(u.toString(), {
    headers: { "user-agent": "Mozilla/5.0 resumewise" },
  }).then((r) => (r.ok ? r.text() : ""));
  const match = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (match) {
    try {
      const payload = JSON.parse(match[1]) as {
        props?: {
          pageProps?: {
            posting?: {
              title?: string;
              descriptionHtml?: string;
              locationName?: string;
            };
            organizationName?: string;
          };
        };
      };
      const posting = payload.props?.pageProps?.posting;
      if (posting) {
        return {
          text: htmlToText(posting.descriptionHtml ?? ""),
          title: posting.title ?? null,
          company:
            payload.props?.pageProps?.organizationName ??
            companyFromSlug(orgSlug),
          location: posting.locationName ?? null,
          source: "ashby",
          sourceUrl: u.toString(),
        };
      }
    } catch {
      // fall through
    }
  }

  throw new Error("couldn't load ashby posting");
}

function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

function companyFromSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
