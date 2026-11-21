import type { Metadata } from "next";
import { db } from "@/lib/db";
import { TUSCARAWAS_CITIES } from "@/lib/utils";
import { buildMetadata } from "@/components/public/seo";
import { RECOMMEND_PATH } from "@/lib/business-leads-shared";
import { RecommendForm } from "./recommend-form";
import { ShareInvite } from "./share-invite";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: "Recommend a Local Business",
    description: "Know a great Tuscarawas County business that should be on T County Connect? Tell us about it — no account needed.",
    path: RECOMMEND_PATH,
  });
}

export default async function RecommendABusinessPage() {
  const categories = await db.businessCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { name: true } });
  return (
    <>
      <section className="bg-gradient-to-b from-navy-900 to-navy-800 text-white">
        <div className="container-page py-12 text-center sm:py-16">
          <h1 className="font-display text-4xl font-bold text-balance sm:text-5xl">Know a Great Local Business?</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-200">
            We&apos;re building a directory of businesses throughout Tuscarawas County, and we&apos;d love your help! Whether it&apos;s your favorite restaurant, a family-owned shop, a contractor, or a business your friend owns, tell us about them.
          </p>
        </div>
      </section>
      <div className="container-page py-10">
        <div className="mx-auto max-w-3xl space-y-10">
          <RecommendForm cities={[...TUSCARAWAS_CITIES]} categories={categories.map((c) => c.name)} />
          <ShareInvite />
        </div>
      </div>
    </>
  );
}
