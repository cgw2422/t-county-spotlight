"use server";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  ALL_COUNTY, COMMUNITY_COOKIE, COOKIE_MAX_AGE, PROMPT_DISMISSED_COOKIE, SCOPE_COOKIE, cleanCommunities, cleanInterests, communityName, communitySlug,
} from "@/lib/my-t-county-shared";
import type { ActionState } from "@/components/ui/form-message";

const cookieOpts = { maxAge: COOKIE_MAX_AGE, sameSite: "lax" as const, path: "/", httpOnly: false, secure: process.env.NODE_ENV === "production" };

/** "all" or a known community (slug or name). */
const communityValue = z.string().trim().max(60).refine((v) => v === ALL_COUNTY || !!communityName(v), "Unknown community");

async function writeCommunityCookie(name: string | null) {
  const jar = await cookies();
  jar.set(COMMUNITY_COOKIE, name ? communitySlug(name)! : ALL_COUNTY, cookieOpts);
  jar.delete(SCOPE_COOKIE);
}

/**
 * Sets the preferred community. Signed in → saved on the account (and mirrored
 * in the device cookie so the prompt stays away); guest → plain cookie only.
 */
export async function setCommunityAction(value: string): Promise<{ ok: boolean; community: string | null }> {
  const parsed = communityValue.safeParse(value);
  if (!parsed.success) return { ok: false, community: null };
  const name = parsed.data === ALL_COUNTY ? null : communityName(parsed.data);
  const user = await getCurrentUser();
  if (user) {
    if (!rateLimit(`community:${user.id}`, 30, 60_000).ok) return { ok: false, community: null };
    await db.user.update({
      where: { id: user.id },
      data: { homeCommunity: name, extraCommunities: cleanCommunities(user.extraCommunities, name) },
    });
  }
  await writeCommunityCookie(name);
  return { ok: true, community: name };
}

/** Switches between the chosen community and the whole county without forgetting the choice. */
export async function setScopeAction(scope: "community" | "all") {
  const jar = await cookies();
  if (scope === "all") jar.set(SCOPE_COOKIE, ALL_COUNTY, cookieOpts);
  else jar.delete(SCOPE_COOKIE);
}

/** "Not now" on the community prompt: never shown again on this device. */
export async function dismissCommunityPromptAction() {
  (await cookies()).set(PROMPT_DISMISSED_COOKIE, "1", cookieOpts);
}

const prefsSchema = z.object({
  community: communityValue,
  extra: z.array(z.string().max(60)).max(30),
  interests: z.array(z.string().max(40)).max(30),
});

/** Members: saves community, additional communities and interests to the account. */
export async function saveMemberPrefsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in to save preferences to your account." };
  if (!rateLimit(`my-prefs:${user.id}`, 20, 60_000).ok) return { error: "Too many changes. Please wait a moment and try again." };
  const parsed = prefsSchema.safeParse({ community: fd.get("community") ?? ALL_COUNTY, extra: fd.getAll("extra"), interests: fd.getAll("interests") });
  if (!parsed.success) return { error: "Please choose from the listed communities and interests." };
  const home = parsed.data.community === ALL_COUNTY ? null : communityName(parsed.data.community);
  await db.user.update({
    where: { id: user.id },
    data: { homeCommunity: home, extraCommunities: cleanCommunities(parsed.data.extra, home), interestKeys: cleanInterests(parsed.data.interests) },
  });
  await writeCommunityCookie(home);
  return { ok: true, message: "Preferences saved to your account." };
}
