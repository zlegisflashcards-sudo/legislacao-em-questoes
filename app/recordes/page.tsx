import { RecordsPage } from "@/components/records-page";
import { loadRecordsContests } from "@/lib/records-ranking-server";

export const dynamic = "force-dynamic";

export default async function RecordsHomePage() {
  return <RecordsPage contests={await loadRecordsContests()} />;
}
