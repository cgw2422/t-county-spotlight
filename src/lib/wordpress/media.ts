/**
 * Media migration: downloads WordPress uploads into permanent storage
 * (S3 bucket or PostgreSQL via src/lib/storage.ts), deduplicated on the
 * original URL, and rewrites URLs in HTML. Sized variants (-300x200.jpg),
 * -scaled originals, srcset entries and Jetpack Photon (i0.wp.com) URLs all
 * map to the single stored original.
 */
import { db } from "@/lib/db";
import { saveImageUpload, putObject, sniffImageType, MAX_UPLOAD_BYTES } from "@/lib/storage";
import { decodeEntities, htmlToText } from "./html";
import type { Logger, WpMedia } from "./types";

export type MediaFailure = { url: string; reason: string; context?: string };

const FILE_EXT = /\.(jpe?g|png|gif|webp|avif|svg|ico|bmp|tiff?|pdf)$/i;
const SIZE_SUFFIX = /-\d{1,5}x\d{1,5}(\.[a-z0-9]+)$/i;
const SCALED_SUFFIX = /-(?:scaled|rotated)(\.[a-z0-9]+)$/i;

export class MediaManager {
  private hosts: Set<string>;
  private origin: string;
  private byKey = new Map<string, WpMedia>();
  private byId = new Map<number, WpMedia>();
  private memo = new Map<string, Promise<string | null>>();
  /** original URL string (as written in content) → new URL */
  readonly urlMap = new Map<string, string>();
  readonly failures: MediaFailure[] = [];
  readonly stats = { referenced: 0, downloaded: 0, reused: 0, failed: 0, skipped: 0 };
  readonly processedIds = new Set<number>();
  private active = 0;
  private queue: (() => void)[] = [];

  constructor(private opts: { baseUrl: string; media: WpMedia[]; skipDownload?: boolean; concurrency?: number; log?: Logger; extraHosts?: string[] }) {
    const u = new URL(opts.baseUrl);
    this.origin = u.origin;
    const bare = u.host.replace(/^www\./, "");
    this.hosts = new Set([u.host, bare, `www.${bare}`, ...(opts.extraHosts ?? [])]);
    for (const m of opts.media) {
      this.byId.set(m.id, m);
      for (const v of [m.url, ...m.variants]) {
        const k = this.key(v);
        if (!k) continue;
        if (!this.byKey.has(k)) this.byKey.set(k, m);
        const descaled = k.replace(SCALED_SUFFIX, "$1");
        if (!this.byKey.has(descaled)) this.byKey.set(descaled, m);
      }
    }
  }

  get siteHosts() { return [...this.hosts]; }
  mediaById(id: number) { return this.byId.get(id); }

  /** Undo Photon, protocol-relative, entities; return absolute URL without query/hash. */
  normalize(raw: string): string | null {
    let s = decodeEntities(raw.trim());
    if (s.startsWith("//")) s = "https:" + s;
    else if (s.startsWith("/")) s = this.origin + s;
    let u: URL;
    try { u = new URL(s); } catch { return null; }
    const photon = u.host.match(/^i\d\.wp\.com$/) ? u.pathname.match(/^\/([^/]+)(\/.*)$/) : null;
    if (photon) { try { u = new URL(`https://${photon[1]}${photon[2]}`); } catch { return null; } }
    if (!this.hosts.has(u.host)) return null;
    return `${u.protocol}//${u.host}${u.pathname}`;
  }

  /** True when the URL points at a file on the WordPress site that should be migrated. */
  isSiteFile(raw: string) {
    const n = this.normalize(raw);
    if (!n) return false;
    const p = new URL(n).pathname;
    return p.includes("/wp-content/uploads/") || FILE_EXT.test(p);
  }

  /** Dedupe key: host-less path with the -WxH size suffix removed. */
  key(raw: string): string | null {
    const n = this.normalize(raw);
    if (!n) return null;
    let p: string;
    try { p = decodeURIComponent(new URL(n).pathname); } catch { p = new URL(n).pathname; }
    return p.replace(SIZE_SUFFIX, "$1").toLowerCase();
  }

  private async slot<T>(fn: () => Promise<T>): Promise<T> {
    const limit = this.opts.concurrency ?? 4;
    if (this.active >= limit) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    try { return await fn(); } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }

  /** Ensure the file behind `raw` is stored; returns its new URL or null. */
  ensure(raw: string, info: { context?: string; alt?: string; wpId?: number } = {}): Promise<string | null> {
    const k = this.key(raw);
    if (!k) return Promise.resolve(null);
    const existing = this.memo.get(k);
    if (existing) return existing.then((url) => { if (url) this.urlMap.set(raw, url); return url; });
    this.stats.referenced++;
    const p = this.doEnsure(raw, k, info).then((url) => { if (url) this.urlMap.set(raw, url); return url; });
    this.memo.set(k, p);
    return p;
  }

