/**
 * Government Watch tests (no internet: a local mock government website and a mock Claude API).
 *
 *   DATABASE_URL=postgresql://tcs:tcs@localhost:5432/tcs npx tsx --conditions=react-server scripts/test-gov-watch.ts
 *
 * Uses the real database and removes everything it creates (sources named "GWTEST …").
 * Covers: link discovery and date parsing; file type detection; text extraction (PDF pages, .docx, scans
 * flagged); website check (new docs, duplicates skipped, unchanged files not re-downloaded, revised file at the
 * same address, failures recorded); revised minutes under a new address; AI analysis request (cached
 * instructions, fallbacks, page-marked text, scans sent as the PDF) and stored findings with action status,
 * priority and page; records email (attachments, sender → source); uploads dedupe; article drafts (DRAFT only,
 * source links); newsletter picker (approved stories only); the public section is off by default.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

process.env.APP_URL ||= "http://localhost:3000";
const FX = path.resolve("scripts/fixtures/gov-watch");
const read = (f: string) => fs.readFileSync(path.join(FX, f));

const results: string[] = [];
let failed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try { await fn(); results.push(`PASS ${name}`); } catch (e) { failed++; results.push(`FAIL ${name}: ${(e as Error).message.split("\n").slice(0, 6).join(" | ")}`); }
}

// ───── mock government website ─────
const site: Record<string, { body: Buffer | string; type: string; etag?: string; status?: number }> = {};
const hits: string[] = [];
const gov = http.createServer((req, res) => {
  const u = new URL(req.url ?? "/", "http://x");
  hits.push(u.pathname);
  const r = site[u.pathname];
  if (!r) { res.writeHead(404).end("not found"); return; }
  if (r.status) { res.writeHead(r.status).end("error"); return; }
  if (r.etag && req.headers["if-none-match"] === r.etag) { res.writeHead(304).end(); return; }
  res.writeHead(200, { "Content-Type": r.type, ...(r.etag ? { ETag: r.etag } : {}) }).end(r.body);
});

// ───── mock Claude API ─────
type Captured = { headers: http.IncomingHttpHeaders; body: Record<string, unknown> };
const claudeCalls: Captured[] = [];
let nextReply: unknown = null;
const claude = http.createServer((req, res) => {
  let data = "";
  req.on("data", (c) => (data += c));
  req.on("end", () => {
    const body = JSON.parse(data || "{}");
    claudeCalls.push({ headers: req.headers, body });
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
      id: "msg_test", type: "message", role: "assistant", model: body.model, stop_reason: "end_turn", stop_sequence: null,
      content: [{ type: "text", text: JSON.stringify(nextReply) }],
      usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    }));
  });
});

async function main() {
  await new Promise<void>((r) => gov.listen(0, "127.0.0.1", () => r()));
  await new Promise<void>((r) => claude.listen(0, "127.0.0.1", () => r()));
  const GOV = `http://127.0.0.1:${(gov.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(claude.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = "test-key";

  const { db } = await import("@/lib/db");
  const links = await import("@/lib/gov-watch/links");
  const { sniffFileType, extractText } = await import("@/lib/gov-watch/extract");
  const { checkSource } = await import("@/lib/gov-watch/collect");
  const { analyzeDocument, SYSTEM_PROMPT, DEFAULT_MODEL } = await import("@/lib/gov-watch/analyze");
  const { mailToDocuments, ingestMail } = await import("@/lib/gov-watch/inbox");
  const { ingestDocument } = await import("@/lib/gov-watch/store");
  const { draftArticle } = await import("@/lib/gov-watch/articles");
  const { searchGovStories } = await import("@/lib/gov-watch/newsletter");
  const { publicGovWatchEnabled } = await import("@/lib/gov-watch/settings");
  const { STARTER_SOURCES } = await import("@/lib/gov-watch/starter-sources");

  const PREFIX = "GWTEST ";
  const createdArticles: string[] = [];
  const cleanup = async () => {
    // The sample files are synthetic test fixtures: any stored copy of them (e.g. from a manual test) is removed too.
    const { sha256 } = await import("@/lib/gov-watch/store");
    const fixtureHashes = fs.readdirSync(FX).map((f) => sha256(read(f)));
    const docs = await db.govDocument.findMany({ where: { OR: [{ source: { name: { startsWith: PREFIX } } }, { emailFrom: { endsWith: "@gwtest.example" } }, { title: { startsWith: PREFIX } }, { sha256: { in: fixtureHashes } }] }, select: { id: true, storageKey: true } });
    await db.govFinding.deleteMany({ where: { documentId: { in: docs.map((d) => d.id) } } });
    await db.govDocument.updateMany({ where: { id: { in: docs.map((d) => d.id) } }, data: { revisionOfId: null } });
    await db.govDocument.deleteMany({ where: { id: { in: docs.map((d) => d.id) } } });
    await db.mediaBlob.deleteMany({ where: { key: { in: docs.map((d) => d.storageKey) } } });
    await db.govSource.deleteMany({ where: { name: { startsWith: PREFIX } } });
    if (createdArticles.length) await db.article.deleteMany({ where: { id: { in: createdArticles } } });
    await db.auditLog.deleteMany({ where: { action: { startsWith: "govwatch." }, entityId: { in: createdArticles } } }).catch(() => {});
  };
  await cleanup();

  try {
    await test("link discovery: documents and minutes pages found, navigation/social dropped, most document-like first", () => {
      const html = `<nav><a href="/">Home</a><a href="/contact">Contact</a><a href="https://facebook.com/x">Facebook</a></nav>
        <a href="/docs/Minutes%2011-03-2026.pdf">Council Minutes &ndash; November 3, 2026</a>
        <a href="files/agenda.docx" title="Agenda Nov 17">Agenda</a>
        <a href="/minutes-archive/">Minutes archive 2025</a>
        <a href="https://other.example/page">Council news elsewhere</a>
        <a href="https://cdn.example.com/x/budget-2027.pdf">2027 Budget</a>
        <a href="mailto:clerk@x.org">Email the clerk</a>`;
      const l = links.discoverDocumentLinks(html, "https://village.example/council/");
      const urls = l.map((x) => x.url);
      assert.ok(urls.includes("https://village.example/docs/Minutes%2011-03-2026.pdf"));
      assert.ok(urls.includes("https://village.example/council/files/agenda.docx"));
      assert.ok(urls.includes("https://village.example/minutes-archive/"), "same-site minutes page followed");
      assert.ok(urls.includes("https://cdn.example.com/x/budget-2027.pdf"), "documents on other hosts kept");
      assert.ok(!urls.some((u) => /facebook|other\.example|mailto|contact/.test(u)));
      assert.equal(l[0].docType, "minutes");
      assert.equal(l.find((x) => x.url.endsWith("budget-2027.pdf"))!.docType, "budget");
      assert.equal(links.dateFromText("Council Minutes – November 3, 2026")?.toISOString().slice(0, 10), "2026-11-03");
      assert.equal(links.dateFromText("minutes_2026-03-04.pdf")?.toISOString().slice(0, 10), "2026-03-04");
      assert.equal(links.dateFromText("Agenda 3/17/26")?.toISOString().slice(0, 10), "2026-03-17");
      assert.equal(links.dateFromText("Agenda 13/45/2026"), null);
    });

    await test("file types and text extraction: PDF text per page, Word, scanned PDF flagged for AI reading", async () => {
      assert.equal(sniffFileType(read("minutes-2026-11-03.pdf")), "pdf");
      assert.equal(sniffFileType(read("board.docx")), "docx");
      assert.equal(sniffFileType(Buffer.from("<html><body>Hi</body></html>")), "html");
      assert.equal(sniffFileType(Buffer.from("MZ\x90\x00 binary")), null);
      const pdf = await extractText(read("minutes-2026-11-03.pdf"), "pdf");
      assert.equal(pdf.pageCount, 2);
      assert.match(pdf.text!, /\[Page 1\][\s\S]*VILLAGE OF TESTVILLE[\s\S]*\[Page 2\][\s\S]*\$412,500/);
      const w = await extractText(read("board.docx"), "docx");
      assert.match(w.text!, /bus purchase for \$128,000/);
      const scan = await extractText(read("scanned.pdf"), "pdf");
      assert.equal(scan.scanned, true);
      assert.equal(scan.text, null);
    });

    const src = await db.govSource.create({ data: { name: `${PREFIX}Testville Village Council`, community: "Testville", govType: "village", minutesUrl: `${GOV}/council/minutes/`, clerkEmail: "clerk@gwtest.example", collectionMethod: "web_page" } });
    site["/council/minutes/"] = { type: "text/html", body: `<h1>Minutes</h1><a href="/files/minutes-2026-11-03.pdf">Council Minutes November 3, 2026</a> <a href="/files/agenda-2026-11-17.pdf">Agenda November 17, 2026</a> <a href="/files/copy.pdf">Minutes copy (same file)</a> <a href="/2025/">2025 Minutes archive</a>` };
    site["/files/minutes-2026-11-03.pdf"] = { type: "application/pdf", body: read("minutes-2026-11-03.pdf"), etag: '"m1"' };
    site["/files/agenda-2026-11-17.pdf"] = { type: "application/pdf", body: read("agenda-2026-11-17.pdf"), etag: '"a1"' };
    site["/files/copy.pdf"] = { type: "application/pdf", body: read("minutes-2026-11-03.pdf") };
    site["/2025/"] = { type: "text/html", body: `<a href="/files/scanned.pdf">Trustees Minutes January 5, 2025 (scanned)</a>` };
    site["/files/scanned.pdf"] = { type: "application/pdf", body: read("scanned.pdf"), etag: '"s1"' };

    await test("website check: new documents stored unchanged with text; duplicate file skipped; archive page followed", async () => {
      const r = await checkSource(src.id, "manual");
      assert.ok(r.ok, r.message);
      assert.equal(r.newDocs, 3, r.message);
      assert.equal(r.duplicates, 1, "same file under another address isn't stored twice");
      const docs = await db.govDocument.findMany({ where: { sourceId: src.id }, orderBy: { title: "asc" } });
      const m = docs.find((d) => d.sourceUrl?.endsWith("minutes-2026-11-03.pdf"))!;
      assert.equal(m.docType, "minutes");
      assert.equal(m.meetingDate?.toISOString().slice(0, 10), "2026-11-03");
      assert.equal(m.extractionMethod, "text");
      assert.match(m.textContent!, /\[Page 2\]/);
      const blob = await db.mediaBlob.findUniqueOrThrow({ where: { key: m.storageKey } });
      assert.ok(Buffer.from(blob.data).equals(read("minutes-2026-11-03.pdf")), "original preserved byte-for-byte");
      assert.equal(docs.find((d) => d.sourceUrl?.endsWith("scanned.pdf"))!.extractionMethod, "ocr_ai");
      const s = await db.govSource.findUniqueOrThrow({ where: { id: src.id } });
      assert.equal(s.lastStatus, "ok");
      assert.ok(s.lastSuccessAt);
      const run = await db.govCheckRun.findFirstOrThrow({ where: { sourceId: src.id }, orderBy: { startedAt: "desc" } });
      assert.equal(run.status, "ok"); assert.equal(run.newDocs, 3);
    });

    await test("second check: unchanged files aren't downloaded again (ETag); a changed file at the same address is a revision", async () => {
      hits.length = 0;
      const r1 = await checkSource(src.id, "cron");
      assert.equal(r1.newDocs + r1.revisions, 0, r1.message);
      site["/files/agenda-2026-11-17.pdf"] = { type: "application/pdf", body: Buffer.concat([read("agenda-2026-11-17.pdf"), Buffer.from("\n% revised\n")]), etag: '"a2"' };
      const r2 = await checkSource(src.id, "cron");
      assert.equal(r2.revisions, 1, r2.message);
      const versions = await db.govDocument.findMany({ where: { sourceUrl: `${GOV}/files/agenda-2026-11-17.pdf` }, orderBy: { discoveredAt: "asc" } });
      assert.equal(versions.length, 2);
      assert.ok(versions[0].supersededAt, "earlier version marked superseded");
      assert.equal(versions[1].revisionOfId, versions[0].id);
    });

    await test("failed check is recorded on the source and in the activity log", async () => {
      const bad = await db.govSource.create({ data: { name: `${PREFIX}Broken Township`, community: "Testville", govType: "township", minutesUrl: `${GOV}/nope/` } });
      const r = await checkSource(bad.id, "cron");
      assert.equal(r.ok, false);
      const s = await db.govSource.findUniqueOrThrow({ where: { id: bad.id } });
      assert.equal(s.lastStatus, "error"); assert.match(s.lastError!, /HTTP 404/); assert.equal(s.consecutiveFailures, 1);
      assert.equal((await db.govCheckRun.findFirstOrThrow({ where: { sourceId: bad.id } })).status, "error");
    });

    const minutes = await db.govDocument.findFirstOrThrow({ where: { sourceUrl: `${GOV}/files/minutes-2026-11-03.pdf` } });
    await test("AI analysis: cached instructions, server-side fallbacks, page-marked text; findings stored with status, priority and page", async () => {
      nextReply = {
        meetingDate: "2026-11-03", meetingBody: "Testville Village Council", documentType: "minutes",
        summary: "Council approved Main Street paving and held a second reading on a water rate increase.",
        findings: [
          { category: "roads", headline: "Council approves $412,500 Main Street paving", detail: "Council voted 3-0 to pave Main Street. Work begins April 2027.", actionStatus: "approved", priority: "high", amount: "$412,500", voteResult: "3-0", pageNumber: 2, quote: "Motion carried 3-0.", eventDate: null },
          { category: "rates", headline: "Water rate increase gets second reading", detail: "Ordinance 2026-14 would raise water rates 8 percent. No vote was taken.", actionStatus: "proposed", priority: "high", amount: null, voteResult: null, pageNumber: 2, quote: null, eventDate: null },
          { category: "meeting", headline: "Zoning hearing for 400 Elm St.", detail: "Public hearing December 1, 2026 at 6 p.m.", actionStatus: "scheduled", priority: "medium", amount: null, voteResult: null, pageNumber: 2, quote: null, eventDate: "2026-12-01" },
        ],
      };
      claudeCalls.length = 0;
      const r = await analyzeDocument(minutes.id);
      assert.ok(r.ok, r.message);
      const call = claudeCalls[0];
      assert.equal(call.body.model, DEFAULT_MODEL);
      assert.equal(call.body.fallbacks, "default");
      assert.match(String(call.headers["anthropic-beta"]), /server-side-fallback-2026-07-01/);
      const sys = call.body.system as { text: string; cache_control?: unknown }[];
      assert.equal(sys[0].text, SYSTEM_PROMPT); assert.deepEqual(sys[0].cache_control, { type: "ephemeral" });
      assert.equal((call.body.output_config as { format: { type: string } }).format.type, "json_schema");
      const userText = JSON.stringify(call.body.messages);
      assert.match(userText, /\[Page 2\]/); assert.match(userText, /Testville Village Council/);
      const d = await db.govDocument.findUniqueOrThrow({ where: { id: minutes.id }, include: { findings: true } });
      assert.equal(d.status, "analyzed"); assert.match(d.summary!, /Main Street/);
      assert.equal(d.findings.length, 3);
      const paving = d.findings.find((f) => f.category === "roads")!;
      assert.equal(paving.actionStatus, "approved"); assert.equal(paving.priority, "high"); assert.equal(paving.pageNumber, 2); assert.equal(paving.voteResult, "3-0");
      assert.equal(d.findings.find((f) => f.category === "rates")!.actionStatus, "proposed", "proposed is kept distinct from approved");
      assert.equal(d.findings.find((f) => f.category === "meeting")!.eventDate?.toISOString().slice(0, 10), "2026-12-01");
      assert.equal(d.inputTokens, 1200);
      const again = await analyzeDocument(minutes.id);
      assert.equal(again.ok, false, "an analyzed document isn't analyzed again automatically");
      assert.equal(claudeCalls.length, 1);
    });

    await test("scanned PDF: sent to the AI as the original PDF (no text layer needed)", async () => {
      const scan = await db.govDocument.findFirstOrThrow({ where: { sourceUrl: `${GOV}/files/scanned.pdf` } });
      nextReply = { meetingDate: "2025-01-05", meetingBody: null, documentType: "minutes", summary: "Scanned trustees minutes.", findings: [] };
      claudeCalls.length = 0;
      const r = await analyzeDocument(scan.id);
      assert.ok(r.ok, r.message);
      const content = (claudeCalls[0].body.messages as { content: { type: string; source?: { media_type: string; data: string } }[] }[])[0].content;
      assert.equal(content[0].type, "document"); assert.equal(content[0].source!.media_type, "application/pdf");
      assert.ok(Buffer.from(content[0].source!.data, "base64").equals(read("scanned.pdf")));
    });

    await test("revised minutes posted under a new address are linked to the earlier version after analysis", async () => {
      site["/files/minutes-2026-11-03-amended.pdf"] = { type: "application/pdf", body: read("minutes-2026-11-03-rev.pdf") };
      site["/council/minutes/"].body += `<a href="/files/minutes-2026-11-03-amended.pdf">Amended Council Minutes November 3, 2026</a>`;
      const r = await checkSource(src.id, "manual");
      assert.equal(r.newDocs, 1, r.message);
      const amended = await db.govDocument.findFirstOrThrow({ where: { sourceUrl: `${GOV}/files/minutes-2026-11-03-amended.pdf` } });
      nextReply = { meetingDate: "2026-11-03", meetingBody: "Testville Village Council", documentType: "minutes", summary: "Amended minutes.", findings: [] };
      await analyzeDocument(amended.id);
      const a = await db.govDocument.findUniqueOrThrow({ where: { id: amended.id } });
      assert.equal(a.revisionOfId, minutes.id);
      assert.ok((await db.govDocument.findUniqueOrThrow({ where: { id: minutes.id } })).supersededAt);
    });

    await test("records email: attachments become documents filed under the source matching the sender; duplicates skipped", async () => {
      const MailComposer = (await import("nodemailer/lib/mail-composer")).default;
      const raw = await new MailComposer({
        from: "Clerk <clerk@gwtest.example>", to: "records@tcountyconnect.com", subject: "Board minutes Oct 20, 2026", text: "Attached.",
        attachments: [{ filename: "board-minutes.docx", content: read("board.docx") }, { filename: "logo.png", content: Buffer.from("x"), cid: "logo@x" }],
      }).compile().build();
      const mail = await mailToDocuments(raw);
      assert.equal(mail.from, "clerk@gwtest.example");
      assert.equal(mail.docs.length, 1); assert.equal(mail.docs[0].fileType, "docx");
      const r = await ingestMail(mail);
      assert.equal(r.created, 1); assert.equal(r.sourceId, src.id);
      const d = await db.govDocument.findFirstOrThrow({ where: { emailFrom: "clerk@gwtest.example" } });
      assert.equal(d.origin, "email"); assert.equal(d.emailSubject, "Board minutes Oct 20, 2026"); assert.match(d.textContent!, /\$128,000/);
      assert.equal((await ingestMail(mail)).duplicates, 1);
      const bodyOnly = await mailToDocuments(await new MailComposer({ from: "someone@gwtest.example", subject: "Notice of special meeting", text: "The Testville Board of Trustees will hold a special meeting on December 9, 2026 at 7 p.m. at the township hall to discuss road salt." }).compile().build());
      assert.equal(bodyOnly.docs.length, 1); assert.equal(bodyOnly.docs[0].fileType, "text");
    });

    await test("manual upload path: same file can't be stored twice", async () => {
      const r = await ingestDocument({ buf: read("minutes-2026-11-03.pdf"), fileType: "pdf", title: `${PREFIX}upload`, origin: "upload" });
      assert.equal(r.outcome, "duplicate"); assert.equal(r.id, minutes.id);
    });

    await test("article draft: created as a DRAFT with source links; stories linked; never published", async () => {
      const f = await db.govFinding.findMany({ where: { documentId: minutes.id }, orderBy: { createdAt: "asc" } });
      nextReply = { title: "Testville approves Main Street paving; water rate increase still pending", excerpt: "Council approved paving and heard a second reading on water rates.", bodyHtml: "<p>Testville Village Council voted 3-0 to pave Main Street, according to the meeting minutes.</p><script>x()</script>" };
      claudeCalls.length = 0;
      const r = await draftArticle({ findingIds: f.slice(0, 2).map((x) => x.id), userId: null });
      assert.ok(r.ok, (r as { message?: string }).message);
      if (!r.ok) return;
      createdArticles.push(r.articleId);
      const a = await db.article.findUniqueOrThrow({ where: { id: r.articleId } });
      assert.equal(a.status, "DRAFT");
      assert.match(a.content, /<h2>Sources<\/h2>/); assert.ok(a.content.includes(`${GOV}/files/minutes-2026-11-03.pdf`), "links the original");
      assert.ok(!/<script/.test(a.content), "sanitized");
      assert.equal((await db.govFinding.findUniqueOrThrow({ where: { id: f[0].id } })).articleId, a.id);
      assert.match(JSON.stringify(claudeCalls[0].body.messages), /Officially approved/);
      assert.match(JSON.stringify(claudeCalls[0].body.messages), /Proposed \(not yet approved\)/);
    });

    await test("newsletter picker lists only approved (reviewed/published) stories", async () => {
      const f = await db.govFinding.findMany({ where: { documentId: minutes.id } });
      assert.ok(!(await searchGovStories("Main Street")).some((x) => x.title.includes("Main Street")), "new stories aren't offered");
      await db.govFinding.update({ where: { id: f.find((x) => x.category === "roads")!.id }, data: { reviewStatus: "reviewed" } });
      const picked = await searchGovStories("Main Street");
      assert.equal(picked.length, 1);
      assert.match(picked[0].description, /Testville Village Council/);
      assert.ok(picked[0].url.startsWith(GOV), "links the original record while the public section is off and the article is a draft");
    });

    await test("public Government Watch section is off by default; starter sources contain no unverified entries marked verified", async () => {
      const row = await db.setting.findUnique({ where: { key: "govWatchPublicEnabled" } });
      if (!row) assert.equal(await publicGovWatchEnabled(), false);
      assert.ok(STARTER_SOURCES.length >= 50);
      assert.ok(STARTER_SOURCES.every((s) => !/port authority|convention/i.test(s.name)), "dropped entities without evidence");
      for (const s of STARTER_SOURCES) for (const u of [s.website, s.minutesUrl, s.agendasUrl]) if (u) assert.ok(/^https?:\/\//.test(u), u);
    });
  } finally {
    await cleanup();
    gov.close(); claude.close();
    await db.$disconnect();
  }
  console.log(results.join("\n"));
  console.log(failed ? `${failed} FAILED` : `All ${results.length} Government Watch tests passed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
