import type { PublicInteractiveLawAvailability } from "./public-availability";

export async function publicAvailabilityResponse(slug: string, resolve: (slug: string) => Promise<PublicInteractiveLawAvailability | null>) {
  try {
    const availability = await resolve(slug);
    if (!availability) return Response.json({ status: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return Response.json(availability, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "technical_error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
