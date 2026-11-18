import "server-only";

/**
 * beehiiv v2 API (server-side only). Docs: https://developers.beehiiv.com/
 *   GET /publications/{publicationId}/posts
 *     ?status=confirmed&content_tags[]=<tag>&expand[]=free_web_content&expand[]=free_email_content&limit=100&page=N
 *   Authorization: Bearer <BEEHIIV_API_KEY>
 * The key is read from the environment on each call and is never logged,
 * returned, or included in error messages.
 */
export const BEEHIIV_DEFAULT_API_BASE = "https://api.beehiiv.com/v2";
export const BEEHIIV_PAGE_LIMIT = 100;
const MAX_PAGES = 50; // 5,000 posts per tag per run — far beyond a local newsletter's archive

export type BeehiivEnv = { apiKey: string; publicationId: string; apiBase: string };

/** Present/missing only — never the values. */
export function beehiivEnvStatus() {
  return {
    apiKey: !!process.env.BEEHIIV_API_KEY?.trim(),
    publicationId: !!process.env.BEEHIIV_PUBLICATION_ID?.trim(),
    customApiBase: !!process.env.BEEHIIV_API_BASE?.trim(),
  };
}

export function beehiivEnv(): BeehiivEnv | null {
  const apiKey = process.env.BEEHIIV_API_KEY?.trim();
  const publicationId = process.env.BEEHIIV_PUBLICATION_ID?.trim();
  if (!apiKey || !publicationId) return null;
  const apiBase = (process.env.BEEHIIV_API_BASE?.trim() || BEEHIIV_DEFAULT_API_BASE).replace(/\/+$/, "");
  return { apiKey, publicationId, apiBase };
}

export type BeehiivPost = {
  id: string;
  title?: string | null;
  subtitle?: string | null;
  slug?: string | null;
  status?: string | null; // draft | confirmed | archived
  publish_date?: number | null; // unix seconds
  displayed_date?: number | null;
  created?: number | null;
  thumbnail_url?: string | null;
  web_url?: string | null;
  platform?: string | null; // web | email | both
  audience?: string | null;
  content_tags?: string[] | null;
  authors?: string[] | null;
  preview_text?: string | null;
  meta_default_title?: string | null;
  meta_default_description?: string | null;
  hidden_from_feed?: boolean | null;
  content?: { free?: { web?: string | null; email?: string | null; rss?: string | null } | null } | null;
};

type ListResponse = { data?: BeehiivPost[]; page?: number; total_pages?: number; total_results?: number; limit?: number };

export class BeehiivError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** All confirmed posts carrying `tag` (every page). Throws BeehiivError on any HTTP/network failure. */
export async function listConfirmedPostsByTag(env: BeehiivEnv, tag: string, fetchImpl: typeof fetch = fetch): Promise<BeehiivPost[]> {
  const out: BeehiivPost[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const q = new URLSearchParams();
    q.set("status", "confirmed");
    q.append("content_tags[]", tag);
    q.append("expand[]", "free_web_content");
    q.append("expand[]", "free_email_content");
    q.set("limit", String(BEEHIIV_PAGE_LIMIT));
    q.set("page", String(page));
    q.set("order_by", "publish_date");
    q.set("direction", "desc");
    const url = `${env.apiBase}/publications/${encodeURIComponent(env.publicationId)}/posts?${q.toString()}`;
    let res: Response;
    try {
      res = await fetchImpl(url, { headers: { Authorization: `Bearer ${env.apiKey}`, Accept: "application/json", "User-Agent": "TCountyConnect-Sync/1.0" }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
    } catch (e) {
      throw new BeehiivError(`Network error contacting beehiiv (${(e as Error).name})`, 0);
    }
    if (!res.ok) {
      const hint = res.status === 401 || res.status === 403 ? " — check BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID" : res.status === 404 ? " — publication not found (check BEEHIIV_PUBLICATION_ID)" : res.status === 429 ? " — rate limited, try again later" : "";
      throw new BeehiivError(`beehiiv API returned HTTP ${res.status}${hint}`, res.status);
    }
    const json = (await res.json().catch(() => null)) as ListResponse | null;
    if (!json || !Array.isArray(json.data)) throw new BeehiivError("beehiiv API returned an unexpected response", res.status);
    out.push(...json.data.filter((p) => p && typeof p.id === "string" && p.id));
    const totalPages = typeof json.total_pages === "number" ? json.total_pages : json.data.length < BEEHIIV_PAGE_LIMIT ? page : page + 1;
    if (page >= totalPages || json.data.length === 0) break;
  }
  return out;
}
