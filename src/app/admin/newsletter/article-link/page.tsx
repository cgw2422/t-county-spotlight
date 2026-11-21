import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Link2, Search } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";
import { checkArticleLink, type LinkCheck, type PostSummary } from "@/lib/beehiiv/article-link";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { CopyLink } from "./copy-link";
import { bringInNowAction, holdArticleUrlAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Article link" };

const TIMING: Record<PostSummary["timing"], string> = { draft: "Draft", scheduled: "Scheduled", published: "Published", archived: "Archived" };
const ROUTE: Record<PostSummary["route"], string> = { article: "Article (public web post)", issue: "Newsletter archive", email_only: "Email only", premium: "Premium only" };

function PostFacts({ post }: { post: PostSummary }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2" data-testid="post-facts">
      <div><dt className="text-xs text-slate-500">beehiiv post</dt><dd className="font-semibold text-navy-900">{post.title}</dd></div>
      <div><dt className="text-xs text-slate-500">beehiiv slug</dt><dd className="font-mono text-xs">{post.slug || "—"}</dd></div>
      <div><dt className="text-xs text-slate-500">Status in beehiiv</dt><dd data-testid="post-timing">{TIMING[post.timing]}{post.publishAt && post.timing !== "draft" ? ` · ${post.timing === "scheduled" ? "sends" : "sent"} ${formatDateTime(post.publishAt)}` : ""}</dd></div>
      <div><dt className="text-xs text-slate-500">Goes to</dt><dd>{ROUTE[post.route]}</dd></div>
    </dl>
  );
}

function HiddenFields({ postId, slug }: { postId: string; slug: string }) {
  return <><input type="hidden" name="postId" value={postId} /><input type="hidden" name="slug" value={slug} /></>;
}

