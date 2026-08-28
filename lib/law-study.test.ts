import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAW_STUDY_PLATFORM,
  LAW_STUDY_PLATFORM_IDS,
  LAW_STUDY_PLATFORMS,
  isValidLawSlug,
  lawMaterialActionLabel,
  lawMaterialAvailabilityLabel,
  lawStudyShortName,
} from "./law-study";

const server = readFileSync("lib/law-study-server.ts", "utf8");
const campaignServer = readFileSync("lib/law-campaign-server.ts", "utf8");
const route = readFileSync("app/api/aluno/estudar/lei/[slug]/route.ts", "utf8");
const page = readFileSync("app/estudar/lei/[slug]/page.tsx", "utf8");
const client = readFileSync("components/law-study-page-client.tsx", "utf8");
const donut = readFileSync("components/campaign-performance-donut.tsx", "utf8");
const cards = readFileSync("components/student-laws-client.tsx", "utf8");
const contract = readFileSync("lib/law-study.ts", "utf8");

describe("contrato da página de estudo da lei", () => {
  it("mantém plataformas tipadas com Computador como padrão, sem URLs de vídeo legadas", () => {
    expect(DEFAULT_LAW_STUDY_PLATFORM).toBe("computador");
    expect(LAW_STUDY_PLATFORM_IDS).toEqual(["computador", "android", "ios", "navegador"]);
    for (const platform of LAW_STUDY_PLATFORM_IDS) expect(LAW_STUDY_PLATFORMS[platform]).not.toHaveProperty("videoUrl");
  });

  it("valida o slug e mantém o nome oficial como título", () => {
    expect(isValidLawSlug("constituicao-federal")).toBe(true);
    expect(isValidLawSlug("../segredo")).toBe(false);
    expect(lawStudyShortName("Constituição Federal", " Recorte PMMA ")).toBe("Recorte PMMA");
    expect(lawStudyShortName("Constituição Federal", " CONSTITUIÇÃO FEDERAL ")).toBeNull();
  });

  it("mantém materiais secundários e o Anki disponível", () => {
    expect(lawMaterialActionLabel({ type: "flashcards", action: "baixar" })).toBe("Baixar flashcards");
    expect(lawMaterialActionLabel({ type: "pdf", action: "baixar" })).toBe("Baixar PDF");
    expect(lawMaterialAvailabilityLabel({ accessAvailable: true, availableAt: "2026-08-25" })).toBeNull();
    expect(lawMaterialAvailabilityLabel({ accessAvailable: false, availableAt: null })).toBe("Em breve");
    expect(lawMaterialAvailabilityLabel({ accessAvailable: false, availableAt: "2026-08-25" })).toBe("Disponível em 25/08/2026");
    expect(client).toContain('function Materials'); expect(client).toContain('>Materiais<'); expect(client).toContain('>Estudar no Anki<'); expect(client).toContain('"Baixar PDF"'); expect(client).toContain('"Baixar deck (.apkg)"'); expect(client).toContain('"Baixando arquivo…"'); expect(client).not.toContain('/apkg`');
  });

  it("mantém a central utilizável em telas estreitas", () => {
    expect(client).toContain("overflow-x-hidden");
    expect(client).toContain("min-h-12 w-full items-center justify-center");
    expect(client).toContain("sm:w-auto");
    expect(client).toContain("break-words font-bold leading-5");
    expect(client).toContain("grid-cols-1 gap-2 sm:grid-cols-4");
    expect(client).not.toContain("block truncate font-bold text-slate-800");
  });
});

