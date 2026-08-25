import { notFound } from "next/navigation";
import { LeagueRankingPage } from "@/components/league-ranking-page";
import { loadLeagueRanking } from "@/lib/league-ranking-server";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export default async function LeaguePage({ params }: Props) {
  const data = await loadLeagueRanking((await params).slug);
  if (!data) notFound();
  return <LeagueRankingPage initial={data} />;
}
