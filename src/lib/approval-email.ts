import { BRAND } from "./brand";
import { escapeHtml, oneLine } from "./text";
import { absoluteUrl } from "./utils";

export const APPROVAL_LIVE_HEADLINE = "Your free business listing is live";
export const APPROVAL_MEMBERSHIP_PROMPT = "Want to add more photos, list your services, or post more events?";
export const APPROVAL_MEMBERSHIP_LINK_LABEL = "View your membership options";

export type ApprovalEmailInput = {
  kind: "new" | "claim";
  businessName: string;
  businessId: string;
  slug: string;
  /** The listing is published (approved and public). */
  live: boolean;
  /** An account was linked as OWNER (only then is there a dashboard / membership tab to link to). */
  owner: boolean;
  /** A password setup invitation was sent separately (account without a password). */
  invited: boolean;
  note?: string | null;
};

/**
 * Approval email for a business application or claim. A live listing leads with "Your free business listing is live"
 * and View Your Listing as the primary link; the membership line is short, optional and links straight to THAT
 * listing's Membership tab (sign-in returns there). Approval never starts a subscription — this email only links.
 */
export function buildApprovalEmail(i: ApprovalEmailInput) {
  const name = oneLine(i.businessName, 120);
  const listingUrl = absoluteUrl(`/business/${i.slug}/`);
  const dashboardUrl = absoluteUrl(`/dashboard/${i.businessId}/`);
  const membershipUrl = absoluteUrl(`/dashboard/${i.businessId}/membership/`);

  const intro = i.live
    ? i.kind === "claim"
      ? `Good news! Your claim for ${name} was approved, and you're now an owner of the listing on ${BRAND.name}.`
      : `Good news! ${name} has been approved and is now live on ${BRAND.name}.`
    : i.kind === "claim"
      ? `Good news! Your claim for ${name} on ${BRAND.name} has been approved, and you're now an owner of the listing.`
      : `Good news! ${name} has been approved for ${BRAND.name}. Our team will finish setting up your listing and publish it shortly.`;
  const account = !i.owner
    ? null
    : i.invited
      ? "We sent you a separate email with a link to set your password and open your dashboard."
      : `Sign in with your existing account to manage your listing (your password hasn't changed): ${dashboardUrl}`;
  const showMembership = i.live && i.owner;
  const note = i.note ? `Note from our team: ${i.note}` : null;

  const subject = oneLine(i.live ? `${APPROVAL_LIVE_HEADLINE}: ${name}` : i.kind === "claim" ? `Your claim for ${name} was approved` : `Your listing for ${name} was approved`, 200);

  const text = [
    i.live ? APPROVAL_LIVE_HEADLINE : null,
    intro,
    i.live ? `View Your Listing: ${listingUrl}` : null,
    account,
    showMembership ? `${APPROVAL_MEMBERSHIP_PROMPT} ${APPROVAL_MEMBERSHIP_LINK_LABEL}: ${membershipUrl}` : null,
    note,
    `— ${BRAND.name}`,
  ].filter(Boolean).join("\n\n");

  const p = (t: string, style = "") => `<p style="margin:0 0 14px;line-height:1.5;${style}">${escapeHtml(t)}</p>`;
  const accountHtml = !account ? "" : i.invited ? p(account) : `<p style="margin:0 0 14px;line-height:1.5">Sign in with your existing account to <a href="${escapeHtml(dashboardUrl)}" style="color:#0B2340;font-weight:bold">manage your listing</a> (your password hasn&#39;t changed).</p>`;
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;background:#F7F8F5;padding:24px"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:24px">${
    i.live ? `<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#0B2340">${escapeHtml(APPROVAL_LIVE_HEADLINE)}</h1>` : ""
  }${p(intro)}${
    i.live ? `<p style="margin:20px 0"><a href="${escapeHtml(listingUrl)}" style="background:#0B2340;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">View Your Listing</a></p>` : ""
  }${accountHtml}${
    showMembership ? `<p style="margin:18px 0 14px;line-height:1.5;font-size:14px;color:#475569">${escapeHtml(APPROVAL_MEMBERSHIP_PROMPT)} <a href="${escapeHtml(membershipUrl)}" style="color:#0B2340;font-weight:bold">${escapeHtml(APPROVAL_MEMBERSHIP_LINK_LABEL)}</a>.</p>` : ""
  }${note ? p(note) : ""}<p style="margin:16px 0 0;color:#64748b;font-size:13px">— ${escapeHtml(BRAND.name)}</p></div></body></html>`;

  return { subject, text, html, listingUrl, membershipUrl: showMembership ? membershipUrl : null };
}
