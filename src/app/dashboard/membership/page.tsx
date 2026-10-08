import { redirect } from "next/navigation";

/** Stable link used by /memberships/: routes to the right business's membership page. */
export default function MembershipShortcut() {
  redirect("/dashboard/?to=membership");
}
