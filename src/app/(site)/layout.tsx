import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { BottomNav } from "@/components/site/bottom-nav";
import { InstallPrompt } from "@/components/site/install-prompt";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="min-h-[60vh]">{children}</main>
      <SiteFooter />
      <InstallPrompt />
      <BottomNav />
    </>
  );
}
