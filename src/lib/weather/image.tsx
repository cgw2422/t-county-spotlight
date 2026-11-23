import "server-only";
import { ImageResponse } from "next/og";
import fs from "node:fs/promises";
import path from "node:path";
import { BRAND } from "@/lib/brand";
import { easternTime, tempText, WEATHER_LOCATION, type WeatherDay, type WeatherIcon } from "./shared";

/**
 * The newsletter weather card: three days side by side, drawn as a PNG so every email client (and beehiiv's RSS
 * block) shows the same layout. 1200×630 (shown at 600 wide in email, sharp on high-DPI screens).
 */
export const WEATHER_IMAGE_SIZE = { width: 1200, height: 630 };

const { navy, green, orange, offWhite } = BRAND.colors;
const CLOUD = "#CBD5E1";
const CLOUD_DARK = "#94A3B8";
const DROP = "#2B6CB0";

// Satori only allows intrinsic SVG elements inside <svg>, so the icon parts are plain functions returning arrays of
// shapes (not components or fragments).
type El = React.ReactElement;

function cloud(fill = CLOUD, dy = 0, k = "c"): El[] {
  return [
    <circle key={`${k}1`} cx="25" cy={36 + dy} r="11" fill={fill} />,
    <circle key={`${k}2`} cx="38" cy={30 + dy} r="14" fill={fill} />,
    <circle key={`${k}3`} cx="49" cy={38 + dy} r="9" fill={fill} />,
    <rect key={`${k}4`} x="14" y={36 + dy} width="44" height="13" rx="6.5" fill={fill} />,
  ];
}

function sun(cx = 32, cy = 32, r = 11): El[] {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => {
    const rad = (a * Math.PI) / 180;
    return <line key={`r${i}`} x1={cx + Math.cos(rad) * (r + 5)} y1={cy + Math.sin(rad) * (r + 5)} x2={cx + Math.cos(rad) * (r + 11)} y2={cy + Math.sin(rad) * (r + 11)} stroke={orange} strokeWidth="4" strokeLinecap="round" />;
  });
  return [<circle key="sun" cx={cx} cy={cy} r={r} fill={orange} />, ...rays];
}

const drops = (xs: number[]): El[] => xs.map((x) => <line key={`d${x}`} x1={x} y1="52" x2={x - 4} y2="61" stroke={DROP} strokeWidth="4" strokeLinecap="round" />);
const flakes = (xs: number[]): El[] => xs.map((x) => <circle key={`f${x}`} cx={x} cy="57" r="3.5" fill={DROP} />);

export function WeatherGlyph({ icon, size = 120 }: { icon: WeatherIcon; size?: number }) {
  const body: El[] = (() => {
    switch (icon) {
      case "sunny": return sun();
      case "partly": return [...sun(24, 22, 9), ...cloud(CLOUD, 4)];
      case "cloudy": return [...cloud(CLOUD_DARK, -8, "a"), ...cloud(CLOUD, 0, "b")];
      case "rain": return [...cloud(CLOUD_DARK, -6), ...drops([24, 34, 44])];
      case "storm": return [...cloud("#64748B", -6), <polygon key="bolt" points="34,40 26,54 33,54 29,64 42,48 35,48 39,40" fill={orange} />];
      case "snow": return [...cloud(CLOUD, -6), ...flakes([22, 33, 44])];
      case "mix": return [...cloud(CLOUD, -6), ...drops([26]), ...flakes([38, 47])];
      case "fog": return [...cloud(CLOUD, -10), ...[46, 53, 60].map((y) => <line key={`fog${y}`} x1="12" y1={y} x2="52" y2={y} stroke={CLOUD_DARK} strokeWidth="4" strokeLinecap="round" />)];
      case "wind": return ["M8 26 H40 C48 26 48 16 41 16", "M8 36 H50 C58 36 58 46 50 46", "M8 46 H30"].map((d) => <path key={d} d={d} stroke={CLOUD_DARK} strokeWidth="4" fill="none" strokeLinecap="round" />);
    }
  })();
  return <svg width={size} height={size} viewBox="0 0 64 64">{body}</svg>;
}

function Raindrop() {
  return <svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 2 C12 2 5 10.5 5 15 a7 7 0 0 0 14 0 C19 10.5 12 2 12 2 Z" fill={green} /></svg>;
}

