import Link from "next/link";
import { exigirAdministrador } from "@/lib/admin-auth";
import { sanitizarHtmlLegislacao } from "@/lib/legisbot/sanitize-legal-html";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const textHtml = (value: string) => value.includes("<") ? sanitizarHtmlLegislacao(value) : `<p>${value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br />")}</p>`;

export default async function LegisBotPreviewPage({ searchParams }: { searchParams: Promise<{ lei?: string }> }) {
  await exigirAdministrador();
  const slug = (await searchParams).lei?.trim().toLowerCase() ?? "";
  if (!slug) return <main className="admin-shell article-center-shell"><p className="admin-empty">Escolha uma lei para visualizar a prévia.</p></main>;
  const db = getSupabaseServerClient();
  const [law, references] = await Promise.all([
    db.from("leis").select("titulo,nome_curto").eq("slug", slug).maybeSingle(),
    db.from("legislative_references").select("ordem,identificacao,legislacao").eq("slug", slug).not("legislacao", "is", null).order("ordem").limit(500),
  ]);
  if (law.error || references.error) throw new Error("Não foi possível gerar a prévia da legislação.");
  const records = (references.data ?? []).filter((item) => typeof item.legislacao === "string" && item.legislacao.trim());
  return <main className="admin-shell article-center-shell legisbot-preview-page"><Link className="admin-central-link" href={`/admin/artigos?aba=artigos&lei=${encodeURIComponent(slug)}`}>← Voltar para a Base Legislativa</Link><header className="admin-header"><div><div className="admin-eyebrow">Prévia administrativa</div><h1>{law.data?.nome_curto || law.data?.titulo || slug}</h1><p>Simulação da leitura contínua da futura Legislação Interativa. Apenas referências com texto preparado são exibidas.</p></div></header><div className="legisbot-preview-layout"><aside className="legisbot-preview-toc"><strong>Sumário</strong>{records.map((item) => <a key={item.ordem} href={`#ordem-${item.ordem}`}>{item.identificacao}</a>)}</aside><section className="legisbot-preview-content">{records.length ? records.map((item) => <article id={`ordem-${item.ordem}`} key={item.ordem} className="legisbot-preview-block"><header><span>ordem {item.ordem}</span><h2>{item.identificacao}</h2></header><div className="legisbot-legal-html" dangerouslySetInnerHTML={{ __html: textHtml(String(item.legislacao)) }} /></article>) : <div className="admin-empty"><h2>Nenhum texto legislativo preparado</h2><p>Prepare ou importe referências para visualizar a leitura contínua.</p></div>}</section></div></main>;
}
