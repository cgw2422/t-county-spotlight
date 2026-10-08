import { ShieldCheck, ShieldOff } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { otpauthUrl } from "@/lib/totp";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { ActionButton } from "@/components/admin/action-button";
import { TextField } from "@/components/admin/form-field";
import { cancelTotpSetup, confirmTotp, disableTotp, startTotpSetup } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Two-factor authentication" };

export default async function SecurityPage() {
  const user = await requireStaff();
  const u = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true, totpEnabled: true, totpSecret: true, passwordHash: true } });
  const settingUp = !u.totpEnabled && !!u.totpSecret;
  const grouped = u.totpSecret?.match(/.{1,4}/g)?.join(" ");
  return (
    <>
      <PageHeader title="Two-factor authentication" description="Protect your admin account with a 6-digit code from an authenticator app (Google Authenticator, 1Password, Authy…)." />
      <Card className="max-w-2xl">
        {u.totpEnabled ? (
          <div className="space-y-4">
            <Notice tone="success" title="Two-factor authentication is on"><span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> You’ll be asked for a code each time you sign in.</span></Notice>
            <ActionForm action={disableTotp} className="space-y-3">
              <h2 className="font-semibold text-slate-900">Turn off</h2>
              <TextField name="code" label="Current code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required />
              {u.passwordHash && <TextField name="password" type="password" label="Your password" autoComplete="current-password" required />}
              <Submit className="btn-danger" pendingText="Turning off…"><ShieldOff className="h-4 w-4" /> Turn off 2FA</Submit>
            </ActionForm>
          </div>
        ) : settingUp ? (
          <div className="space-y-5">
            <ol className="list-decimal space-y-4 pl-5 text-sm text-slate-700">
              <li>
                In your authenticator app, add an account and enter this secret key (time-based):
                <code className="mt-2 block break-all rounded-lg bg-slate-100 px-3 py-2 font-mono text-base tracking-wider text-slate-900">{grouped}</code>
              </li>
              <li>
                Or, if your app accepts a setup link, use:
                <code className="mt-2 block break-all rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">{otpauthUrl(u.totpSecret!, u.email)}</code>
              </li>
              <li>Enter the 6-digit code the app shows to confirm.</li>
            </ol>
            <ActionForm action={confirmTotp} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <TextField name="code" label="Verification code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required wrapClassName="flex-1" />
              <Submit pendingText="Checking…">Turn on 2FA</Submit>
            </ActionForm>
            <ActionButton action={cancelTotpSetup} className="btn-ghost btn-sm">Cancel setup</ActionButton>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Two-factor authentication is <strong>off</strong> for {u.email}.</p>
            <ActionButton action={startTotpSetup} className="btn-primary"><ShieldCheck className="h-4 w-4" /> Set up two-factor authentication</ActionButton>
          </div>
        )}
      </Card>
    </>
  );
}
