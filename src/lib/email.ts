import "server-only";
import nodemailer from "nodemailer";
import { getSettings } from "./settings";

let transporter: nodemailer.Transporter | null = null;

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

export function emailConfigured() {
  return !!process.env.SMTP_HOST;
}

/** Sends an email. Without SMTP configured, logs the message (dev / staging). */
export async function sendEmail(to: string, subject: string, text: string, html?: string) {
  const settings = await getSettings();
  const from = `"${settings.emailFromName}" <${settings.emailFromAddress || process.env.SMTP_FROM || "no-reply@tcountyspotlight.com"}>`;
  const t = getTransport();
  if (!t) {
    console.info(`[email:not-configured] to=${to} subject=${subject}\n${text}`);
    return { delivered: false };
  }
  try {
    await t.sendMail({ from, to, subject, text, html });
    return { delivered: true };
  } catch (e) {
    console.error("[email] send failed", e);
    return { delivered: false };
  }
}
