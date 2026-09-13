export function resolveLawStudyAccess(input: {
  studentId: string | null;
  hasActiveRelease: boolean;
  mustChangePassword: boolean;
  administrator: boolean;
}) {
  if (input.studentId && input.hasActiveRelease && !input.mustChangePassword) {
    return { allowed: true, kind: "student", studentId: input.studentId } as const;
  }
  if (input.administrator) return { allowed: true, kind: "admin", studentId: null } as const;
  return { allowed: false, status: 403, message: input.mustChangePassword
    ? "Crie sua nova senha antes de acessar suas leis."
    : "Esta lei não está liberada para sua conta." } as const;
}
