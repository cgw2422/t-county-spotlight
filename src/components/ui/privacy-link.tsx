import Link from "next/link";
import { cn } from "@/lib/utils";

export const PRIVACY_POLICY_PATH = "/privacy/";

/** Small "Privacy Policy" link used next to account, newsletter and listing forms. */
export function PrivacyPolicyLink({ className, hash, children = "Privacy Policy" }: { className?: string; hash?: string; children?: React.ReactNode }) {
  return (
    <Link href={`${PRIVACY_POLICY_PATH}${hash ? `#${hash}` : ""}`} className={cn("underline underline-offset-2", className)} data-testid="privacy-policy-link">
      {children}
    </Link>
  );
}
