"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sanitizePlain } from "@/lib/sanitize";
import { ORG_KINDS } from "@/lib/gives/constants";
import { CsvError, parseCsv } from "@/lib/gives/csv";
import {
  IMPORT_FIELD_KEYS, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, analyzeImport, createDataFor, fillEmptyData, importSlug, readDefaults, readMapping,
  type ImportResult,
} from "@/lib/gives/import";
import type { Prisma } from "@/generated/prisma/client";
import type { ActionState } from "@/components/ui/form-message";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Step 1: upload & parse a CSV (admin only). */
export async function uploadImport(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose a CSV file to upload." };
  if (file.size > IMPORT_MAX_BYTES) return { error: "The file is larger than 2 MB. Split it into smaller files." };
  if (!/\.csv$/i.test(file.name) && !/csv|text\/plain|excel/i.test(file.type)) return { error: "Please upload a .csv file." };
  let rows: string[][];
  try {
    const text = new TextDecoder("utf-8").decode(await file.arrayBuffer());
    if (text.includes("\u0000")) return { error: "This doesn't look like a text CSV file." };
    rows = parseCsv(text, { maxRows: IMPORT_MAX_ROWS + 1 });
  } catch (e) {
    if (e instanceof CsvError) return { error: e.message };
    return { error: "We couldn't read that file as CSV." };
  }
  if (rows.length < 2) return { error: "The file needs a header row and at least one data row." };
  const headers = rows[0].map((h, i) => sanitizePlain(h, 80) || `Column ${i + 1}`).slice(0, 60);
  const data = rows.slice(1).map((r) => headers.map((_, i) => String(r[i] ?? "").slice(0, 10_000)));
  const imp = await db.organizationImport.create({
    data: { filename: sanitizePlain(file.name, 200) || "import.csv", headers, rows: data, status: "uploaded", createdById: user.id },
  });
  await audit(user.id, "organization_import.upload", "OrganizationImport", imp.id, { filename: imp.filename, rows: data.length, columns: headers.length });
  redirect(`/admin/organizations/import/${imp.id}/`);
}

/** Step 2: column mapping + row defaults. */
export async function saveImportMapping(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const imp = await db.organizationImport.findUnique({ where: { id: str(fd, "importId") }, select: { id: true, status: true, headers: true } });
  if (!imp) return { error: "Import not found." };
  if (imp.status !== "uploaded" && imp.status !== "mapped") return { error: "This import already ran." };
  const mapping: Record<number, string> = {};
  const used = new Set<string>();
  for (let i = 0; i < imp.headers.length; i++) {
    const f = str(fd, `col_${i}`);
    if (!IMPORT_FIELD_KEYS.includes(f)) { mapping[i] = "ignore"; continue; }
    if (used.has(f)) return { error: `Two columns are mapped to the same field (“${f}”). Map each field once.` };
    used.add(f);
    mapping[i] = f;
  }
  if (!used.has("name")) return { error: "Map one column to Name — it's the only required field." };
  const kind = str(fd, "defaultKind");
  const defaults = { kind: (ORG_KINDS as readonly string[]).includes(kind) ? kind : "NONPROFIT", publish: str(fd, "publish") === "yes" };
  await db.organizationImport.update({ where: { id: imp.id }, data: { mapping, defaults, status: "mapped" } });
  await audit(user.id, "organization_import.map", "OrganizationImport", imp.id, { mapping, defaults });
  redirect(`/admin/organizations/import/${imp.id}/`);
}

export async function reopenMapping(_p: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const n = await db.organizationImport.updateMany({ where: { id: str(fd, "importId"), status: "mapped" }, data: { status: "uploaded" } });
  if (!n.count) return { error: "This import can't be changed any more." };
  revalidatePath(`/admin/organizations/import/${str(fd, "importId")}/`);
  return { ok: true, message: "Back to column mapping." };
}

export async function discardImport(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const n = await db.organizationImport.deleteMany({ where: { id: str(fd, "importId"), status: { in: ["uploaded", "mapped"] } } });
  if (!n.count) return { error: "Only imports that haven't run can be discarded." };
  await audit(user.id, "organization_import.discard", "OrganizationImport", str(fd, "importId"), {});
  redirect("/admin/organizations/import/");
}

/**
 * Step 4: import the selected rows. Guarded so a double click can't run it twice
 * (mapped → importing via updateMany). Rows are re-validated server-side; claimed
 * organizations are never touched; updates only fill empty fields of unclaimed listings.
 */
