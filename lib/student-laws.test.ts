import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { filterStudentLaws, parseStudentLawRows, studentLawReferenceLabel, studentLawShortNameForDisplay, studentLawStatusLabel, type StudentLaw } from "./student-laws";

const migration = readFileSync("supabase/migrations/20260806103510_create_student_acquired_laws_rpc.sql", "utf8");
const server = readFileSync("lib/student-laws-server.ts", "utf8");
const route = readFileSync("app/api/aluno/minhas-leis/route.ts", "utf8");
const client = readFileSync("components/student-laws-client.tsx", "utf8");
const ankiModule = client.slice(client.indexOf("function AnkiModule"), client.indexOf("function StudentLawCard"));
const card = client.slice(client.indexOf("function StudentLawCard"), client.indexOf("function EmptyState"));
const page = readFileSync("app/minhas-leis/page.tsx", "utf8");

const laws: StudentLaw[] = [
  { id: 1, slug: "cf", titulo: "Constituição Federal", nomeCurto: "CF", descricao: null, codigo: "CF/88", categoria: "Constitucional", thumbnailUrl: null, ordem: 0, totalFlashcards: 845, versaoMaterial: "4.1", revisadoEm: "2026-08-06", publicadoEm: "2026-08-06", situacaoAtualizacao: "atualizado", houveAlteracaoLegislativa: true, referenciaNormativaAtual: "EC 138/2025", tipoReferenciaNormativa: "alteracao" },
  { id: 2, slug: "cpp", titulo: "Código de Processo Penal", nomeCurto: "CPP", descricao: null, codigo: "DL 3.689", categoria: "Processo Penal", thumbnailUrl: null, ordem: 1, totalFlashcards: 0, versaoMaterial: null, revisadoEm: null, publicadoEm: null, situacaoAtualizacao: "revisao_pendente", houveAlteracaoLegislativa: false, referenciaNormativaAtual: "Decreto-Lei nº 3.689/1941", tipoReferenciaNormativa: "originaria" },
];

const rpcLaw = {
  id: 1, slug: "cf", titulo: "Constituição", nome_curto: null, descricao: null, codigo: null,
  categoria: null, thumbnail_url: null, ordem: 0, fontes_ativas: 2, total_flashcards: 845,
  versao_material: "4.1", revisado_em: "2026-08-06", publicado_em: "2026-08-06",
  situacao_atualizacao: "atualizado", houve_alteracao_legislativa: true,
  referencia_normativa_atual: "EC 138/2025", tipo_referencia_normativa: "alteracao",
};

describe("dados das leis adquiridas", () => {
  it("saneia estritamente a resposta da RPC", () => {
    expect(parseStudentLawRows([rpcLaw])).toEqual([
      { id: 1, slug: "cf", titulo: "Constituição", nomeCurto: null, descricao: null, codigo: null, categoria: null, thumbnailUrl: null, ordem: 0, totalFlashcards: 845, versaoMaterial: "4.1", revisadoEm: "2026-08-06", publicadoEm: "2026-08-06", situacaoAtualizacao: "atualizado", houveAlteracaoLegislativa: true, referenciaNormativaAtual: "EC 138/2025", tipoReferenciaNormativa: "alteracao" },
    ]);
    expect(parseStudentLawRows([{ ...rpcLaw, compra_id: "segredo" }])).toEqual([]);
    expect(parseStudentLawRows([{ ...rpcLaw, total_flashcards: -1 }])).toEqual([]);
    expect(parseStudentLawRows([{ ...rpcLaw, revisado_em: "2026-02-30" }])).toEqual([]);
    expect(parseStudentLawRows([{ ...rpcLaw, situacao_atualizacao: "inventado" }])).toEqual([]);
    expect(parseStudentLawRows([{ ...rpcLaw, houve_alteracao_legislativa: false }])).toEqual([]);
  });

  it("centraliza os rótulos editoriais sem distorcer os valores", () => {
    expect(studentLawStatusLabel("atualizado")).toBe("Material atualizado");
    expect(studentLawStatusLabel("revisao_pendente")).toBe("Revisão pendente");
    expect(studentLawStatusLabel("desatualizado")).toBe("Material desatualizado");
    expect(studentLawStatusLabel("em_revisao")).toBe("Material em revisão");
    expect(studentLawReferenceLabel("originaria")).toBe("Norma originária");
    expect(studentLawReferenceLabel("alteracao")).toBe("Última alteração incorporada");
  });

  it("busca localmente por título, nome curto, código e categoria sem diferenciar acentos ou caixa", () => {
    expect(filterStudentLaws(laws, "constituicao")).toEqual([laws[0]]);
    expect(filterStudentLaws(laws, "cpp")).toEqual([laws[1]]);
    expect(filterStudentLaws(laws, "3.689")).toEqual([laws[1]]);
    expect(filterStudentLaws(laws, "PROCESSO penal")).toEqual([laws[1]]);
    expect(filterStudentLaws(laws, "138/2025")).toEqual([laws[0]]);
    expect(filterStudentLaws(laws, "4.1")).toEqual([laws[0]]);
    expect(filterStudentLaws(laws, "tributário")).toEqual([]);
  });

  it("mantém o nome padrão e só libera um nome curto complementar válido", () => {
    expect(studentLawShortNameForDisplay({ titulo: "Constituição Federal", nomeCurto: "Recorte PMMA" })).toBe("Recorte PMMA");
    expect(studentLawShortNameForDisplay({ titulo: "Constituição Federal", nomeCurto: null })).toBeNull();
    expect(studentLawShortNameForDisplay({ titulo: "Constituição Federal", nomeCurto: "" })).toBeNull();
    expect(studentLawShortNameForDisplay({ titulo: "Constituição Federal", nomeCurto: "   " })).toBeNull();
    expect(studentLawShortNameForDisplay({ titulo: "Constituição Federal", nomeCurto: "  CONSTITUIÇÃO FEDERAL  " })).toBeNull();

    const equalShortName = { ...laws[0], nomeCurto: "  CONSTITUIÇÃO FEDERAL  " };
    expect(filterStudentLaws([equalShortName], "constituição federal")).toEqual([equalShortName]);
  });
});

