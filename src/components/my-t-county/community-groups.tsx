/**
 * Renders "In {community}" items first, then "Around T County" items, each with
 * a small label. When nothing local is listed, says so honestly and shows the
 * countywide list.
 */
export function CommunityGroups<T>({ community, local, rest, render, gridClassName, nothingLocal, testId }: {
  community: string;
  local: T[];
  rest: T[];
  render: (x: T) => React.ReactNode;
  gridClassName: string;
  /** e.g. "No Dover events listed for today." */
  nothingLocal: string;
  testId?: string;
}) {
  const label = "mb-3 text-sm font-bold uppercase tracking-wide text-slate-500";
  return (
    <div className="space-y-6" data-testid={testId}>
      {local.length > 0 ? (
        <div data-testid={testId ? `${testId}-local` : undefined}>
          <h3 className={label}>In {community}</h3>
          <div className={gridClassName}>{local.map(render)}</div>
        </div>
      ) : (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{nothingLocal}</p>
      )}
      {rest.length > 0 && (
        <div data-testid={testId ? `${testId}-rest` : undefined}>
          <h3 className={label}>Around T County</h3>
          <div className={gridClassName}>{rest.map(render)}</div>
        </div>
      )}
    </div>
  );
}
