import { getOwnedBusinesses, isStaff, requireBusinessAccess } from "@/lib/auth";
import { getBusinessEntitlements } from "@/lib/entitlements";
import { businessHref } from "@/lib/links";
import { DashboardShell } from "@/components/dashboard/shell";
import type { DashNavItem } from "@/components/dashboard/nav";

export const dynamic = "force-dynamic";

export default async function BusinessDashboardLayout({ children, params }: { children: React.ReactNode; params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, business } = await requireBusinessAccess(businessId);
  const [{ entitlements }, owned] = await Promise.all([getBusinessEntitlements(business.id), getOwnedBusinesses(user.id)]);
  const businesses = owned.map((b) => ({ id: b.id, name: b.name }));
  if (isStaff(user) && !businesses.some((b) => b.id === business.id)) businesses.unshift({ id: business.id, name: business.name });
  const root = `/dashboard/${business.id}/`;
  const items: DashNavItem[] = [
    { key: "overview", href: root, label: "Overview" },
    { key: "profile", href: `${root}profile/`, label: "Edit profile" },
    { key: "photos", href: `${root}photos/`, label: "Photos" },
    { key: "events", href: `${root}events/`, label: "Events", locked: !entitlements.events },
    { key: "specials", href: `${root}specials/`, label: "Specials", locked: !entitlements.promotions },
    { key: "updates", href: `${root}updates/`, label: "Updates", locked: !entitlements.updates },
    { key: "membership", href: `${root}membership/`, label: "Membership" },
    { key: "invoices", href: `${root}invoices/`, label: "Invoices" },
  ];
  return (
    <DashboardShell
      items={items} root={root} business={{ id: business.id, name: business.name, status: business.status }} businesses={businesses}
      publicHref={business.status === "PUBLISHED" ? businessHref(business) : null} userName={user.name || user.email}
    >
      {children}
    </DashboardShell>
  );
}
