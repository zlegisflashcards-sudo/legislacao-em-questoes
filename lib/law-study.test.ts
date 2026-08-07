import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAW_STUDY_PLATFORM,
  LAW_STUDY_PLATFORM_IDS,
  LAW_STUDY_PLATFORMS,
  isValidLawSlug,
  lawMaterialActionLabel,
  lawStudyShortName,
} from "./law-study";

const server = readFileSync("lib/law-study-server.ts", "utf8");
const route = readFileSync("app/api/aluno/estudar/lei/[slug]/route.ts", "utf8");
const page = readFileSync("app/estudar/lei/[slug]/page.tsx", "utf8");
const client = readFileSync("components/law-study-page-client.tsx", "utf8");
const cards = readFileSync("components/student-laws-client.tsx", "utf8");
const contract = readFileSync("lib/law-study.ts", "utf8");

describe("contrato da página de estudo da lei", () => {
  it("mantém plataformas tipadas com Computador como padrão e vídeos ainda não publicados", () => {
    expect(DEFAULT_LAW_STUDY_PLATFORM).toBe("computador");
    expect(LAW_STUDY_PLATFORM_IDS).toEqual(["computador", "android", "ios", "navegador"]);
    for (const platform of LAW_STUDY_PLATFORM_IDS) expect(LAW_STUDY_PLATFORMS[platform].videoUrl).toBeNull();
  });

  it("valida o slug e mantém o nome oficial como título", () => {
    expect(isValidLawSlug("constituicao-federal")).toBe(true);
    expect(isValidLawSlug("../segredo")).toBe(false);
    expect(lawStudyShortName("Constituição Federal", " Recorte PMMA ")).toBe("Recorte PMMA");
    expect(lawStudyShortName("Constituição Federal", " CONSTITUIÇÃO FEDERAL ")).toBeNull();
  });

  it("mantém as ações de material desabilitadas enquanto falta download seguro", () => {
    expect(lawMaterialActionLabel({ type: "flashcards", action: "baixar" })).toBe("Baixar flashcards");
    expect(lawMaterialActionLabel({ type: "pdf", action: "baixar" })).toBe("Baixar PDF");
    expect(client).toContain("material.downloadAvailable");
    expect(client).not.toMatch(/href=\{material\./);
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
    expect(server).toContain('select("id,tipo,titulo,descricao,provedor,url_externa,acao,quantidade_itens,versao_material")');
    expect(server).toContain('select("id,tipo,importancia,titulo,descricao_resumida,referencia_normativa,versao_nova,data_publicacao,created_at")');
    expect(server).toContain('.eq("visivel_aluno", true)');
    for (const forbidden of ["observacao_interna", "criado_por", "compra_id", "produto_id", "email"]) expect(server).not.toContain(forbidden);
  });

  it("expõe somente GET privado, sem endpoint de escrita ou download improvisado", () => {
    expect(route).toContain("export async function GET");
    expect(route).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    expect(route).toContain('"Cache-Control": "private, no-store, max-age=0"');
    expect(route).not.toContain("url_externa");
  });
});

describe("interface de estudo", () => {
  it("cria a rota autenticada e ativa Baixar questões nos cards", () => {
    expect(page).toContain("<LawStudyPageClient slug={slug} />");
    expect(client).toContain("supabase.auth.getSession()");
    expect(client).toContain("/conta?modo=login&retorno=");
    expect(cards).toContain('const lawHref = `/estudar/lei/${encodeURIComponent(law.slug)}`');
    expect(cards).toContain("href={lawHref}");
    expect(cards).toContain(">Baixar questões</Link>");
    expect(cards).not.toContain("Baixar questões — em breve");
  });

  it("reutiliza as abas e não adiciona botão Voltar", () => {
    expect(client).toContain('<StudentAreaTabs activeTab="leis" minhasLeisHref="/minhas-leis" />');
    expect(client).not.toContain(">Voltar<");
  });

  it("mostra cabeçalho, tutorial responsivo e a orientação permanente", () => {
    for (const expected of ["study.law.title", "study.law.shortName", "study.law.totalFlashcards > 0", "aspect-video w-full", "Tutorial em preparação", "Mantenha suas revisões em dia antes de avançar para novos cartões."]) expect(client).toContain(expected);
    for (const platform of ["Computador", "Android", "iOS", "Navegador"]) expect(contract).toContain(`label: "${platform}"`);
  });

  it("renderiza materiais dinâmicos e o estado vazio", () => {
    expect(client).toContain("study.materials.map");
    expect(client).toContain("Nenhum material disponível no momento.");
    expect(client).toContain("lawMaterialIcon(material.type)");
  });

  it("persiste as duas marcações de progresso sem localStorage", () => {
    expect(client).toContain("Progresso nesta lei");
    expect(client).toContain("Lei em estudo");
    expect(client).toContain("Finalizei todas as questões da lei");
    expect(client).not.toContain("localStorage");
    expect(client).toContain('method: "PATCH"');
  });

  it("mantém o histórico recolhido, recente primeiro e limitado a campos seguros", () => {
    expect(client).toContain("<details");
    expect(client).not.toContain("<details open");
    expect(client).toContain("history.slice(0, 3)");
    expect(client).toContain("Ver atualizações anteriores");
    for (const field of ["publishedAt", "version", "type", "importance", "summary", "legalReference"]) expect(client).toContain(`item.${field}`);
    for (const forbidden of ["observacao_interna", "criado_por", "url_externa"]) expect(client).not.toContain(forbidden);
  });
});
