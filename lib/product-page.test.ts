import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("página comercial de produto", () => {
  const source = readFileSync("app/leisflashcards/[slug]/page.tsx", "utf8");

  it("consulta produto e leis vinculadas no banco", () => {
    expect(source).toContain('from("produtos")');
    expect(source).toContain('from("produto_leis")');
    expect(source).toContain('leis(id,slug,titulo,nome_curto)');
    expect(source).toContain("activeQuestionCountsBySlug");
    expect(source).not.toContain('from("materiais_leis")');
    expect(source).toContain('export const dynamic = "force-dynamic"');
  });

  it("inclui slugs de produtos ativos na rota comercial sem depender do Sheets", () => {
    expect(source).toContain("let slugsProdutos: string[] = []");
    expect(source).toContain("return slugsProdutos.map");
  });

  it("usa apenas checkout cadastrado e preserva o fallback da página anterior", () => {
    expect(source).toContain("produto.hotmartUrl");
    expect(source).toContain("Link de aquisição indisponível");
    expect(source).toContain("if (produto)");
  });

  it("usa somente o vídeo próprio como vitrine e evita CTAs duplicados", () => {
    expect(source).toContain("video_demo_url");
    expect(source).toContain("const video = produto.videoDemoUrl ? getYoutubeEmbedUrl(produto.videoDemoUrl) : null");
    expect(source).not.toContain("const selectedVideoUrl");
    expect(source).not.toContain("videoUrl={videoUrl}");
    expect(source).toContain("inline-flex w-full items-center justify-center");
    expect(source).toContain("Vídeo do produto:");
    expect(source).toContain('const isLeiAvulsa = produto.tipoProduto === "lei_avulsa"');
    expect(source).not.toContain("Comprar agora");
  });

  it("mostra a projeção estrutural somente para vínculo avulso consistente", () => {
    expect(source).toContain('select("lei_id,ordem,recorte_id,leis(id,slug,titulo,nome_curto)")');
    expect(source).toContain('tipo_produto');
    expect(source).toContain("loadPublicLawContentTree");
    expect(source).toContain("loadPublicLawCommercialSummary");
    expect(source).toContain("produto.leis.length === 1");
    expect(source).toContain("Conteúdo disponível nesta lei");
    expect(source).toContain("🎧 = Possui LegisCast");
    expect(source.indexOf("Conteúdo incluído")).toBeLessThan(source.indexOf("Conteúdo disponível nesta lei"));
  });

  it("acrescenta estado e módulos apenas para a lei avulsa validada", () => {
    expect(source).toContain("<LegislationState summary={commercialSummary} />");
    expect(source).toContain("<LawModules summary={commercialSummary} />");
    expect(source).toContain("Estado da legislação");
    expect(source).toContain("Disponibilidade do conteúdo");
    expect(source).toContain('min-h-full bg-[#171a21]');
  });

  it("abre cada lei de combo ou edital na rota reutilizável da própria lei", () => {
    expect(source).toContain("isCompositeLawProduct(produto.tipoProduto)");
    expect(source).toContain("/leisflashcards/${encodeURIComponent(lei.slug)}");
    expect(source).toContain("recorte_id=${encodeURIComponent(lei.recorteId)}");
    expect(source).toContain("isProdutoComposto && lawHref");
  });

  it("mantém a rota comercial disponível enquanto a coluna de vídeo não foi aplicada", () => {
    expect(source).toContain("const produto = produtoComVideo.error");
    expect(source).toContain('select("id,nome,descricao,hotmart_url,tipo_produto")');
  });

  it("resolve produtos do banco antes do fallback de legislação", () => {
    expect(source.indexOf("const produto = await carregarProdutoCatalogo(slug)")).toBeLessThan(
      source.lastIndexOf("const legislacoes = await withActiveQuestionCounts(await getLegislacoes())"),
    );
  });
});
