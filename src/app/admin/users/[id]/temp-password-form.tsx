"use client";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import type { ActionState } from "@/components/ui/form-message";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { Checkbox } from "@/components/admin/form-field";
import { TempPasswordFields } from "@/components/admin/temp-password-fields";
import { setTemporaryPassword } from "../actions";

/** Admin: set a temporary password for another user. Fields are cleared after success. */
export function TempPasswordForm({ userId }: { userId: string }) {
  const [gen, setGen] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  function onResult(r: ActionState) {
    setErrors(r?.fieldErrors ?? {});
    if (r && !r.error) setGen((g) => g + 1); // remount: the password is gone from the page
  }
  return (
    <ActionForm action={setTemporaryPassword} onResult={onResult} className="space-y-3" key={gen}>
      <input type="hidden" name="id" value={userId} />
      <TempPasswordFields errors={{ password: errors.tempPassword, confirm: errors.tempConfirm }} />
      <Checkbox checked disabled readOnly label="Require password change on next sign-in" help="Always on. They're also signed out of every device now." />
      <Submit pendingText="Setting…"><KeyRound className="h-4 w-4" aria-hidden /> Set temporary password</Submit>
    </ActionForm>
  );
}
