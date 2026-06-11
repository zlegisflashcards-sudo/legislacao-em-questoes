import { AuthCard } from "@/components/auth-card";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <AuthCard
      title="Entrar"
      subtitle="Acesse sua Area do Aluno para acompanhar seu perfil e, nas proximas fases, seus produtos e beneficios."
    >
      <LoginForm />
    </AuthCard>
  );
}
