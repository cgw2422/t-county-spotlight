import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Check, Newspaper, Scale } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatPlanPrice } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Business memberships",
  description: "Optional memberships that add tools to your free TCountySpotlight business listing.",
};
export const dynamic = "force-dynamic";

export default async function MembershipsPage() {
  const [plans, settings, user] = await Promise.all([
    db.membershipPlan.findMany({ where: { isPublic: true }, orderBy: [{ sortOrder: "asc" }, { priceCents: "asc" }] }),
    getSettings(),
    getCurrentUser(),
  ]);
  const cta = user ? { href: "/dashboard/membership/", label: "Choose in my dashboard" } : { href: "/register/?business=1", label: "Create a free account" };
  return (
    <>
      <section className="bg-gradient-to-b from-navy-900 to-navy-800 text-white">
        <div className="container-page py-14 text-center sm:py-20">
          <p className="eyebrow text-sunset-400">For local businesses</p>
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Memberships</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-200">{settings.membershipIntro}</p>
          <p className="mx-auto mt-2 max-w-2xl text-slate-300">Every business gets a free listing. Memberships are optional and add extra tools.</p>
        </div>
      </section>

      <section className="container-page -mt-8 pb-4 sm:-mt-10">
        {plans.length === 0 ? (
          <p className="card p-8 text-center text-slate-600">Membership options are being finalized. Check back soon!</p>
        ) : (
          <div className={`mx-auto grid max-w-5xl gap-5 ${plans.length >= 3 ? "lg:grid-cols-3" : "md:grid-cols-2"}`}>
            {plans.map((p) => {
              const price = formatPlanPrice(p);
              return (
                <article key={p.id} className="card flex flex-col p-6">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xl font-semibold text-navy-900">{p.name}</h2>
                    {!p.isActive && <span className="badge-amber">Coming soon</span>}
                  </div>
                  <p className="mt-3"><span className="text-4xl font-bold text-navy-900">{price.amount}</span><span className="text-slate-500">{price.per}</span></p>
                  {p.description && <p className="mt-3 text-sm text-slate-600">{p.description}</p>}
                  <ul className="mt-5 flex-1 space-y-2.5 text-sm text-slate-700">
                    {p.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />{f}</li>)}
                  </ul>
                  <div className="mt-6">
                    {p.interval === "FREE" ? (
                      <Link href={user ? "/list-your-business/" : "/register/?business=1"} className="btn-secondary w-full">List your business free</Link>
                    ) : p.isActive ? (
                      <Link href={cta.href} className="btn-primary w-full">{cta.label}</Link>
                    ) : (
                      <span className="btn-secondary w-full cursor-default opacity-70" aria-disabled>Coming soon</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="container-page py-12">
        <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-3">
          {[
            { icon: Newspaper, title: "Editorial is never for sale", text: "Paid memberships never buy news coverage or a Business Spotlight story. Our editors choose those independently." },
            { icon: BadgeCheck, title: "Sponsored is always labeled", text: `Any paid placement is clearly marked “${settings.sponsoredLabel}” so readers always know.` },
            { icon: Scale, title: "Cancel anytime", text: "Memberships renew automatically and can be canceled from your dashboard — you keep features until the period ends." },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl bg-cream p-5">
              <Icon className="h-6 w-6 text-sunset-600" aria-hidden />
              <h2 className="mt-3 font-semibold text-navy-900">{title}</h2>
              <p className="mt-1 text-sm text-slate-600">{text}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 text-center text-slate-600">
          Questions? {settings.contactEmail ? <a href={`mailto:${settings.contactEmail}`} className="font-semibold text-brand-700 hover:underline">Email us</a> : <Link href="/contact/" className="font-semibold text-brand-700 hover:underline">Contact us</Link>} — we&apos;re happy to help.
        </p>
      </section>
    </>
  );
}
