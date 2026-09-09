import { RecordsPage } from "@/components/records-page";
import { loadLeagueRanking } from "@/lib/league-ranking-server";

export const dynamic = "force-dynamic";

export default async function RecordsHomePage() {
  return <RecordsPage pmma={await loadLeagueRanking("pmma")} />;
}
