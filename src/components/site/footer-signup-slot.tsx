"use client";
import { usePathname } from "next/navigation";
import { SUBSCRIBE_PATH } from "@/lib/newsletter/copy";

/** Footer newsletter signup wrapper: hidden on /subscribe/, which is itself the (single-field) signup. */
export function FooterSignupSlot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === SUBSCRIBE_PATH || pathname === SUBSCRIBE_PATH.replace(/\/$/, "")) return null;
  return <>{children}</>;
}
