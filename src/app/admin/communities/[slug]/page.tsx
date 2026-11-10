import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { loadCommunity } from "@/lib/communities";
import { PageHeader } from "@/components/admin/page-header";
import { CommunityProfileForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit community page" };

export default async function EditCommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireStaff();
  const { slug } = await params;
  const c = await loadCommunity(slug);
  if (!c) notFound();
  return (
    <>
      <PageHeader
        title={c.name}
        description="Optional. Without a cover photo the page uses a simple branded header — never a stock photo."
        back={{ href: "/admin/communities/", label: "Community pages" }}
        actions={<a href={`/communities/${c.slug}/`} target="_blank" rel="noreferrer" className="btn-secondary btn-sm"><ExternalLink className="h-4 w-4" /> View page</a>}
      />
      <CommunityProfileForm
        key={c.profile?.updatedAt.getTime() ?? 0}
        slug={c.slug}
        name={c.name}
        intro={c.profile?.intro ?? ""}
        coverImageUrl={c.profile?.coverImageUrl ?? ""}
        focusX={c.profile?.coverFocusX ?? 50}
        focusY={c.profile?.coverFocusY ?? 50}
      />
    </>
  );
}
