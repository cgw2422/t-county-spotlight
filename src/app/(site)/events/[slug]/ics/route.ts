import { describeRecurrence, type Recurrence } from "@/lib/events";
import { eventHref } from "@/lib/links";
import { absoluteUrl, stripHtml, toDateInput } from "@/lib/utils";
import { nyDateKey, addDaysKey } from "@/components/public/dates";
import { loadEvent } from "../data";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\;");
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

const TZ = "America/New_York";
/** YYYYMMDDTHHMMSS in America/New_York. */
function local(d: Date) {
  return toDateInput(d).replace(/[-:]/g, "") + "00";
}
const VTIMEZONE = [
  "BEGIN:VTIMEZONE", `TZID:${TZ}`,
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:-0500", "TZOFFSETTO:-0400", "TZNAME:EDT", "DTSTART:19700308T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:-0400", "TZOFFSETTO:-0500", "TZNAME:EST", "DTSTART:19701101T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU", "END:STANDARD",
  "END:VTIMEZONE",
];

/** Folds long lines per RFC 5545 (75 octets). */
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = " " + rest.slice(74); }
  out.push(rest);
  return out.join("\r\n");
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = await loadEvent(slug);
  if (!e) return new Response("Not found", { status: 404 });
  const url = absoluteUrl(eventHref(e));
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TCountySpotlight//Events//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    ...(e.allDay ? [] : VTIMEZONE),
    "BEGIN:VEVENT",
    `UID:${e.id}@tcountyspotlight`,
    `DTSTAMP:${utc(new Date())}`,
  ];
  if (e.allDay) {
    const s = nyDateKey(e.startAt);
    const endKey = e.endAt ? addDaysKey(nyDateKey(e.endAt), 1) : addDaysKey(s, 1);
    lines.push(`DTSTART;VALUE=DATE:${s.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${endKey.replace(/-/g, "")}`);
  } else {
    // Local wall-clock time with TZID so recurring events stay at the same local hour across DST.
    lines.push(`DTSTART;TZID=${TZ}:${local(e.startAt)}`, `DTEND;TZID=${TZ}:${local(e.endAt ?? new Date(e.startAt.getTime() + 3600_000))}`);
  }
  const rec = e.recurrence as Recurrence | null;
  if (rec?.freq && ["DAILY", "WEEKLY", "MONTHLY"].includes(rec.freq)) {
    let rule = `RRULE:FREQ=${rec.freq};INTERVAL=${Math.max(1, rec.interval || 1)}`;
    if (rec.count) rule += `;COUNT=${rec.count}`;
    else if (rec.until && !Number.isNaN(Date.parse(rec.until))) rule += `;UNTIL=${utc(new Date(rec.until))}`;
    lines.push(rule);
  }
  lines.push(`SUMMARY:${esc(e.title)}`);
  const location = [e.locationName, e.address, e.city ? `${e.city}, OH` : null].filter(Boolean).join(", ");
  if (location) lines.push(`LOCATION:${esc(location)}`);
  const desc = [stripHtml(e.description).slice(0, 1500), describeRecurrence(e.recurrence), url].filter(Boolean).join("\n\n");
  lines.push(`DESCRIPTION:${esc(desc)}`, `URL:${url}`, "END:VEVENT", "END:VCALENDAR");
  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${e.slug.replace(/[^a-z0-9-]/gi, "")}.ics"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
