import "server-only";

/** A certificate is necessary but never sufficient to start a pilot. */
export function scopedReadingPilotEnabled(slug: string, recorteId: string | null) {
  if (!recorteId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(recorteId)) return false;
  const key = `${slug.toLowerCase()}:${recorteId.toLowerCase()}`;
  return (process.env.SCOPED_READING_PILOTS ?? "").split(",").some((item) => item.trim().toLowerCase() === key);
}
