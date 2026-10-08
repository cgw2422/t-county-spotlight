import Link from "next/link";
import { CheckCircle2, XCircle, ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { emailConfigured } from "@/lib/email";
import { storageMode } from "@/lib/storage";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { LinkTabs } from "@/components/admin/tabs";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { Checkbox, FormGrid, SelectField, TextArea, TextField } from "@/components/admin/form-field";
import { MediaField } from "@/components/admin/media-picker";
import { spGet, type SP } from "../_lib/list";
import { saveSettingsGroup } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

const TABS = [
  ["general", "General"], ["contact", "Contact & social"], ["footer", "Footer"], ["seo", "SEO"], ["email", "Email"],
  ["pwa", "App (PWA)"], ["moderation", "Moderation"], ["payments", "Payments"], ["membership", "Membership"],
] as const;

function EnvStatus({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-slate-400" />}
      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{label}</code>
      <span className={ok ? "text-emerald-700" : "text-slate-500"}>{ok ? "configured" : "not set"}</span>
    </li>
  );
}

function SettingsForm({ group, children }: { group: string; children: React.ReactNode }) {
  return (
    <ActionForm action={saveSettingsGroup} warnUnsaved className="space-y-5">
      <input type="hidden" name="group" value={group} />
      {children}
      <div className="border-t border-slate-100 pt-4"><Submit pendingText="Saving…">Save settings</Submit></div>
    </ActionForm>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = TABS.find(([k]) => k === spGet(sp, "tab"))?.[0] ?? "general";
  const s = await getSettings();
  return (
    <>
      <PageHeader title="Settings" description="Site-wide configuration. Changes apply immediately." actions={<Link href="/admin/security/" className="btn-secondary"><ShieldCheck className="h-4 w-4" /> Two-factor authentication</Link>} />
      <LinkTabs items={TABS.map(([k, label]) => ({ label, href: `/admin/settings/?tab=${k}`, active: k === tab }))} />
      <Card className="max-w-3xl">
        {tab === "general" && (
          <SettingsForm group={tab}>
            <TextField name="siteName" label="Site name" defaultValue={s.siteName} required />
            <TextField name="tagline" label="Tagline" defaultValue={s.tagline} />
            <TextArea name="description" label="Site description" defaultValue={s.description} rows={3} />
            <div className="grid gap-4 sm:grid-cols-3">
              <MediaField name="logoUrl" label="Logo" defaultValue={s.logoUrl} aspect="aspect-[3/1]" help="For light backgrounds." />
              <MediaField name="logoDarkUrl" label="Logo (dark backgrounds)" defaultValue={s.logoDarkUrl} aspect="aspect-[3/1]" help="Used in the footer & admin sidebar." />
              <MediaField name="faviconUrl" label="Favicon" defaultValue={s.faviconUrl} aspect="aspect-square" help="Square PNG/SVG/ICO." />
            </div>
          </SettingsForm>
        )}
        {tab === "contact" && (
          <SettingsForm group={tab}>
            <FormGrid>
              <TextField name="contactEmail" type="email" label="Contact email" defaultValue={s.contactEmail} />
              <TextField name="contactPhone" label="Contact phone" defaultValue={s.contactPhone} />
            </FormGrid>
            <TextField name="address" label="Address / service area" defaultValue={s.address} />
            <FormGrid>
              {(["facebook", "instagram", "x", "youtube", "tiktok", "linkedin"] as const).map((k) => (
                <TextField key={k} name={k} label={k === "x" ? "X (Twitter)" : k[0].toUpperCase() + k.slice(1)} defaultValue={s.socials?.[k] ?? ""} placeholder="https://" />
              ))}
            </FormGrid>
          </SettingsForm>
        )}
        {tab === "footer" && <SettingsForm group={tab}><TextArea name="footerText" label="Footer text" defaultValue={s.footerText} rows={4} /></SettingsForm>}
        {tab === "seo" && (
          <SettingsForm group={tab}>
            <TextField name="seoDefaultTitle" label="Default page title" defaultValue={s.seoDefaultTitle} />
            <TextArea name="seoDefaultDescription" label="Default meta description" defaultValue={s.seoDefaultDescription} rows={3} />
            <MediaField name="seoDefaultImage" label="Default social share image" defaultValue={s.seoDefaultImage} aspect="aspect-[1200/630]" className="max-w-md" help="1200×630 recommended." />
          </SettingsForm>
        )}
        {tab === "email" && (
          <SettingsForm group={tab}>
            <Notice tone={emailConfigured() ? "success" : "warn"} title={emailConfigured() ? "SMTP is configured" : "SMTP is not configured"}>
              {emailConfigured() ? "Emails are delivered through your SMTP server." : "Emails are only written to the server log. Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASSWORD environment variables to send real email."}
            </Notice>
            <FormGrid>
              <TextField name="emailFromName" label="From name" defaultValue={s.emailFromName} />
              <TextField name="emailFromAddress" type="email" label="From address" defaultValue={s.emailFromAddress} placeholder="no-reply@yourdomain.com" />
            </FormGrid>
            <TextField name="notifyAdminEmail" type="email" label="Admin notification email" defaultValue={s.notifyAdminEmail} help="Receives new application, event and special submissions." />
          </SettingsForm>
        )}
        {tab === "pwa" && (
          <SettingsForm group={tab}>
            <FormGrid>
              <TextField name="pwaName" label="App name" defaultValue={s.pwaName} required />
              <TextField name="pwaShortName" label="Short name" defaultValue={s.pwaShortName} required maxLength={20} help="Shown under the home-screen icon." />
              <TextField name="pwaThemeColor" type="color" label="Theme color" defaultValue={s.pwaThemeColor} className="h-11 p-1" />
              <TextField name="pwaBackgroundColor" type="color" label="Background color" defaultValue={s.pwaBackgroundColor} className="h-11 p-1" />
            </FormGrid>
          </SettingsForm>
        )}
        {tab === "moderation" && (
          <SettingsForm group={tab}>
            <Checkbox name="requireEventApproval" label="Community event submissions need approval" defaultChecked={s.requireEventApproval} />
            <Checkbox name="requirePromotionApproval" label="Business specials need approval" defaultChecked={s.requirePromotionApproval} />
            <Checkbox name="requireUpdateApproval" label="Business updates need approval" defaultChecked={s.requireUpdateApproval} />
          </SettingsForm>
        )}
        {tab === "payments" && (
          <SettingsForm group={tab}>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-2 text-sm font-semibold text-slate-800">Environment</p>
              <ul className="space-y-1.5">
                <EnvStatus ok={!!process.env.STRIPE_SECRET_KEY} label="STRIPE_SECRET_KEY" />
                <EnvStatus ok={!!process.env.STRIPE_WEBHOOK_SECRET} label="STRIPE_WEBHOOK_SECRET" />
                <EnvStatus ok={!!process.env.STRIPE_PUBLISHABLE_KEY || !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY} label="STRIPE_PUBLISHABLE_KEY" />
              </ul>
              <p className="mt-2 text-xs text-slate-500">Keys are read from environment variables and never shown here. Storage mode: {storageMode() === "s3" ? "S3 bucket" : "database"}.</p>
            </div>
            <Checkbox name="paymentsEnabled" label="Enable online payments" defaultChecked={s.paymentsEnabled} help="Membership checkout appears only for active plans with a Stripe price ID." />
            <SelectField name="stripeMode" label="Stripe mode" defaultValue={s.stripeMode} options={[{ value: "test", label: "Test mode" }, { value: "live", label: "Live mode" }]} />
          </SettingsForm>
        )}
        {tab === "membership" && (
          <SettingsForm group={tab}>
            <TextArea name="membershipIntro" label="Membership page intro" defaultValue={s.membershipIntro} rows={3} />
            <TextField name="sponsoredLabel" label="Sponsored label" defaultValue={s.sponsoredLabel} required help="Shown on every paid placement, sponsored event and sponsored special." />
          </SettingsForm>
        )}
      </Card>
    </>
  );
}
