"use client";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function SubmitButton({ children, className, pendingText, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button {...rest} type="submit" disabled={pending || rest.disabled} className={cn(className || "btn-primary")}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
