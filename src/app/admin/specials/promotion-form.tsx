import { ActionForm, DirtyIndicator, Submit } from "@/components/admin/action-form";
import { Card } from "@/components/admin/page-header";
import { Checkbox, FormGrid, SelectField, TextArea, TextField } from "@/components/admin/form-field";
import { MediaField } from "@/components/admin/media-picker";
import { SearchSelect } from "@/components/admin/search-select";
import { toDateInput } from "@/lib/utils";
import type { Promotion } from "@/generated/prisma/client";
import { savePromotion } from "./actions";

export function PromotionForm({ p, business }: { p: Promotion | null; business?: { id: string; label: string; sub?: string | null } | null }) {
  return (
    <ActionForm action={savePromotion} warnUnsaved className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="min-w-0 space-y-6">
        <Card title="Special">
          <div className="space-y-4">
            <SearchSelect name="business" type="business" multiple={false} label="Business *" initial={business ? [business] : []} placeholder="Search businesses…" />
            <TextField name="title" label="Title" required defaultValue={p?.title} maxLength={200} placeholder="20% off all pies this weekend" />
            <TextField name="slug" label="Slug" defaultValue={p?.slug} help={p ? `Public URL: /specials/${p.slug}/` : "Leave blank to generate from the title."} />
            <TextArea name="description" label="Description" defaultValue={p?.description ?? ""} rows={4} maxLength={5000} />
            <TextArea name="terms" label="Terms & conditions" defaultValue={p?.terms ?? ""} rows={2} maxLength={3000} placeholder="One per customer. Not valid with other offers." />
          </div>
        </Card>
        <Card title="Dates & redemption" description="Eastern Time. Specials appear only between these dates and expire automatically.">
          <FormGrid>
            <TextField name="startsAt" type="datetime-local" label="Starts" defaultValue={toDateInput(p?.startsAt ?? new Date())} />
            <TextField name="endsAt" type="datetime-local" label="Ends" defaultValue={toDateInput(p?.endsAt)} help="Leave blank for no end date." />
            <TextField name="couponCode" label="Coupon code" defaultValue={p?.couponCode ?? ""} maxLength={60} />
            <TextField name="redemptionLimit" type="number" min={1} label="Redemption limit" defaultValue={p?.redemptionLimit ?? ""} help="Optional cap on member redemptions." />
          </FormGrid>
        </Card>
      </div>
      <aside className="min-w-0 space-y-6 lg:sticky lg:top-20 lg:self-start">
        <Card title="Publishing">
          <div className="space-y-2">
            <SelectField name="status" label="Status" defaultValue={p?.status ?? "APPROVED"} options={[
              { value: "APPROVED", label: "Approved (live during dates)" }, { value: "PENDING", label: "Pending approval" }, { value: "DRAFT", label: "Draft" },
              { value: "UNPUBLISHED", label: "Unpublished" }, { value: "REJECTED", label: "Rejected" },
            ]} />
            <Checkbox name="isFeatured" label="Featured" defaultChecked={p?.isFeatured} />
            <Checkbox name="isSponsored" label="Sponsored (paid placement)" defaultChecked={p?.isSponsored} help="Always shown with a “Sponsored” label." />
          </div>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <Submit className="btn-primary w-full" pendingText="Saving…">{p ? "Save special" : "Create special"}</Submit>
            <div className="mt-2 text-center"><DirtyIndicator /></div>
          </div>
        </Card>
        <Card title="Image"><MediaField name="imageUrl" defaultValue={p?.imageUrl} aspect="aspect-square" /></Card>
      </aside>
    </ActionForm>
  );
}
