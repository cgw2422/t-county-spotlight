import "server-only";
import { emailLogo } from "@/lib/brand-assets";
import { absoluteUrl } from "@/lib/utils";
import { emailUpdateLabel, type EmailUpdateKey } from "@/lib/notification-categories";
import { newsletterSender } from "@/lib/newsletter/settings";
import { esc, renderSimpleEmail } from "@/lib/newsletter/render";
import { unsubscribeToken } from "./tokens";
import { TYPE_LABEL, type LocalItem } from "./items";

export type EmailGroup = { heading: string; items: LocalItem[]; /** Prefix each item with its type ("Food truck · …") in mixed lists. */ showType?: boolean };

const WHY: Record<EmailUpdateKey, string> = {
  weekend_summary: "you turned on “Weekend summary” in your T County Connect email updates",
  saved_event_reminders: "you turned on “Saved event reminders” in your T County Connect email updates and saved these events",
  new_in_my_communities: "you turned on “New in my communities” in your T County Connect email updates",
};

const TURN_OFF: Record<EmailUpdateKey, string> = {
  weekend_summary: "Turn off weekend summaries",
  saved_event_reminders: "Turn off saved event reminders",
  new_in_my_communities: "Turn off “New in my communities”",
};

export function updateLinks(userId: string, kind: EmailUpdateKey) {
  const t = encodeURIComponent(unsubscribeToken(userId, kind));
  return {
    unsubscribeUrl: absoluteUrl(`/account/notifications/unsubscribe/?t=${t}`),
    oneClickUrl: absoluteUrl(`/api/notifications/unsubscribe/?t=${t}`),
    preferencesUrl: absoluteUrl("/account/notifications/"),
  };
}

const C = { navy: "#0B2340", green: "#387D14", sunset: "#C25E00", text: "#1e293b", muted: "#5b6472", line: "#e2e8f0" };

function groupHtml(g: EmailGroup) {
  const rows = g.items.map((i) => `<tr><td style="padding:0 0 12px">
<div style="font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${C.sunset}">${esc(g.showType ? `${TYPE_LABEL[i.type]} · ${i.meta}` : i.meta)}</div>
<div style="font-size:16px;font-weight:700;line-height:1.35"><a href="${esc(absoluteUrl(i.url))}" style="color:${C.navy};text-decoration:none">${esc(i.title)}</a></div>
</td></tr>`).join("");
  return `<h2 style="margin:18px 0 10px;padding:0 0 6px;border-bottom:2px solid ${C.green};font-size:18px;line-height:1.3;color:${C.navy}">${esc(g.heading)}</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;
}

/**
 * Plain, branded, short. Every email says why it was sent and has a one-click
 * "turn off" link for that update type plus a link to manage all preferences.
 */
export async function buildUpdateEmail(o: {
  kind: EmailUpdateKey;
  userId: string;
  name?: string | null;
  subject: string;
  title: string;
  intro: string;
  groups: EmailGroup[];
  button?: { label: string; path: string };
  /** Extra plain-text note (e.g. for test sends). */
  note?: string;
}) {
  const s = await newsletterSender();
  const site = s.site.siteName;
  const links = updateLinks(o.userId, o.kind);
  const first = o.name?.trim().split(/\s+/)[0];
  const hi = first ? `Hi ${first},` : "Hi there,";
  const groups = o.groups.filter((g) => g.items.length);
  const reason = `${WHY[o.kind].charAt(0).toUpperCase()}${WHY[o.kind].slice(1)}.`;
  const postal = s.settings.postalAddress.trim();

  const html = renderSimpleEmail({
    siteName: site, logoUrl: emailLogo(s.site), title: o.title,
    paragraphs: [esc(hi), esc(o.intro), ...(o.note ? [`<em>${esc(o.note)}</em>`] : [])],
    html: groups.map(groupHtml).join("\n"),
    button: o.button ? { label: o.button.label, url: absoluteUrl(o.button.path) } : undefined,
    after: [
      `<strong>Why you’re getting this:</strong> ${esc(reason)}`,
      `<a href="${esc(links.unsubscribeUrl)}" style="color:${C.navy};font-weight:700">${esc(TURN_OFF[o.kind])}</a> (one click, no sign-in needed) &middot; <a href="${esc(links.preferencesUrl)}" style="color:${C.navy}">Manage all email preferences</a>`,
    ],
    footer: [
      `${esc(site)}${postal ? ` &middot; ${esc(postal).replace(/\n/g, ", ")}` : ""}`,
      "Local information only — no ads or sponsored listings.",
    ],
  });

  const lines: string[] = [o.title.toUpperCase(), "", hi, "", o.intro, ""];
  if (o.note) lines.push(o.note, "");
  for (const g of groups) {
    lines.push(g.heading.toUpperCase(), "-".repeat(Math.min(40, g.heading.length)));
    for (const i of g.items) lines.push(`* ${i.title}`, `  ${g.showType ? `${TYPE_LABEL[i.type]} · ` : ""}${i.meta}`, `  ${absoluteUrl(i.url)}`);
    lines.push("");
  }
  if (o.button) lines.push(`${o.button.label}: ${absoluteUrl(o.button.path)}`, "");
  lines.push("—", `Why you’re getting this: ${reason}`, `${TURN_OFF[o.kind]} (one click): ${links.unsubscribeUrl}`, `Manage all email preferences: ${links.preferencesUrl}`, `${site}${postal ? ` · ${postal.replace(/\n/g, ", ")}` : ""}`);

  return {
    subject: o.subject,
    html,
    text: lines.join("\n"),
    headers: {
      "List-Unsubscribe": `<${links.oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    tags: [{ name: "category", value: `update_${o.kind}` }],
    label: emailUpdateLabel(o.kind),
  };
}
