import { notFound } from "next/navigation";
import { LeagueRankingPage } from "@/components/league-ranking-page";
import { loadLeagueRanking } from "@/lib/league-ranking-server";

export const dynamic = "force-dynamic";

export default async function PmmaRecordsPage() {
  const data = await loadLeagueRanking("pmma");
  if (!data) notFound();
  return <LeagueRankingPage initial={data} records />;
}
