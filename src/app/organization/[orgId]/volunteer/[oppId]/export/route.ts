import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireOrgAccess } from "@/lib/gives/access";
import { SIGNUP_STATUS_LABEL } from "@/lib/gives/constants";
import { slugify } from "@/lib/utils";

function cell(v: unknown) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // prevent spreadsheet formula injection
  return `"${s.replace(/"/g, '""')}"`;
}

/** CSV of registrations for one opportunity. Organization members and staff only; audit-logged. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string; oppId: string }> }) {
  const { orgId, oppId } = await params;
  const { user, org } = await requireOrgAccess(orgId);
  const opp = await db.volunteerOpportunity.findFirst({
    where: { id: oppId, organizationId: org.id },
    include: { signups: { orderBy: { createdAt: "asc" } } },
  });
  if (!opp) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const header = ["Name", "Email", "Phone", "Status", "18 or older", "Notes", "Signed up"];
  const lines = [header.map(cell).join(",")];
  for (const s of opp.signups) {
    lines.push([s.name, s.email, s.phone, SIGNUP_STATUS_LABEL[s.status], s.isAdult ? "Yes" : "No", s.notes, s.createdAt.toISOString()].map(cell).join(","));
  }
  await audit(user.id, "volunteer.export_csv", "VolunteerOpportunity", opp.id, { organizationId: org.id, rows: opp.signups.length });
  return new NextResponse("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slugify(opp.title)}-volunteers.csv"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
