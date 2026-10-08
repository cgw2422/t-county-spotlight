import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/auth-actions";
import { cn } from "@/lib/utils";

/** POST sign-out button; safe to drop into any server component. */
export function LogoutButton({ className, label = "Sign out", formClassName }: { className?: string; label?: string; formClassName?: string }) {
  return (
    <form action={logoutAction} className={formClassName}>
      <button type="submit" className={cn(className || "btn-secondary")}>
        <LogOut className="h-4 w-4" aria-hidden /> {label}
      </button>
    </form>
  );
}
