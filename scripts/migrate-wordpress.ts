/**
 * WordPress → TCountySpotlight migration CLI.
 *
 *   npx tsx --conditions=react-server scripts/migrate-wordpress.ts [options]
 *
 * Options:
 *   --source=rest|wxr        default rest (wxr when --file is given)
 *   --file=export.xml        WXR export (Tools → Export in WordPress)
 *   --base=https://…         WordPress URL (default WP_BASE_URL)
 *   --dry-run                discover + plan only, no content writes
 *   --force                  overwrite records edited locally
 *   --skip-media             do not download images (URLs stay pointed at WordPress)
 *   --all-media              also download library files no content references
 *   --limit=N                max items per post type (testing)
 *
 * Credentials (optional, REST only): WP_USERNAME + WP_APP_PASSWORD.
 * The `--conditions=react-server` flag lets the shared server-only modules
 * (storage, db) load outside Next.js; the script re-executes itself with it
 * when it was started without.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function hasReactServerCondition() {
  return process.execArgv.join(" ").includes("react-server") || (process.env.NODE_OPTIONS ?? "").includes("react-server");
}

async function main() {
  if (!hasReactServerCondition()) {
    const r = spawnSync(process.execPath, [...process.execArgv, "--conditions=react-server", ...process.argv.slice(1)], { stdio: "inherit", env: process.env });
    process.exit(r.status ?? 1);
  }

  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const m = a.match(/^--([^=]+)(?:=(.*))?$/);
      return m ? [m[1], m[2] ?? "true"] : [a, "true"];
    }),
  );
  if (args.help || args.h) {
    console.log(fs.readFileSync(__filename, "utf8").split("*/")[0]);
    process.exit(0);
  }
  const file = args.file as string | undefined;
  const source = ((args.source as string) || (file ? "wxr" : "rest")) as "rest" | "wxr";
  if (source === "wxr" && !file) throw new Error("--source=wxr needs --file=export.xml");

  const { createRun, executeRun, reportToMarkdown } = await import("../src/lib/wordpress/run");
  const { db } = await import("../src/lib/db");

  const opts = {
    source,
    baseUrl: (args.base as string) || (source === "rest" ? process.env.WP_BASE_URL : undefined),
    wxrXml: file ? fs.readFileSync(path.resolve(file), "utf8") : undefined,
    wxrFilename: file ? path.basename(file) : undefined,
    dryRun: args["dry-run"] === "true",
    force: args.force === "true",
    skipMedia: args["skip-media"] === "true",
    importAllMedia: args["all-media"] === "true",
    limitPerType: args.limit ? Number(args.limit) : undefined,
    startedBy: "cli",
  };
  console.log(`WordPress migration — source=${source} base=${opts.baseUrl ?? "(from file)"}${opts.dryRun ? " DRY RUN" : ""}${opts.force ? " FORCE" : ""}${opts.skipMedia ? " SKIP-MEDIA" : ""}`);
  const run = await createRun(opts);
  let exitCode = 0;
  try {
    const report = await executeRun(run.id, opts, (line) => console.log(line));
    const dir = path.resolve("migration-reports");
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    fs.writeFileSync(path.join(dir, `${stamp}.json`), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(dir, `${stamp}.md`), reportToMarkdown(report));
    console.log(`\nReport: migration-reports/${stamp}.md (+ .json) — run ${run.id}`);
    const i = report.imported;
    console.log(`Articles ${i.articles} · Businesses ${i.businesses} · Pages ${i.pages} · Images ${report.media.downloaded} new / ${report.media.reused} reused / ${report.media.failed} failed · Failed records ${report.failed.length} · Redirects +${report.redirects.created}`);
  } catch (e) {
    console.error(`\nMigration failed: ${(e as Error).message}`);
    exitCode = 1;
  } finally {
    await db.$disconnect();
  }
  process.exit(exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
