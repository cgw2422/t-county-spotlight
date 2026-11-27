import { CATEGORY_LABEL, CATEGORIES, DOC_TYPE_LABEL, DOC_TYPES, GOV_TYPE_LABEL, GOV_TYPES, PRIORITIES, PRIORITY_LABEL } from "@/lib/gov-watch/shared";

/** Filters (plain GET form: works without JavaScript; every filter is in the URL). */
export function GovFilters({ action, values, communities, show = ["community", "govType", "docType", "priority", "category", "from", "to"], hidden = {} }: {
  action: string; values: Record<string, string>; communities: string[]; show?: string[]; hidden?: Record<string, string>;
}) {
  const sel = (name: string, label: string, opts: { value: string; label: string }[]) => show.includes(name) && (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <select name={name} defaultValue={values[name] ?? ""} className="input">
        <option value="">All</option>
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
  return (
    <form action={action} method="get" className="card mb-4 grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8" data-testid="gov-filters">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="col-span-2 block min-w-0 sm:col-span-3 lg:col-span-4 xl:col-span-2">
        <span className="mb-1 block text-xs font-medium text-slate-600">Search</span>
        <input name="q" defaultValue={values.q ?? ""} placeholder="Words in the story or document" className="input" />
      </label>
      {sel("community", "Community", communities.map((c) => ({ value: c, label: c })))}
      {sel("govType", "Government type", GOV_TYPES.map((t) => ({ value: t, label: GOV_TYPE_LABEL[t] })))}
      {sel("docType", "Document type", DOC_TYPES.map((t) => ({ value: t, label: DOC_TYPE_LABEL[t] })))}
      {sel("priority", "Newsworthiness", PRIORITIES.map((t) => ({ value: t, label: PRIORITY_LABEL[t] })))}
      {sel("category", "Topic", CATEGORIES.map((t) => ({ value: t, label: CATEGORY_LABEL[t] })))}
      {show.includes("from") && (
        <label className="block min-w-0"><span className="mb-1 block text-xs font-medium text-slate-600">Meeting from</span><input type="date" name="from" defaultValue={values.from ?? ""} className="input" /></label>
      )}
      {show.includes("to") && (
        <label className="block min-w-0"><span className="mb-1 block text-xs font-medium text-slate-600">Meeting to</span><input type="date" name="to" defaultValue={values.to ?? ""} className="input" /></label>
      )}
      <div className="col-span-2 flex items-end gap-2 sm:col-span-3 lg:col-span-4 xl:col-span-8">
        <button className="btn-primary btn-sm">Apply filters</button>
        <a href={action + (hidden.status ? `?status=${hidden.status}` : "")} className="btn-ghost btn-sm">Clear</a>
      </div>
    </form>
  );
}
