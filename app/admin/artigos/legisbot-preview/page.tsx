import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import styles from "@/app/legisbot/[slug]/continuous-reading.module.css";
import { resolvePreparedLegislativeShadow } from "@/app/admin/artigos/reference-actions";
import { exigirAdministrador } from "@/lib/admin-auth";
import { getAdministrativeLegislativePreview } from "@/lib/admin-legislative-preview";
import { sanitizeLegalHtmlCore } from "@/lib/legisbot/sanitize-legal-html-core";
import { getAdminLegislativeStructureReleaseDashboard } from "@/lib/admin-legislative-structure-releases";
import { LegislativeStructureReleaseDashboard } from "@/components/admin/legislative-structure-release-dashboard";
import { LegislativeStructureConfirmationPreview } from "@/components/admin/legislative-structure-confirmation-preview";

export const dynamic = "force-dynamic";

function PreviewShell({ slug, children }: { slug: string; children: ReactNode }) {
  return <><Link className="admin-central-link" href={`/admin/artigos?aba=artigos&lei=${encodeURIComponent(slug)}`}>← Voltar para a Base Legislativa</Link><p className="admin-eyebrow">Prévia administrativa da Lei Interativa</p>{children}</>;
}

function statusLabel(status: "prepared" | "pending" | "revoked") {
  return status === "prepared" ? "Legislação preparada" : status === "revoked" ? "Exibição taxada e cinza" : "Legislação pendente";
}

