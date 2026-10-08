/** Migration report shape + Markdown rendering. */
import type { EndpointResult } from "./types";
import type { MediaFailure } from "./media";

export type RecordRef = { type: string; wpId: number; title?: string };

export type ImportReport = {
  runId?: string;
  source: "rest" | "wxr";
  baseUrl: string;
  dryRun: boolean;
  options: Record<string, unknown>;
  startedAt: string;
  finishedAt?: string;
  durationSec?: number;
  authenticated: boolean;
  site: { name?: string; description?: string; url?: string };
  /** Records discovered per WordPress type (post types, attachment, term:<taxonomy>, author, menu). */
  discovered: Record<string, number>;
  /** Totals the source itself reported (X-WP-Total / WXR counts). */
  sourceTotals: Record<string, number>;
  imported: {
    articles: number;
    articlesByKind: Record<string, number>;
    articlesByStatus: Record<string, number>;
    businesses: number;
    pages: number;
    otherTypesAsArticles: number;
    categories: number;
    tags: number;
    businessCategories: number;
    articleBusinessLinks: number;
    spotlightedBusinesses: number;
    created: number;
    updated: number;
  };
  preservedLocalEdits: (RecordRef & { reason?: string })[];
  skipped: (RecordRef & { reason: string })[];
  failed: (RecordRef & { error: string })[];
  media: { libraryTotal: number; referenced: number; downloaded: number; reused: number; failed: number; skipped: number; unreferencedInLibrary: number };
  missingFiles: MediaFailure[];
  brokenLinks: { from: string; href: string }[];
  duplicates: (RecordRef & { detail: string })[];
  urlChanges: (RecordRef & { from: string; to: string })[];
  redirects: { created: number; updated: number; unchanged: number; skippedManual: number; skippedConflict: number; list: { from: string; to: string }[] };
  requiresCredentials: string[];
  endpointErrors: EndpointResult[];
  unmappedPostTypes: { type: string; count: number; importedAs: string }[];
  unmappedTaxonomies: { taxonomy: string; terms: number; note: string }[];
  unmappedFields: { type: string; field: string; count: number }[];
  unexpandedShortcodes: { shortcode: string; count: number }[];
  menus: { name: string; items: number; locations?: string[] }[];
  branding: { logo: string; icon: string };
  warnings: string[];
  /** Dry runs only: what each record would become. */
  plan?: { type: string; wpId: number; title: string; target: string; kind?: string; status: string; path?: string }[];
};

export function emptyReport(source: "rest" | "wxr", baseUrl: string, dryRun: boolean, options: Record<string, unknown>): ImportReport {
  return {
    source, baseUrl, dryRun, options, startedAt: new Date().toISOString(), authenticated: false, site: {},
    discovered: {}, sourceTotals: {},
    imported: { articles: 0, articlesByKind: {}, articlesByStatus: {}, businesses: 0, pages: 0, otherTypesAsArticles: 0, categories: 0, tags: 0, businessCategories: 0, articleBusinessLinks: 0, spotlightedBusinesses: 0, created: 0, updated: 0 },
    preservedLocalEdits: [], skipped: [], failed: [],
    media: { libraryTotal: 0, referenced: 0, downloaded: 0, reused: 0, failed: 0, skipped: 0, unreferencedInLibrary: 0 },
    missingFiles: [], brokenLinks: [], duplicates: [], urlChanges: [],
    redirects: { created: 0, updated: 0, unchanged: 0, skippedManual: 0, skippedConflict: 0, list: [] },
    requiresCredentials: [], endpointErrors: [], unmappedPostTypes: [], unmappedTaxonomies: [], unmappedFields: [],
    unexpandedShortcodes: [], menus: [], branding: { logo: "not found", icon: "not found" }, warnings: [],
  };
}

const esc = (s: unknown) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const table = (head: string[], rows: unknown[][], max = 500) => {
  if (!rows.length) return "_None._\n";
  const lines = [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.slice(0, max).map((r) => `| ${r.map(esc).join(" | ")} |`)];
  if (rows.length > max) lines.push(`\n_…and ${rows.length - max} more (see the JSON report)._`);
  return lines.join("\n") + "\n";
};

