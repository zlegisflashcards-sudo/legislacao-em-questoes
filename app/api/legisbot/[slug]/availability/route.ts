import { getContinuousReadingModel } from "@/lib/legisbot/continuous-reading-server";
import { createPublicAvailabilityResolver } from "@/lib/legisbot/public-availability";
import { publicAvailabilityResponse } from "@/lib/legisbot/public-availability-route";

export const dynamic = "force-dynamic";

const availabilityForLaw = createPublicAvailabilityResolver(getContinuousReadingModel);

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return publicAvailabilityResponse((await params).slug, availabilityForLaw);
}
