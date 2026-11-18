import Link from "next/link";
import { UserPlus } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getCommunityPreference } from "@/lib/my-t-county";
import { ALL_COUNTY, ALL_COUNTY_LABEL, COMMUNITIES, communitySlug } from "@/lib/my-t-county-shared";
import { REGISTER_NEWSLETTER_LABEL } from "@/lib/newsletter/copy";
import { MY_T_COUNTY_NAME, loginHref } from "@/lib/resident-accounts";
import { MyTCountyLinkCard } from "./my-t-county-link";

const NEXT = "/my-t-county/";

/**
 * Homepage section type "newsletter" (kept for ordering/toggles): a free My T County account invitation
 * in the same two-column card as the old newsletter signup. The form is a plain GET to /register/
 * (community, newsletter=1, source, next), so the normal registration + email verification flow runs
 * unchanged and it works without JavaScript. No password or email fields here.
 *
 * Signed in: no form. Shows the "Go to My T County" link only when the "join" section (which already
 * shows it) is not on the homepage — never two of them.
 */
export async function AccountSignupSection({ joinShowsLink }: { joinShowsLink: boolean }) {
  const user = await getCurrentUser();
  if (user) return joinShowsLink ? null : <MyTCountyLinkCard testId="home-account-signup-member" />;
  const pref = await getCommunityPreference();
  const selected = pref.community ? communitySlug(pref.community) ?? "" : "";
  const main = COMMUNITIES.filter((c) => c.main);
  const other = COMMUNITIES.filter((c) => !c.main);
  return (
    <section id="newsletter" aria-labelledby="home-account-signup-title" className="container-page scroll-mt-24 py-12" data-testid="home-account-signup">
      <div className="overflow-hidden rounded-3xl bg-cream ring-1 ring-amber-200/70">
        <div className="grid gap-6 p-6 sm:p-10 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-10">
          <div>
            <p className="eyebrow">{MY_T_COUNTY_NAME}</p>
            <h2 id="home-account-signup-title" className="mt-2 font-display text-3xl font-semibold leading-tight text-navy-900 text-balance sm:text-4xl">Keep your local favorites in one place</h2>
            <p className="mt-3 text-slate-700 sm:text-lg">Create a free account to save places, come back to your favorites, give local businesses a thumbs up, and follow the community you care about.</p>
          </div>
          <div>
            <form method="get" action="/register/" data-testid="home-account-signup-form" className="relative space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
              <input type="hidden" name="source" value="homepage" />
              <input type="hidden" name="next" value={NEXT} />
              <div>
                <label htmlFor="home-signup-community" className="label">Your community <span className="font-normal text-slate-400">(optional)</span></label>
                <select id="home-signup-community" name="community" className="input" defaultValue={selected}>
                  <option value="">Choose later</option>
                  <option value={ALL_COUNTY}>{ALL_COUNTY_LABEL}</option>
                  <optgroup label="Main towns">{main.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</optgroup>
                  <optgroup label="More communities">{other.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</optgroup>
                </select>
              </div>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 hover:border-brand-200">
                <input type="checkbox" name="newsletter" value="1" className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-brand-600" data-testid="home-account-signup-newsletter" />
                <span className="text-sm text-navy-900">{REGISTER_NEWSLETTER_LABEL} <span className="text-slate-500">(optional)</span></span>
              </label>
              <button type="submit" className="btn-primary w-full sm:w-auto">
                <UserPlus className="h-4 w-4" aria-hidden />
                Create my free account
              </button>
              <p className="text-sm text-slate-600">
                Already have an account?{" "}
                <Link href={loginHref(NEXT, "homepage")} className="font-semibold text-brand-700 hover:underline">Sign in</Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