export function reportToMarkdown(r: ImportReport): string {
  const i = r.imported;
  const out: string[] = [];
  out.push(`# WordPress migration report${r.dryRun ? " (dry run)" : ""}`);
  out.push("");
  out.push(`- **Source:** ${r.source.toUpperCase()} — ${r.baseUrl}`);
  if (r.site.name) out.push(`- **Site:** ${r.site.name}${r.site.description ? ` — ${r.site.description}` : ""}`);
  out.push(`- **Started:** ${r.startedAt}${r.finishedAt ? ` · **Finished:** ${r.finishedAt} (${r.durationSec}s)` : ""}`);
  out.push(`- **Authenticated:** ${r.authenticated ? "yes (drafts, scheduled, pending and private content included)" : "no (public content only)"}`);
  out.push(`- **Options:** \`${JSON.stringify(r.options)}\``);
  if (r.runId) out.push(`- **Run:** ${r.runId}`);
  out.push("");
  out.push("## Summary");
  out.push(table(["Metric", "Count"], [
    ["Articles imported", i.articles], ["Businesses imported", i.businesses], ["Pages imported", i.pages],
    ["Other post types imported as articles", i.otherTypesAsArticles], ["Categories", i.categories], ["Tags", i.tags],
    ["Business categories", i.businessCategories], ["Article ↔ business links", i.articleBusinessLinks],
    ["Businesses marked spotlighted", i.spotlightedBusinesses], ["Records created / updated", `${i.created} / ${i.updated}`],
    ["Images referenced / downloaded / reused / failed", `${r.media.referenced} / ${r.media.downloaded} / ${r.media.reused} / ${r.media.failed}`],
    ["Preserved local edits", r.preservedLocalEdits.length], ["Skipped", r.skipped.length], ["Failed imports", r.failed.length],
    ["Missing files", r.missingFiles.length], ["Broken internal links", r.brokenLinks.length], ["Duplicates detected", r.duplicates.length],
    ["URL changes", r.urlChanges.length], ["Redirects created / updated", `${r.redirects.created} / ${r.redirects.updated}`],
  ]));
  out.push("## Records discovered");
  out.push(table(["WordPress type", "Discovered", "Source total"], Object.keys({ ...r.discovered, ...r.sourceTotals }).sort().map((k) => [k, r.discovered[k] ?? "", r.sourceTotals[k] ?? ""])));
  out.push("### Articles by kind / status");
  out.push(table(["Kind", "Count"], Object.entries(i.articlesByKind)));
  out.push(table(["Status", "Count"], Object.entries(i.articlesByStatus)));
  out.push("## Endpoints that required credentials");
  out.push(r.requiresCredentials.length ? r.requiresCredentials.map((e) => `- \`${e}\``).join("\n") + "\n\nProvide a WordPress Application Password (WP_USERNAME + WP_APP_PASSWORD) or a WXR export to include these.\n" : "_None._\n");
  if (r.endpointErrors.length) { out.push("### Other endpoint errors"); out.push(table(["Endpoint", "Status", "Note"], r.endpointErrors.map((e) => [e.endpoint, e.status, e.note ?? ""]))); }
  out.push("## Unmapped custom post types");
  out.push(table(["Type", "Count", "Imported as"], r.unmappedPostTypes.map((u) => [u.type, u.count, u.importedAs])));
  out.push("## Unmapped taxonomies");
  out.push(table(["Taxonomy", "Terms", "Note"], r.unmappedTaxonomies.map((u) => [u.taxonomy, u.terms, u.note])));
  out.push("## Unmapped fields (kept in wpMeta)");
  out.push(table(["Type", "Field", "Records"], r.unmappedFields.map((u) => [u.type, u.field, u.count])));
  out.push("## Failed imports");
  out.push(table(["Type", "WP ID", "Title", "Error"], r.failed.map((f) => [f.type, f.wpId, f.title, f.error])));
  out.push("## Skipped");
  out.push(table(["Type", "WP ID", "Title", "Reason"], r.skipped.map((f) => [f.type, f.wpId, f.title, f.reason])));
  out.push("## Preserved local edits");
  out.push(table(["Type", "WP ID", "Title"], r.preservedLocalEdits.map((f) => [f.type, f.wpId, f.title])));
  out.push("## Missing files");
  out.push(table(["URL", "Reason", "Referenced by"], r.missingFiles.map((f) => [f.url, f.reason, f.context ?? ""])));
  out.push("## Broken internal links");
  out.push(table(["In", "Link"], r.brokenLinks.map((b) => [b.from, b.href])));
  out.push("## Duplicates detected");
  out.push(table(["Type", "WP ID", "Title", "Detail"], r.duplicates.map((d) => [d.type, d.wpId, d.title, d.detail])));
  out.push("## URL changes");
  out.push(table(["Type", "Title", "Old URL", "New URL"], r.urlChanges.map((u) => [u.type, u.title, u.from, u.to])));
  out.push("## Redirects");
  out.push(`Created ${r.redirects.created}, updated ${r.redirects.updated}, unchanged ${r.redirects.unchanged}, kept manual ${r.redirects.skippedManual}, skipped (path is live content) ${r.redirects.skippedConflict}.\n`);
  out.push(table(["From", "To"], r.redirects.list.map((x) => [x.from, x.to])));
  out.push("## Shortcodes left unexpanded");
  out.push(table(["Shortcode", "Records"], r.unexpandedShortcodes.map((s) => [`[${s.shortcode}]`, s.count])));
  out.push("## Menus found");
  out.push(table(["Menu", "Items", "Locations"], r.menus.map((m) => [m.name, m.items, (m.locations ?? []).join(", ")])));
  out.push("## Branding");
  out.push(`- Logo: ${r.branding.logo}\n- Icon: ${r.branding.icon}\n`);
  out.push("## Warnings");
  out.push(r.warnings.length ? r.warnings.map((w) => `- ${w}`).join("\n") + "\n" : "_None._\n");
  if (r.plan) {
    out.push("## Dry-run plan");
    out.push(table(["Type", "WP ID", "Title", "Target", "Kind", "Status", "Path"], r.plan.map((p) => [p.type, p.wpId, p.title, p.target, p.kind ?? "", p.status, p.path ?? ""]), 2000));
  }
  return out.join("\n");
}
