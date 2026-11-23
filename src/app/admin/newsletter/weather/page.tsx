import { CloudSun, RefreshCw } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { absoluteUrl } from "@/lib/utils";
import { getCurrentForecast, REFRESH_MS } from "@/lib/weather/forecast";
import { dayLine, easternTime, forecastImagePath, NWS_FORECAST_PAGE, WEATHER_FEED_PATH, WEATHER_LOCATION } from "@/lib/weather/shared";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { CopyLink } from "../article-link/copy-link";
import { refreshWeatherAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Newsletter weather" };

export default async function WeatherAdminPage() {
  await requireAdmin();
  const f = await getCurrentForecast();
  const feed = absoluteUrl(WEATHER_FEED_PATH);
  return (
    <>
      <PageHeader
        title="Newsletter weather"
        description={`A branded 3-day forecast for ${WEATHER_LOCATION.area} (${WEATHER_LOCATION.name}) from the National Weather Service, published as an RSS feed for beehiiv's RSS block. It isn't shown anywhere on the public website.`}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card title="Current forecast" description={f ? `Issued ${easternTime(f.issuedAt)} ET · checked ${easternTime(f.fetchedAt)} ET · re-checked at most every ${REFRESH_MS / 60000} minutes` : undefined}>
          {!f ? (
            <Notice tone="warn" title="No forecast yet">The National Weather Service hasn&apos;t responded yet. Try Refresh now in a few minutes.</Notice>
          ) : (
            <div className="space-y-4" data-testid="weather-preview">
              {f.stale && <Notice tone="warn" title="Showing the last saved forecast">The National Weather Service didn&apos;t respond ({f.error}). The feed keeps serving this forecast until it does.</Notice>}
              {/* eslint-disable-next-line @next/next/no-img-element -- exact image beehiiv receives */}
              <img src={forecastImagePath(f.id)} width={600} height={315} alt="Current 3-day forecast card" className="h-auto w-full max-w-[600px] rounded-xl ring-1 ring-slate-200" data-testid="weather-image" />
              <ul className="space-y-1 text-sm text-slate-700">{f.days.map((d) => <li key={d.date}>{dayLine(d)}</li>)}</ul>
            </div>
          )}
          <ActionForm action={refreshWeatherAction} className="mt-4">
            <Submit pendingText="Refreshing…" data-testid="weather-refresh"><RefreshCw className="h-4 w-4" /> Refresh now</Submit>
          </ActionForm>
        </Card>
        <Card title="Add it to beehiiv" description="One-time setup, then one click per issue.">
          <div className="space-y-4 text-sm text-slate-700">
            <div><p className="mb-1 font-semibold text-navy-900">RSS feed URL</p><CopyLink url={feed} /></div>
            <ol className="list-decimal space-y-2 pl-5">
              <li>In beehiiv, go to Settings → RSS feeds (or type <code className="rounded bg-slate-100 px-1 text-xs">/rss</code> in a post) and add this feed.</li>
              <li>In your post, type <code className="rounded bg-slate-100 px-1 text-xs">/rss</code>, choose the feed, and show <strong>1</strong> article.</li>
              <li>Display: turn <strong>Image</strong> on. Title, date and description are optional; the image already has the days, temperatures and chance of rain.</li>
              <li><strong>Before each send, click the block&apos;s refresh icon</strong> (circular arrows) to pull the latest forecast. On the Pro plan beehiiv doesn&apos;t refresh it automatically at send time.</li>
            </ol>
            <p className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"><CloudSun className="mt-0.5 h-4 w-4 shrink-0 text-sunset-600" aria-hidden /> Each forecast image has its own permanent address, so a sent newsletter keeps showing the forecast it was sent with. The image links to the <a href={NWS_FORECAST_PAGE} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 hover:underline">National Weather Service forecast</a>.</p>
          </div>
        </Card>
      </div>
    </>
  );
}
