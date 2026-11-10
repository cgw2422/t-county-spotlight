"use client";
import { useActionState, useState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveItemAction, saveSectionAction } from "@/app/dashboard/[businessId]/services/actions";

type Section = { id?: string; kind: "SERVICES" | "MENU"; title: string; description: string };
type Item = { id?: string; name: string; description: string; price: string };

/** Create or edit a services/menu section. New-section forms clear themselves after saving. */
export function SectionForm({ businessId, section, onDone }: { businessId: string; section?: Section; onDone?: () => void }) {
  const [round, setRound] = useState(0);
  const [state, action] = useActionState(async (prev: Parameters<typeof saveSectionAction>[0], fd: FormData) => {
    const r = await saveSectionAction(prev, fd);
    if (r?.ok) { if (!section?.id) setRound((n) => n + 1); onDone?.(); }
    return r;
  }, null);
  const id = section?.id ?? "new";
  return (
    <form action={action} className="space-y-3" key={round}>
      <input type="hidden" name="businessId" value={businessId} />
      {section?.id && <input type="hidden" name="sectionId" value={section.id} />}
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <div>
          <label htmlFor={`kind-${id}`} className="label">Type</label>
          <select id={`kind-${id}`} name="kind" defaultValue={section?.kind ?? "SERVICES"} className="input">
            <option value="SERVICES">Services</option>
            <option value="MENU">Menu</option>
          </select>
        </div>
        <div>
          <label htmlFor={`title-${id}`} className="label">Section title</label>
          <input id={`title-${id}`} name="title" defaultValue={section?.title ?? ""} required maxLength={120} className="input" placeholder="e.g. Brake repair, Breakfast, Haircuts" />
        </div>
      </div>
      <div>
        <label htmlFor={`desc-${id}`} className="label">Short description <span className="font-normal text-slate-400">(optional)</span></label>
        <textarea id={`desc-${id}`} name="description" defaultValue={section?.description ?? ""} maxLength={500} rows={2} className="input" />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SubmitButton className="btn-primary btn-sm" pendingText="Saving…">{section?.id ? "Save section" : "Add section"}</SubmitButton>
        <div className="flex-1"><FormMessage state={state} /></div>
      </div>
    </form>
  );
}

/** Create or edit one item (name, optional description and price text). */
export function ItemForm({ businessId, sectionId, item, onDone }: { businessId: string; sectionId: string; item?: Item; onDone?: () => void }) {
  const [round, setRound] = useState(0);
  const [state, action] = useActionState(async (prev: Parameters<typeof saveItemAction>[0], fd: FormData) => {
    const r = await saveItemAction(prev, fd);
    if (r?.ok) { if (!item?.id) setRound((n) => n + 1); onDone?.(); }
    return r;
  }, null);
  const id = item?.id ?? `new-${sectionId}`;
  return (
    <form action={action} className="space-y-3" key={round}>
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="sectionId" value={sectionId} />
      {item?.id && <input type="hidden" name="itemId" value={item.id} />}
      <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
        <div>
          <label htmlFor={`name-${id}`} className="label">Name</label>
          <input id={`name-${id}`} name="name" defaultValue={item?.name ?? ""} required maxLength={120} className="input" placeholder="e.g. Oil change, Pancake stack" />
        </div>
        <div>
          <label htmlFor={`price-${id}`} className="label">Price <span className="font-normal text-slate-400">(optional)</span></label>
          <input id={`price-${id}`} name="price" defaultValue={item?.price ?? ""} maxLength={40} className="input" placeholder="$12, from $40" />
        </div>
      </div>
      <div>
        <label htmlFor={`idesc-${id}`} className="label">Description <span className="font-normal text-slate-400">(optional)</span></label>
        <input id={`idesc-${id}`} name="description" defaultValue={item?.description ?? ""} maxLength={300} className="input" />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SubmitButton className="btn-secondary btn-sm" pendingText="Saving…">{item?.id ? "Save item" : "Add item"}</SubmitButton>
        <div className="flex-1"><FormMessage state={state} /></div>
      </div>
    </form>
  );
}
