import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { BottomNav } from "@/components/site/bottom-nav";
import { InstallPrompt } from "@/components/site/install-prompt";
import { GuestSavesSync } from "@/components/saved/guest-saves-sync";
import { UsageSignals } from "@/components/site/usage-signals";
import { getCurrentUser } from "@/lib/auth";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <>
      <SiteHeader />
      <main id="main" className="min-h-[60vh]">{children}</main>
      <SiteFooter />
      <InstallPrompt />
      <BottomNav />
      <GuestSavesSync userId={user?.id ?? null} />
      <UsageSignals />
    </>
  );
}
