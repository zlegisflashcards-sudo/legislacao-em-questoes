export type StudyAccessOptions = {
  /** Leis podem ter amostra gratuita; doutrina não deve herdar essa exceção. */
  allowFreeAccess?: boolean;
};

export function hasStudyEntitlement(
  hasActiveRelease: boolean,
  isFree: boolean,
  { allowFreeAccess = true }: StudyAccessOptions = {},
) {
  return hasActiveRelease || (allowFreeAccess && isFree);
}
