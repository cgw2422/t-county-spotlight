import { getStoredForecast } from "@/lib/weather/forecast";
import { weatherImageResponse } from "@/lib/weather/image";

/** /weather/forecast/<id>.png — the card for one stored forecast. Never changes, so it's cached for a year. */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const m = /^([a-z0-9]{10,40})\.png$/.exec(file);
  const f = m ? await getStoredForecast(m[1]) : null;
  if (!f || !f.days.length) return new Response("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex" } });
  return weatherImageResponse(f, { immutable: true });
}
