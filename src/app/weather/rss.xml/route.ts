import { GET as feed } from "../rss/route";

/** Same feed at a URL with a file extension (served without the trailing-slash redirect). */
export const dynamic = "force-dynamic";
export const GET = feed;
