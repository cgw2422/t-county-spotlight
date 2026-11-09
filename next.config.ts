import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

/**
 * Domain move: tcountyspotlight.com → tcountyconnect.com.
 * Every page on a legacy host 301-redirects to the same path (and query) on the
 * canonical host. /api/* is excluded so Stripe/Resend webhooks, cron and health
 * checks keep working on the old host during the transition.
 * Override with CANONICAL_HOST / LEGACY_HOSTS (comma-separated) at build time.
 */
const CANONICAL_HOST = process.env.CANONICAL_HOST || "tcountyconnect.com";
const LEGACY_HOSTS = (process.env.LEGACY_HOSTS || "tcountyspotlight.com,www.tcountyspotlight.com")
  .split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
const REDIRECT_HOSTS = [...new Set([...LEGACY_HOSTS, `www.${CANONICAL_HOST}`])].filter((h) => h !== CANONICAL_HOST);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // WordPress URLs end with "/" — keep that so every migrated URL stays identical.
  trailingSlash: true,
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg", "sanitize-html"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  experimental: {
    serverActions: { bodySizeLimit: "26mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    return REDIRECT_HOSTS.flatMap((host) => [
      { source: "/", has: [{ type: "host" as const, value: host }], destination: `https://${CANONICAL_HOST}/`, statusCode: 301 as const },
      { source: "/:path((?!api/).+)", has: [{ type: "host" as const, value: host }], destination: `https://${CANONICAL_HOST}/:path`, statusCode: 301 as const },
    ]);
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};

export default nextConfig;
