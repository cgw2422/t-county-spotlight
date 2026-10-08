import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { activeRun, createRun, executeRun } from "@/lib/wordpress/run";
import { checkWordPressUrl } from "@/lib/wordpress/safe-url";

const MAX_WXR_BYTES = 200 * 1024 * 1024;

/**
 * Upload a WordPress WXR export (Tools → Export) and import it in the
 * background. Admin only. Responds with a redirect to the run page.
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const back = (msg: string) => NextResponse.redirect(new URL(`/admin/migration/?error=${encodeURIComponent(msg)}`, req.url), 303);
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_WXR_BYTES) return back("The export is larger than 200 MB. Split it in WordPress (Tools → Export by post type) and upload each file.");
  if (await activeRun()) return back("Another import is still running. Wait for it to finish first.");

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return back("Choose a WXR .xml file exported from WordPress.");
  const xml = await file.text();
  if (!/<rss[\s>]/.test(xml.slice(0, 5000)) || !xml.includes("wordpress.org/export")) return back("That file is not a WordPress WXR export.");

  let baseUrl: string | undefined;
  const rawBase = form.get("baseUrl")?.toString().trim();
  if (rawBase) {
    const u = checkWordPressUrl(rawBase);
    if (!u.ok) return back(u.error);
    baseUrl = u.url;
  }
  const opts = {
    source: "wxr" as const, wxrXml: xml, wxrFilename: file.name.slice(0, 200), baseUrl,
    force: form.get("force") === "on", skipMedia: form.get("skipMedia") === "on", dryRun: form.get("dryRun") === "on",
    importAllMedia: form.get("importAllMedia") === "on", startedBy: user.email,
  };
  const run = await createRun(opts);
  await audit(user.id, "migration.start", "MigrationRun", run.id, { source: "wxr", file: opts.wxrFilename, size: file.size, force: opts.force, skipMedia: opts.skipMedia, dryRun: opts.dryRun });
  void executeRun(run.id, opts).catch((e) => console.error(`[migration ${run.id}]`, e));
  return NextResponse.redirect(new URL(`/admin/migration/${run.id}/`, req.url), 303);
}
