import "server-only";
import { z } from "zod";
import { sanitizePlain } from "@/lib/sanitize";
import { normalizeUrl, textToHtml } from "@/components/dashboard/text";
import { Prisma, type Organization } from "@/generated/prisma/client";
import { SERVICE_DAYS, SOCIAL_KEYS, ORG_KINDS, readLeaders, readServiceTimes } from "./constants";
import { ownImageUrl } from "./queries";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string, max = 300) => sanitizePlain(str(fd, k), max) || null;
const phoneRe = /^[0-9+().\-\s xext]{7,30}$/i;

function jsonArr(fd: FormData, k: string): unknown[] {
  try {
    const v = JSON.parse(str(fd, k) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * Parses the organization profile form (shared by the organization dashboard
 * and the admin editor). Returns Prisma update data or field errors.
 */
export function parseOrgProfile(fd: FormData, existing: Organization, opts: { allowKind?: boolean } = {}) {
  const fieldErrors: Record<string, string> = {};
  const name = sanitizePlain(str(fd, "name"), 160);
  if (!name) fieldErrors.name = "Please enter the organization's name.";

  const url = (k: string, label = "That doesn't look like a web address (example: www.example.org).") => {
    const raw = str(fd, k);
    const u = normalizeUrl(raw);
    if (raw && !u) fieldErrors[k] = label;
    return u;
  };
  const website = url("website");
  const donationUrl = url("donationUrl");
  const wishlistUrl = url("wishlistUrl");
  const livestreamUrl = url("livestreamUrl");

  const phone = opt(fd, "phone", 30);
  if (phone && !phoneRe.test(phone)) fieldErrors.phone = "Please enter a valid phone number.";
  const emailRaw = str(fd, "email").toLowerCase().slice(0, 254);
  const email = emailRaw ? z.email().safeParse(emailRaw) : null;
  if (email && !email.success) fieldErrors.email = "Please enter a valid email address.";
  const zip = opt(fd, "zip", 10);
  if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) fieldErrors.zip = "Please enter a 5-digit ZIP code.";
  const ein = opt(fd, "ein", 20);
  if (ein && !/^\d{2}-?\d{7}$/.test(ein)) fieldErrors.ein = "An EIN has 9 digits, like 12-3456789.";

  const socials: Record<string, string> = {};
  for (const { key } of SOCIAL_KEYS) {
    const raw = str(fd, `social_${key}`);
    if (!raw) continue;
    const u = normalizeUrl(raw);
    if (!u) fieldErrors[`social_${key}`] = "Please paste the full link to your page.";
    else socials[key] = u;
  }

  const city = str(fd, "city") === "__other" ? opt(fd, "cityOther", 80) : opt(fd, "city", 80);
  const text = (k: string, max = 8000) => {
    const v = String(fd.get(k) ?? "").replace(/\r\n/g, "\n").slice(0, max);
    return v.trim() ? textToHtml(v) : null;
  };

  const data: Prisma.OrganizationUpdateInput = {
    name,
    orgType: opt(fd, "orgType", 80),
    tagline: opt(fd, "tagline", 160),
    mission: opt(fd, "mission", 1000),
    description: text("description"),
    impact: text("impact", 4000),
    logoUrl: ownImageUrl(str(fd, "logoUrl"), existing.logoUrl),
    coverUrl: ownImageUrl(str(fd, "coverUrl"), existing.coverUrl),
    email: email && email.success ? email.data : null,
    emailPublic: fd.get("emailPublic") === "on",
    phone,
    website,
    socials: Object.keys(socials).length ? socials : Prisma.DbNull,
    address: opt(fd, "address", 200),
    city,
    zip,
    serviceArea: opt(fd, "serviceArea", 200),
    donationUrl,
    wishlistUrl,
    ein,
  };

  const kind = str(fd, "kind");
  if (opts.allowKind && (ORG_KINDS as readonly string[]).includes(kind)) data.kind = kind as Organization["kind"];
  const effectiveKind = (data.kind as string | undefined) ?? existing.kind;

  if (effectiveKind === "CHURCH") {
    const leaders = readLeaders(jsonArr(fd, "leadership")).slice(0, 30).map((l) => ({ name: sanitizePlain(l.name, 120), role: sanitizePlain(l.role, 120) })).filter((l) => l.name);
    const times = readServiceTimes(
      jsonArr(fd, "serviceTimes").map((r) => (r && typeof r === "object" ? r : {})),
    ).filter((t) => (SERVICE_DAYS as readonly string[]).includes(t.day)).slice(0, 40).map((t) => ({ ...t, label: sanitizePlain(t.label, 80) }));
    const ministries = jsonArr(fd, "ministries").filter((m): m is string => typeof m === "string").map((m) => sanitizePlain(m, 80)).filter(Boolean).slice(0, 40);
    Object.assign(data, {
      denomination: opt(fd, "denomination", 120),
      leadership: leaders.length ? leaders : Prisma.DbNull,
      serviceTimes: times.length ? times : Prisma.DbNull,
      ministries,
      livestreamUrl,
      accessibility: opt(fd, "accessibility", 1000),
      planYourVisit: text("planYourVisit", 4000),
    } satisfies Prisma.OrganizationUpdateInput);
  }

  return { data, fieldErrors };
}
