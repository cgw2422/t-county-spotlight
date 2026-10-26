import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { getSettings } from "./settings";
import { broadcastProvider, resendConfigured, resendSend, resendBatch, smtpConfigured, type OutgoingEmail } from "./newsletter/provider";

export type { OutgoingEmail } from "./newsletter/provider";

let transporter: Transporter | null = null;

function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    });
  }
  return transporter;
}

/** True when a real provider (Resend or SMTP) is configured. */
export function emailConfigured() {
  return resendConfigured() || smtpConfigured();
}

/** "resend" | "smtp" | null — which provider transactional email uses. */
export function emailProvider() {
  return broadcastProvider();
}

async function defaultFrom() {
  const settings = await getSettings();
  return `"${settings.emailFromName}" <${settings.emailFromAddress || process.env.SMTP_FROM || "no-reply@tcountyspotlight.com"}>`;
}

/**
 * Sends one email with optional headers/tags/reply-to. Uses Resend when
 * RESEND_API_KEY is set, else SMTP, else logs it (dev / staging).
 */
export async function sendMessage(m: Omit<OutgoingEmail, "from"> & { from?: string }): Promise<{ delivered: boolean; id?: string; provider: "resend" | "smtp" | "log"; error?: string }> {
  const msg: OutgoingEmail = { ...m, from: m.from || (await defaultFrom()) };
  if (resendConfigured()) {
    try {
      const r = await resendSend(msg);
      return { delivered: true, id: r.id, provider: "resend" };
    } catch (e) {
      console.error("[email] resend send failed", (e as Error).message);
      return { delivered: false, provider: "resend", error: (e as Error).message };
    }
  }
  const t = getTransport();
  if (!t) {
    console.info(`[email:not-configured] to=${msg.to} subject=${msg.subject}\n${msg.text}`);
    return { delivered: false, provider: "log" };
  }
  try {
    const info = await t.sendMail({ from: msg.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html, replyTo: msg.replyTo, headers: msg.headers });
    return { delivered: true, id: info.messageId, provider: "smtp" };
  } catch (e) {
    console.error("[email] send failed", e);
    return { delivered: false, provider: "smtp", error: (e as Error).message };
  }
}

/** Sends an email. Without a provider configured, logs the message (dev / staging). */
export async function sendEmail(to: string, subject: string, text: string, html?: string) {
  const r = await sendMessage({ to, subject, text, html });
  return { delivered: r.delivered };
}

export type BatchResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Broadcast delivery for the newsletter engine. Refuses to run without a real
 * provider — the app server is never used as an unconfigured mail server.
 * Resend: one batch request (≤100). SMTP: one message at a time.
 * Throws ProviderError on a request-level failure (nothing in the batch was sent).
 */
export async function sendBroadcastBatch(msgs: OutgoingEmail[], idempotencyKey?: string): Promise<BatchResult[]> {
  const provider = broadcastProvider();
  if (!provider) throw new Error("No email provider is configured (set RESEND_API_KEY or SMTP_HOST).");
  if (provider === "resend") {
    const { ids } = await resendBatch(msgs, idempotencyKey);
    return ids.map((id) => (id ? { ok: true as const, id } : { ok: false as const, error: "Provider returned no message id" }));
  }
  const t = getTransport()!;
  const out: BatchResult[] = [];
  for (const m of msgs) {
    try {
      const info = await t.sendMail({ from: m.from, to: m.to, subject: m.subject, text: m.text, html: m.html, replyTo: m.replyTo, headers: m.headers });
      out.push({ ok: true, id: `smtp:${info.messageId || crypto.randomUUID()}` });
    } catch (e) {
      out.push({ ok: false, error: (e as Error).message.slice(0, 500) });
    }
  }
  return out;
}
