import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export default async function LeaguePage({ params }: Props) {
  const { slug } = await params;
  if (slug === "pmma") redirect("/recordes/pmma");
  notFound();
}