function Result({ r, input }: { r: LinkCheck; input: string }) {
  switch (r.kind) {
    case "not_configured":
      return <Notice tone="warn" title="beehiiv isn't connected">Set BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID on the server to look up posts.</Notice>;
    case "invalid":
      return <Notice tone="warn" title="Check the slug">{r.message}</Notice>;
    case "error":
      return <Notice tone="danger" title="Couldn't check beehiiv">{r.message} Nothing was changed.</Notice>;
    case "not_found":
      return <Notice tone="warn" title="No beehiiv post with that slug">Check the slug in beehiiv (Post settings → URL). The lookup includes drafts and scheduled posts.</Notice>;
    case "not_article":
      return (
        <Card title="No article URL for this post"><PostFacts post={r.post} /><div className="mt-4"><Notice tone="warn">{r.message}</Notice></div></Card>
      );
    case "conflict":
      return (
        <Card title="URL already in use">
          <PostFacts post={r.post} />
          <div className="mt-4" data-testid="link-conflict">
            <Notice tone="danger" title="Don't use this URL yet">
              {r.message}{" "}
              <Link href={r.conflict.adminHref} className="font-semibold underline">Open the other article</Link>
              {r.conflict.beehiivPostId ? " (it's linked to a different beehiiv post)." : "."}
            </Notice>
          </div>
        </Card>
      );
    case "blocked":
      return (
        <Card title="Article deleted"><PostFacts post={r.post} /><div className="mt-4"><Notice tone="danger">{r.message} <Link href={r.article.adminHref} className="font-semibold underline">Open the article</Link></Notice></div></Card>
      );
    case "available":
      return (
        <Card title="This URL is free — hold it to get a link">
          <PostFacts post={r.post} />
          {r.slugNote && <p className="mt-3 text-sm text-amber-800">{r.slugNote}</p>}
          <p className="mt-4 text-sm text-slate-600">The article will use:</p>
          <p className="mt-1 break-all font-mono text-sm font-semibold text-navy-900" data-testid="article-link-preview">{r.url}</p>
          <p className="mt-3 text-sm text-slate-600">
            {r.post.timing === "draft"
              ? "Holding links a hidden article to this beehiiv post at this exact URL, so nothing else can take it. The content comes in once you schedule the post in beehiiv."
              : "Holding imports this post now. The article stays hidden until beehiiv's send time, then goes live automatically."}
            {" "}You get the Copy Link button once the URL is held.
          </p>
          <form action={holdArticleUrlAction} className="mt-4">
            <HiddenFields postId={r.post.id} slug={input} />
            <SubmitButton className="btn-primary" pendingText="Holding…" data-testid="hold-url"><Link2 className="h-4 w-4" aria-hidden /> Hold this URL</SubmitButton>
          </form>
        </Card>
      );
    case "linked": {
      const tone = r.state === "live" || r.state === "ready" ? "success" : r.state === "held" ? "info" : "warn";
      const Icon = r.state === "live" || r.state === "ready" ? CheckCircle2 : r.state === "held" ? Clock : AlertTriangle;
      const canBringIn = r.post.timing === "scheduled" || r.post.timing === "published";
      return (
        <Card title="T County Connect article URL">
          <PostFacts post={r.post} />
          <div className="mt-5"><CopyLink url={r.article.url} /></div>
          <p className="mt-3 flex items-start gap-2 text-sm" data-testid={`link-state-${r.state}`}>
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone === "success" ? "text-emerald-600" : tone === "info" ? "text-brand-600" : "text-amber-600"}`} aria-hidden />
            <span>{r.message}</span>
          </p>
          {r.slugNote && <p className="mt-2 text-sm text-amber-800" data-testid="slug-note">{r.slugNote}</p>}
          <p className="mt-2 text-xs text-slate-500">
            Article: {r.article.status.toLowerCase()}{r.article.publishedAt ? ` · go-live ${formatDateTime(r.article.publishedAt)}` : ""}.{" "}
            <Link href={r.article.adminHref} className="font-semibold text-brand-700 hover:underline">Open in Admin → Articles</Link>
            {r.state === "live" && <> · <a href={r.article.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">View <ExternalLink className="h-3 w-3" aria-hidden /></a></>}
          </p>
          {canBringIn && r.state !== "live" && r.state !== "ready" && !r.article.locallyEdited && (
            <form action={bringInNowAction} className="mt-4">
              <HiddenFields postId={r.post.id} slug={input} />
              <SubmitButton className="btn-secondary" pendingText="Bringing in…" data-testid="bring-in-now">Bring in now</SubmitButton>
            </form>
          )}
        </Card>
      );
    }
  }
}

export default async function ArticleLinkPage({ searchParams }: { searchParams: Promise<{ slug?: string; done?: string; error?: string }> }) {
  await requireAdmin();
  const { slug = "", done, error } = await searchParams;
  const input = slug.slice(0, 500);
  const result = input ? await checkArticleLink(input) : null;
  return (
    <>
      <PageHeader
        title="Article link"
        description="Find the T County Connect article URL for a beehiiv post before you send it, for beehiiv's Custom Read Online URL. The lookup includes drafts and scheduled posts. A link is shown only once an article on this site is linked to the post, so it's the real address, not a guess. Later syncs update that same article."
      />
      <Card className="mb-6">
        <form method="get" className="flex flex-col gap-2 sm:flex-row" role="search">
          <label htmlFor="slug" className="sr-only">beehiiv post slug</label>
          <input id="slug" name="slug" defaultValue={input} required maxLength={500} className="input min-w-0 flex-1 font-mono text-sm" placeholder="meet-colt-liggett-the-man-behind-c3-excavation" autoComplete="off" data-testid="slug-input" />
          <button className="btn-secondary shrink-0" data-testid="check-slug"><Search className="h-4 w-4" aria-hidden /> Check</button>
        </form>
        <p className="mt-2 text-xs text-slate-500">Paste the slug or the post&apos;s beehiiv URL.</p>
      </Card>
      {done && <div className="mb-4"><Notice tone="success">{done === "held" ? "URL held for this post." : "Imported from beehiiv."}</Notice></div>}
      {error && <div className="mb-4" data-testid="action-error"><Notice tone="danger">{error}</Notice></div>}
      {result && <Result r={result} input={input} />}
    </>
  );
}
