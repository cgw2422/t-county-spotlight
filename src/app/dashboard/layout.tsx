import type { Metadata } from "next";

export const metadata: Metadata = { title: { default: "Business dashboard", template: "%s · Business dashboard" }, robots: { index: false, follow: false } };

export default function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