describe("autorização e exposição segura", () => {
  it("autentica, resolve o aluno e verifica a liberação ativa antes dos materiais", () => {
    expect(server).toContain("auth.getUser(token)");
    expect(server).toContain('.from("alunos").select("id").eq("user_id", userData.user.id)');
    expect(server).toContain('.from("liberacoes_leis").select("id")');
    expect(server).toContain('.eq("status", "ativo")');
    expect(server.indexOf('.from("liberacoes_leis")')).toBeLessThan(server.indexOf('.from("materiais_leis")'));
    expect(server).toContain("Lei não encontrada ou não liberada para sua conta.");
  });

  it("consulta somente campos seguros e conteúdo visível ao aluno", () => {
    expect(server).toContain('select("id,tipo,titulo,descricao,provedor,url_externa,acao,quantidade_itens,versao_material,data_entrega_prevista")');
    expect(server).toContain('select("id,tipo,importancia,titulo,descricao_resumida,referencia_normativa,versao_nova,data_publicacao,created_at")');
    expect(server).toContain('.eq("visivel_aluno", true)');
    for (const forbidden of ["observacao_interna", "criado_por", "compra_id", "produto_id", "email"]) expect(server).not.toContain(forbidden);
  });

  it("obtém o total de flashcards a partir das questões ativas, não dos materiais", () => {
    expect(server).toContain("activeQuestionCountBySlug(slug)");
    expect(server).toContain("activeQuestionCountBySlug(PUBLIC_SAMPLE_LAW_SLUG)");
    expect(server).not.toContain("materials.reduce");
  });

  it("expõe somente GET privado, sem endpoint de escrita ou download improvisado", () => {
    expect(route).toContain("export async function GET");
    expect(route).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    expect(route).toContain('"Cache-Control": "private, no-store, max-age=0"');
    expect(route).not.toContain("url_externa");
  });
});

