import { AuthCard } from "@/components/auth-card";
import { RecuperarSenhaForm } from "@/components/recuperar-senha-form";

export default function RecuperarSenhaPage() {
  return (
    <AuthCard
      title="Recuperar senha"
      subtitle="Informe seu e-mail para receber as instrucoes de acesso."
    >
      <RecuperarSenhaForm />
    </AuthCard>
  );
}
