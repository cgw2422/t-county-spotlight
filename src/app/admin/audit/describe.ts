type Entry = { action: string; entityType: string | null; entityId: string | null; details: unknown };

const VERBS: Record<string, string> = {
  create: "created", update: "updated", publish: "published", unpublish: "unpublished", schedule: "scheduled", submit: "submitted for review",
  trash: "moved to trash", restore: "restored", delete: "permanently deleted", approve: "approved", reject: "rejected", archive: "archived",
  suspend: "suspended", reactivate: "reactivated", feature: "featured", unfeature: "unfeatured", upload: "uploaded", role: "changed role of",
  publish_scheduled: "auto-published scheduled", plan_create: "created plan", plan_update: "updated plan", plan_delete: "deleted plan", product_create: "created product", product_update: "updated product", product_delete: "deleted product", sessions_revoke: "signed out all sessions of", grant: "granted", revoke: "revoked", password_reset: "sent password reset to",
  owner_add: "added owner to", owner_remove: "removed owner from", save: "saved", reorder: "reordered", restore_revision: "restored a revision of",
  enable_2fa: "enabled 2FA", disable_2fa: "disabled 2FA", link_business: "linked business to",
};

/** Human-readable one-line summary of an audit log entry. */
export function describeAudit(a: Entry) {
  const [scope, verb] = a.action.split(".");
  const d = (a.details ?? {}) as Record<string, unknown>;
  const name = (d.title || d.name || d.email || d.label || d.filename || d.fromPath || d.group || d.key) as string | undefined;
  const v = VERBS[verb ?? ""] ?? (verb ? verb.replace(/_/g, " ") : a.action);
  const selfContained = ["enable_2fa", "disable_2fa"].includes(verb ?? "");
  const what = selfContained ? "for" : (a.entityType || scope || "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
  return `${v.charAt(0).toUpperCase()}${v.slice(1)} ${what}${name ? ` “${String(name).slice(0, 80)}”` : ""}`.trim();
}
