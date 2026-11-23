import Link from "next/link";
import { Copy, ExternalLink, FilePlus2, LayoutTemplate, PencilLine, Trash2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { beehiivEditUrl } from "@/lib/beehiiv/posts-api";
import { PageHeader, Card } from "@/components/admin/page-header";
import { createDesignAction, deleteDesignAction, duplicateDesignAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Newsletter designer" };

const STATUS: Record<string, [string, string]> = {
  none: ["Draft", "badge-gray"], failed: ["Draft · last send failed", "badge-amber"], pending: ["Sending…", "badge-blue"],
  unknown: ["Check beehiiv", "badge-amber"], created: ["In beehiiv", "badge-green"],
};
const issueLabel = (n: number | null) => (n ? `#${String(n).padStart(3, "0")}` : "—");

export default async function DesignerListPage() {
  await requireAdmin();
  const rows = await db.newsletterDesign.findMany({ orderBy: [{ updatedAt: "desc" }], take: 200, select: { id: true, title: true, issueNumber: true, issueDate: true, beehiivStatus: true, beehiivPostId: true, beehiivSentAt: true, updatedAt: true } });
  const drafts = rows.filter((r) => r.beehiivStatus !== "created");
  const sent = rows.filter((r) => r.beehiivStatus === "created");
  const Row = ({ r }: { r: (typeof rows)[number] }) => {
    const [label, cls] = STATUS[r.beehiivStatus] ?? STATUS.none;
    const deletable = !r.beehiivPostId && (r.beehiivStatus === "none" || r.beehiivStatus === "failed");
    return (
      <li className="flex flex-wrap items-center gap-3 p-4" data-testid="design-row">
        <span className="w-14 shrink-0 font-display text-lg font-bold tabular-nums text-navy-900">{issueLabel(r.issueNumber)}</span>
        <span className="min-w-0 flex-1">
          <Link href={`/admin/newsletter/designer/${r.id}/`} className="block truncate font-semibold text-slate-900 hover:text-brand-700">{r.title}</Link>
          <span className="text-xs text-slate-500">Issue date {r.issueDate.toISOString().slice(0, 10)} · edited {formatDateTime(r.updatedAt)}{r.beehiivSentAt ? ` · sent to beehiiv ${formatDateTime(r.beehiivSentAt)}` : ""}</span>
        </span>
        <span className={cls}>{label}</span>
        <span className="flex flex-wrap gap-2">
          <Link href={`/admin/newsletter/designer/${r.id}/`} className="btn-secondary btn-sm"><PencilLine className="h-4 w-4" /> Edit</Link>
          <form action={duplicateDesignAction}><input type="hidden" name="id" value={r.id} /><button className="btn-ghost btn-sm" data-testid="duplicate-design"><Copy className="h-4 w-4" /> Duplicate</button></form>
          {r.beehiivPostId && <a href={beehiivEditUrl(r.beehiivPostId)} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm"><ExternalLink className="h-4 w-4" /> beehiiv</a>}
          {deletable && <form action={deleteDesignAction}><input type="hidden" name="id" value={r.id} /><button className="btn-ghost btn-sm text-red-600 hover:bg-red-50" data-testid="delete-design"><Trash2 className="h-4 w-4" /> Delete</button></form>}
        </span>
      </li>
    );
  };
  return (
    <>
      <PageHeader
        title="Newsletter designer"
        description="Build each issue here with the T County Connect template, preview it on desktop and phone, then send it to beehiiv as a draft. In beehiiv you add your sponsor ad, review it, and send. beehiiv stays your sender, subscriber list and analytics."
        actions={<form action={createDesignAction}><button className="btn-primary" data-testid="create-design"><FilePlus2 className="h-4 w-4" /> Create newsletter</button></form>}
      />
      <div className="space-y-6">
        <Card title={`Saved drafts (${drafts.length})`}>
          {drafts.length ? <ul className="-mx-5 divide-y divide-slate-100 sm:-mx-6">{drafts.map((r) => <Row key={r.id} r={r} />)}</ul> : <p className="text-sm text-slate-600">No drafts yet. Click Create newsletter to start one from the template.</p>}
        </Card>
        <Card title={`Sent to beehiiv (${sent.length})`} description="Previous issues. Duplicate one to start the next issue from it.">
          {sent.length ? <ul className="-mx-5 divide-y divide-slate-100 sm:-mx-6">{sent.map((r) => <Row key={r.id} r={r} />)}</ul> : <p className="text-sm text-slate-600">Nothing sent to beehiiv yet.</p>}
        </Card>
        <Card title="Newsletter template">
          <p className="flex items-start gap-3 text-sm text-slate-600"><LayoutTemplate className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden /> Every issue uses the T County Connect template: masthead with issue number and date, then your choice of introduction, featured article, sponsor ad, weather, events, more stories, Business Spotlight and the Explore T County Connect section, then the footer. Turn sections on or off and reorder them in each issue.</p>
        </Card>
      </div>
    </>
  );
}
