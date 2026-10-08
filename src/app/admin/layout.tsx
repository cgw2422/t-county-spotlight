import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { AdminShell } from "@/components/admin/shell";
import { Toaster } from "@/components/admin/toast";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const [settings, applications, events, specials, updates, articles, jobs] = await Promise.all([
    getSettings(),
    db.businessApplication.count({ where: { status: "PENDING" } }),
    db.event.count({ where: { status: "PENDING", deletedAt: null } }),
    db.promotion.count({ where: { status: "PENDING", deletedAt: null } }),
    db.businessUpdate.count({ where: { status: "PENDING" } }),
    db.article.count({ where: { status: "PENDING", deletedAt: null } }),
    db.job.count({ where: { status: "PENDING", deletedAt: null } }),
  ]);
  return (
    <AdminShell
      user={{ name: user.name, email: user.email, role: user.role }}
      isAdmin={user.role === "ADMIN"}
      siteName={settings.siteName}
      logoUrl={settings.logoDarkUrl || settings.logoUrl || null}
      logoOnDark={!!settings.logoDarkUrl}
      counts={{ applications, events, specials, updates, articles, jobs }}
    >
      {children}
      <Toaster />
    </AdminShell>
  );
}
