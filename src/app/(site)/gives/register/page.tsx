import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, CalendarDays, HandHelping, UsersRound } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getUserOrganizations } from "@/lib/gives/access";
import { KIND_PARAM } from "@/lib/gives/constants";
import { PageHeader } from "@/components/public/page-header";
import { buildMetadata, param, type SearchParams } from "@/components/public/seo";
import { RegisterOrgForm } from "@/components/gives/public-forms";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: "Register Your Nonprofit, Church or Community Group — Always Free",
    description: "List your Tuscarawas County nonprofit, church or community group on T-County Gives for free. Share needs, find volunteers and promote events.",
    path: "/gives/register/",
  });
}

const PERKS = [
  { icon: HandHelping, title: "Post needs & a wish list", text: "Neighbors pledge supplies, food or time — you confirm what arrives." },
  { icon: UsersRound, title: "Find volunteers", text: "Simple sign-ups with spots, waitlists and a downloadable list." },
  { icon: CalendarDays, title: "Promote your events", text: "Fundraisers, services and meals on the community calendar." },
  { icon: BadgeCheck, title: "Get verified", text: "Our team verifies organizations so donors give with confidence." },
];

export default async function RegisterOrgPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const kind = KIND_PARAM[param(sp, "kind")] ?? "NONPROFIT";
  const mine = user ? await getUserOrganizations(user.id) : [];
  const next = encodeURIComponent(`/gives/register/${param(sp, "kind") ? `?kind=${param(sp, "kind")}` : ""}`);
  return (
    <>
      <PageHeader
        eyebrow="T-County Gives · Always free"
        title="Register your organization"
        subtitle="Nonprofits, churches and community groups are always free on T-County Gives — no plans, no fees, ever."
        crumbs={[{ label: "T-County Gives", href: "/gives/" }, { label: "Register" }]}
      />
      <div className="container-page py-8 sm:py-10">
        <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0">
            {!user ? (
              <div className="card p-6 text-center sm:p-8">
                <h2 className="font-display text-2xl font-semibold text-navy-900">First, sign in or create a free account</h2>
                <p className="mt-2 text-slate-600">Your account is how you&apos;ll manage your organization&apos;s page. It takes a minute.</p>
                <div className="mx-auto mt-6 grid max-w-sm gap-3">
                  <Link href={`/register/?next=${next}`} className="btn-primary min-h-12 text-base">Create a free account</Link>
                  <Link href={`/login/?next=${next}`} className="btn-secondary min-h-12 text-base">I already have an account</Link>
                </div>
              </div>
            ) : (
              <div className="card p-5 sm:p-8">
                {mine.length > 0 && (
                  <p className="mb-5 rounded-xl bg-brand-50 px-4 py-3 text-sm text-navy-900">
                    You already manage {mine.map((o) => o.name).join(", ")}. <Link href="/organization/" className="font-semibold text-brand-700 underline">Go to your dashboard</Link>
                  </p>
                )}
                <RegisterOrgForm defaultKind={kind} email={user.email} />
                <p className="mt-5 text-sm text-slate-500">After you register, our team reviews your organization (usually within a couple of days). You can finish your profile right away.</p>
              </div>
            )}
          </div>
          <aside className="space-y-3">
            {PERKS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-sunset-600"><Icon className="h-5 w-5" aria-hidden /></span>
                <span><span className="block font-semibold text-navy-900">{title}</span><span className="text-sm text-slate-600">{text}</span></span>
              </div>
            ))}
            <p className="px-1 text-sm text-slate-500">One page per organization — churches with outreach ministries use the same page for both.</p>
          </aside>
        </div>
      </div>
    </>
  );
}
