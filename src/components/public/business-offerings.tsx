type Item = { id: string; name: string; description: string | null; price: string | null };
type Section = { id: string; kind: "SERVICES" | "MENU"; title: string; description: string | null; items: Item[] };

/** Public "Services" / "Menu" blocks on a business profile (Premium feature; caller decides visibility). */
export function BusinessOfferings({ sections }: { sections: Section[] }) {
  const groups = (["SERVICES", "MENU"] as const)
    .map((kind) => ({ kind, sections: sections.filter((s) => s.kind === kind && (s.items.length > 0 || s.description)) }))
    .filter((g) => g.sections.length > 0);
  return (
    <>
      {groups.map((g) => {
        const heading = g.kind === "MENU" ? "Menu" : "Services";
        const id = `offerings-${g.kind.toLowerCase()}`;
        return (
          <section key={g.kind} aria-labelledby={id} data-testid={id}>
            <h2 id={id} className="section-title">{heading}</h2>
            <div className="mt-4 space-y-5">
              {g.sections.map((s) => (
                <div key={s.id} className="card p-5 sm:p-6">
                  {(g.sections.length > 1 || s.title !== heading) && <h3 className="font-display text-lg font-semibold text-navy-900">{s.title}</h3>}
                  {s.description && <p className="mt-1 text-sm text-slate-600">{s.description}</p>}
                  {s.items.length > 0 && (
                    <ul className="mt-3 divide-y divide-slate-100">
                      {s.items.map((it) => (
                        <li key={it.id} className="flex items-start gap-4 py-3 first:pt-1 last:pb-0">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-navy-900">{it.name}</p>
                            {it.description && <p className="mt-0.5 text-sm text-slate-600">{it.description}</p>}
                          </div>
                          {it.price && <p className="shrink-0 text-right font-semibold tabular-nums text-navy-900">{it.price}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
