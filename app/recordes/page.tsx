import { RecordsPage } from "@/components/records-page";
import { loadRecordsRankings } from "@/lib/records-ranking-server";

export const dynamic = "force-dynamic";

export default async function RecordsHomePage() {
  return <RecordsPage contests={await loadRecordsRankings()} />;
}
