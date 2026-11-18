import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { absoluteUrl } from "@/lib/utils";
import { getNewsletterSettings, newsletterSender } from "@/lib/newsletter/settings";
import { resendConfigured, smtpConfigured, webhookSecretConfigured } from "@/lib/newsletter/provider";
import { broadcastReadiness } from "@/lib/newsletter/send";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { FormGrid, SelectField, TextArea, TextField } from "@/components/admin/form-field";
import { saveNewsletterSettingsAction, saveProviderSettingsAction } from "../actions";
import { beehiivEnvStatus } from "@/lib/beehiiv/client";
import { ARCHIVE_TAG, ARTICLE_TAG } from "@/lib/beehiiv/sync";
import { newsletterCopy, theName, THANKS_PATH } from "@/lib/newsletter/copy";
import { BeehiivEmbed } from "@/components/newsletter/beehiiv-embed";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Newsletter settings" };

function Status({ ok, label, detail, yes = "Yes", no = "No", testId }: { ok: boolean; label: string; detail?: string; yes?: string; no?: string; testId?: string }) {
  return (
    <li className="flex items-start gap-2 text-sm" data-testid={testId} data-ok={ok ? "true" : "false"}>
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />}
      <span><span className="font-medium text-slate-800">{label}</span> <span className={ok ? "text-emerald-700" : "text-slate-500"}>{ok ? yes : no}</span>{detail && <span className="block text-xs text-slate-500">{detail}</span>}</span>
    </li>
  );
}

const code = "rounded bg-slate-100 px-1 text-xs break-all";

