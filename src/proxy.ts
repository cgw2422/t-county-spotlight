import { NextResponse, type NextRequest } from "next/server";

const PRIVATE = /^\/(admin|dashboard|organization)(\/|$)/;
/** Must match SEASON_PREVIEW_HEADER in src/lib/seasonal-theme.ts. */
const SEASON_PREVIEW_HEADER = "x-tcc-season-preview";

/**
 * Lightweight gate only: bounce visitors without a session cookie away from
 * private areas. Real authorization happens server-side (requireStaff /
 * requireBusinessAccess). No database access here.
 *
 * Also forwards a seasonal theme preview (`?seasonPreview=<season|auto>&token=…`)
 * to the root layout as a request header. The token is verified there against
 * the visitor's staff session, so the header is useless to anyone else.
 */
export function proxy(req: NextRequest) {
  if (PRIVATE.test(req.nextUrl.pathname) && !req.cookies.get("tcs_session")?.value) {
    const url = req.nextUrl.clone();
    const next = req.nextUrl.pathname + req.nextUrl.search;
    url.pathname = "/login/";
    url.search = `?next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(url);
  }
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete(SEASON_PREVIEW_HEADER); // never trust a client-sent copy
  const season = req.nextUrl.searchParams.get("seasonPreview");
  const token = req.nextUrl.searchParams.get("token");
  if (season && token && /^[a-z]{1,10}$/.test(season) && /^[a-f0-9]{32}$/.test(token)) {
    requestHeaders.set(SEASON_PREVIEW_HEADER, `${season}:${token}`);
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/admin", "/admin/:path*", "/dashboard", "/dashboard/:path*", "/organization", "/organization/:path*",
    // seasonal theme previews (staff only; verified server-side)
    { source: "/:path*", has: [{ type: "query", key: "seasonPreview" }] },
  ],
};
