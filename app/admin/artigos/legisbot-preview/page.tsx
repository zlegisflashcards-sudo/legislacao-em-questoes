import Link from "next/link";
import type { ReactNode } from "react";
import styles from "@/app/legisbot/[slug]/continuous-reading.module.css";
import { resolvePreparedLegislativeShadow, savePreparedLegislativeReference } from "@/app/admin/artigos/reference-actions";
import { exigirAdministrador } from "@/lib/admin-auth";
import { getAdministrativeLegislativePreview } from "@/lib/admin-legislative-preview";
import { sanitizeLegalHtmlCore } from "@/lib/legisbot/sanitize-legal-html-core";

export const dynamic = "force-dynamic";

function PreviewShell({ slug, children }: { slug: string; children: ReactNode }) {
  return <><Link className="admin-central-link" href={`/admin/artigos?aba=artigos&lei=${encodeURIComponent(slug)}`}>← Voltar para a Base Legislativa</Link><p className="admin-eyebrow">Prévia administrativa — leitura contínua em preparação</p>{children}</>;
}

function statusLabel(status: "prepared" | "pending" | "revoked") {
  return status === "prepared" ? "Legislação preparada" : status === "revoked" ? "Revogado" : "Legislação pendente";
}

export default async function LegisBotPreviewPage({ searchParams }: { searchParams: Promise<{ lei?: string; editar?: string; referencia?: string; sombra?: string; filtro?: string }> }) {
  await exigirAdministrador();
  const query = await searchParams;
  const slug = query.lei?.trim().toLowerCase() ?? "";
  if (!slug) return <main className="admin-shell article-center-shell"><p className="admin-empty">Escolha uma lei para visualizar a prévia.</p></main>;

  try {
    const preview = await getAdministrativeLegislativePreview(slug);
    if (!preview) return <main className={`${styles.page} admin-shell`}><PreviewShell slug={slug}><section className={`${styles.shell} ${styles.empty}`}><h1>Legislação não encontrada</h1><p>Confira a lei selecionada ou volte à Base Legislativa.</p></section></PreviewShell></main>;
    const editing = query.editar ? preview.items.find((item) => item.id === query.editar) : null;
    const filter = query.filtro === "orfas" || query.filtro === "sombra" ? query.filtro : "todas";
    const visibleItems = filter === "todas" ? preview.items : [];
    return <main className={`${styles.page} admin-shell`}><PreviewShell slug={slug}>
      <section className={styles.shell}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>Prévia administrativa</p>
          <h1>{preview.law.nome_curto || preview.law.titulo}</h1>
          <p>A base editorial e a conferência de cobertura são independentes: artigos sombra vêm do inventário do documento oficial; questões órfãs são questões sem destino legislativo seguro.</p>
          <div className={styles.previewStats}><span>{preview.items.length} dispositivo(s) identificável(is)</span><span>{preview.items.filter((item) => item.status === "prepared").length} preparado(s)</span><span>{preview.items.filter((item) => item.status === "pending").length} pendente(s)</span></div>
        </header>
        {query.referencia === "salva" ? <p className="admin-alert success">A referência foi salva. A prévia foi atualizada sem alterar nenhuma questão.</p> : null}
        {query.sombra === "criado" ? <p className="admin-alert success">Bloco legislativo criado a partir do texto do documento oficial.</p> : query.sombra === "revogado" ? <p className="admin-alert success">Dispositivo registrado como revogado; o texto oficial foi preservado para consulta.</p> : null}
        <form className={styles.previewFilter}><input type="hidden" name="lei" value={slug}/><label>Exibir<select name="filtro" defaultValue={filter}><option value="todas">Todos os blocos legislativos</option><option value="sombra">Artigos sombra</option><option value="orfas">Questões órfãs</option></select></label><button className="admin-button secondary">Aplicar filtro</button></form>
        {preview.unpositionedQuestions.length && filter !== "orfas" ? <p className="admin-alert"><strong>{preview.unpositionedQuestions.length} questão(ões) têm Ordem não interpretável:</strong> elas não podem ser posicionadas automaticamente na leitura. Revise-as na Gestão de Questões.</p> : null}
        {editing?.id ? <section className={styles.previewEditor} aria-labelledby="preview-editor-title"><header><div><p className={styles.eyebrow}>Edição direta</p><h2 id="preview-editor-title">{editing.identification}</h2><p>ordem {editing.ordem} · UUID, Ordem e contadores serão preservados.</p></div><Link className="admin-button secondary" href={`/admin/artigos/legisbot-preview?lei=${encodeURIComponent(slug)}`}>Fechar edição</Link></header><form action={savePreparedLegislativeReference} className="article-mapping-form"><input type="hidden" name="id" value={editing.id}/><input type="hidden" name="slug" value={editing.slug}/><input type="hidden" name="ordem" value={editing.ordem}/><input type="hidden" name="return_to_preview" value="1"/><label>Identificação do dispositivo<input name="identification" defaultValue={editing.identification}/></label><label>Legislação preparada<textarea name="legislation" defaultValue={editing.legislation ?? ""} placeholder="Cole o texto legislativo preparado."/></label><label className={styles.revokeControl}><input type="checkbox" name="status" value="revogada" defaultChecked={editing.status === "revoked"}/> Marcar como revogado</label><label>Lei que revogou (obrigatória quando revogado)<input name="revoking_law" defaultValue={editing.revokingLaw ?? ""} placeholder="Ex.: Lei nº 14.230/2021"/></label><p className="article-interaction-note">Revogar não exclui referência, texto armazenado, questões nem LegisBots. Para reverter, desmarque a opção e salve.</p><button className="admin-button primary">Salvar situação da referência</button></form></section> : null}
        <section className={styles.previewReading} aria-label="Leitura contínua administrativa">
          {visibleItems.map((item) => <article key={`${item.slug}:${item.ordem}`} className={`${styles.previewReadingBlock} ${item.status === "revoked" ? styles.previewRevoked : ""}`}>
            <header className={styles.previewReadingHeader}><div><p className={styles.previewOrder}>ordem {item.ordem}</p><h2>{item.identification}</h2><p className={styles.previewStatus}>{statusLabel(item.status)}{item.status === "revoked" && item.revokingLaw ? ` · Revogado pela ${item.revokingLaw}` : ""} · <Link href={`/admin/leis/${encodeURIComponent(item.slug)}/questoes?article=${encodeURIComponent(item.ordem)}`}>{item.questionCount} questão(ões)</Link></p></div><div className={styles.previewActions}>{item.id ? <Link className="admin-button secondary" href={`/admin/artigos/legisbot-preview?lei=${encodeURIComponent(slug)}&editar=${encodeURIComponent(item.id)}`}>{item.status === "revoked" ? "Editar / reverter" : "Editar"}</Link> : null}</div></header>
            {item.status === "prepared" && item.legislation ? <div className={styles.legalHtml} dangerouslySetInnerHTML={{ __html: sanitizeLegalHtmlCore(item.legislation) }}/> : <p className={styles.previewInlineNotice}>Dispositivo revogado. O texto armazenado permanece preservado para consulta e reversão administrativa.</p>}
          </article>)}
          {filter === "orfas" ? <section className={styles.previewOrphans}>{preview.orphanQuestions.length ? <><h2>Questões órfãs</h2><p>Estas questões não encontram um destino legislativo seguro na mesma Ordem, em Ordem superior, nem por vínculo editorial manual. A ausência de comentário do LegisBot não as inclui nesta lista.</p>{preview.orphanQuestions.map((question) => <article key={question.id}><div><strong>{question.assunto || "Assunto não informado"}</strong><p>Ordem atual: <code>{question.ordem || "ausente"}</code></p></div><Link className="admin-button secondary" href={`/admin/leis/${encodeURIComponent(slug)}/questoes?question_id=${encodeURIComponent(question.id)}`}>Revisar questão</Link></article>)}</> : <div className={styles.empty}><h2>Nenhuma questão órfã</h2><p>Todas as questões ativas encontram um destino legislativo seguro pela Ordem, hierarquia ou vínculo editorial.</p></div>}</section> : null}
          {filter === "sombra" ? <section className={styles.previewOrphans}>{!preview.inventoryAvailable ? <div className={styles.empty}><h2>Inventário oficial ainda não importado</h2><p>Importe o documento oficial integral desta lei para conferir se algum artigo ficou fora da base legislativa.</p><Link className="admin-button secondary" href={`/admin/artigos?aba=artigos&lei=${encodeURIComponent(slug)}`}>Abrir Base Legislativa</Link></div> : preview.shadowArticles.length ? <><h2>Artigos sombra</h2><p>Estes dispositivos constam no documento oficial importado, mas ainda não possuem texto preparado na base legislativa. Resolva cada um criando o bloco ou registrando a revogação.</p>{preview.shadowArticles.map((article) => <article key={article.ordem}><div><strong>{article.identification}</strong><p>Ordem: <code>{article.ordem}</code></p></div><div className="article-header-actions"><form action={resolvePreparedLegislativeShadow}><input type="hidden" name="slug" value={slug}/><input type="hidden" name="ordem" value={article.ordem}/><input type="hidden" name="resolution" value="preparada"/><button className="admin-button primary">Criar bloco</button></form><form action={resolvePreparedLegislativeShadow}><input type="hidden" name="slug" value={slug}/><input type="hidden" name="ordem" value={article.ordem}/><input type="hidden" name="resolution" value="revogada"/><label className="sr-only" htmlFor={`revogadora-${article.ordem}`}>Lei revogadora</label><input id={`revogadora-${article.ordem}`} name="revoking_law" required placeholder="Lei revogadora"/><button className="admin-button secondary">Marcar revogado</button></form></div></article>)}</> : <div className={styles.empty}><h2>Nenhum artigo sombra</h2><p>Todos os dispositivos do documento oficial importado possuem texto preparado na base legislativa.</p></div>}</section> : null}
          {!visibleItems.length && filter !== "orfas" ? <section className={styles.empty}><h2>Nenhum bloco legislativo preparado</h2><p>Importe a legislação para criar a base de leitura contínua.</p></section> : null}
        </section>
      </section>
    </PreviewShell></main>;
  } catch (error) {
    console.error("[Admin] Falha ao montar prévia administrativa.", { slug, tipo: error instanceof Error ? error.name : "unknown" });
    return <main className={`${styles.page} admin-shell`}><PreviewShell slug={slug}><section className={`${styles.shell} ${styles.empty}`}><h1>Prévia temporariamente indisponível</h1><p>Não foi possível carregar os registros administrativos agora. Nenhuma questão ou referência foi alterada.</p></section></PreviewShell></main>;
  }
}