export async function runImport(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const id = str(fd, "importId");
  const claimed = await db.organizationImport.updateMany({ where: { id, status: "mapped" }, data: { status: "importing" } });
  if (!claimed.count) {
    const cur = await db.organizationImport.findUnique({ where: { id }, select: { status: true } });
    if (cur?.status === "imported" || cur?.status === "importing") redirect(`/admin/organizations/import/${id}/`);
    return { error: "This import isn't ready to run." };
  }
  const imp = (await db.organizationImport.findUnique({ where: { id } }))!;
  const rows = (Array.isArray(imp.rows) ? imp.rows : []) as string[][];
  const mapping = readMapping(imp.mapping, imp.headers.length);
  const defaults = readDefaults(imp.defaults);
  const now = new Date();
  const results: ImportResult[] = [];
  try {
    const analyzed = await analyzeImport(rows, mapping, defaults);
    const reserved = new Set<string>();
    type Op = { r: (typeof analyzed)[number]; kind: "create"; slug: string } | { r: (typeof analyzed)[number]; kind: "update"; orgId: string };
    const ops: Op[] = [];
    for (const r of analyzed) {
      const row = r.index + 1;
      const name = r.data.name || `(row ${row})`;
      const include = fd.get(`inc_${r.index}`) === "on";
      const act = str(fd, `act_${r.index}`);
      if (r.existing.length) {
        if (act === "update") {
          if (r.errors.length) { results.push({ row, name, outcome: "error", message: r.errors.join(" ") }); continue; }
          const target = r.existing.length === 1 ? r.existing[0] : null;
          if (!target) { results.push({ row, name, outcome: "skipped_duplicate", message: "Matches more than one listing — not updated." }); continue; }
          if (target.ownershipStatus === "CLAIMED") { results.push({ row, name, outcome: "skipped_claimed", orgId: target.id, message: `Matches claimed listing “${target.name}”.` }); continue; }
          if (!target.updatable) { results.push({ row, name, outcome: "skipped_duplicate", orgId: target.id, message: `Matches “${target.name}” (${target.why}).` }); continue; }
          ops.push({ r, kind: "update", orgId: target.id });
        } else {
          const c = r.existing.find((e) => e.ownershipStatus === "CLAIMED");
          results.push(c
            ? { row, name, outcome: "skipped_claimed", orgId: c.id, message: `Matches claimed listing “${c.name}” (${c.reasons.join(", ")}).` }
            : { row, name, outcome: "skipped_duplicate", orgId: r.existing[0].id, message: `Matches “${r.existing[0].name}” (${r.existing[0].reasons.join(", ")}).` });
        }
        continue;
      }
      if (!include) {
        results.push(r.inFileDupOf !== null
          ? { row, name, outcome: "skipped_duplicate", message: `Duplicate of row ${r.inFileDupOf + 1} in this file (${r.inFileReasons.join(", ")}).` }
          : r.errors.length ? { row, name, outcome: "error", message: r.errors.join(" ") } : { row, name, outcome: "skipped", message: "Not selected." });
        continue;
      }
      if (r.errors.length) { results.push({ row, name, outcome: "error", message: r.errors.join(" ") }); continue; }
      ops.push({ r, kind: "create", slug: await importSlug(r.data.name, reserved) });
    }

    // Write in chunks, each chunk in its own transaction.
    for (let i = 0; i < ops.length; i += 50) {
      const chunk = ops.slice(i, i + 50);
      const out = await db.$transaction(async (tx) => {
        const res: ImportResult[] = [];
        for (const op of chunk) {
          const row = op.r.index + 1;
          const warn = op.r.warnings.length ? op.r.warnings.join(" ") : undefined;
          if (op.kind === "create") {
            const o = await tx.organization.create({ data: createDataFor(op.r.data, { slug: op.slug, publish: defaults.publish, importBatchId: imp.id, createdById: user.id, now }), select: { id: true } });
            res.push({ row, name: op.r.data.name, outcome: "created", orgId: o.id, message: warn });
          } else {
            // Re-check inside the transaction: never touch a listing that became claimed.
            const cur = await tx.organization.findUnique({ where: { id: op.orgId } });
            const members = await tx.organizationMember.count({ where: { organizationId: op.orgId } });
            if (!cur || cur.deletedAt || cur.ownershipStatus !== "UNCLAIMED" || members > 0) {
              res.push({ row, name: op.r.data.name, outcome: "skipped_claimed", orgId: op.orgId, message: "Listing is no longer unclaimed — not updated." });
              continue;
            }
            const fill = fillEmptyData(cur as unknown as Record<string, unknown>, op.r.data, now);
            if (!fill) { res.push({ row, name: op.r.data.name, outcome: "skipped_duplicate", orgId: op.orgId, message: "Nothing to fill — the listing already has these fields." }); continue; }
            await tx.organization.update({ where: { id: op.orgId }, data: fill.data });
            res.push({ row, name: op.r.data.name, outcome: "updated", orgId: op.orgId, message: `Filled: ${fill.fields.join(", ")}.${warn ? ` ${warn}` : ""}` });
          }
        }
        return res;
      }, { timeout: 60_000 });
      results.push(...out);
    }
    results.sort((a, b) => a.row - b.row);
    const summary = {
      total: rows.length,
      created: results.filter((r) => r.outcome === "created").length,
      updated: results.filter((r) => r.outcome === "updated").length,
      skippedDuplicate: results.filter((r) => r.outcome === "skipped_duplicate").length,
      skippedClaimed: results.filter((r) => r.outcome === "skipped_claimed").length,
      skipped: results.filter((r) => r.outcome === "skipped").length,
      errors: results.filter((r) => r.outcome === "error").length,
      published: defaults.publish,
    };
    await db.organizationImport.update({ where: { id: imp.id }, data: { status: "imported", results: results as unknown as Prisma.InputJsonValue, summary, completedAt: new Date() } });
    await audit(user.id, "organization_import.run", "OrganizationImport", imp.id, { filename: imp.filename, ...summary });
  } catch (e) {
    console.error("[import] failed", e);
    await db.organizationImport.update({ where: { id: imp.id }, data: { status: "failed", results: results as unknown as Prisma.InputJsonValue, summary: { error: (e as Error).message.slice(0, 500) } } });
    await audit(user.id, "organization_import.failed", "OrganizationImport", imp.id, { error: (e as Error).message.slice(0, 500) });
  }
  revalidatePath("/admin/organizations/", "layout");
  revalidatePath("/gives/", "layout");
  revalidatePath("/churches/", "layout");
  redirect(`/admin/organizations/import/${imp.id}/`);
}
