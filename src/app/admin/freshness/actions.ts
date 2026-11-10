"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/components/ui/form-message";
import { freshnessWhere } from "./data";

function refresh() {
  revalidatePath("/admin/freshness/");
  revalidatePath("/", "layout");
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Bulk clean-up of content whose dates have passed. Each run is audit-logged with the affected ids. */
export async function bulkFreshness(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const kind = String(fd.get("kind") ?? "");
  const w = freshnessWhere();
  switch (kind) {
    case "events": {
      const rows = await db.event.findMany({ where: w.endedEvents, select: { id: true } });
      if (!rows.length) return { ok: true, message: "Nothing to archive." };
      await db.event.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: "ARCHIVED" } });
      await audit(user.id, "event.archive_ended", "Event", undefined, { count: rows.length, ids: rows.map((r) => r.id) });
      refresh();
      return { ok: true, message: `Archived ${plural(rows.length, "ended event")}.` };
    }
    case "specials": {
      const rows = await db.promotion.findMany({ where: w.expiredSpecials, select: { id: true } });
      if (!rows.length) return { ok: true, message: "Nothing to unpublish." };
      await db.promotion.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: "UNPUBLISHED" } });
      await audit(user.id, "promotion.unpublish_expired", "Promotion", undefined, { count: rows.length, ids: rows.map((r) => r.id) });
      refresh();
      return { ok: true, message: `Unpublished ${plural(rows.length, "expired special")}.` };
    }
    case "needs": {
      const rows = await db.communityNeed.findMany({ where: w.pastDeadlineNeeds, select: { id: true } });
      if (!rows.length) return { ok: true, message: "Nothing to close." };
      await db.communityNeed.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: "CLOSED" } });
      await audit(user.id, "need.close_past_deadline", "CommunityNeed", undefined, { count: rows.length, ids: rows.map((r) => r.id) });
      refresh();
      return { ok: true, message: `Closed ${plural(rows.length, "need")} past their deadline.` };
    }
    case "opportunities": {
      const rows = await db.volunteerOpportunity.findMany({ where: w.endedOpportunities, select: { id: true } });
      if (!rows.length) return { ok: true, message: "Nothing to close." };
      await db.volunteerOpportunity.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: "CLOSED" } });
      await audit(user.id, "volunteer.close_ended", "VolunteerOpportunity", undefined, { count: rows.length, ids: rows.map((r) => r.id) });
      refresh();
      return { ok: true, message: `Closed ${rows.length} ended ${rows.length === 1 ? "opportunity" : "opportunities"}.` };
    }
    default:
      return { error: "Unknown clean-up." };
  }
}

/** Stop featuring an old announcement (it stays published and searchable). */
export async function unfeatureArticle(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const id = String(fd.get("id") ?? "");
  const a = await db.article.findUnique({ where: { id }, select: { id: true, title: true } });
  if (!a) return { error: "Article not found." };
  await db.article.update({ where: { id }, data: { isFeatured: false } });
  await audit(user.id, "article.unfeature", "Article", id, { title: a.title, source: "freshness" });
  refresh();
  return { ok: true, message: "No longer featured." };
}
