import Link from "next/link";
import { formatDateTime } from "@/lib/utils";
import { UNUSUAL, type UnusualActivity } from "@/lib/recommendations";
import { Card } from "@/components/admin/page-header";

/** Staff-only recommendation signals (admin list + business detail). */
export function UnusualActivityPanel({ data, showBusiness = true }: { data: UnusualActivity; showBusiness?: boolean }) {
  const total = data.newAccounts.length + data.ipClusters.length + data.bursts.length + data.heavyUsers.length;
  return (
    <Card title="Unusual activity" description={`Signals for review over the last ${UNUSUAL.lookbackDays} days — not proof of abuse. Nothing is removed automatically.`}>
      {total === 0 ? (
        <p className="text-sm text-slate-500" data-testid="unusual-none">Nothing unusual right now.</p>
      ) : (
        <div className="space-y-5 text-sm" data-testid="unusual-activity">
          {data.bursts.length > 0 && (
            <div data-testid="unusual-bursts">
              <h3 className="font-semibold text-slate-900">Bursts (≥{UNUSUAL.burstPerBusiness24h} for one business within 24 hours)</h3>
              <ul className="mt-1 space-y-1">
                {data.bursts.map((r) => <li key={r.businessId}><Link href={`/admin/recommendations/${r.businessId}/`} className="font-medium text-brand-700 hover:underline">{showBusiness ? r.businessName : "This listing"}</Link>: {r.n} starting {formatDateTime(r.windowStart)}</li>)}
              </ul>
            </div>
          )}
          {data.ipClusters.length > 0 && (
            <div data-testid="unusual-ip">
              <h3 className="font-semibold text-slate-900">Same network (≥{UNUSUAL.sameIpPerBusiness} from one IP hash for one business)</h3>
              <ul className="mt-1 space-y-1">
                {data.ipClusters.map((r) => <li key={`${r.businessId}:${r.ipHash}`}><Link href={`/admin/recommendations/${r.businessId}/#ip-${r.ipHash.slice(0, 10)}`} className="font-medium text-brand-700 hover:underline">{showBusiness ? r.businessName : "This listing"}</Link>: {r.n} from <code className="rounded bg-slate-100 px-1">{r.ipHash.slice(0, 10)}</code> ({formatDateTime(r.first)} – {formatDateTime(r.last)})</li>)}
              </ul>
            </div>
          )}
          {data.newAccounts.length > 0 && (
            <div data-testid="unusual-new-accounts">
              <h3 className="font-semibold text-slate-900">New accounts (created &lt; 48 hours before recommending)</h3>
              <ul className="mt-1 space-y-1">
                {data.newAccounts.slice(0, 25).map((r) => <li key={r.id}><span className="break-all">{r.userName || r.email}</span> → <Link href={`/admin/recommendations/${r.businessId}/`} className="font-medium text-brand-700 hover:underline">{r.businessName}</Link> <span className="text-slate-500">(account {formatDateTime(r.userCreatedAt)}, recommended {formatDateTime(r.createdAt)})</span></li>)}
              </ul>
            </div>
          )}
          {data.heavyUsers.length > 0 && (
            <div data-testid="unusual-heavy-users">
              <h3 className="font-semibold text-slate-900">Accounts recommending more than {UNUSUAL.perUser24h} businesses in a day</h3>
              <ul className="mt-1 space-y-1">
                {data.heavyUsers.map((r) => <li key={r.userId}><Link href={`/admin/users/${r.userId}/`} className="break-all font-medium text-brand-700 hover:underline">{r.userName || r.email}</Link>: {r.n} starting {formatDateTime(r.windowStart)}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