export default async function NewsletterSettingsPage() {
  await requireAdmin();
  const [s, sender, ready, scheduled] = await Promise.all([getNewsletterSettings(), newsletterSender(), broadcastReadiness(), db.newsletter.count({ where: { status: { in: ["SCHEDULED", "SENDING"] } } })]);
  const copy = newsletterCopy(s);
  const env = beehiivEnvStatus();
  const thanksUrl = absoluteUrl(THANKS_PATH);
  const readyToSwitch = !!s.beehiivEmbedUrl && env.apiKey && env.publicationId;
  return (
    <>
      <PageHeader title="Newsletter settings" description={`Signup provider, wording, sender identity, legal footer and consent wording version for ${theName(copy.name)}.`} />

      <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" id="provider">
        <Card title="Signup & sending provider" description="Which signup form the site shows and who sends issues. Stays on Built-in until you switch it here.">
          <ActionForm action={saveProviderSettingsAction} warnUnsaved className="space-y-5">
            <SelectField name="provider" label="Signup & sending provider" defaultValue={s.provider} data-testid="provider-select"
              options={[{ value: "builtin", label: "Built-in (current signup form & campaigns)" }, { value: "beehiiv", label: "beehiiv (embedded beehiiv form; send from beehiiv)" }]}
              help="beehiiv: every signup placement shows beehiiv's form, signups go straight to beehiiv (no account, no local subscriber), and built-in campaigns can't be created, scheduled or sent. Unsubscribe/preferences links in past emails keep working either way." />
            <TextArea name="beehiivEmbedUrl" label="beehiiv embed form URL" defaultValue={s.beehiivEmbedUrl} rows={2} maxLength={4000} data-testid="embed-url"
              placeholder="https://embeds.beehiiv.com/00000000-0000-0000-0000-000000000000"
              help={<>Paste the form URL, or the whole embed code — only the iframe&rsquo;s address is kept (scripts are never stored). Must be https on embeds.beehiiv.com or subscribe-forms.beehiiv.com.</>} />
            <div className="border-t border-slate-100 pt-4"><Submit pendingText="Saving…">Save provider</Submit></div>
          </ActionForm>
          {s.beehiivEmbedUrl && (
            <div className="mt-6 border-t border-slate-100 pt-5">
              <p className="label">Live preview of the beehiiv form</p>
              <p className="help mb-3">This is exactly what visitors will see{s.provider === "beehiiv" ? "" : " after you switch"}. Try a test signup here before switching.</p>
              <div className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200" data-testid="embed-preview"><BeehiivEmbed url={s.beehiivEmbedUrl} name={theName(copy.name)} eager /></div>
            </div>
          )}
        </Card>
        <div className="space-y-6">
          <Card title={readyToSwitch ? "Ready to switch" : "Not ready to switch yet"}>
            <ul className="space-y-2" data-testid="ready-check" data-ready={readyToSwitch ? "true" : "false"}>
              <Status ok={!!s.beehiivEmbedUrl} label="beehiiv embed form URL" yes="Set" no="Missing" testId="ready-embed" />
              <Status ok={env.apiKey} label="BEEHIIV_API_KEY" yes="Present" no="Missing" detail="Server environment variable (Railway). Used only for the content sync." testId="ready-api-key" />
              <Status ok={env.publicationId} label="BEEHIIV_PUBLICATION_ID" yes="Present" no="Missing" detail="Starts with pub_." testId="ready-publication" />
            </ul>
            <p className="mt-3 text-sm text-slate-600">Current provider: <strong data-testid="current-provider">{s.provider === "beehiiv" ? "beehiiv" : "Built-in"}</strong>.{s.provider === "beehiiv" && scheduled ? ` ${scheduled} scheduled/sending campaign(s) will not send.` : ""}</p>
            <p className="mt-3 text-xs text-slate-500">Values are never shown here — only whether they are set.</p>
          </Card>
          <Card title="beehiiv setup checklist">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
              <li>Export subscribers in <Link href="/admin/newsletter/subscribers/" className="font-semibold text-brand-700 hover:underline">Subscribers → Export for beehiiv</Link> and import the CSV in beehiiv (Audience → Subscribers → Import). Also download <em>Export unsubscribes &amp; suppressions</em> and never import those addresses.</li>
              <li>In beehiiv, create an embedded subscribe form (Audience → Subscribe forms) and set its <strong>redirect URL</strong> to <code className={code} data-testid="thanks-url">{thanksUrl}</code></li>
              <li>Copy the form&rsquo;s embed URL into the field on the left and check the live preview.</li>
              <li>Set <code className={code}>BEEHIIV_API_KEY</code> and <code className={code}>BEEHIIV_PUBLICATION_ID</code> on the server (Railway → Variables) and redeploy.</li>
              <li>In beehiiv, tag posts <code className={code}>{ARCHIVE_TAG}</code> (newsletter archive) and/or <code className={code}>{ARTICLE_TAG}</code> (site article). Publish them to <strong>Email and web</strong> for the best result on the site.</li>
              <li>Run <Link href="/admin/newsletter/beehiiv/" className="font-semibold text-brand-700 hover:underline">beehiiv → Sync now</Link>, do a test signup in the preview, then switch the provider to beehiiv.</li>
            </ol>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title="Name, signup copy, sending & compliance">
          <ActionForm action={saveNewsletterSettingsAction} warnUnsaved className="space-y-5">
            <FormGrid>
              <TextField name="name" label="Name in emails & prose" defaultValue={s.name} required maxLength={80} data-testid="nl-name" help={<>Reads as &ldquo;{theName(copy.name)}&rdquo; in emails and on the site.</>} />
              <TextField name="navLabel" label="Navigation label & archive title" defaultValue={s.navLabel} required maxLength={40} data-testid="nl-navlabel" help="Title of /newsletter/ and the small label on signup cards." />
              <TextField name="heading" label="Signup heading" defaultValue={s.heading} required maxLength={120} data-testid="nl-heading" help="Homepage hero card and every signup card." />
              <TextField name="button" label="Signup button (built-in form)" defaultValue={s.button} required maxLength={40} data-testid="nl-button" help="beehiiv's own button text is set in beehiiv's form editor." />
            </FormGrid>
            <TextField name="tagline" label="Signup description" defaultValue={s.tagline} required maxLength={200} data-testid="nl-tagline" help="Shown under the signup heading on every signup card." />
            <FormGrid>
              <TextField name="fromName" label="From name" defaultValue={s.fromName} maxLength={80} help="Shown as the sender of built-in newsletter emails. Leave blank to use the site email name." />
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
          {s.provider === "beehiiv" ? (
            <Notice tone="info" title="Built-in sending is off">The provider is beehiiv — send issues from beehiiv. Password resets, verification, invitations and member email updates still use the settings below.</Notice>
          ) : ready.ok ? (
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
