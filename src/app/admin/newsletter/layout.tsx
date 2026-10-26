import { requireAdmin } from "@/lib/auth";
import { NewsletterNav } from "./nav";

export const dynamic = "force-dynamic";

/** Newsletter admin is ADMIN-only (editors are redirected). Each page and action also checks. */
export default async function NewsletterAdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <NewsletterNav />
      {children}
    </>
  );
}
