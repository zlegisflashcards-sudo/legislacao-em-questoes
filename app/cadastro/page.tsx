import { AuthCard } from "@/components/auth-card";
import { CadastroForm } from "@/components/cadastro-form";

export default function CadastroPage() {
  return (
    <AuthCard
      title="Criar conta"
      subtitle="Cadastre-se para ativar sua Area do Aluno no Legis Flashcards."
    >
      <CadastroForm />
    </AuthCard>
  );
}
