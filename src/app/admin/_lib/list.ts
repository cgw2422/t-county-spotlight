import "server-only";

export type SP = Record<string, string | string[] | undefined>;

export function spGet(sp: SP, key: string) {
  const v = sp[key];
  return (Array.isArray(v) ? v[0] : v)?.trim() || "";
}

export function pageParams(sp: SP, perPage = 25) {
  const page = Math.max(1, parseInt(spGet(sp, "page") || "1", 10) || 1);
  return { page, take: perPage, skip: (page - 1) * perPage, perPage };
}
