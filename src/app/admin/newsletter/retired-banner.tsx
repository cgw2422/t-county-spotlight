import Link from "next/link";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { getNewsletterSettings } from "@/lib/newsletter/settings";
import { Notice } from "@/components/admin/page-header";
import { SENDING_RETIRED_MESSAGE } from "@/lib/newsletter/send";

/** beehiiv mode: lists scheduled/sending built-in campaigns that are kept but will not send. */
export async function RetiredCampaignsBanner({ refused = false }: { refused?: boolean }) {
  const ns = await getNewsletterSettings();
  if (ns.provider !== "beehiiv") return null;
  const pending = await db.newsletter.findMany({ where: { status: { in: ["SCHEDULED", "SENDING"] } }, orderBy: { scheduledFor: "asc" }, select: { id: true, subject: true, status: true, scheduledFor: true } });
  return (
    <div className="mb-6 space-y-3" data-testid="retired-banner">
      {refused && <Notice tone="danger" title="Not created">{SENDING_RETIRED_MESSAGE}</Notice>}
      <Notice tone="warn" title={pending.length ? `${pending.length} scheduled campaign(s) will not send` : "Built-in sending is off (provider: beehiiv)"}>
        {pending.length ? (
          <>
            <p>The provider is beehiiv, so these stay stored but won&rsquo;t go out. Send from beehiiv, or switch back to Built-in in <Link href="/admin/newsletter/settings/" className="font-semibold underline">Settings</Link>.</p>
            <ul className="mt-2 list-disc pl-5" data-testid="retired-list">
              {pending.map((c) => (
                <li key={c.id}><Link href={`/admin/newsletter/campaigns/${c.id}/`} className="font-semibold underline">{c.subject}</Link> — {c.status === "SENDING" ? "was sending (paused)" : c.scheduledFor ? `scheduled ${formatDateTime(c.scheduledFor)}` : "scheduled"}</li>
              ))}
            </ul>
          </>
        ) : (
          <p>Campaigns can&rsquo;t be created, scheduled or sent here while the provider is beehiiv. Password resets, verification, invitations and member email updates are not affected.</p>
        )}
      </Notice>
    </div>
  );
}
