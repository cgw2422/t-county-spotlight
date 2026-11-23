import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { beehiivEnv } from "@/lib/beehiiv/client";
import { beehiivEditUrl } from "@/lib/beehiiv/posts-api";
import { getTemplateId } from "@/lib/newsletter-events";
import { designRenderContext, toMeta } from "@/lib/newsletter-designer/server";
import { PageHeader } from "@/components/admin/page-header";
import { DesignEditor } from "./editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit newsletter" };

export default async function DesignEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const row = await db.newsletterDesign.findUnique({ where: { id } });
  if (!row) notFound();
  const [ctx, templateId] = await Promise.all([designRenderContext({ preview: true }), getTemplateId()]);
  return (
    <>
      <PageHeader title={row.issueNumber ? `Issue #${String(row.issueNumber).padStart(3, "0")}` : "Newsletter"} description="Edit on the left; the preview updates as you type. Changes save automatically." />
      <DesignEditor
        id={row.id}
        initial={toMeta(row)}
        ctx={ctx}
        beehiiv={{ status: row.beehiivStatus, postId: row.beehiivPostId, editUrl: row.beehiivPostId ? beehiivEditUrl(row.beehiivPostId) : null, message: row.beehiivMessage, configured: !!beehiivEnv(), hasTemplate: !!templateId }}
      />
    </>
  );
}