async function font(file: string) {
  try {
    return await fs.readFile(path.join(process.cwd(), "node_modules", "@fontsource", file));
  } catch {
    return null;
  }
}

function DayCard({ d }: { d: WeatherDay }) {
  // Vertical budget (card ≈ 400px tall): every block has a fixed line height and never shrinks, so a two-line
  // description always fits above the precipitation chip.
  const fixed = { display: "flex", flexShrink: 0 } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, background: "#ffffff", borderRadius: 28, padding: "20px 18px 18px", border: "2px solid rgba(11,35,64,0.08)" }}>
      <div style={{ ...fixed, fontFamily: "Montserrat", fontSize: 36, lineHeight: 1.1, color: navy }}>{d.weekday}</div>
      <div style={{ ...fixed, fontSize: 21, lineHeight: 1.2, color: "#64748B", marginTop: 4 }}>{d.monthDay}</div>
      <div style={{ ...fixed, marginTop: 4 }}><WeatherGlyph icon={d.icon} size={96} /></div>
      <div style={{ ...fixed, alignItems: "baseline" }}>
        <span style={{ fontFamily: "Montserrat", fontSize: 54, lineHeight: 1.1, color: navy }}>{tempText(d.high)}</span>
        <span style={{ fontFamily: "Montserrat", fontSize: 32, lineHeight: 1.1, color: "#94A3B8", marginLeft: 10 }}>{tempText(d.low)}</span>
      </div>
      <div style={{ ...fixed, alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 23, lineHeight: 1.15, color: "#1E293B", marginTop: 6, height: 54, maxWidth: "100%" }}>{d.summary}</div>
      <div style={{ ...fixed, alignItems: "center", marginTop: "auto", padding: "5px 16px", borderRadius: 999, background: "#EAF4E4" }}>
        <Raindrop />
        <span style={{ fontFamily: "Montserrat", fontSize: 23, color: green, marginLeft: 8 }}>{`${d.precip}% chance`}</span>
      </div>
    </div>
  );
}

/** PNG response for one stored forecast. `immutable` for /weather/forecast/<id>.png (that forecast never changes). */
export async function weatherImageResponse(f: { days: WeatherDay[]; issuedAt: Date }, opts: { immutable?: boolean } = {}) {
  const [montserrat, openSans] = await Promise.all([
    font("montserrat/files/montserrat-latin-700-normal.woff"),
    font("open-sans/files/open-sans-latin-400-normal.woff"),
  ]);
  const fonts = [
    ...(montserrat ? [{ name: "Montserrat", data: montserrat, weight: 700 as const, style: "normal" as const }] : []),
    ...(openSans ? [{ name: "Open Sans", data: openSans, weight: 400 as const, style: "normal" as const }] : []),
  ];
  const res = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: offWhite, fontFamily: "Open Sans" }}>
        <div style={{ display: "flex", height: 10, width: "100%", background: orange }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 118, padding: "0 44px", background: navy }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontFamily: "Montserrat", fontSize: 20, letterSpacing: 3, color: orange }}>LOCAL WEATHER</div>
            <div style={{ display: "flex", fontFamily: "Montserrat", fontSize: 46, color: "#ffffff", marginTop: 2 }}>3-Day Forecast</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontFamily: "Montserrat", fontSize: 28, color: "#ffffff" }}>{WEATHER_LOCATION.area}</div>
            <div style={{ display: "flex", fontSize: 22, color: "#CBD5E1", marginTop: 2 }}>{WEATHER_LOCATION.name}</div>
          </div>
        </div>
        <div style={{ display: "flex", flex: 1, gap: 22, padding: "24px 36px 18px" }}>
          {f.days.slice(0, 3).map((d) => <DayCard key={d.date} d={d} />)}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 50, padding: "0 44px", fontSize: 19, color: "#475569" }}>
          <div style={{ display: "flex" }}>{`National Weather Service forecast · Updated ${easternTime(f.issuedAt)} ET`}</div>
          <div style={{ display: "flex", fontFamily: "Montserrat", fontSize: 20, color: navy }}>tcountyconnect.com</div>
        </div>
        <div style={{ display: "flex", height: 10, width: "100%", background: green }} />
      </div>
    ),
    { ...WEATHER_IMAGE_SIZE, fonts: fonts.length ? fonts : undefined },
  );
  res.headers.set("Cache-Control", opts.immutable ? "public, max-age=31536000, immutable" : "public, max-age=300, s-maxage=300");
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}
