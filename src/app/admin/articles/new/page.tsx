import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { ArticleForm } from "../article-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New article" };

export default async function NewArticlePage() {
  await requireStaff();
  const [categories, tags] = await Promise.all([
    db.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.tag.findMany({ orderBy: { name: "asc" }, select: { name: true }, take: 500 }),
  ]);
  return (
    <>
      <PageHeader title="New article" back={{ href: "/admin/articles/", label: "Articles" }} />
      <ArticleForm article={null} categories={categories} tagSuggestions={tags.map((t) => t.name)} />
    </>
  );
}
