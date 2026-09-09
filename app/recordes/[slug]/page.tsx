import { notFound } from "next/navigation";
import { LeagueRankingPage } from "@/components/league-ranking-page";
import { loadRecordsRanking } from "@/lib/records-ranking-server";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export default async function RecordsContestPage({ params }: Props) {
  const data = await loadRecordsRanking((await params).slug);
  if (!data) notFound();
  return <LeagueRankingPage initial={data} records />;
}
