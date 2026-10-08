"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { saveSettings, type SiteSettings } from "@/lib/settings";
import type { ActionState } from "@/components/ui/form-message";
import { parseForm, zBool, zUrlOpt } from "../_lib/form";

const str = (max: number) => z.string().trim().max(max).default("");
const email = z.string().trim().max(200).default("").refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email address");
const color = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Colors must be hex like #16325c");
const social = z.string().trim().max(300).default("").refine((v) => !v || /^https?:\/\//.test(v), "Social links must start with https://");

const GROUPS = {
  general: z.object({ siteName: str(100).pipe(z.string().min(1, "Site name is required")), tagline: str(200), description: str(500), logoUrl: zUrlOpt, logoDarkUrl: zUrlOpt, faviconUrl: zUrlOpt }),
  contact: z.object({ contactEmail: email, contactPhone: str(40), address: str(300), facebook: social, instagram: social, x: social, youtube: social, tiktok: social, linkedin: social }),
  footer: z.object({ footerText: str(1000) }),
  seo: z.object({ seoDefaultTitle: str(200), seoDefaultDescription: str(400), seoDefaultImage: zUrlOpt }),
  email: z.object({ emailFromName: str(100), emailFromAddress: email, notifyAdminEmail: email }),
  pwa: z.object({ pwaName: str(60).pipe(z.string().min(1, "App name is required")), pwaShortName: str(20).pipe(z.string().min(1, "Short name is required")), pwaThemeColor: color, pwaBackgroundColor: color }),
  moderation: z.object({ requireEventApproval: zBool, requirePromotionApproval: zBool, requireUpdateApproval: zBool }),
  payments: z.object({ paymentsEnabled: zBool, stripeMode: z.enum(["test", "live"]) }),
  membership: z.object({ membershipIntro: str(1000), sponsoredLabel: str(40).pipe(z.string().min(1, "A sponsored label is required")) }),
} as const;

export async function saveSettingsGroup(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const group = String(fd.get("group")) as keyof typeof GROUPS;
  const schema = GROUPS[group];
  if (!schema) return { error: "Unknown settings group." };
  const p = parseForm(schema as z.ZodType, fd);
  if (p.error) return p.error;
  let patch = p.data as Record<string, unknown>;
  if (group === "contact") {
    const { facebook, instagram, x, youtube, tiktok, linkedin, ...rest } = patch as Record<string, string>;
    const socials = Object.fromEntries(Object.entries({ facebook, instagram, x, youtube, tiktok, linkedin }).filter(([, v]) => v));
    patch = { ...rest, socials };
  }
  if (group === "payments" && patch.paymentsEnabled && !process.env.STRIPE_SECRET_KEY) {
    return { error: "Add the STRIPE_SECRET_KEY environment variable before enabling payments." };
  }
  await saveSettings(patch as Partial<SiteSettings>);
  await audit(user.id, "settings.save", "Setting", group, { group, keys: Object.keys(patch), ...(group === "payments" || group === "moderation" ? patch : {}) } as never);
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved." };
}
