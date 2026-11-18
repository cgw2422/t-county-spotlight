import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FORCED_PASSWORD_CHANGE_PATH, getSessionUser } from "@/lib/auth";
import { homeForRole, safeNext } from "@/lib/tokens";
import { getCommunityPreference } from "@/lib/my-t-county";
import { ALL_COUNTY, communitySlug } from "@/lib/my-t-county-shared";
import { REGISTER_HEADLINE, REGISTER_SUBHEAD, loginHref, parseRegisterSource } from "@/lib/resident-accounts";
import { AuthShell } from "@/components/account/auth-shell";
import { TrackView } from "@/components/public/track";
import { RegisterForm } from "./register-form";
import { getNewsletterConfig } from "@/lib/newsletter/settings";

export const metadata: Metadata = { title: "Create a free account", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string; business?: string; source?: string; community?: string; newsletter?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next) ?? undefined;
  const source = parseRegisterSource(sp.source);
  const user = await getSessionUser();
  if (user?.mustChangePassword) redirect(FORCED_PASSWORD_CHANGE_PATH);
  if (user) redirect(next ?? homeForRole(user.role));
  // ?community= (e.g. from the homepage My T County signup; allowlisted, "all" = All of Tuscarawas County)
  // wins; otherwise a guest who already picked a community on this device gets it pre-selected (still optional).
  const asked = typeof sp.community === "string" ? sp.community.trim().toLowerCase().slice(0, 60) : "";
  const pref = await getCommunityPreference();
  const community = asked === ALL_COUNTY ? ALL_COUNTY : communitySlug(asked) ?? (pref.community ? communitySlug(pref.community) ?? "" : "");
  const nl = await getNewsletterConfig();
  return (
    <AuthShell
      title={REGISTER_HEADLINE}
      subtitle={REGISTER_SUBHEAD}
      footer={
        <div className="space-y-3">
          <p>Already have an account? <Link href={loginHref(next, source)} className="font-semibold text-brand-700 hover:underline">Sign in</Link></p>
          <p className="text-xs text-slate-500">
            Resident accounts are always free. Business listings and memberships are separate.{" "}
            <Link href="/list-your-business/" className="font-semibold text-brand-700 hover:underline">List your business</Link>
          </p>
        </div>
      }
    >
      <TrackView type="register_view" targetType="REGISTER" targetId={source} />
      <RegisterForm next={next} business={sp.business === "1"} source={source} community={community}
        newsletter={{ mode: nl.isBeehiiv ? "beehiiv" : "builtin", tagline: nl.tagline, checked: sp.newsletter === "1" }} />
    </AuthShell>
  );
}
