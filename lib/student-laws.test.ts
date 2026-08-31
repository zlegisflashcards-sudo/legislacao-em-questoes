import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { filterStudentLaws, parseStudentLawRows, projectStudentLawContexts, studentLawContextTitle, studentLawReferenceLabel, studentLawShortNameForDisplay, studentLawStatusLabel, uniqueStudentLawsById, type StudentLaw } from "./student-laws";

const migration = readFileSync("supabase/migrations/20260806103510_create_student_acquired_laws_rpc.sql", "utf8");
const server = readFileSync("lib/student-laws-server.ts", "utf8");
const route = readFileSync("app/api/aluno/minhas-leis/route.ts", "utf8");
const client = readFileSync("components/student-laws-client.tsx", "utf8");
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

describe("projeção de contextos em Minhas Leis", () => {
  it("cria um card por contexto único sem duplicar a lei canônica", () => {
    const projected = projectStudentLawContexts([laws[0]], new Map([[1, [
      { recorteId: null, nome: "Lei completa", questionCount: 845 },
      { recorteId: "pmerj", nome: "PMERJ", questionCount: 120 },
      { recorteId: "pmesp", nome: "PMESP", questionCount: 90 },
    ]]]));
    expect(projected).toHaveLength(3);
    expect(projected.map((law) => law.id)).toEqual([1, 1, 1]);
    expect(projected.map((law) => law.studyContextId)).toEqual([null, "pmerj", "pmesp"]);
    expect(projected.map((law) => law.totalFlashcards)).toEqual([845, 120, 90]);
    expect(projected.every((law) => law.studyContextKind === "completa" || law.studyContextKind === "recorte")).toBe(true);
  });

  it("mantém somente um card para vínculos completos ou recortes já deduplicados pelo resolvedor", () => {
    const projected = projectStudentLawContexts([laws[0]], new Map([[1, [
      { recorteId: null, nome: "Lei completa", questionCount: 845 },
      { recorteId: "pmerj", nome: "PMERJ", questionCount: 120 },
    ]]]));
    expect(projected.filter((law) => law.studyContextId === null)).toHaveLength(1);
    expect(projected.filter((law) => law.studyContextId === "pmerj")).toHaveLength(1);
  });

  it("mantém uma só lei para consumidores que operam por lei, como Meu Edital e a árvore", () => {
    const projected = projectStudentLawContexts([laws[0]], new Map([[1, [
      { recorteId: "pmerj", nome: "PMERJ", questionCount: 120 },
      { recorteId: "pmesp", nome: "PMESP", questionCount: 90 },
    ]]]));
    expect(uniqueStudentLawsById(projected)).toHaveLength(1);
  });

  it("permite pesquisar pelo nome amigável do recorte", () => {
    const projected = projectStudentLawContexts([laws[0]], new Map([[1, [{ recorteId: "pmerj", nome: "PMERJ", questionCount: 120 }]]]));
    expect(filterStudentLaws(projected, "pmerj")).toEqual(projected);
  });

  it("não repete o nome do recorte quando o título público já contém o sufixo", () => {
    expect(studentLawContextTitle("Constituição Federal - PMERJ", "PMERJ")).toBe("Constituição Federal - PMERJ");
    expect(studentLawContextTitle("Constituição Federal", "PMERJ")).toBe("Constituição Federal - PMERJ");
    expect(studentLawContextTitle("Constituição Federal - PMERJ", "pmerj")).toBe("Constituição Federal - PMERJ");
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

  it("projeta cada contexto com a contagem central de questões ativas", () => {
    expect(server).toContain("listLawStudyContextsByLaw(student.id, laws.map((law) => law.id))");
    expect(server).toContain("projectStudentLawContexts(lawsWithCampaign, contextsByLaw)");
    expect(server).not.toContain("quantidade_itens");
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
  it("abre a página interna da lei, sem iniciar o jogador", () => {
    expect(card).toContain('const lawHref = isScope ?');
    expect(card).toContain('?contexto=completo');
    expect(card).toContain('?recorte_id=');
    expect(card).toContain('href={lawHref}'); expect(card).toContain('>Estudar</Link>');
    expect(card).not.toContain('/questoes/${encodeURIComponent(law.slug)}/estudar');
  });

  it("cria a rota oficial e as duas abas", () => {
    expect(page).toContain("<StudentLawsClient />");
    expect(client).toContain("Legis Questões");
    expect(client).toContain('<StudentAreaTabs activeTab={activeTab} onTabChange={setActiveTab} meuEditalHref="/meu-edital" />');
  });

  it("não exibe onboarding obrigatório do Anki em Legis Questões", () => {
    for (const forbidden of ["AnkiModule", "AnkiRequiredModal", "Passo obrigatório", "Configurar o App de Questões", "Baixando e configurando o App de questões"]) expect(client).not.toContain(forbidden);
    expect(client).not.toContain("/estudar/anki");
  });

  it("mantém os cards de lei responsivos no mobile", () => {
    expect(card).toContain("grid min-w-0 gap-4");
    expect(card).toContain("w-full");
    expect(card).toContain("sm:w-auto");
    expect(card).toContain("break-words text-xl font-black leading-6");
    expect(card).toContain("grid gap-3 sm:flex sm:flex-wrap");
  });

  it("lista somente as leis liberadas, sem estado local de configuração do Anki", () => {
    for (const forbidden of ["readAnkiConfigured", "markAnkiConfigured", "window.localStorage", "setProgress", "updateProgress"]) expect(client).not.toContain(forbidden);
    expect(client).toContain("filteredLaws.map((law) => { const examLaw");
    expect(client).toContain("{laws.length} {laws.length === 1");
    expect(client).not.toContain("laws.length + 1");
  });

  it("simplifica o card sem exibir metadados editoriais ou campos privados", () => {
    for (const expected of ["law.titulo", "studyContextName", "studyContextKind", "studentLawContextTitle", "campaignStatus", "campaignProgress", "+ Adicionar ao edital", "✓ No meu edital", "Remover do edital"]) expect(card).toContain(expected);
    expect(card).toContain('const lawHref = isScope ?');
    expect(card).toContain("href={lawHref}");
    for (const forbidden of ["law.thumbnailUrl", "law.descricao", "law.nomeCurto", "studentLawShortNameForDisplay", "law.categoria", "studentLawStatusLabel", "situacaoAtualizacao", "versaoMaterial", "revisadoEm", "publicadoEm", "Atualizado em", "studentLawReferenceLabel", "referenciaNormativaAtual", "Norma originária", "Última alteração incorporada", "Material atualizado", "Concluída", "Não iniciada"]) {
      expect(card).not.toContain(forbidden);
    }
    expect(card).not.toContain("0 flashcards");
    expect(card).not.toContain("legislação conferida até");
    expect(card).not.toContain("url_externa");
    expect(card).not.toContain("observacao_interna");
    expect(card).not.toContain("historico_atualizacoes_leis");
  });

  it("exibe apenas barra e percentual real de progresso, sem score", () => {
    expect(card).toContain("const progress = law.campaignStatus === \"concluida\" ? 100");
    expect(card).toContain('aria-label={`${progress}% concluído`}');
    expect(card).toContain('>{progress}%</p>');
    expect(card).not.toContain('score');
  });

  it("oferece carregamento, erro, vazio, resultado e busca sem resultado", () => {
    for (const text of ["Carregando suas leis", "Não foi possível carregar suas leis", "Você ainda não possui leis liberadas", "Nenhuma lei encontrada", "contexto de estudo disponível"]) {
      expect(client).toContain(text);
    }
  });

  it("ativa a rota segura de estudo e permite controlar o Meu Edital sem duplicidade", () => {
    expect(client).toContain('const lawHref = isScope ?');
    expect(client).toContain("examLaw={examLaw}");
    expect(client).toContain("onToggleMyExam={() => void toggleMyExamLaw(law)}");
    expect(client).toContain('action: included ? "remove" : "add"');
    expect(client).toContain("recorteId: requestedScopeId");
    for (const forbidden of ["questões respondidas", "streak atual", "progresso de estudo", "hotmart api", "mercado pago", "SUPABASE_SERVICE_ROLE_KEY"]) {
      expect(client.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
