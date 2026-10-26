import type { Metadata } from "next";
import { Toaster } from "@/components/admin/toast";

export const metadata: Metadata = {
  title: { default: "Organization dashboard", template: "%s · T-County Gives" },
  robots: { index: false, follow: false },
};

export default function OrganizationRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
