import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { toCsv } from "@/lib/gives/csv";
import { TEMPLATE_HEADERS } from "@/lib/gives/import";

/** Blank CSV template with the headers the importer recognises. Admin only. */
export async function GET() {
  await requireAdmin();
  const example = TEMPLATE_HEADERS.map((h) => ({ name: "Example Food Pantry", kind: "nonprofit", city: "Dover", state: "OH" } as Record<string, string>)[h] ?? "");
  return new NextResponse(toCsv([TEMPLATE_HEADERS, example]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="organizations-template.csv"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
