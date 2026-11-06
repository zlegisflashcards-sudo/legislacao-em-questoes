import { DoctrineStudyPageClient } from "@/components/doctrine-study-page-client";
export const dynamic = "force-dynamic";
export default async function DoctrinePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ questao?: string; ordem?: string }> }) {
  const { slug } = await params; const { questao, ordem } = await searchParams;
  return <DoctrineStudyPageClient slug={slug} questao={questao} ordem={ordem} />;
}
