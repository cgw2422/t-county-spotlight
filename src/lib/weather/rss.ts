import "server-only";
import { absoluteUrl } from "@/lib/utils";
import { dayLine, easternTime, forecastImagePath, forecastTitle, NWS_FORECAST_PAGE, WEATHER_FEED_PATH, WEATHER_LOCATION } from "./shared";
import { WEATHER_IMAGE_SIZE } from "./image";
import type { CurrentForecast } from "./forecast";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const cdata = (s: string) => `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

/**
 * RSS 2.0 with exactly one item: the current 3-day forecast. The item's image (enclosure / media:content) is the
 * branded forecast card at a permanent per-forecast URL; the description is a plain-text summary; content:encoded
 * holds the card (with the full forecast as alt text) and an "Updated" caption.
 */
export function weatherRss(f: CurrentForecast) {
  const days = f.days.slice(0, 3);
  const img = absoluteUrl(forecastImagePath(f.id));
  const title = forecastTitle(days);
  const updated = `Updated ${easternTime(f.issuedAt)} ET from the National Weather Service.`;
  const text = days.map(dayLine).join(" ");
  const alt = `${title}. ${text}`;
  // Full content = the card (alt text carries every day's details for screen readers / images-off) + a small caption.
  const html =
    `<p><a href="${esc(NWS_FORECAST_PAGE)}"><img src="${esc(img)}" width="600" height="315" alt="${esc(alt)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;" /></a></p>` +
    `<p style="font-size:12px;color:#64748B;font-family:Arial,Helvetica,sans-serif;">${esc(updated)}</p>`;
  const pub = f.issuedAt.toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
<title>T County Connect Weather</title>
<link>${esc(NWS_FORECAST_PAGE)}</link>
<atom:link href="${esc(absoluteUrl(WEATHER_FEED_PATH))}" rel="self" type="application/rss+xml" />
<description>${esc(`3-day forecast for ${WEATHER_LOCATION.area} (${WEATHER_LOCATION.name}) from the National Weather Service, for the T County Connect newsletter.`)}</description>
<language>en-us</language>
<lastBuildDate>${new Date(Math.max(f.fetchedAt.getTime(), f.issuedAt.getTime())).toUTCString()}</lastBuildDate>
<ttl>30</ttl>
<item>
<title>${esc(title)}</title>
<link>${esc(NWS_FORECAST_PAGE)}</link>
<guid isPermaLink="false">tcountyconnect-weather-${esc(f.id)}</guid>
<pubDate>${pub}</pubDate>
<description>${esc(`${text} ${updated}`)}</description>
<content:encoded>${cdata(html)}</content:encoded>
<enclosure url="${esc(img)}" type="image/png" length="0" />
<media:content url="${esc(img)}" medium="image" type="image/png" width="${WEATHER_IMAGE_SIZE.width}" height="${WEATHER_IMAGE_SIZE.height}" />
<media:thumbnail url="${esc(img)}" width="${WEATHER_IMAGE_SIZE.width}" height="${WEATHER_IMAGE_SIZE.height}" />
</item>
</channel>
</rss>
`;
}
