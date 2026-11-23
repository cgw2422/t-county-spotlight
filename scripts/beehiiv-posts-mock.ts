/**
 * Local mock of the beehiiv v2 POSTS API (no network) for the Newsletter Events tool.
 * Used in-process by scripts/test-newsletter-events.ts and standalone by the Playwright run:
 *   npx tsx scripts/beehiiv-posts-mock.ts 3198   →   BEEHIIV_API_BASE=http://127.0.0.1:3198/v2
 *
 *   POST /v2/publications/{pub}/posts          201 { data: { id, preview_url } } (stored as a draft)
 *   GET  /v2/publications/{pub}/posts/{id}     first call 202 (being created), then 200 — or 404 POST_CREATION_FAILED
 *   GET  /v2/publications/{pub}/polls          two sample polls (newsletter designer poll picker)
 *   GET  /v2/publications/{pub}/posts?status=  stored posts; status=draft is honoured, any other status
 *                                              returns EVERYTHING (drafts leak, so the sync's own filter is tested)
 * Behaviour by a keyword in the post title:
 *   [delay] 600 ms before answering · [timeout] store the post, answer after 3 s · [drop] store the post, destroy the socket
 *   [500] store the post, answer 500 · [401] [403] [404] [422] [429] error, nothing stored · [createfail] 201, later 404 POST_CREATION_FAILED
 * GET /__mock/requests lists received requests; POST /__mock/reset clears requests and posts.
 */
import http from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

export type PostsMockRequest = { method: string; path: string; query: string; auth: string | undefined; body: unknown; at: number };
export type MockStoredPost = { id: string; title: string; subtitle?: string; status: string; content_tags: string[]; created: number; publish_date: number | null; gets: number; fail?: boolean; platform: string; audience: string; content: { free: { web: string; email: string } } };
export type PostsMock = { port: number; base: string; requests: PostsMockRequest[]; posts: Map<string, MockStoredPost>; close: () => Promise<void> };

export function startPostsMock(opts: { port?: number; apiKey: string; publicationId: string }): Promise<PostsMock> {
  const requests: PostsMockRequest[] = [];
  const posts = new Map<string, MockStoredPost>();
  const json = (res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    if (res.destroyed) return;
    res.writeHead(status, { "Content-Type": "application/json", ...headers }).end(JSON.stringify(body));
  };
  const err = (res: http.ServerResponse, status: number, code: string, message: string) => json(res, status, { status, statusText: code, errors: [{ code, message }] });

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      const url = new URL(req.url ?? "/", "http://mock");
      const raw = Buffer.concat(chunks).toString("utf8");
      if (url.pathname === "/__mock/requests") return json(res, 200, requests);
      if (url.pathname === "/__mock/posts") return json(res, 200, [...posts.values()]);
      if (url.pathname === "/__mock/reset") { requests.length = 0; posts.clear(); return json(res, 200, { ok: true }); }
      let body: unknown = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
      requests.push({ method: req.method ?? "", path: url.pathname, query: url.search, auth: req.headers.authorization, body, at: Date.now() });

      if (req.headers.authorization !== `Bearer ${opts.apiKey}`) return err(res, 401, "unauthorized", "Invalid API key");
      // GET /v2/publications/{pub}/polls — two sample polls (newsletter designer's Community Poll picker).
      if (req.method === "GET" && url.pathname === `/v2/publications/${opts.publicationId}/polls`) {
        return json(res, 200, { data: [
          { id: "poll_mock-lights", name: "Holiday lights", question: "Which town has the best holiday lights?", poll_type: "voting", status: "published", created_at: 1, poll_choices: [{ id: "c1", label: "Dover" }, { id: "c2", label: "New Philadelphia" }, { id: "c3", label: "Sugarcreek" }] },
          { id: "poll_mock-draft", name: "Draft poll", question: "Unpublished question", poll_type: "voting", status: "draft", created_at: 2, poll_choices: [] },
        ], has_more: false });
      }
      const m = url.pathname.match(/^\/v2\/publications\/([^/]+)\/posts(?:\/([^/]+))?$/);
      if (!m || decodeURIComponent(m[1]) !== opts.publicationId) return err(res, 404, "not_found", "Publication not found");
      const postId = m[2] ? decodeURIComponent(m[2]) : null;

      if (req.method === "POST" && !postId) {
        const b = (body ?? {}) as Record<string, unknown>;
        const title = String(b.title ?? "");
        for (const s of [401, 403, 404, 422, 429]) if (title.includes(`[${s}]`)) return err(res, s, `http_${s}`, `Mock ${s}`);
        if (!title) return err(res, 400, "invalid", "title is required");
        if (b.status !== undefined && b.status !== "draft" && b.status !== "confirmed") return err(res, 400, "invalid", "bad status");
        const id = `post_${randomUUID()}`;
        const html = Array.isArray(b.blocks) ? (b.blocks as { type: string; html?: string }[]).filter((x) => x.type === "html").map((x) => x.html).join("") : String(b.body_content ?? "");
        posts.set(id, {
          id, title, subtitle: typeof b.subtitle === "string" ? b.subtitle : undefined, status: b.status === "confirmed" ? "confirmed" : "draft",
          content_tags: Array.isArray(b.content_tags) ? (b.content_tags as string[]) : [], created: Math.floor(Date.now() / 1000),
          publish_date: null, gets: 0, fail: title.includes("[createfail]"), platform: "both", audience: "free", content: { free: { web: html, email: html } },
        });
        if (title.includes("[drop]")) { req.socket.destroy(); return; }
        if (title.includes("[500]")) return err(res, 500, "internal", "Mock server error");
        if (title.includes("[timeout]")) await new Promise((r) => setTimeout(r, 3000));
        if (title.includes("[delay]")) await new Promise((r) => setTimeout(r, 600));
        return json(res, 201, { data: { id, preview_url: `https://app.beehiiv.com/posts/${id}/preview` } });
      }
      if (req.method === "GET" && postId) {
        const p = posts.get(postId);
        if (!p) return err(res, 404, "not_found", "Post not found");
        p.gets++;
        if (p.fail) return err(res, 404, "POST_CREATION_FAILED", "Post creation failed");
        if (p.gets === 1) return json(res, 202, { data: { id: p.id } }, { "Retry-After": "1" });
        return json(res, 200, { data: { id: p.id, title: p.title, status: p.status, content_tags: p.content_tags, created: p.created } });
      }
      if (req.method === "GET" && !postId) {
        const status = url.searchParams.get("status");
        const limit = Number(url.searchParams.get("limit") || 10);
        let list = [...posts.values()].sort((a, b) => b.created - a.created);
        if (status === "draft") list = list.filter((p) => p.status === "draft");
        const page = list.slice(0, limit).map((p) => { const out: Partial<MockStoredPost> = { ...p }; delete out.gets; delete out.fail; return out; });
        return json(res, 200, { data: page, page: 1, total_pages: 1, total_results: page.length, limit });
      }
      return err(res, 404, "not_found", "Unknown route");
    });
  });

  return new Promise((resolve) => {
    server.listen(opts.port ?? 0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ port, base: `http://127.0.0.1:${port}/v2`, requests, posts, close: () => new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()); }) });
    });
  });
}

if (process.argv[1] && /beehiiv-posts-mock\.ts$/.test(process.argv[1])) {
  const port = Number(process.argv[2] || 3198);
  startPostsMock({ port, apiKey: process.env.MOCK_API_KEY || "test", publicationId: process.env.MOCK_PUBLICATION_ID || "pub_test" }).then((m) => {
    console.log(`beehiiv posts mock listening on ${m.base}`);
  });
}
