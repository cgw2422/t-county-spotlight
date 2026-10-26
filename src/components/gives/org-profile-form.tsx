"use client";
import { ActionForm, DirtyIndicator, Submit, type FormAction } from "@/components/admin/action-form";
import { Checkbox, FormGrid, TextArea, TextField } from "@/components/admin/form-field";
import { CitySelect } from "@/components/admin/city-select";
import { TokenInput } from "@/components/admin/token-input";
import { htmlToText } from "@/components/dashboard/text";
import { KIND_LABEL, ORG_KINDS, SERVICE_DAYS, SERVICE_DAY_NAMES, SOCIAL_KEYS, readLeaders, readServiceTimes } from "@/lib/gives/constants";
import { OrgImageUpload } from "./org-image-upload";
import { RowsEditor } from "./rows-editor";

export type OrgFormValues = {
  id: string; name: string; kind: string; orgType: string | null; tagline: string | null; mission: string | null; description: string | null;
  impact: string | null; logoUrl: string | null; coverUrl: string | null; email: string | null; emailPublic: boolean; phone: string | null;
  website: string | null; socials: unknown; address: string | null; city: string | null; zip: string | null; serviceArea: string | null;
  donationUrl: string | null; wishlistUrl: string | null; ein: string | null; denomination: string | null; leadership: unknown;
  serviceTimes: unknown; ministries: string[]; livestreamUrl: string | null; accessibility: string | null; planYourVisit: string | null;
};

