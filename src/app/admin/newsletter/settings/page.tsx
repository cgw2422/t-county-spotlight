import { CheckCircle2, XCircle } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { absoluteUrl } from "@/lib/utils";
import { getNewsletterSettings, newsletterSender } from "@/lib/newsletter/settings";
import { resendConfigured, smtpConfigured, webhookSecretConfigured } from "@/lib/newsletter/provider";
import { broadcastReadiness } from "@/lib/newsletter/send";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { FormGrid, TextArea, TextField } from "@/components/admin/form-field";
import { saveNewsletterSettingsAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Newsletter settings" };

function Status({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />}
      <span><span className="font-medium text-slate-800">{label}</span> <span className={ok ? "text-emerald-700" : "text-slate-500"}>{ok ? "Yes" : "No"}</span>{detail && <span className="block text-xs text-slate-500">{detail}</span>}</span>
    </li>
  );
}

export default async function NewsletterSettingsPage() {
  await requireAdmin();
  const [s, sender, ready] = await Promise.all([getNewsletterSettings(), newsletterSender(), broadcastReadiness()]);
  return (
    <>
      <PageHeader title="Newsletter settings" description="Sender identity, legal footer and consent wording version for the T-County Weekly." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title="Sending & compliance">
          <ActionForm action={saveNewsletterSettingsAction} warnUnsaved className="space-y-5">
            <FormGrid>
              <TextField name="fromName" label="From name" defaultValue={s.fromName} maxLength={80} help="Shown as the sender, e.g. “T-County Weekly”." />
              <TextField name="fromAddress" type="email" label="From address" defaultValue={s.fromAddress} maxLength={254} help={`Must be on a domain verified with your email provider.${process.env.NEWSLETTER_FROM ? " Overrides NEWSLETTER_FROM when set." : ""}`} />
              <TextField name="replyTo" type="email" label="Reply-to address" defaultValue={s.replyTo} maxLength={254} help="Where replies go. Optional." />
              <TextField name="consentVersion" label="Consent version" defaultValue={s.consentVersion} required maxLength={40} help="Stored with each signup. Change it whenever the signup wording changes." />
            </FormGrid>
            <TextArea name="postalAddress" label="Physical postal mailing address" defaultValue={s.postalAddress} rows={3} maxLength={300} required help="Required by the CAN-SPAM Act and printed in every newsletter footer. A street address or a registered P.O. box." />
            <TextArea name="description" label="Newsletter description" defaultValue={s.description} rows={3} maxLength={500} help="Shown on the /newsletter/ page." />
            <div className="border-t border-slate-100 pt-4"><Submit pendingText="Saving…">Save settings</Submit></div>
          </ActionForm>
        </Card>

        <div className="space-y-6">
          <Card title="Provider status">
            <ul className="space-y-2">
              <Status ok={resendConfigured()} label="Resend API key (RESEND_API_KEY)" detail="Recommended. Used for confirmations and broadcasts." />
              <Status ok={smtpConfigured()} label="SMTP server (SMTP_HOST)" detail="Fallback when Resend isn't configured." />
              <Status ok={webhookSecretConfigured()} label="Webhook secret (RESEND_WEBHOOK_SECRET)" detail="Needed for delivery, bounce, complaint, open and click statistics." />
              <Status ok={!!sender.address} label="Sending address" detail={sender.address || undefined} />
              <Status ok={!!s.postalAddress.trim()} label="Postal mailing address" />
            </ul>
            <p className="mt-4 text-xs text-slate-500">Secrets are never shown here. Set them as environment variables on the server.</p>
          </Card>
          {ready.ok ? (
            <Notice tone="success" title="Ready to send">Approved campaigns can be scheduled or sent.</Notice>
          ) : (
            <Notice tone="warn" title="Broadcasts are turned off"><ul className="list-disc pl-5">{ready.problems.map((p) => <li key={p}>{p}</li>)}</ul></Notice>
          )}
          <Card title="Resend setup">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
              <li>Verify your sending domain in Resend and add its SPF, DKIM and DMARC DNS records.</li>
              <li>Create an API key with sending access and set <code className="rounded bg-slate-100 px-1 text-xs">RESEND_API_KEY</code>.</li>
              <li>Add a webhook for email.sent, delivered, bounced, complained, opened and clicked pointing to <code className="break-all rounded bg-slate-100 px-1 text-xs">{absoluteUrl("/api/newsletter/webhook/")}</code> (keep the trailing slash), then set <code className="rounded bg-slate-100 px-1 text-xs">RESEND_WEBHOOK_SECRET</code> to its signing secret.</li>
              <li>Make sure the cron job calls <code className="rounded bg-slate-100 px-1 text-xs">/api/cron/</code> every ~10 minutes so scheduled campaigns go out.</li>
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
