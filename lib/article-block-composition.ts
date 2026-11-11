import { formatLegalReferenceFromOrder } from "@/lib/article-order-structure";
import { legisBotOrderCandidates } from "@/lib/legisbot/order-candidates";
import { parseQuestionOrder } from "@/lib/question-structure-consistency";

export type ArticleBlock = { id: string; leiId: number; slug: string; ordem: string; identificacao: string; legislacao: string; updatedAt: string; situacao?: string | null };
export type BlockDependency = { kind: "legisbot" | "question_link" | "highlight" | "identifier_repair" | "community_comment" | "mapping"; id: string; ordem: string; detail: string };
export type ResolutionImpact = { questionId: string; ordem: string; before: string | null; after: string | null };

function active(block: ArticleBlock) { return block.situacao !== "arquivada"; }
function ref(block: ArticleBlock, lawShortName: string) { return formatLegalReferenceFromOrder(block.ordem, lawShortName, block.identificacao) ?? block.identificacao; }
function canonicalOrders(blocks: ArticleBlock[]) { return blocks.filter(active).map((block) => block.ordem); }
function resolve(ordem: string, available: string[]) { return legisBotOrderCandidates(ordem).find((candidate) => available.includes(candidate)) ?? null; }
function sameLaw(blocks: ArticleBlock[]) { return blocks.length > 0 && blocks.every((block) => block.leiId === blocks[0].leiId && block.slug.toLowerCase() === blocks[0].slug.toLowerCase()); }
function normalizedHtml(value: string) { return value.replace(/>\s+</g, "><").trim(); }

export function previewBlockUnification(input: { blocks: ArticleBlock[]; availableBlocks?: ArticleBlock[]; lawShortName: string; questions: Array<{ id: string; ordem: string }>; dependencies: BlockDependency[] }) {
  const blocks = [...input.blocks].sort((a, b) => a.ordem.localeCompare(b.ordem));
  if (blocks.length < 2) throw new Error("Selecione pelo menos dois blocos para unificar.");
  if (!sameLaw(blocks) || blocks.some((block) => !active(block))) throw new Error("Selecione somente blocos ativos da mesma lei.");
  const parsed = blocks.map((block) => parseQuestionOrder(block.ordem));
  if (parsed.some((item) => !item)) throw new Error("Todos os blocos precisam ter Ordem canônica.");
  const first = parsed[0]!;
  if (first.paragrafo || first.inciso || first.letraParagrafo || first.letraInciso || blocks.some((_, index) => {
    const current = parsed[index]!;
    return current.artigo !== first.artigo || current.letraArtigo !== first.letraArtigo || current.inciso || current.letraParagrafo || current.letraInciso;
  })) throw new Error("Nesta primeira versão, a unificação deve começar no caput e incluir apenas parágrafos diretos do mesmo artigo.");
  const paragraphs = parsed.slice(1).map((item) => Number(item!.paragrafo));
  if (paragraphs.some((value, index) => !Number.isSafeInteger(value) || value !== index + 1)) throw new Error("Os blocos devem ser adjacentes: caput, § 1º, § 2º e assim por diante.");
  const target = blocks[0];
  const sourceIds = new Set(blocks.slice(1).map((block) => block.id));
  const mergedLegislation = blocks.map((block) => block.legislacao.trim()).join("\n");
  // A questão não conhece a seleção da tela: ela resolve contra toda a base
  // ativa da lei. A prévia precisa reproduzir essa regra, inclusive quando há
  // um ancestral fora da seleção.
  const available = input.availableBlocks ?? blocks;
  const before = canonicalOrders(available);
  const after = available.filter((block) => !sourceIds.has(block.id)).map((block) => block.ordem);
  const impact = input.questions.map((question) => ({ questionId: question.id, ordem: question.ordem, before: resolve(question.ordem, before), after: resolve(question.ordem, after) }));
  const dependencies = input.dependencies.filter((item) => sourceIds.has(item.id) || item.id === target.id);
  return { kind: "unificar" as const, target: { id: target.id, ordem: target.ordem, reference: ref(target, input.lawShortName), legislation: mergedLegislation, updatedAt: target.updatedAt }, sources: blocks.map((block) => ({ id: block.id, ordem: block.ordem, reference: ref(block, input.lawShortName), updatedAt: block.updatedAt })), archiveIds: [...sourceIds], dependencies, impact, requiresCommentDecision: dependencies.some((item) => item.kind === "legisbot") };
}

export type SplitPiece = { ordem: string; identificacao: string; legislacao: string };

/** The caller must supply complete, non-overlapping HTML pieces from the original block. */
export function previewBlockSplit(input: { block: ArticleBlock; availableBlocks?: ArticleBlock[]; pieces: SplitPiece[]; lawShortName: string; questions: Array<{ id: string; ordem: string }>; dependencies: BlockDependency[] }) {
  if (!active(input.block)) throw new Error("Um bloco arquivado não pode ser separado.");
  if (input.pieces.length < 2) throw new Error("Escolha ao menos um ponto de corte.");
  if (new Set(input.pieces.map((piece) => piece.ordem)).size !== input.pieces.length) throw new Error("A separação produziria Ordens repetidas.");
  if (input.pieces[0].ordem !== input.block.ordem) throw new Error("O primeiro trecho deve preservar a Ordem e o UUID do bloco original.");
  if (input.pieces.some((piece) => !parseQuestionOrder(piece.ordem) || !piece.identificacao.trim() || !piece.legislacao.trim())) throw new Error("Cada trecho precisa de referência, Ordem canônica e texto legislativo.");
  if (normalizedHtml(input.pieces.map((piece) => piece.legislacao).join("")) !== normalizedHtml(input.block.legislacao)) throw new Error("A separação não cobre exatamente o texto original; nenhum conteúdo pode ser perdido ou duplicado.");
  const available = input.availableBlocks ?? [input.block];
  const before = canonicalOrders(available);
  const after = [...available.filter((block) => block.id !== input.block.id).map((block) => block.ordem), ...input.pieces.map((piece) => piece.ordem)];
  const impact = input.questions.map((question) => ({ questionId: question.id, ordem: question.ordem, before: resolve(question.ordem, before), after: resolve(question.ordem, after) }));
  return { kind: "separar" as const, source: { id: input.block.id, ordem: input.block.ordem, reference: ref(input.block, input.lawShortName), updatedAt: input.block.updatedAt }, pieces: input.pieces.map((piece) => ({ ...piece, reference: formatLegalReferenceFromOrder(piece.ordem, input.lawShortName, piece.identificacao) ?? piece.identificacao })), dependencies: input.dependencies, impact, requiresCommentDecision: input.dependencies.some((item) => item.kind === "legisbot") };
}
