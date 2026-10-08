"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/components/ui/form-message";
import { activeRun, createRun, executeRun } from "@/lib/wordpress/run";
import { checkWordPressUrl } from "@/lib/wordpress/safe-url";

const schema = z.object({
  baseUrl: z.string().trim().min(1, "Enter the WordPress site URL").max(300),
  force: z.boolean(),
  skipMedia: z.boolean(),
  dryRun: z.boolean(),
  importAllMedia: z.boolean(),
});

/** Start a REST import in the background and open its run page. */
export async function startRestImport(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const parsed = schema.safeParse({
    baseUrl: String(fd.get("baseUrl") ?? ""),
    force: fd.get("force") === "on",
    skipMedia: fd.get("skipMedia") === "on",
    dryRun: fd.get("dryRun") === "on",
    importAllMedia: fd.get("importAllMedia") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const url = checkWordPressUrl(parsed.data.baseUrl);
  if (!url.ok) return { error: url.error };
  const running = await activeRun();
  if (running) return { error: "Another import is still running. Wait for it to finish first." };

  const opts = { source: "rest" as const, baseUrl: url.url, force: parsed.data.force, skipMedia: parsed.data.skipMedia, dryRun: parsed.data.dryRun, importAllMedia: parsed.data.importAllMedia, startedBy: user.email };
  const run = await createRun(opts);
  await audit(user.id, "migration.start", "MigrationRun", run.id, { source: "rest", baseUrl: url.url, force: opts.force, skipMedia: opts.skipMedia, dryRun: opts.dryRun });
  // fire-and-forget: the run updates MigrationRun.log as it goes; the page polls
  void executeRun(run.id, opts).catch((e) => console.error(`[migration ${run.id}]`, e));
  redirect(`/admin/migration/${run.id}/`);
}