describe("interface de estudo", () => {
  it("cria a rota autenticada e faz o card abrir a página interna", () => {
    expect(page).toContain("getAnkiTutorialSettings");
    expect(page).toContain("<LawStudyPageClient slug={slug} ankiTutorialSettings={settings} />");
    expect(client).toContain("supabase.auth.getSession()");
    expect(client).toContain("/conta?modo=login&retorno=");
    expect(cards).toContain('const lawHref = `/estudar/lei/${encodeURIComponent(law.slug)}`');
    expect(cards).toContain("href={lawHref}");
    expect(cards).toContain('href={lawHref}'); expect(cards).toContain('>Estudar</Link>');
  });

  it("reutiliza as abas e não adiciona botão Voltar", () => {
    expect(client).toContain('<StudentAreaTabs activeTab="leis" minhasLeisHref="/minhas-leis" />');
    expect(client).not.toContain(">Voltar<");
  });

  it("prioriza a central de estudo, estado de campanha e reset", () => {
    for (const expected of ['"Começar estudo"', '"Continuar estudo"', '"Concluída"', '"Em andamento"', '"Não iniciada"', 'Estudo Ativo da Lei', 'Estudo Livre', 'Resetar Estudo Ativo da Lei', 'campaign.progress']) expect(client).toContain(expected);
    for (const platform of ["Anki — Computador", "AnkiDroid — Android", "AnkiMobile — iPhone", "Online — Em breve"]) expect(contract).toContain(`label: "${platform}"`);
  });

  it("mostra a posição atual do ranking da própria lei abaixo do melhor score", () => {
    expect(campaignServer).toContain('supabase.rpc("obter_resultado_campanha_lei", { p_aluno_id: studentId, p_lei_id: lawId })');
    expect(campaignServer).toContain("const rankingPosition = Number.isSafeInteger(position) && position > 0 ? position : null");
    expect(campaignServer).toContain("position: rankingPosition ?? undefined");
    expect(client).toContain('Posição no ranking: {typeof campaign.result?.position === "number" ? `${campaign.result.position}º lugar` : "Ainda sem posição no ranking"}');
  });

  it("mostra o gráfico do recorde histórico, inclusive após reset, sem usar a campanha ativa", () => {
    expect(campaignServer).toContain("bestCompletedCampaignForRecord(history)");
    expect(campaignServer).toContain('score_competitivo_acertos,score_competitivo_erros');
    expect(campaignServer).toContain('eq("score_version", 2)');
    expect(client).toContain("campaign.record ?");
    expect(client).toContain("<CampaignPerformanceDonut compact {...competitiveCampaignPerformance(campaign.record.correct, campaign.record.errors)} />");
    expect(client).toContain('completed || campaign.status === "em_andamento" || campaign.record');
    expect(donut).toContain("lf-attempt-donut");
    expect(donut).toContain("is-compact");
  });

  it("libera estudo livre e capítulos somente após a campanha concluída", () => {
    expect(client).toContain('completed && tree.length > 0 ? <Link href={`/questoes/${encodeURIComponent(slug)}/estudar?livre=1${contextQuery}`}');
    expect(client).toContain('structure_id=${node.id}');
  });

  it("representa uma lei sem subbaralhos pelo deck raiz, sem ação duplicada", () => {
    expect(client).toContain('function RootDeck');
    expect(client).toContain('count={selectedContext?.questionCount ?? sourceLaw?.questions.length ?? 0}');
    expect(client).toContain('completed && tree.length > 0 ? <Link');
    expect(client).toContain('const href = `/questoes/${encodeURIComponent(slug)}/estudar?livre=1${recorteId ?');
  });

  it("reserva + e − somente para níveis que podem ser expandidos", () => {
    expect(client).toContain('node.children.length ? <button type="button"');
    expect(client).toContain('{open ? "−" : "+"}');
    expect(client).toContain('function progressionPhase');
    expect(client).toContain('levels.find((item) => !item.concluido)');
    expect(client).toContain('phase === "concluida"');
    expect(client).toContain('phase === "atual"');
    expect(client).toContain('icon: "✓"');
    expect(client).toContain('icon: "▶"');
    expect(client).toContain('icon: "🔒"');
    expect(client).not.toContain('const state = isDone ? "Concluído" : isCurrent ? "Em andamento" : "Bloqueado"');
    expect(client).not.toContain('>{state}</span>');
  });

  it("mantém a árvore do Estudo Ativo apenas informativa", () => {
    const tree = client.slice(client.indexOf('function StructureTreeNode'), client.indexOf('function RootDeck'));
    expect(tree).toContain('completed ? <Link href={href}');
    expect(tree).toContain(': <div className="flex min-w-0 flex-1 items-start gap-2 py-1 sm:items-center sm:gap-3">{label}</div>');
    expect(tree).not.toContain('href={href} className="flex min-w-0 flex-1 items-start gap-2 rounded-lg py-1 hover:bg-blue-50 sm:items-center sm:gap-3">{label}</Link> : <Link');
  });

  it("apresenta o Estudo Livre como menu de decks disponível", () => {
    const tree = client.slice(client.indexOf('function FreeStudyLabel'), client.indexOf('function RootDeck'));
    expect(tree).toContain('function FreeStudyLabel');
    expect(tree).toContain('border border-blue-100 bg-white');
    expect(tree).toContain('group-hover:border-blue-300 group-hover:bg-blue-50');
    expect(tree).toContain('completed ? <FreeStudyLabel name={node.nome} count={node.count} />');
    expect(tree).toContain('completed ? <Link href={href} className="group flex min-w-0 flex-1');
    expect(tree).not.toContain('FreeStudyLabel name={node.nome} count={node.count} phase=');
  });

  it("oferece materiais de Anki como seção secundária", () => {
    expect(client).toContain('study.materials.find'); expect(client).toContain('flashcards'); expect(client).toContain('AnkiModal');
  });

  it("reseta somente a campanha sem localStorage", () => {
    expect(client).toContain('}/campanha`, "DELETE"'); expect(client).toContain('record: current?.record');
    expect(client).not.toContain("localStorage");
    expect(client).toContain('Resetar Estudo Ativo da Lei');
  });

  it("mantém materiais sem expor dados administrativos", () => {
    for (const forbidden of ["observacao_interna", "criado_por", "url_externa"]) expect(client).not.toContain(forbidden);
    expect(client).toContain('download');
  });
});
