"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, passwordProblem, requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  changeListingRole, createWithTemporaryPassword, grantExistingUser, inviteByEmail, loadListing, parseAccessRole, removeListingAccess, resendInvitation,
  type GrantResult, type ListingKind,
} from "@/lib/listing-access";
import type { ActionState } from "@/components/ui/form-message";

/**
 * Listing Access server actions (admin only). Every action re-checks
 * requireAdmin() and loads the listing from the database — nothing from the
 * client is trusted. Passwords and tokens are never returned or logged.
 */

const str = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);

async function context(fd: FormData) {
  const admin = await requireAdmin();
  const kind = str(fd, "kind") as ListingKind;
  if (kind !== "business" && kind !== "organization") return { admin, listing: null };
  const listing = await loadListing({ kind, id: str(fd, "listingId", 40) });
  return { admin, listing };
}

function refresh(listing: { adminPath: string; kind: ListingKind; id: string }) {
  revalidatePath(listing.adminPath);
  if (listing.kind === "organization") revalidatePath(`/organization/${listing.id}/team/`);
  revalidatePath("/admin/users/");
}

const done = (r: GrantResult): ActionState => (r.ok ? { ok: true, message: r.message } : { error: r.error, ...(r.field ? { fieldErrors: { [r.field]: r.error } } : {}) });

const personSchema = z.object({
  firstName: z.string().trim().min(1, "Enter a first name.").max(60),
  lastName: z.string().trim().min(1, "Enter a last name.").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
});

export async function addListingAccessAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { admin, listing } = await context(fd);
  if (!listing) return { error: "Listing not found." };
  const role = parseAccessRole(listing.kind, str(fd, "role"));
  if (!role) return { error: "Choose a role.", fieldErrors: { role: "Choose a role" } };
  const mode = str(fd, "mode");
  const actor = { id: admin.id, name: admin.name, email: admin.email };

  if (mode === "existing") {
    const userId = String(fd.getAll("user")[0] ?? "").slice(0, 40);
    if (!userId) return { error: "Search for and choose an existing account.", fieldErrors: { user: "Choose an account" } };
    const target = await db.user.findUnique({ where: { id: userId } });
    if (!target) return { error: "That account no longer exists." };
    if (!target.passwordHash && !rateLimit(`invite:${admin.id}`, 30, 60 * 60_000).ok) return { error: "You've sent a lot of invitations recently. Please wait a while and try again." };
    const r = await grantExistingUser(listing, target, role, actor, { notify: fd.get("notify") === "on" });
    if (r.ok) refresh(listing);
    return done(r);
  }

  const person = personSchema.safeParse({ firstName: fd.get("firstName"), lastName: fd.get("lastName"), email: fd.get("email") });
  if (!person.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of person.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  if (mode === "invite") {
    if (!rateLimit(`invite:${admin.id}`, 30, 60 * 60_000).ok) return { error: "You've sent a lot of invitations recently. Please wait a while and try again." };
    const r = await inviteByEmail(listing, { ...person.data, role }, actor);
    if (r.ok) refresh(listing);
    return done(r);
  }

  if (mode === "temp") {
    const password = String(fd.get("tempPassword") ?? "");
    const confirm = String(fd.get("tempConfirm") ?? "");
    const problem = passwordProblem(password);
    if (problem) return { error: problem, fieldErrors: { tempPassword: problem } };
    if (password !== confirm) return { error: "The temporary passwords don't match.", fieldErrors: { tempConfirm: "Passwords don't match." } };
    if (!rateLimit(`temp-pw:${admin.id}`, 20, 60 * 60_000).ok) return { error: "Too many temporary passwords set recently. Please wait a while and try again." };
    // Option 2 is for NEW accounts only and always requires a change on first login.
    const r = await createWithTemporaryPassword(listing, { ...person.data, role, passwordHash: await hashPassword(password) }, actor);
    if (r.ok) refresh(listing);
    return done(r);
  }
  return { error: "Choose how to add this person." };
}

export async function changeListingRoleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { admin, listing } = await context(fd);
  if (!listing) return { error: "Listing not found." };
  const role = parseAccessRole(listing.kind, str(fd, "role"));
  if (!role) return { error: "Choose a role." };
  const r = await changeListingRole(listing, str(fd, "userId", 40), role, { id: admin.id, name: admin.name, email: admin.email });
  if (r.ok) refresh(listing);
  return done(r);
}

export async function resendInvitationAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { admin, listing } = await context(fd);
  if (!listing) return { error: "Listing not found." };
  const userId = str(fd, "userId", 40);
  if (!rateLimit(`invite:${admin.id}`, 30, 60 * 60_000).ok || !rateLimit(`invite-resend:${listing.id}:${userId}`, 5, 60 * 60_000).ok) {
    return { error: "This invitation was re-sent several times recently. Please wait a while before sending it again." };
  }
  const r = await resendInvitation(listing, userId, { id: admin.id, name: admin.name });
  if ("error" in r) return { error: r.error };
  refresh(listing);
  return { ok: true, message: r.message };
}

export async function removeListingAccessAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { admin, listing } = await context(fd);
  if (!listing) return { error: "Listing not found." };
  const r = await removeListingAccess(listing, str(fd, "userId", 40), { id: admin.id, name: admin.name, email: admin.email });
  if (r.ok) refresh(listing);
  return done(r);
}
