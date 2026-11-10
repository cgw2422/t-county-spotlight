import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { PageHeader } from "@/components/public/page-header";
import { buildMetadata, param, type SearchParams } from "@/components/public/seo";
import { communityName } from "@/lib/my-t-county-shared";
import { formStamp, isSuggestionKind, SUGGESTION_KIND_INFO } from "@/lib/suggestions";
import { SuggestionForm } from "./suggestion-form";
import { submitSuggestion } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const raw = param(await searchParams, "kind");
  const kind = isSuggestionKind(raw) ? raw : "OTHER";
  return buildMetadata({
    title: SUGGESTION_KIND_INFO[kind].heading,
    description: "Suggest a new business opening, community update, local attraction or volunteer opportunity in Tuscarawas County. Free, no account needed, and reviewed by our local team.",
    path: "/submit/suggest/",
  });
}

export default async function SuggestPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const raw = param(sp, "kind");
  const kind = isSuggestionKind(raw) ? raw : "OTHER";
  const info = SUGGESTION_KIND_INFO[kind];
  const user = await getCurrentUser();
  return (
    <>
      <PageHeader eyebrow="Share something" title={info.heading} subtitle={info.intro} crumbs={[{ label: "Share something", href: "/submit/" }, { label: "Suggest" }]} />
      <div className="container-page py-8 sm:py-10">
        <div className="mx-auto max-w-3xl">
          {!user && (
            <p className="mb-6 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
              No account needed. Have one? <Link href={`/login/?next=${encodeURIComponent(`/submit/suggest/?kind=${kind}`)}`} className="font-semibold underline">Sign in</Link> to see your suggestions in your account.
            </p>
          )}
          <SuggestionForm
            mode="create"
            action={submitSuggestion}
            stamp={formStamp()}
            defaults={{
              kind, title: "", details: "", city: communityName(param(sp, "city")) ?? "", address: "", linkUrl: "", eventDate: "", photos: [],
              name: user?.name ?? "", email: user?.email ?? "",
            }}
          />
        </div>
      </div>
    </>
  );
}