export default async function LegisBotPreviewPage({ searchParams }: { searchParams: Promise<{ lei?: string; editar?: string; referencia?: string; sombra?: string; filtro?: string; liberacao?: string; liberacao_erro?: string; associacoes_confirmadas?: string; associacoes_ignoradas?: string; estrutura?: string; incluir?: string; confirmacao_liberada?: string; confirmacao_erro?: string }> }) {
  await exigirAdministrador();
  const query = await searchParams;
  const slug = query.lei?.trim().toLowerCase() ?? "";
  if (!slug) return <main className="admin-shell article-center-shell"><p className="admin-empty">Escolha uma lei para visualizar a prévia.</p></main>;

  try {
    const preview = await getAdministrativeLegislativePreview(slug);
    if (!preview) return <main className={`${styles.page} admin-shell`}><PreviewShell slug={slug}><section className={`${styles.shell} ${styles.empty}`}><h1>Legislação não encontrada</h1><p>Confira a lei selecionada ou volte à Base Legislativa.</p></section></PreviewShell></main>;
    const editing = query.editar ? preview.items.find((item) => item.id === query.editar) : null;
    if (editing) redirect(`/admin/artigos/${encodeURIComponent(editing.slug)}/${encodeURIComponent(editing.ordem)}?aba=artigo&lei=${encodeURIComponent(slug)}`);
    const filter = query.filtro === "orfas" || query.filtro === "sombra" ? query.filtro : "todas";
    const visibleItems = filter === "todas" ? preview.items : [];
    const releaseDashboard = await getAdminLegislativeStructureReleaseDashboard(slug);
    // A leitura do aluno é travada pelo mesmo diagnóstico estrutural usado no
    // painel de liberação. Assim um estado antigo de "Liberada" jamais deixa
    // a prévia geral verde quando o recorte voltou a ter pendências.
    const structuresReady = !releaseDashboard?.integrity.hasStructures
      || releaseDashboard.integrity.reports.every((report) => report.status === "ready");
    const readiness = [
      { ready: preview.items.length > 0, text: "A base ainda não possui blocos legislativos preparados." },
      { ready: preview.shadowArticles.length === 0, text: `${preview.shadowArticles.length} artigo(s) sombra ainda precisam de texto ou marcação editorial.` },
      { ready: preview.orphanQuestions.length === 0, text: `${preview.orphanQuestions.length} questão(ões) órfã(s) ainda não encontram destino legislativo seguro.` },
      { ready: preview.unpositionedQuestions.length === 0, text: `${preview.unpositionedQuestions.length} questão(ões) têm Ordem não interpretável.` },
      { ready: structuresReady, text: "A hierarquia ainda possui estrutura(s) sem cobertura suficiente para a leitura." },
    ];
    const studentReady = readiness.every((item) => item.ready);
    const lawAvailable = Boolean(releaseDashboard?.law.ativo && releaseDashboard.law.status_publicacao === "ativa");
    const selectedStructureId = /^\d+$/.test(query.estrutura ?? "") ? Number(query.estrutura) : null;
    const selectedStructure = selectedStructureId === null ? null : releaseDashboard?.structures.find((item) => item.structureId === selectedStructureId) ?? null;
    // A prévia geral não traz `estrutura` na URL. Para que o botão não seja
    // um link para a própria página, a simulação administrativa começa na
    // primeira estrutura legislativa disponível. Isso não cria liberação nem
    // altera a rota pública.
    const studentPreviewStructure = selectedStructure ?? releaseDashboard?.structures[0] ?? null;
    // A ação desta prévia é administrativa: quando há uma estrutura em
    // conferência, ela deve abrir a simulação correspondente — nunca a rota
    // pública, que exige a autorização comercial do aluno.
    const studentPreviewHref = studentPreviewStructure
      ? `/admin/artigos/legisbot-preview/visao-aluno?lei=${encodeURIComponent(slug)}&estrutura=${encodeURIComponent(String(studentPreviewStructure.structureId))}`
      : `/admin/artigos/legisbot-preview?lei=${encodeURIComponent(slug)}`;
    const includedIds = [...new Set((query.incluir ?? "").split(/[\s,;]+/).filter((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)))].slice(0, 100);
    return <main className={`${styles.page} admin-shell`}><PreviewShell slug={slug}>
      <section className={styles.shell}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>Prévia administrativa</p>
          <h1>{preview.law.nome_curto || preview.law.titulo}</h1>
          <p>A base editorial e a conferência de cobertura são independentes: artigos sombra vêm do inventário do documento oficial; questões órfãs são questões sem destino legislativo seguro.</p>
          <div className={styles.previewStats}><span>{preview.items.length} dispositivo(s) identificável(is)</span><span>{preview.items.filter((item) => item.status === "prepared").length} preparado(s)</span><span>{preview.items.filter((item) => item.status === "pending").length} pendente(s)</span></div>
        </header>
        <section className={`${styles.studentReadiness} ${studentReady ? styles.studentReadinessReady : ""}`} aria-live="polite"><strong>{studentReady ? "Pronta para ser a Lei Interativa padrão do aluno" : "O que falta para esta ser a Lei Interativa padrão do aluno"}</strong>{studentReady ? <div className={styles.studentReadinessActions}><p>A leitura tem cobertura editorial suficiente: não há artigos sombra, questões órfãs ou Ordens sem posição.</p><Link className="admin-button secondary" href={studentPreviewHref}>Abrir simulação do aluno</Link></div> : <ul>{readiness.filter((item) => !item.ready).map((item) => <li key={item.text}>{item.text}</li>)}</ul>}</section>
        {query.referencia === "salva" ? <p className="admin-alert success">A referência foi salva. A prévia foi atualizada sem alterar nenhuma questão.</p> : null}
        {query.associacoes_confirmadas ? <p className="admin-alert success">{query.associacoes_confirmadas} associação(ões) estrutural(is) sugerida(s) foram confirmadas. {query.associacoes_ignoradas && query.associacoes_ignoradas !== "0" ? `${query.associacoes_ignoradas} não foram alterada(s), pois mudaram antes da confirmação.` : "Você pode ajustar qualquer exceção na edição individual do bloco."}</p> : null}
        {query.liberacao === "liberada" ? <p className={`admin-alert${studentReady ? " success" : ""}`}>{studentReady ? "A estrutura foi liberada manualmente. A Lei Interativa pública ainda não utiliza liberações por estrutura nesta etapa." : "A liberação foi registrada, mas a leitura continua bloqueada por pendências atuais. Confira o diagnóstico estrutural abaixo."}</p> : query.liberacao === "lei_liberada" ? <p className={`admin-alert${studentReady ? " success" : ""}`}>{studentReady ? "Todas as estruturas prontas foram liberadas em uma única operação auditável. O modo parcial continua desativado." : "As liberações foram registradas, mas a leitura continua bloqueada por pendências atuais. Confira o diagnóstico estrutural abaixo."}</p> : query.liberacao === "bloqueada" ? <p className="admin-alert success">A estrutura foi bloqueada manualmente.</p> : query.liberacao === "sem_alteracao" || query.liberacao === "lei_sem_alteracao" ? <p className="admin-alert">A lei já possuía esse estado de liberação.</p> : null}
        {query.liberacao_erro === "not_ready" ? <p className="admin-alert error">A estrutura não está pronta. Atualize o diagnóstico e resolva as pendências antes de liberar.</p> : query.liberacao_erro === "root_required" ? <p className="admin-alert error">Somente um Título sem pai pode ser liberado. Escolha a estrutura raiz do ramo.</p> : query.liberacao_erro === "blocked_descendant" ? <p className="admin-alert error">A liberação foi recusada porque existe um descendente bloqueado explicitamente.</p> : query.liberacao_erro === "law_unavailable" ? <p className="admin-alert error">A lei não está ativa para disponibilização pública.</p> : query.liberacao_erro === "migration_pending" ? <p className="admin-alert error">A migration de liberação por estrutura ainda não foi aplicada.</p> : query.liberacao_erro ? <p className="admin-alert error">Não foi possível concluir a operação de liberação. O estado não foi confirmado.</p> : null}
        {query.confirmacao_liberada ? <p className={`admin-alert${studentReady ? " success" : ""}`}>{studentReady ? `${query.confirmacao_liberada} bloco(s) foram associados e a estrutura foi liberada em uma única operação.` : `${query.confirmacao_liberada} bloco(s) foram associados; a leitura continua bloqueada por pendências atuais.`}</p> : null}
        {query.confirmacao_erro === "not_ready" ? <p className="admin-alert error">A confirmação foi recusada porque ainda há pendências impeditivas no recorte.</p> : query.confirmacao_erro === "stale_integrity" ? <p className="admin-alert error">Os dados mudaram desde a prévia. Atualize a confirmação antes de tentar novamente.</p> : query.confirmacao_erro === "migration_pending" ? <p className="admin-alert error">A migration da confirmação transacional ainda não foi aplicada.</p> : query.confirmacao_erro ? <p className="admin-alert error">A confirmação não foi concluída. Nenhum vínculo ou liberação foi gravado.</p> : null}
        {releaseDashboard ? <LegislativeStructureReleaseDashboard slug={slug} migrationAvailable={releaseDashboard.migrationAvailable} rows={releaseDashboard.structures} lawAvailable={lawAvailable} /> : null}
        {releaseDashboard && selectedStructure ? <LegislativeStructureConfirmationPreview slug={slug} structure={{ id: selectedStructure.structureId, label: selectedStructure.path.join(" › ") || selectedStructure.name, activeQuestionCount: selectedStructure.activeQuestionCount, preparedReferenceCount: selectedStructure.preparedReferenceCount }} references={releaseDashboard.referenceAssociations} includedIds={includedIds} orphanQuestions={selectedStructure.orphanQuestionCount} shadowArticles={preview.shadowArticles.length} possibleMissingArticles={selectedStructure.articleContinuity?.possibleMissingArticles ?? []} migrationAvailable={releaseDashboard.confirmationAvailable} /> : null}
        {query.sombra === "criado" ? <p className="admin-alert success">Bloco legislativo criado a partir do texto do documento oficial.</p> : query.sombra === "revogado" ? <p className="admin-alert success">Dispositivo registrado como revogado; o texto oficial foi preservado para consulta.</p> : null}
        <form className={styles.previewFilter}><input type="hidden" name="lei" value={slug}/><label>Exibir<select name="filtro" defaultValue={filter}><option value="todas">Todos os blocos legislativos</option><option value="sombra">Artigos sombra</option><option value="orfas">Questões órfãs</option></select></label><button className="admin-button secondary">Aplicar filtro</button></form>
        {preview.unpositionedQuestions.length && filter !== "orfas" ? <p className="admin-alert"><strong>{preview.unpositionedQuestions.length} questão(ões) têm Ordem não interpretável:</strong> elas não podem ser posicionadas automaticamente na leitura. Revise-as na Gestão de Questões.</p> : null}
        <section className={styles.previewReading} aria-label="Leitura contínua administrativa">
          {visibleItems.map((item) => <article key={`${item.slug}:${item.ordem}`} className={`${styles.previewReadingBlock} ${item.status === "revoked" ? styles.previewRevoked : ""}`}>
            <header className={styles.previewReadingHeader}><div><p className={styles.previewOrder}>ordem {item.ordem}</p><h2>{item.identification}</h2><p className={styles.previewStatus}>{statusLabel(item.status)} · <Link href={`/admin/leis/${encodeURIComponent(item.slug)}/questoes?article=${encodeURIComponent(item.ordem)}`}>{item.questionCount} questão(ões)</Link></p></div><div className={styles.previewActions}>{item.id ? <Link className="admin-button secondary" href={`/admin/artigos/${encodeURIComponent(item.slug)}/${encodeURIComponent(item.ordem)}?aba=artigo&lei=${encodeURIComponent(slug)}`}>{item.status === "revoked" ? "Editar / exibir normal" : "Editar"}</Link> : null}</div></header>
            {item.legislation ? <div className={styles.legalHtml} dangerouslySetInnerHTML={{ __html: sanitizeLegalHtmlCore(item.legislation) }}/> : <p className={styles.previewInlineNotice}>Este bloco ainda não possui texto legislativo preparado.</p>}
          </article>)}
          {filter === "orfas" ? <section className={styles.previewOrphans}>{preview.orphanQuestions.length ? <><h2>Questões órfãs</h2><p>Estas questões não encontram um destino legislativo seguro na mesma Ordem, em Ordem superior, nem por vínculo editorial manual. A ausência de comentário do LegisBot não as inclui nesta lista.</p>{preview.orphanQuestions.map((question) => <article key={question.id}><div><strong>{question.assunto || "Assunto não informado"}</strong><p>Ordem atual: <code>{question.ordem || "ausente"}</code></p></div><Link className="admin-button secondary" href={`/admin/leis/${encodeURIComponent(slug)}/questoes?question_id=${encodeURIComponent(question.id)}`}>Revisar questão</Link></article>)}</> : <div className={styles.empty}><h2>Nenhuma questão órfã</h2><p>Todas as questões ativas encontram um destino legislativo seguro pela Ordem, hierarquia ou vínculo editorial.</p></div>}</section> : null}
          {filter === "sombra" ? <section className={styles.previewOrphans}>{!preview.inventoryAvailable ? <div className={styles.empty}><h2>Inventário oficial ainda não importado</h2><p>Importe o documento oficial integral desta lei para conferir se algum artigo ficou fora da base legislativa.</p><Link className="admin-button secondary" href={`/admin/artigos?aba=artigos&lei=${encodeURIComponent(slug)}`}>Abrir Base Legislativa</Link></div> : preview.shadowArticles.length ? <><h2>Artigos sombra</h2><p>Estes dispositivos constam no documento oficial importado, mas ainda não possuem texto preparado na base legislativa. Resolva cada um criando o bloco ou registrando a revogação.</p>{preview.shadowArticles.map((article) => <article key={article.ordem}><div><strong>{article.identification}</strong><p>Ordem: <code>{article.ordem}</code></p></div><div className="article-header-actions"><form action={resolvePreparedLegislativeShadow}><input type="hidden" name="slug" value={slug}/><input type="hidden" name="ordem" value={article.ordem}/><input type="hidden" name="resolution" value="preparada"/><button className="admin-button primary">Criar bloco</button></form><form action={resolvePreparedLegislativeShadow}><input type="hidden" name="slug" value={slug}/><input type="hidden" name="ordem" value={article.ordem}/><input type="hidden" name="resolution" value="revogada"/><label className="sr-only" htmlFor={`revogadora-${article.ordem}`}>Lei revogadora</label><input id={`revogadora-${article.ordem}`} name="revoking_law" required placeholder="Lei revogadora"/><button className="admin-button secondary">Marcar revogado</button></form></div></article>)}</> : <div className={styles.empty}><h2>Nenhum artigo sombra</h2><p>Todos os dispositivos do documento oficial importado possuem texto preparado na base legislativa.</p></div>}</section> : null}
          {!visibleItems.length && filter !== "orfas" ? <section className={styles.empty}><h2>Nenhum bloco legislativo preparado</h2><p>Importe a legislação para criar a base de leitura contínua.</p></section> : null}
        </section>
      </section>
    </PreviewShell></main>;
  } catch (error) {
    // `redirect()` sinaliza a navegação lançando NEXT_REDIRECT; ele não é uma
    // falha da prévia e precisa atravessar este tratamento de erro.
    if (typeof error === "object" && error !== null && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT")) throw error;
    console.error("[Admin] Falha ao montar prévia administrativa.", { slug, tipo: error instanceof Error ? error.name : "unknown" });
    return <main className={`${styles.page} admin-shell`}><PreviewShell slug={slug}><section className={`${styles.shell} ${styles.empty}`}><h1>Prévia temporariamente indisponível</h1><p>Não foi possível carregar os registros administrativos agora. Nenhuma questão ou referência foi alterada.</p></section></PreviewShell></main>;
  }
}
