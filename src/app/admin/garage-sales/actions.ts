"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { sanitizePlain } from "@/lib/sanitize";
import { absoluteUrl } from "@/lib/utils";
import { isDateKey, startOfNyDay } from "@/components/public/dates";
import type { ActionState } from "@/components/ui/form-message";
import { endedSaleWhere, garageSaleHref } from "@/lib/garage-sales";
import { GARAGE_SALE_CATEGORIES, GARAGE_SALE_TYPES } from "@/lib/garage-sales-shared";
import { parseForm, zOpt, zReq } from "../_lib/form";

function refresh(id?: string) {
  revalidatePath("/admin/garage-sales/");
  if (id) revalidatePath(`/admin/garage-sales/${id}/`);
  revalidatePath("/admin/submissions/");
  revalidatePath("/admin/freshness/");
  revalidatePath("/garage-sales/", "layout");
  revalidatePath("/");
}

const STATUSES = ["PENDING", "PUBLISHED", "REJECTED", "REMOVED"] as const;

/** Approve / reject (with emailed reason) / remove / restore to pending. */
export async function setGarageSaleStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(z.object({ id: z.string().min(1), status: z.enum(STATUSES), reason: zOpt(1000) }), fd);
  if (p.error) return p.error;
  const { id, status, reason } = p.data;
  if (status === "REJECTED" && !reason) return { error: "Add a reason so the submitter knows why." };
  const s = await db.garageSale.findUnique({ where: { id } });
  if (!s) return { error: "Sale not found." };
  if (s.status === status) return { ok: true, message: "No change." };
  const now = new Date();
  await db.garageSale.update({
    where: { id },
    data: {
      status,
      rejectionReason: status === "REJECTED" ? reason : null,
      ...(status === "PUBLISHED" || status === "REJECTED" ? { reviewedById: user.id, reviewedAt: now } : {}),
      ...(status === "PUBLISHED" ? { publishedAt: s.publishedAt ?? now, removedAt: null } : {}),
      ...(status === "REMOVED" ? { removedAt: now } : {}),
    },
  });
  const verb = status === "PUBLISHED" ? (s.status === "PENDING" ? "approve" : "publish") : status === "REJECTED" ? "reject" : status === "REMOVED" ? "remove" : "reopen";
  await audit(user.id, `garage_sale.${verb}`, "GarageSale", id, { title: s.title, from: s.status, reason });
  if (s.status === "PENDING" && status === "PUBLISHED") {
    await sendEmail(s.submitterEmail, `Your garage sale “${s.title}” is live`,
      `Good news! Your sale is now listed on T County Connect:\n${absoluteUrl(garageSaleHref(s))}\n\nNeed to change or cancel it? Use the private manage link from our first email.\n\n— T County Connect`);
  } else if (status === "REJECTED") {
    await sendEmail(s.submitterEmail, `About your garage sale “${s.title}”`,
      `Thanks for sharing “${s.title}”. We weren't able to publish it.\n\nReason: ${reason}\n\nYou can fix it and resubmit using the private manage link from our first email, or list it again at ${absoluteUrl("/garage-sales/submit/")}.\n\n— T County Connect`);
  }
  refresh(id);
  return { ok: true, message: { approve: "Sale approved and published.", publish: "Sale published.", reject: "Sale rejected. The submitter was emailed.", remove: "Sale removed.", reopen: "Moved back to pending." }[verb] };
}

const TYPE_VALUES = GARAGE_SALE_TYPES.map((t) => t.value) as [string, ...string[]];
const CATS = new Set<string>(GARAGE_SALE_CATEGORIES.map((c) => c.key));

/** Staff edit. Keeps the current status; date rules are relaxed for corrections. */
export async function adminSaveGarageSale(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(z.object({
    id: z.string().min(1),
    title: zReq("Title", 120),
    saleType: z.enum(TYPE_VALUES),
    description: zOpt(2000),
    startDate: z.string().refine(isDateKey, "Enter the first day"),
    endDate: z.string().refine(isDateKey, "Enter the last day"),
    dailyStart: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
    dailyEnd: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
    address: zOpt(200),
    generalLocation: zOpt(120),
    addressVisibility: z.enum(["EXACT", "GENERAL"]),
    city: zOpt(80),
    zip: zOpt(10),
  }), fd);
  if (p.error) return p.error;
  const d = p.data;
  if (d.endDate < d.startDate) return { error: "The last day must be on or after the first day." };
  if (d.dailyEnd <= d.dailyStart) return { error: "Closing time must be after opening time." };
  if (d.addressVisibility === "GENERAL" && !d.generalLocation) return { error: "Add a general location, or switch to showing the exact address." };
  if (d.addressVisibility === "EXACT" && !d.address) return { error: "Add the street address to show it publicly." };
  const existing = await db.garageSale.findUnique({ where: { id: d.id }, select: { id: true } });
  if (!existing) return { error: "Sale not found." };
  const photos = fd.getAll("photos").map(String).filter(Boolean).slice(0, 4);
  const s = await db.garageSale.update({
    where: { id: d.id },
    data: {
      title: sanitizePlain(d.title, 120), saleType: d.saleType as never, description: sanitizePlain(d.description, 2000) || null,
      itemCategories: fd.getAll("itemCategories").map(String).filter((k) => CATS.has(k)),
      startDate: startOfNyDay(d.startDate), endDate: startOfNyDay(d.endDate), dailyStart: d.dailyStart, dailyEnd: d.dailyEnd,
      address: sanitizePlain(d.address, 200) || null, generalLocation: sanitizePlain(d.generalLocation, 120) || null,
      addressVisibility: d.addressVisibility, city: sanitizePlain(d.city, 80) || null, zip: sanitizePlain(d.zip, 10) || null, photos,
    },
  });
  await audit(user.id, "garage_sale.update", "GarageSale", s.id, { title: s.title });
  refresh(s.id);
  return { ok: true, message: "Sale saved." };
}

/** Freshness: move every ended published sale to Removed (archive). Safe — ended sales are already hidden. */
export async function archiveEndedGarageSales(_: ActionState, _fd: FormData): Promise<ActionState> {
  void _fd;
  const user = await requireStaff();
  const ended = await db.garageSale.findMany({ where: endedSaleWhere(), select: { id: true } });
  if (!ended.length) return { ok: true, message: "Nothing to archive." };
  await db.garageSale.updateMany({ where: { id: { in: ended.map((e) => e.id) } }, data: { status: "REMOVED", removedAt: new Date() } });
  await audit(user.id, "garage_sale.archive_ended", "GarageSale", undefined, { count: ended.length, ids: ended.map((e) => e.id) });
  refresh();
  return { ok: true, message: `Archived ${ended.length} ended sale${ended.length === 1 ? "" : "s"}.` };
}