describe("fronteira autenticada das leis adquiridas", () => {
  it("usa auth.uid e consolida somente liberações e leis ativas", () => {
    expect(migration).toContain("function public.obter_minhas_leis()");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("aluno.user_id = auth.uid()");
    expect(migration).toContain("liberacao.status = 'ativo'");
    expect(migration).toContain("lei.ativo = true");
    expect(migration).toContain("pg_catalog.count(*)::bigint as fontes_ativas");
    expect(migration).toContain("pg_catalog.sum(material.quantidade_itens)");
    expect(migration).toContain("material.ativo = true");
    expect(migration).toContain("material.tipo = 'flashcards'");
    expect(migration).toContain("material.publicado_em desc nulls last");
    expect(migration).toContain("material.revisado_em desc nulls last");
    expect(migration).toContain("lei.situacao_atualizacao");
    expect(migration).toContain("lei.ultima_alteracao_referencia");
    expect(migration).toContain("lei.norma_originaria_referencia");
    expect(migration).not.toContain("aluno_produtos");
    expect(migration).not.toContain("url_externa");
    expect(migration).not.toContain("observacao_interna");
    expect(migration).not.toContain("historico_atualizacoes_leis");
  });

  it("mantém SECURITY DEFINER fechado para anon e sem service role como acesso do aluno", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog");
    expect(migration).toContain("from public, anon, authenticated, service_role");
    expect(migration).toContain("to authenticated");
  });

  it("exige sessão, rejeita aluno_id e usa o token no cliente limitado", () => {
    expect(server).toContain('url.searchParams.has("aluno_id")');
    expect(server).toContain("auth.getUser(token)");
    expect(server).toContain('rpc("obter_minhas_leis")');
    expect(server).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(client).toContain('Authorization: `Bearer ${token}`');
    expect(client).toContain("/conta?modo=login&retorno=%2Fminhas-leis");
  });

  it("expõe apenas GET saneado e desabilita cache privado", () => {
    expect(route).toContain("export async function GET");
    expect(route).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    expect(route).toContain('"Cache-Control": "private, no-store, max-age=0"');
    for (const forbidden of ["compra_id", "produto_id", "administrador", "motivo", "identificador_externo", "url_externa", "observacao_interna", "historico_atualizacoes_leis", "email"]) {
      expect(route.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe("interface das leis adquiridas", () => {
  it("cria a rota oficial e as duas abas", () => {
    expect(page).toContain("<StudentLawsClient />");
    expect(client).toContain("Minhas leis adquiridas");
    expect(client).toContain("<StudentAreaTabs activeTab={activeTab} onTabChange={setActiveTab} />");
  });

  it("mantém o card obrigatório do Anki em primeiro lugar e com a estrutura dos cards de lei", () => {
    expect(client.indexOf("<AnkiModule userId={userId} />")).toBeLessThan(client.indexOf('id="student-laws-search"'));
    const sharedCardClass = "flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center";
    expect(ankiModule).toContain(sharedCardClass);
    expect(card).toContain(sharedCardClass);
    expect(ankiModule).toContain("Passo obrigatório");
    expect(ankiModule).toContain("Baixando e configurando o Anki");
    expect(ankiModule).toContain("O Anki é o aplicativo de questões utilizado no nosso método de estudo. Nele, você responde às questões em formato de flashcards e informa o nível de dificuldade de cada resposta. Com base no seu desempenho, o próprio aplicativo organiza as revisões e reapresenta cada questão no momento adequado.");
    expect(ankiModule).toContain("<AnkiIcon />");
    expect(client).toContain('import Image from "next/image"');
    expect(ankiModule).toContain('src="/icons/anki.png"');
    expect(ankiModule).toContain('alt="Ícone do Anki"');
    expect(ankiModule).toContain("width={80}");
    expect(ankiModule).toContain("height={80}");
    expect(ankiModule).toContain('sizes="80px"');
    expect(ankiModule).toContain("flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-blue-50");
    expect(card).toContain("flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-3xl");
    expect(ankiModule.match(/\/icons\/anki\.png/g)).toHaveLength(1);
    expect(ankiModule).not.toContain("⚖️");
  });

  it("lê o estado existente sem permitir que o card marque o Anki como configurado", () => {
    expect(client).toContain('type AnkiSetupStatus = "loading" | "pending" | "configured"');
    expect(ankiModule).toContain("readAnkiConfigured(window.localStorage, userId)");
    expect(ankiModule).toContain("Pendente");
    expect(ankiModule).toContain("Anki configurado");
    expect(ankiModule).not.toContain("window.localStorage.setItem");
    expect(ankiModule).not.toContain("markConfigured");
    expect(ankiModule).not.toContain("tutorialOpen");
    expect(ankiModule).not.toContain("Marcar como configurado");
  });

  it("abre o tutorial sem marcar configuração nem condicionar as leis", () => {
    expect(ankiModule).toContain('href="/estudar/anki"');
    expect(ankiModule).toContain("Configurar o App de Questões");
    expect(ankiModule).toContain("Reabrir tutorial");
    expect(ankiModule).not.toContain("Em breve");
    expect(ankiModule).not.toContain("disabled");
    expect(ankiModule).not.toContain("data-future-href");
    expect(ankiModule).not.toContain("onClick");
    for (const forbidden of ["StudentLawCard", "filteredLaws", "window.location", "router.", "fetch(", ".rpc(", "setProgress", "updateProgress"]) {
      expect(ankiModule).not.toContain(forbidden);
    }
    expect(client).toContain("filteredLaws.map((law) => <StudentLawCard");
    expect(client).toContain("{laws.length} {laws.length === 1");
    expect(client).not.toContain("laws.length + 1");
  });

  it("simplifica o card sem exibir metadados editoriais ou campos privados", () => {
    for (const expected of ["law.titulo", "law.codigo", "studentLawShortNameForDisplay", "shortName", "law.totalFlashcards > 0", "Abrir estudo — em breve"]) expect(card).toContain(expected);
    expect(card.indexOf("law.titulo")).toBeLessThan(card.indexOf("{shortName}"));
    for (const forbidden of ["law.categoria", "studentLawStatusLabel", "situacaoAtualizacao", "versaoMaterial", "revisadoEm", "publicadoEm", "Atualizado em", "studentLawReferenceLabel", "referenciaNormativaAtual", "Norma originária", "Última alteração incorporada", "Material atualizado"]) {
      expect(card).not.toContain(forbidden);
    }
    expect(card).not.toContain("0 flashcards");
    expect(card).not.toContain("legislação conferida até");
    expect(card).not.toContain("url_externa");
    expect(card).not.toContain("observacao_interna");
    expect(card).not.toContain("historico_atualizacoes_leis");
  });

  it("oferece carregamento, erro, vazio, resultado e busca sem resultado", () => {
    for (const text of ["Carregando suas leis", "Não foi possível carregar suas leis", "Você ainda não possui leis liberadas", "Nenhuma lei encontrada", "lei liberada"]) {
      expect(client).toContain(text);
    }
  });

  it("não simula estudo, edital, progresso ou métricas inexistentes", () => {
    expect(client).toContain("Abrir estudo — em breve");
    expect(client).toContain("Montar meu edital — em breve");
    expect(client.match(/disabled/g)?.length).toBeGreaterThanOrEqual(2);
    for (const forbidden of ["questões respondidas", "streak atual", "progresso de estudo", "hotmart api", "mercado pago", "SUPABASE_SERVICE_ROLE_KEY"]) {
      expect(client.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
