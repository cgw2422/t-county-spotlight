import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getHeroAppearanceState } from "@/lib/hero-appearance";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page-header";
import { AppearanceEditor } from "./appearance-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Homepage appearance", robots: { index: false, follow: false } };

export default async function HomepageAppearancePage() {
  await requireAdmin();
  const state = await getHeroAppearanceState();
  const ids = [state.draft.updatedById, state.published?.publishedById].filter((x): x is string => !!x);
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }) : [];
  const who = (id: string | null | undefined) => {
    const u = users.find((x) => x.id === id);
    return u ? u.name || u.email : null;
  };
  const status = {
    published: state.published
      ? { at: state.published.publishedAt ? formatDateTime(state.published.publishedAt) : null, by: who(state.published.publishedById), hasImage: !!state.published.imageUrl }
      : null,
    draft: state.draft.updatedAt ? { at: formatDateTime(state.draft.updatedAt), by: who(state.draft.updatedById) } : null,
    hasUnpublishedChanges: state.hasUnpublishedChanges,
    isLegacy: state.isLegacy,
  };
  const { draft } = state;
  return (
    <>
      <PageHeader
        back={{ href: "/admin/homepage/", label: "Homepage" }}
        title="Homepage appearance"
        description="Choose the background photo behind the homepage headline and search bar. Changes are saved as a draft and only go live when you publish."
        actions={<>
          <Link href="/admin/homepage/appearance/preview/" target="_blank" className="btn-secondary"><ExternalLink className="h-4 w-4" /> Open draft preview</Link>
          <a href="/" target="_blank" rel="noreferrer" className="btn-secondary"><ExternalLink className="h-4 w-4" /> View homepage</a>
        </>}
      />
      <AppearanceEditor
        key={`${draft.updatedAt ?? "init"}-${state.published?.publishedAt ?? "none"}`}
        initial={{ imageUrl: draft.imageUrl, imageAlt: draft.imageAlt, mobileImageUrl: draft.mobileImageUrl, desktopFocusX: draft.desktopFocusX, desktopFocusY: draft.desktopFocusY, mobileFocusX: draft.mobileFocusX, mobileFocusY: draft.mobileFocusY, overlay: draft.overlay }}
        status={status}
      />
    </>
  );
}
