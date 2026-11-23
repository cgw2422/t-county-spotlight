import { getCurrentForecast } from "@/lib/weather/forecast";
import { weatherRss } from "@/lib/weather/rss";

/**
 * Newsletter weather feed for beehiiv's RSS block (https://tcountyconnect.com/weather/rss/). Always the latest
 * National Weather Service forecast (re-checked at most every 30 minutes). Not linked from the public site.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const f = await getCurrentForecast();
  if (!f || !f.days.length) {
    return new Response("Weather forecast temporarily unavailable.", { status: 503, headers: { "Retry-After": "300", "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" } });
  }
  return new Response(weatherRss(f), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
