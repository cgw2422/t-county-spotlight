import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe (Railway healthcheck path: /api/health/). */
export async function GET() {
  let ok = false;
  try {
    await db.$queryRaw`SELECT 1`;
    ok = true;
  } catch {}
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", db: ok, time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
