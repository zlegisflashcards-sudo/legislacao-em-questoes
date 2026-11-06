import { hasStudyEntitlement } from "./study-access-policy";

/** Política pura correspondente ao adaptador de servidor de doutrina. */
export function doctrineAccessDecision(input: {
  authenticated: boolean;
  student: boolean;
  published: boolean;
  passwordChangeRequired: boolean;
  activeRelease: boolean;
}) {
  if (!input.authenticated) return { allowed: false, status: 401 as const };
  if (!input.student || !input.published || !input.activeRelease) return { allowed: false, status: 404 as const };
  if (input.passwordChangeRequired) return { allowed: false, status: 403 as const };
  return { allowed: true, status: 200 as const };
}

export function hasDoctrineEntitlement(activeRelease: boolean) {
  return hasStudyEntitlement(activeRelease, false, { allowFreeAccess: false });
}
