/**
 * Local mock of the beehiiv v2 subscriptions/publication API (no network).
 * Used by scripts/test-beehiiv-signup.ts (in-process) and by the Playwright run
 * (standalone: `npx tsx scripts/beehiiv-mock.ts 3199` → BEEHIIV_API_BASE=http://127.0.0.1:3199/v2).
 *
 * The response is chosen by a keyword in the email's local part:
 *   bh-active / bh-validating / bh-inactive / bh-invalid / bh-needs (needs_attention) / bh-weird (unknown status)
 *   bh-503 / bh-500 / bh-429 / bh-401 / bh-404 / bh-400 (HTTP errors), bh-slow (answers after 9 s), bh-drop (socket destroyed)
 *   anything else → "pending"
 * GET /__mock/requests lists received requests; POST /__mock/reset clears them.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

export type MockRequest = { method: string; path: string; auth: string | undefined; contentType: string | undefined; body: unknown };
export type BeehiivMock = { port: number; base: string; requests: MockRequest[]; subs: Map<string, string>; state: { publicationName: string; publicationStatus: number }; close: () => Promise<void> };

const KEYWORDS: [string, string | number][] = [
  ["bh-active", "active"], ["bh-validating", "validating"], ["bh-inactive", "inactive"], ["bh-invalid", "invalid"], ["bh-needs", "needs_attention"], ["bh-weird", "mystery_status"],
  ["bh-503", 503], ["bh-500", 500], ["bh-429", 429], ["bh-401", 401], ["bh-404", 404], ["bh-400", 400], ["bh-slow", "slow"], ["bh-drop", "drop"],
];

export function startBeehiivMock(opts: { port?: number; apiKey: string; publicationId: string; publicationName?: string }): Promise<BeehiivMock> {
  const requests: MockRequest[] = [];
  const subs = new Map<string, string>();
  const state = { publicationName: opts.publicationName ?? "T County Connect", publicationStatus: 200 };
  const json = (res: http.ServerResponse, status: number, body: unknown) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      const url = new URL(req.url ?? "/", "http://mock");
      const raw = Buffer.concat(chunks).toString("utf8");
      if (url.pathname === "/__mock/requests") return json(res, 200, requests);
      if (url.pathname === "/__mock/reset") { requests.length = 0; return json(res, 200, { ok: true }); }
      if (url.pathname === "/__mock/state" && req.method === "POST") { Object.assign(state, JSON.parse(raw || "{}")); return json(res, 200, state); }
      let body: unknown = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
      requests.push({ method: req.method ?? "", path: url.pathname, auth: req.headers.authorization, contentType: req.headers["content-type"], body });

      if (req.headers.authorization !== `Bearer ${opts.apiKey}`) return json(res, 401, { errors: [{ code: "unauthorized", message: "Invalid API key" }] });
      const m = url.pathname.match(/^\/v2\/publications\/([^/]+)(\/subscriptions(?:\/by_email\/([^/]+))?)?$/);
      if (!m || decodeURIComponent(m[1]) !== opts.publicationId) return json(res, 404, { errors: [{ code: "not_found", message: "Publication not found" }] });

      if (!m[2] && req.method === "GET") {
        if (state.publicationStatus !== 200) return json(res, state.publicationStatus, { errors: [{ message: "nope" }] });
        return json(res, 200, { data: { id: opts.publicationId, name: state.publicationName, organization_name: "T County Connect LLC", created: 1700000000 } });
      }
      if (m[3] && req.method === "GET") {
        const email = decodeURIComponent(m[3]);
        const status = subs.get(email);
        if (!status) return json(res, 404, { errors: [{ code: "not_found", message: "Subscription not found" }] });
        return json(res, 200, { data: { id: `sub_${Buffer.from(email).toString("hex").slice(0, 12)}`, email, status, created: Math.floor(Date.now() / 1000) } });
      }
      if (m[2] && !m[3] && req.method === "POST") {
        const email = String((body as { email?: string } | null)?.email ?? "");
        const local = email.split("@")[0] ?? "";
        const hit = KEYWORDS.find(([k]) => local.includes(k))?.[1] ?? "pending";
        if (typeof hit === "number") return json(res, hit, { errors: [{ code: `http_${hit}`, message: `Mock error for ${email}` }] });
        if (hit === "drop") { req.socket.destroy(); return; }
        if (hit === "slow") await new Promise((r) => setTimeout(r, 9_000));
        const status = hit === "slow" ? "pending" : hit;
        // Like beehiiv: an existing (e.g. unsubscribed) address keeps its status when reactivate_existing is false.
        const existing = subs.get(email);
        const final = existing === "inactive" ? "inactive" : status;
        subs.set(email, final);
        return json(res, 201, { data: { id: `sub_${Buffer.from(email).toString("hex").slice(0, 12)}`, email, status: final, created: Math.floor(Date.now() / 1000), utm_source: (body as Record<string, unknown>).utm_source } });
      }
      return json(res, 404, { errors: [{ message: "Unknown route" }] });
    });
  });

  return new Promise((resolve) => {
    server.listen(opts.port ?? 0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ port, base: `http://127.0.0.1:${port}/v2`, requests, subs, state, close: () => new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()); }) });
    });
  });
}

if (process.argv[1] && /beehiiv-mock\.ts$/.test(process.argv[1])) {
  const port = Number(process.argv[2] || 3199);
  startBeehiivMock({ port, apiKey: process.env.MOCK_API_KEY || "test", publicationId: process.env.MOCK_PUBLICATION_ID || "pub_test" }).then((m) => {
    console.log(`beehiiv mock listening on ${m.base}`);
  });
}
