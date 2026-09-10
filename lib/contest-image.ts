export type ContestImageSource = {
  productImage?: string | null;
  leagueImage?: string | null;
};

function validImageUrl(value: string | null | undefined) {
  const url = value?.trim() ?? "";
  return url && (url.startsWith("/") || /^https?:\/\//i.test(url)) ? url : null;
}

/** Resolução legada da Liga: produto, Liga, depois monograma do componente. */
export function resolveContestImage({ productImage, leagueImage }: ContestImageSource) {
  return validImageUrl(productImage) ?? validImageUrl(leagueImage);
}

/** A identidade visual de Records é administrada exclusivamente pelo produto. */
export function resolveRecordsContestImage(productImage?: string | null) {
  return validImageUrl(productImage);
}
