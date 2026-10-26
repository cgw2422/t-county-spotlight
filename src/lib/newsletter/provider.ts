import "server-only";

/**
 * Resend HTTP API (no SDK). Docs: https://resend.com/docs/api-reference
 *   POST https://api.resend.com/emails        — single email
 *   POST https://api.resend.com/emails/batch  — up to 100 emails per request
 */
const RESEND_API = "https://api.resend.com";
export const RESEND_BATCH_MAX = 100;

export type OutgoingEmail = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  tags?: { name: string; value: string }[];
};

export class ProviderError extends Error {
  constructor(message: string, public status: number, public retryable: boolean) {
    super(message);
  }
}

export function resendConfigured() {
  return !!process.env.RESEND_API_KEY;
}
export function smtpConfigured() {
  return !!process.env.SMTP_HOST;
}
export function webhookSecretConfigured() {
  return !!process.env.RESEND_WEBHOOK_SECRET;
}

/** A real mail provider for broadcasts. Never the app server itself. */
export function broadcastProvider(): "resend" | "smtp" | null {
  if (resendConfigured()) return "resend";
  if (smtpConfigured()) return "smtp";
  return null;
}

/** Resend tag names/values: ASCII letters, numbers, underscores and dashes only. */
function cleanTag(s: string) {
  return s.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256);
}

function toResend(m: OutgoingEmail) {
  return {
    from: m.from,
    to: [m.to],
    subject: m.subject,
    text: m.text,
    ...(m.html ? { html: m.html } : {}),
    ...(m.replyTo ? { reply_to: m.replyTo } : {}),
    ...(m.headers && Object.keys(m.headers).length ? { headers: m.headers } : {}),
    ...(m.tags?.length ? { tags: m.tags.map((t) => ({ name: cleanTag(t.name), value: cleanTag(t.value) })) } : {}),
  };
}

async function resendFetch(path: string, body: unknown, idempotencyKey?: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new ProviderError("RESEND_API_KEY is not set", 0, false);
  let res: Response;
  try {
    res = await fetch(`${RESEND_API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "User-Agent": "TCountySpotlight-Newsletter/1.0",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey.slice(0, 256) } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new ProviderError(`Network error contacting Resend: ${(e as Error).message}`, 0, true);
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof json.message === "string" ? json.message : `HTTP ${res.status}`;
    throw new ProviderError(`Resend: ${msg}`, res.status, res.status === 429 || res.status >= 500);
  }
  return json;
}

export async function resendSend(m: OutgoingEmail, idempotencyKey?: string): Promise<{ id: string }> {
  const json = await resendFetch("/emails", toResend(m), idempotencyKey);
  return { id: String(json.id ?? "") };
}

/** Sends up to 100 emails in one request. Returns provider ids in request order. */
export async function resendBatch(msgs: OutgoingEmail[], idempotencyKey?: string): Promise<{ ids: string[] }> {
  if (msgs.length > RESEND_BATCH_MAX) throw new Error(`Resend batch is limited to ${RESEND_BATCH_MAX} emails`);
  if (!msgs.length) return { ids: [] };
  const json = await resendFetch("/emails/batch", msgs.map(toResend), idempotencyKey);
  const data = Array.isArray(json.data) ? (json.data as { id?: string }[]) : [];
  return { ids: msgs.map((_, i) => String(data[i]?.id ?? "")) };
}
