import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { sanitizeRichText } from "@/lib/sanitize";
import { PROSE_CLASSES } from "@/lib/prose";
import { TUSCARAWAS_CITIES } from "@/lib/utils";
import { PageHeader } from "@/components/public/page-header";
import { buildMetadata, param, type SearchParams } from "@/components/public/seo";
import { ApplicationForm } from "./form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: "List Your Business",
    description: "Add your Tuscarawas County business to the TCountySpotlight directory — free listing, events, specials and more.",
    path: "/list-your-business/",
  });
}

export default async function ListYourBusinessPage({ searchParams }: { searchParams: SearchParams }) {
  const claimSlug = param(await searchParams, "claim");
  const [user, categories, claim, cmsPage] = await Promise.all([
    getCurrentUser(),
    db.businessCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { name: true } }),
    claimSlug ? db.business.findFirst({ where: { slug: claimSlug, status: "PUBLISHED", deletedAt: null }, select: { slug: true, name: true } }) : null,
    // A migrated WordPress page at this URL provides the intro copy.
    db.page.findFirst({ where: { status: "PUBLISHED", deletedAt: null, OR: [{ slug: "list-your-business" }, { legacyPath: "/list-your-business/" }] }, select: { content: true } }),
  ]);
  const perks = ["A free profile with hours, photos and contact info", "Your events on the county calendar", "Specials and announcements (with membership)", "Consideration for an editorial spotlight"];

  return (
    <>
      <PageHeader
        eyebrow={claim ? "Claim your listing" : "Free listing"}
        title={claim ? `Claim ${claim.name}` : "List your business"}
        subtitle={claim ? "Tell us how you’re connected to this business and we’ll verify and connect it to your account." : "Join the directory that helps Tuscarawas County residents find and support local."}
        crumbs={[{ label: "List your business" }]}
      />
      <div className="container-page py-8 sm:py-12">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_minmax(0,640px)]">
          <div className="lg:pt-2">
            {cmsPage?.content ? (
              <div className={`${PROSE_CLASSES} text-slate-800`} dangerouslySetInnerHTML={{ __html: sanitizeRichText(cmsPage.content) }} />
            ) : (
              <>
                <h2 className="section-title">Why list with us?</h2>
                <p className="mt-3 text-slate-600">TCountySpotlight celebrates the people and businesses of Tuscarawas County. A listing helps neighbors discover you.</p>
              </>
            )}
            <ul className="mt-6 space-y-3">
              {perks.map((p) => <li key={p} className="flex gap-3 text-slate-700"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />{p}</li>)}
            </ul>
            <p className="mt-6 text-sm text-slate-500">Every application is reviewed by a real person. We&rsquo;ll reach out within a few business days.</p>
          </div>
          <div className="relative">
            <ApplicationForm
              categories={categories.map((c) => c.name)}
              cities={TUSCARAWAS_CITIES}
              defaults={{ businessName: claim?.name, email: user?.email, contactName: user?.name ?? undefined }}
              claimSlug={claim?.slug}
            />
          </div>
        </div>
      </div>
    </>
  );
}
