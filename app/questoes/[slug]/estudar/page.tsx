import { LegisQuestoesStudyClient } from "@/components/legis-questoes-study-client";

type StudyPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function StudyPage({
  params,
}: StudyPageProps) {
  const { slug } = await params;

  return <LegisQuestoesStudyClient slug={slug} />;
}