function Section({ title, description, children, id }: { title: string; description?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="card scroll-mt-24 p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-navy-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

export const ORG_TYPE_SUGGESTIONS = [
  "Food pantry", "Animal rescue", "Youth program", "Senior services", "Health & wellness", "Housing & shelter", "Education & literacy",
  "Arts & culture", "Veterans", "Environment", "Disaster relief", "Recovery & addiction support", "Family services", "Historical society",
  "Civic & service club", "Sports & recreation",
];

export function OrgProfileForm({ org, action, allowKind, extra, submitLabel = "Save profile" }: {
  org: OrgFormValues; action: FormAction; allowKind?: boolean; extra?: React.ReactNode; submitLabel?: string;
}) {
  const socials = (org.socials ?? {}) as Record<string, string>;
  const church = org.kind === "CHURCH";
  const times = readServiceTimes(org.serviceTimes);
  const leaders = readLeaders(org.leadership);
  return (
    <ActionForm action={action} warnUnsaved className="space-y-6">
      <input type="hidden" name="orgId" value={org.id} />
      <Section title="The basics">
        <TextField name="name" label="Organization name" required defaultValue={org.name} maxLength={160} />
        <FormGrid>
          {allowKind ? (
            <div>
              <label htmlFor="f-kind" className="label">Kind</label>
              <select id="f-kind" name="kind" className="input" defaultValue={org.kind}>
                {ORG_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
              <p className="help">Save to show or hide the church sections.</p>
            </div>
          ) : (
            <div>
              <span className="label">Kind</span>
              <p className="flex min-h-11 items-center rounded-lg bg-slate-50 px-3 text-sm text-slate-700">{KIND_LABEL[org.kind]}</p>
            </div>
          )}
          <div>
            <TextField name="orgType" label="Type or cause" defaultValue={org.orgType ?? ""} maxLength={80} list="org-type-suggestions" placeholder={church ? "e.g. Congregation" : "e.g. Food pantry"} help="Helps people browse by cause." />
            <datalist id="org-type-suggestions">{ORG_TYPE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
        </FormGrid>
        <TextField name="tagline" label="Short tagline" defaultValue={org.tagline ?? ""} maxLength={160} placeholder="One sentence about what you do" />
        <TextArea name="mission" label="Mission statement" defaultValue={org.mission ?? ""} maxLength={1000} rows={3} />
        <TextArea name="description" label="About your organization" defaultValue={htmlToText(org.description)} maxLength={8000} rows={7} help="Plain text is fine. Leave a blank line between paragraphs." />
        <TextArea name="impact" label="Community impact" defaultValue={htmlToText(org.impact)} maxLength={4000} rows={4} help="Who you serve and what difference it makes. Only share real numbers you can stand behind." />
      </Section>

      <Section title="Logo & cover photo">
        <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
          <OrgImageUpload name="logoUrl" orgId={org.id} defaultValue={org.logoUrl} label="Logo" aspect="aspect-square" />
          <OrgImageUpload name="coverUrl" orgId={org.id} defaultValue={org.coverUrl} label="Cover photo" aspect="aspect-[16/9]" help="A wide photo works best (at least 1600 pixels across)." />
        </div>
      </Section>

      <Section title="Giving" description="Donations go directly to you through your own donation page — T-County Gives never handles money and is always free.">
        <TextField name="donationUrl" label="Donation page link" defaultValue={org.donationUrl ?? ""} inputMode="url" placeholder="https://" />
        <TextField name="wishlistUrl" label="Online wish list link" defaultValue={org.wishlistUrl ?? ""} inputMode="url" placeholder="e.g. an Amazon or Target wish list" />
        <TextField name="ein" label="EIN (tax ID)" defaultValue={org.ein ?? ""} maxLength={20} placeholder="12-3456789" help="Used only to verify your organization. It is never shown publicly." />
      </Section>

      <Section title="Contact & location">
        <FormGrid>
          <TextField name="email" type="email" label="Email" defaultValue={org.email ?? ""} maxLength={254} />
          <TextField name="phone" type="tel" label="Phone" defaultValue={org.phone ?? ""} maxLength={30} />
        </FormGrid>
        <Checkbox name="emailPublic" label="Show our email on our public page" defaultChecked={org.emailPublic} />
        <TextField name="website" label="Website" defaultValue={org.website ?? ""} inputMode="url" placeholder="www.example.org" />
        <TextField name="address" label="Street address" defaultValue={org.address ?? ""} maxLength={200} />
        <FormGrid>
          <CitySelect defaultValue={org.city} />
          <TextField name="zip" label="ZIP" defaultValue={org.zip ?? ""} inputMode="numeric" maxLength={10} />
        </FormGrid>
        <TextField name="serviceArea" label="Area you serve" defaultValue={org.serviceArea ?? ""} maxLength={200} placeholder="e.g. All of Tuscarawas County" />
      </Section>

      <Section title="Social media">
        <FormGrid>
          {SOCIAL_KEYS.map((s) => <TextField key={s.key} name={`social_${s.key}`} label={s.label} defaultValue={socials[s.key] ?? ""} inputMode="url" placeholder="https://" />)}
        </FormGrid>
      </Section>

      {church && (
        <>
          <Section title="Worship services" description="Add each service. Sunday and midweek services show in a schedule on your page.">
            <RowsEditor
              name="serviceTimes"
              addLabel="Add a service"
              emptyText="No services added yet."
              defaultValue={times.map((t) => ({ day: t.day, time: t.time, label: t.label }))}
              fields={[
                { key: "day", label: "Day", type: "select", options: SERVICE_DAYS.map((d) => ({ value: d, label: SERVICE_DAY_NAMES[d] })) },
                { key: "time", label: "Time", type: "time" },
                { key: "label", label: "Service name", placeholder: "e.g. Worship, Bible study", maxLength: 80 },
              ]}
            />
            <TextField name="livestreamUrl" label="Livestream link" defaultValue={org.livestreamUrl ?? ""} inputMode="url" placeholder="YouTube or Facebook Live page" />
          </Section>
          <Section title="Church details">
            <TextField name="denomination" label="Denomination or affiliation" defaultValue={org.denomination ?? ""} maxLength={120} placeholder="e.g. United Methodist, Non-denominational" />
            <div>
              <span className="label">Pastor & leadership</span>
              <RowsEditor name="leadership" addLabel="Add a person" emptyText="No leaders added yet." defaultValue={leaders} fields={[{ key: "name", label: "Name" }, { key: "role", label: "Role", placeholder: "e.g. Lead Pastor" }]} />
            </div>
            <TokenInput name="ministries" label="Ministries" defaultValue={org.ministries} placeholder="e.g. Youth group, Food pantry — press Enter after each" />
            <TextArea name="accessibility" label="Accessibility" defaultValue={org.accessibility ?? ""} maxLength={1000} rows={3} placeholder="e.g. Wheelchair-accessible entrance, hearing loop, large-print bulletins" />
            <TextArea name="planYourVisit" label="Plan your visit" defaultValue={htmlToText(org.planYourVisit)} maxLength={4000} rows={5} help="What should a first-time visitor know? Parking, what to wear, kids' programs, how long services last." />
          </Section>
        </>
      )}

      {extra}

      <div className="sticky bottom-[calc(3.5rem+var(--safe-bottom,0px))] z-20 -mx-4 flex items-center gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 lg:bottom-0">
        <Submit pendingText="Saving…" className="btn-primary min-h-12 flex-1 text-base sm:flex-none">{submitLabel}</Submit>
        <DirtyIndicator />
      </div>
    </ActionForm>
  );
}
