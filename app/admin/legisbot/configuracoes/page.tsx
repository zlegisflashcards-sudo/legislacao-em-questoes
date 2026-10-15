import Link from "next/link";
import { salvarPromptLegisBot } from "@/app/admin/actions";
import { exigirAdministrador } from "@/lib/admin-auth";
import { getLegisBotPrompt } from "@/lib/legisbot/prompt-config";

export default async function LegisBotSettingsPage() {
  await exigirAdministrador();
  const prompt = await getLegisBotPrompt();
  return <main className="admin-shell">
    <Link className="admin-back" href="/admin/legisbot">← Voltar ao LegisBot</Link>
    <header className="admin-header"><div><div className="admin-eyebrow">Configuração</div><h1>Prompt do LegisBot</h1><p>Aplicado somente às novas gerações; conteúdos já salvos não são alterados.</p></div></header>
    <form action={salvarPromptLegisBot} className="admin-card grid gap-4">
      <label className="grid gap-2"><strong>Prompt atual</strong><textarea className="admin-legislation" name="prompt" defaultValue={prompt} rows={28} /></label>
      <button className="admin-button primary justify-self-start">Salvar prompt</button>
    </form>
  </main>;
}
