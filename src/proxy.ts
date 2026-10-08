import { NextResponse, type NextRequest } from "next/server";

/**
 * Lightweight gate only: bounce visitors without a session cookie away from
 * private areas. Real authorization happens server-side (requireStaff /
 * requireBusinessAccess). No database access here.
 */
export function proxy(req: NextRequest) {
  if (!req.cookies.get("tcs_session")?.value) {
    const url = req.nextUrl.clone();
    const next = req.nextUrl.pathname + req.nextUrl.search;
    url.pathname = "/login/";
    url.search = `?next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/dashboard", "/dashboard/:path*"],
};
