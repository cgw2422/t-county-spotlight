import "server-only";
import { db } from "./db";
import { sendEmail } from "./email";
import { absoluteUrl } from "./utils";
import { newManageToken } from "./garage-sales";
import { hashToken } from "./auth";

export * from "./suggestions-shared";
/** Spam protection helpers are shared with the garage sale form (signed "form opened at" stamp). */
export { formStamp, formAgeSeconds } from "./garage-sales";

export function newSuggestionToken() {
  return newManageToken();
}

export function suggestionManageUrl(token: string) {
  return absoluteUrl(`/submit/manage/?token=${encodeURIComponent(token)}`);
}

export async function findSuggestionByToken(token: string | null | undefined) {
  if (!token || token.length > 200) return null;
  return db.communitySuggestion.findUnique({ where: { manageTokenHash: hashToken(token) } });
}

export async function emailSuggestionLink(to: string, title: string, token: string, opts: { resubmitted?: boolean } = {}) {
  const link = suggestionManageUrl(token);
  const intro = opts.resubmitted
    ? `Thanks for updating “${title}”. Our team will review it again shortly.`
    : `Thanks for sharing “${title}” with T County Connect! Our local team reviews every suggestion before anything is published.`;
  await sendEmail(
    to,
    opts.resubmitted ? `We received your updated suggestion “${title}”` : `We received your suggestion “${title}”`,
    `${intro}\n\nUse this private link to check the status, edit or withdraw your suggestion:\n${link}\n\nKeep this link to yourself — anyone with it can change your suggestion. Your email address and name are never shown publicly.\n\n— T County Connect`,
  );
}

/**
 * When staff publish something created from a suggestion (resultRef), let the
 * submitter know once. Plain email; never includes other people's details.
 */
export async function notifySuggestionPublished(resultRef: string, publicPath: string) {
  const s = await db.communitySuggestion.findFirst({ where: { resultRef, status: "APPROVED" }, select: { id: true, title: true, submitterEmail: true } });
  if (!s) return;
  await sendEmail(
    s.submitterEmail,
    `Your suggestion “${s.title}” is on T County Connect`,
    `Thanks again for your suggestion. Our team checked it and published it here:\n${absoluteUrl(publicPath)}\n\n— T County Connect`,
  );
}

/** A signed-in resident's own suggestions for /account/. */
export async function getUserSuggestions(userId: string) {
  return db.communitySuggestion.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, kind: true, title: true, status: true, createdAt: true },
  });
}