  async ensureId(id: number | undefined, context?: string): Promise<{ url: string; alt?: string } | null> {
    if (!id) return null;
    const m = this.byId.get(id);
    if (!m) {
      this.failures.push({ url: `attachment #${id}`, reason: "attachment not found in media library", context });
      this.stats.failed++;
      return null;
    }
    const url = await this.ensure(m.url, { context, wpId: id });
    return url ? { url, alt: m.alt } : null;
  }

  private async doEnsure(raw: string, k: string, info: { context?: string; alt?: string; wpId?: number }): Promise<string | null> {
    const attachment = this.byKey.get(k) ?? this.byKey.get(k.replace(SCALED_SUFFIX, "$1"));
    const normalized = this.normalize(raw)!;
    const stripped = normalized.replace(SIZE_SUFFIX, "$1");
    const candidates = [...new Set([attachment?.url ? this.normalize(attachment.url) : null, stripped, normalized].filter(Boolean) as string[])];
    if (attachment) this.processedIds.add(attachment.id);

    // reuse files stored by a previous run
    for (const c of candidates) {
      const hit = await db.media.findUnique({ where: { sourceUrl: c }, select: { url: true } });
      if (hit) { this.stats.reused++; return hit.url; }
    }
    if (attachment) {
      const hit = await db.media.findUnique({ where: { wpId: attachment.id }, select: { url: true } });
      if (hit) { this.stats.reused++; return hit.url; }
    }
    if (this.opts.skipDownload) { this.stats.skipped++; return null; }

    return this.slot(async () => {
      let lastReason = "";
      for (const url of candidates) {
        try {
          const r = await fetch(url, { headers: { "User-Agent": "TCountySpotlight-Migrator/1.0" }, signal: AbortSignal.timeout(60_000) });
          if (!r.ok) { lastReason = `HTTP ${r.status}`; continue; }
          const len = Number(r.headers.get("content-length") ?? 0);
          if (len > MAX_UPLOAD_BYTES) { lastReason = `file too large (${Math.round(len / 1e6)} MB)`; break; }
          const buf = Buffer.from(await r.arrayBuffer());
          if (buf.length > MAX_UPLOAD_BYTES) { lastReason = "file too large (>15 MB)"; break; }
          const filename = decodeURIComponent(new URL(url).pathname.split("/").pop() || "file");
          const wpId = attachment?.id ?? info.wpId;
          const wpIdFree = wpId ? !(await db.media.findUnique({ where: { wpId }, select: { id: true } })) : false;
          const extra = {
            sourceUrl: url,
            wpId: wpIdFree ? wpId : undefined,
            alt: (attachment?.alt || info.alt || undefined)?.slice(0, 500),
            caption: attachment?.caption ? htmlToText(attachment.caption).slice(0, 1000) || undefined : undefined,
            title: attachment?.title?.slice(0, 300),
          };
          let stored: { url: string };
          if (sniffImageType(buf)) {
            stored = await saveImageUpload(buf, filename, null, extra);
          } else if (buf.subarray(0, 5).toString() === "%PDF-") {
            const obj = await putObject(buf, "application/pdf", filename);
            stored = await db.media.create({ data: { key: obj.key, url: obj.url, filename: filename.slice(0, 200), mimeType: "application/pdf", size: buf.length, ...extra } });
          } else {
            lastReason = `unsupported file type (${r.headers.get("content-type") ?? "unknown"})`;
            break;
          }
          this.stats.downloaded++;
          return stored.url;
        } catch (e) {
          const msg = (e as Error).message;
          if (/Unique constraint/i.test(msg)) {
            const hit = await db.media.findUnique({ where: { sourceUrl: url }, select: { url: true } });
            if (hit) { this.stats.reused++; return hit.url; }
          }
          lastReason = msg;
        }
      }
      this.stats.failed++;
      this.failures.push({ url: normalized, reason: lastReason || "download failed", context: info.context });
      this.opts.log?.(`  ✗ media ${normalized}: ${lastReason}`);
      return null;
    });
  }

  /** Every site-hosted file URL string in an HTML fragment. */
  findUrls(html: string): string[] {
    const found = new Set<string>();
    for (const m of html.matchAll(/(?:https?:)?\/\/[^\s"'<>()\\]+?(?=[\s"'<>()\\]|,\s|,$|$)/gi)) {
      const s = m[0].replace(/[.,;]+$/, "");
      if (this.isSiteFile(s)) found.add(s);
    }
    for (const m of html.matchAll(/(?<=["'\s,(=])\/wp-content\/uploads\/[^\s"'<>()\\]+?(?=[\s"'<>()\\]|,\s|$)/gi)) found.add(m[0]);
    return [...found];
  }

  /** Download every file referenced in `html` and return the rewritten HTML. */
  async rewriteHtml(html: string, context?: string): Promise<string> {
    if (!html) return html;
    const urls = this.findUrls(html);
    await Promise.all(urls.map((u) => this.ensure(u, { context })));
    let out = html;
    // longest first so a URL that is a prefix of another is not replaced inside it
    for (const u of urls.sort((a, b) => b.length - a.length)) {
      const n = this.urlMap.get(u);
      if (n) out = out.split(u).join(n);
    }
    return out;
  }
}
