import "server-only";
import { sendMessage } from "@/lib/email";
import { absoluteUrl } from "@/lib/utils";
import { NEWSLETTER_NAME, FREQUENCY_NOTE } from "./copy";
import { newsletterSender } from "./settings";
import { esc, listUnsubscribeHeaders, recipientLinks, renderSimpleEmail } from "./render";

type Sub = { email: string; firstName: string | null; unsubscribeToken: string };

async function ctx() {
  const s = await newsletterSender();
  const footer = [
    `${esc(s.site.siteName)}${s.settings.postalAddress ? ` &middot; ${esc(s.settings.postalAddress).replace(/\n/g, ", ")}` : ""}`,
    `<a href="${esc(absoluteUrl("/newsletter/#privacy"))}" style="color:#64748b">How we use your email</a>`,
  ];
  return { s, footer };
}

/** Double opt-in confirmation. Sent only when someone asks to subscribe. */
export async function sendConfirmationEmail(sub: Sub, token: string) {
  const { s, footer } = await ctx();
  const link = absoluteUrl(`/newsletter/confirm/?token=${encodeURIComponent(token)}`);
  const hi = sub.firstName ? `Hi ${esc(sub.firstName)},` : "Hi there,";
  const subject = `Please confirm your ${NEWSLETTER_NAME} subscription`;
  const html = renderSimpleEmail({
    siteName: s.site.siteName, logoUrl: s.site.logoUrl, title: "One click to confirm",
    paragraphs: [hi, `Someone (hopefully you!) asked to receive the <strong>${NEWSLETTER_NAME}</strong> from ${esc(s.site.siteName)} at this address. Please confirm you'd like local events, community stories, business spotlights and things to do around Tuscarawas County in your inbox.`],
    button: { label: "Yes, subscribe me", url: link },
    after: ["This link expires in 48 hours. If you didn't ask for this, just ignore this email — you won't be subscribed and we won't email you again about it."],
    footer,
  });
  const text = `${sub.firstName ? `Hi ${sub.firstName},` : "Hi there,"}\n\nSomeone (hopefully you!) asked to receive the ${NEWSLETTER_NAME} from ${s.site.siteName} at this address.\n\nConfirm your subscription:\n${link}\n\nThis link expires in 48 hours. If you didn't ask for this, ignore this email — you won't be subscribed.\n\n— ${s.site.siteName}`;
  return sendMessage({ to: sub.email, subject, text, html, from: s.from || undefined, replyTo: s.replyTo, tags: [{ name: "category", value: "newsletter_confirm" }] });
}

export async function sendWelcomeEmail(sub: Sub) {
  const { s, footer } = await ctx();
  const links = recipientLinks(sub.unsubscribeToken);
  const subject = `Welcome to the ${NEWSLETTER_NAME}!`;
  const html = renderSimpleEmail({
    siteName: s.site.siteName, logoUrl: s.site.logoUrl, title: `You're in${sub.firstName ? `, ${sub.firstName}` : ""}!`,
    paragraphs: [
      `Thanks for confirming. The ${NEWSLETTER_NAME} brings you local events, community stories, business spotlights and things to do around Tuscarawas County. ${FREQUENCY_NOTE}`,
      "Some issues include clearly labeled promotional content from local businesses and sponsors.",
    ],
    button: { label: "Explore T-County now", url: absoluteUrl("/explore/") },
    after: [`Choose topics on your <a href="${esc(links.preferencesUrl)}" style="color:#1d66db">preferences page</a>, or <a href="${esc(links.unsubscribeUrl)}" style="color:#1d66db">unsubscribe</a> at any time.`],
    footer,
  });
  const text = `You're in${sub.firstName ? `, ${sub.firstName}` : ""}!\n\nThanks for confirming. The ${NEWSLETTER_NAME} brings you local events, community stories, business spotlights and things to do around Tuscarawas County. ${FREQUENCY_NOTE}\n\nExplore: ${absoluteUrl("/explore/")}\n\nEmail preferences: ${links.preferencesUrl}\nUnsubscribe: ${links.unsubscribeUrl}\n\n— ${s.site.siteName}`;
  return sendMessage({ to: sub.email, subject, text, html, from: s.from || undefined, replyTo: s.replyTo, headers: listUnsubscribeHeaders(sub.unsubscribeToken), tags: [{ name: "category", value: "newsletter_welcome" }] });
}

/** Sent (at most daily) when an active subscriber signs up again. Doesn't reveal anything on the website. */
export async function sendAlreadySubscribedEmail(sub: Sub) {
  const { s, footer } = await ctx();
  const links = recipientLinks(sub.unsubscribeToken);
  const subject = `You're already getting the ${NEWSLETTER_NAME}`;
  const html = renderSimpleEmail({
    siteName: s.site.siteName, logoUrl: s.site.logoUrl, title: "You're already subscribed",
    paragraphs: [`Good news — this address already receives the ${NEWSLETTER_NAME}. There's nothing else you need to do.`],
    button: { label: "Manage email preferences", url: links.preferencesUrl },
    after: [`Didn't request this? You can ignore it, or <a href="${esc(links.unsubscribeUrl)}" style="color:#1d66db">unsubscribe</a>.`],
    footer,
  });
  const text = `Good news — this address already receives the ${NEWSLETTER_NAME}. There's nothing else you need to do.\n\nManage preferences: ${links.preferencesUrl}\nUnsubscribe: ${links.unsubscribeUrl}\n\n— ${s.site.siteName}`;
  return sendMessage({ to: sub.email, subject, text, html, from: s.from || undefined, replyTo: s.replyTo, headers: listUnsubscribeHeaders(sub.unsubscribeToken), tags: [{ name: "category", value: "newsletter_notice" }] });
}
