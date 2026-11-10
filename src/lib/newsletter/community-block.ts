import "server-only";
import { absoluteUrl } from "@/lib/utils";
import { cleanCommunities, communityName } from "@/lib/my-t-county-shared";
import { fetchLocalItems, inCommunities, mixItems, TYPE_LABEL, type LocalItem, type LocalItemType } from "@/lib/notifications/items";
import { EMAIL_COLORS as C, EMAIL_FONT, EMAIL_SERIF, PREFERENCES_PLACEHOLDER, esc, itemBlock } from "./render";
import type { Preferences, TopicKey } from "./copy";

/**
 * "Around your community" block for the T County Connect Weekly. Computed at
 * send time for each distinct (communities + topics) combination, never
 * per recipient, and only from real published listings in those communities
 * this week. Sponsored items are never included. Empty → no block at all.
 */
export const BLOCK_LIMIT = 4;
const BLOCK_TYPES: LocalItemType[] = ["event", "food_truck", "garage_sale", "opening", "need", "volunteer"];

/** Which newsletter topic each kind of item belongs to (subscribers who turned a topic off don't get those items). */
const TOPIC_OF: Record<LocalItemType, TopicKey> = {
  event: "events", food_truck: "events", garage_sale: "events", opening: "stories", need: "gives", volunteer: "gives", special: "specials",
};

/**
 * Communities for a subscriber: their own newsletter choice; when empty and the
 * subscriber is a linked member, the member's My T County communities; else none
 * (countywide email, no block).
 */
export function subscriberCommunities(sub: { communities: string[]; user?: { homeCommunity: string | null; extraCommunities: string[] } | null }): string[] {
  const own = cleanCommunities(sub.communities);
  if (own.length) return own;
  if (!sub.user) return [];
  const home = communityName(sub.user.homeCommunity);
  return [...(home ? [home] : []), ...cleanCommunities(sub.user.extraCommunities, home)];
}

export async function blockSource(communities: string[], now = new Date()) {
  const src = await fetchLocalItems({ communities, start: now, end: new Date(now.getTime() + 7 * 86400_000), now, types: BLOCK_TYPES, take: 6 });
  for (const t of BLOCK_TYPES) src[t] = inCommunities(src[t], communities);
  return src;
}

export function pickBlockItems(src: Record<LocalItemType, LocalItem[]>, prefs: Preferences | null, limit = BLOCK_LIMIT) {
  const types = BLOCK_TYPES.filter((t) => !prefs || prefs[TOPIC_OF[t]]);
  return mixItems(src, types, limit);
}

function label(c: string[]) {
  return c.length === 1 ? c[0] : c.length === 2 ? `${c[0]} & ${c[1]}` : "your communities";
}

/** HTML (a table row matching the newsletter sections) and plain text. Empty strings when there are no items. */
export function renderCommunityBlock(items: LocalItem[], communities: string[]) {
  if (!items.length || !communities.length) return { html: "", text: "" };
  const title = `Around ${label(communities)} this week`;
  const nl = items.map((i) => ({ id: i.key, title: i.title, url: absoluteUrl(i.url), meta: `${TYPE_LABEL[i.type]} · ${i.meta}` }));
  const html = `<tr><td class="nl-pad" style="padding:8px 32px 6px;font-family:${EMAIL_FONT}">
  <h2 style="margin:12px 0 6px;padding:0 0 8px;border-bottom:2px solid ${C.sunset};font-family:${EMAIL_SERIF};font-size:22px;color:${C.navy}">${esc(title)}</h2>
  <p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:${C.muted}">Picked for ${esc(communities.join(", "))} from this week&rsquo;s listings. <a href="${PREFERENCES_PLACEHOLDER}" style="color:${C.muted};text-decoration:underline">Change your communities</a></p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${nl.map((i) => itemBlock(i, "")).join("\n")}</table>
</td></tr>`;
  const text = [
    title.toUpperCase(), "-".repeat(Math.min(40, title.length)),
    `Picked for ${communities.join(", ")} from this week's listings. Change your communities: ${PREFERENCES_PLACEHOLDER}`,
    ...nl.flatMap((i) => [`* ${i.meta} — ${i.title}`, `  ${i.url}`]),
    "",
  ].join("\n");
  return { html, text };
}

/**
 * Per-send renderer with caching: each distinct community set is queried once,
 * and each (communities, topics) combination rendered once.
 */
export function createCommunityBlockRenderer(now = new Date()) {
  const sources = new Map<string, ReturnType<typeof blockSource>>();
  const rendered = new Map<string, Promise<{ html: string; text: string }>>();
  const render = (communities: string[], prefs: Preferences | null) => {
    if (!communities.length) return Promise.resolve({ html: "", text: "" });
    const ckey = communities.join("|");
    const key = `${ckey}#${prefs ? Object.values(prefs).map(Number).join("") : "all"}`;
    let r = rendered.get(key);
    if (!r) {
      if (!sources.has(ckey)) sources.set(ckey, blockSource(communities, now));
      r = sources.get(ckey)!.then((src) => renderCommunityBlock(pickBlockItems(src, prefs), communities));
      rendered.set(key, r);
    }
    return r;
  };
  /** Number of distinct community sets queried so far (for tests/diagnostics). */
  render.distinctSets = () => sources.size;
  return render;
}
